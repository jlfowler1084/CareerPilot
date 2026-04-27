/**
 * Tests for the B2 filter pipeline composition logic.
 * Verifies the zip-back invariant: after filtering Job[], we recover the
 * original JobSearchResultRow objects via Map<Job, JobSearchResultRow>.
 *
 * All tests are pure-function (no React, no hooks).
 */
import { describe, it, expect } from "vitest"
import { rowToJob } from "@/lib/search-results/to-job"
import { applyFilters, applyAdvancedFilters, DEFAULT_ADVANCED_FILTERS, parseSalary } from "@/lib/search-filter-utils"
import { applyQueryFilter, parseQuery } from "@/lib/query-parser"
import type { JobSearchResultRow } from "@/types/supabase"
import type { Job } from "@/types"

function makeRow(over: Partial<JobSearchResultRow> = {}): JobSearchResultRow {
  return {
    id: "row-1",
    user_id: "user-1",
    source: "indeed",
    source_id: "abc",
    url: "https://indeed.com/jobs/abc",
    title: "Systems Engineer",
    company: "Acme Corp",
    location: "Remote",
    salary: "$120k",
    job_type: "Full-time",
    posted_date: "2 days ago",
    easy_apply: false,
    profile_id: "profile-a",
    profile_label: "Profile A",
    description: null,
    requirements: null,
    nice_to_haves: null,
    discovered_at: "2026-04-27T00:00:00Z",
    last_seen_at: "2026-04-27T00:00:00Z",
    last_enriched_at: null,
    status: "new",
    application_id: null,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    ...over,
  }
}

/** Replicates the page's filter pipeline (pure functions only). */
function runPipeline(
  rows: JobSearchResultRow[],
  opts: {
    profileIds?: Set<string>
    keyword?: string
    queryString?: string
    sortOrder?: "newest" | "company"
  } = {}
): JobSearchResultRow[] {
  // Step 1: Profile filter
  const profileFiltered =
    !opts.profileIds || opts.profileIds.size === 0
      ? rows
      : rows.filter((r) => r.profile_id && opts.profileIds!.has(r.profile_id))

  // Step 2: Build Job[] + zip Map (the invariant under test)
  const jobs: Job[] = profileFiltered.map(rowToJob)
  const jobToRow = new Map<Job, JobSearchResultRow>(
    profileFiltered.map((row, i) => [jobs[i], row])
  )

  // Step 3: Filter
  let filtered: Job[]
  if (opts.queryString) {
    filtered = applyQueryFilter(jobs, parseQuery(opts.queryString))
  } else {
    const quick = { source: "all", jobType: "all", remote: false, easyApplyOnly: false, hasSalary: false, keyword: opts.keyword ?? "" }
    filtered = applyAdvancedFilters(applyFilters(jobs, quick), DEFAULT_ADVANCED_FILTERS)
  }

  // Step 4: Zip back
  const filteredRows = filtered
    .map((j) => jobToRow.get(j))
    .filter((r): r is JobSearchResultRow => r !== undefined)

  // Step 5: Sort
  if (opts.sortOrder === "newest") {
    filteredRows.sort(
      (a, b) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()
    )
  } else if (opts.sortOrder === "company") {
    filteredRows.sort((a, b) => (a.company ?? "").localeCompare(b.company ?? ""))
  }

  return filteredRows
}

describe("filter pipeline — zip-back invariant", () => {
  it("returns all rows when no filters active", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })]
    const result = runPipeline(rows)
    expect(result.map((r) => r.id)).toEqual(["a", "b"])
  })

  it("profile filter narrows to selected profile IDs", () => {
    const rowA = makeRow({ id: "a", profile_id: "p1" })
    const rowB = makeRow({ id: "b", profile_id: "p2" })
    const rowC = makeRow({ id: "c", profile_id: "p1" })
    const result = runPipeline([rowA, rowB, rowC], { profileIds: new Set(["p1"]) })
    expect(result.map((r) => r.id)).toEqual(["a", "c"])
  })

  it("zip-back preserves exact row identity (same object reference) through keyword filter", () => {
    const rowA = makeRow({ id: "a", title: "PowerShell Engineer" })
    const rowB = makeRow({ id: "b", title: "Java Developer" })
    const result = runPipeline([rowA, rowB], { keyword: "PowerShell" })
    expect(result).toHaveLength(1)
    // Strict reference equality: the returned element IS rowA, not a copy
    expect(result[0]).toBe(rowA)
  })

  it("quick keyword filter narrows beyond profile filter", () => {
    const rowA = makeRow({ id: "a", profile_id: "p1", title: "PowerShell Engineer" })
    const rowB = makeRow({ id: "b", profile_id: "p1", title: "Java Developer" })
    const rowC = makeRow({ id: "c", profile_id: "p2", title: "PowerShell Admin" })
    // Profile filter: only p1 rows (A and B); then keyword: only PowerShell (A)
    const result = runPipeline([rowA, rowB, rowC], {
      profileIds: new Set(["p1"]),
      keyword: "PowerShell",
    })
    expect(result.map((r) => r.id)).toEqual(["a"])
  })

  it("query mode replaces quick filters (mutex)", () => {
    const rowA = makeRow({ id: "a", title: "DevOps Engineer", location: "Remote" })
    const rowB = makeRow({ id: "b", title: "Java Developer",  location: "Remote" })
    // keyword filter would match nothing (no 'keyword' set), but query mode finds DevOps
    const result = runPipeline([rowA, rowB], { queryString: "title:DevOps" })
    expect(result.map((r) => r.id)).toEqual(["a"])
  })

  it("sort by newest orders by discovered_at descending", () => {
    const rowOld = makeRow({ id: "old", discovered_at: "2026-04-25T00:00:00Z" })
    const rowNew = makeRow({ id: "new", discovered_at: "2026-04-27T00:00:00Z" })
    const rowMid = makeRow({ id: "mid", discovered_at: "2026-04-26T00:00:00Z" })
    const result = runPipeline([rowOld, rowNew, rowMid], { sortOrder: "newest" })
    expect(result.map((r) => r.id)).toEqual(["new", "mid", "old"])
  })

  it("sort by company orders alphabetically", () => {
    const rowZ = makeRow({ id: "z", company: "Zebra Corp" })
    const rowA = makeRow({ id: "a", company: "Acme Inc" })
    const rowM = makeRow({ id: "m", company: "Megacorp" })
    const result = runPipeline([rowZ, rowA, rowM], { sortOrder: "company" })
    expect(result.map((r) => r.id)).toEqual(["a", "m", "z"])
  })

  it("empty rows after profile filter produces empty result", () => {
    const row = makeRow({ id: "a", profile_id: "p1" })
    const result = runPipeline([row], { profileIds: new Set(["p999"]) })
    expect(result).toHaveLength(0)
  })
})
