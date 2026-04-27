import { describe, it, expect } from "vitest"
import { rowsToAutoQueue } from "@/lib/search-results/auto-queue"
import type { JobSearchResultRow } from "@/types/supabase"
import type { FitScore } from "@/types"

function makeRow(over: Partial<JobSearchResultRow> = {}): JobSearchResultRow {
  return {
    id: "row-1",
    user_id: "user-1",
    source: "dice",
    source_id: "abc",
    url: "https://dice.com/jobs/abc",
    title: "Systems Engineer",
    company: "Acme Corp",
    location: "Remote",
    salary: "$120k",
    job_type: "Full-time",
    posted_date: "2 days ago",
    easy_apply: true,
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

function makeScore(total: number): FitScore {
  return { total, breakdown: { title: 0, skills: 0, location: 0, salary: 0 } }
}

describe("rowsToAutoQueue", () => {
  it("returns qualifying rows when enabled", () => {
    const row = makeRow({ id: "r1", title: "Eng", company: "Acme" })
    const scores = new Map([["r1", makeScore(85)]])
    const result = rowsToAutoQueue([row], scores, () => false)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("r1")
  })

  it("excludes rows where easy_apply is false", () => {
    const row = makeRow({ id: "r1", easy_apply: false })
    const scores = new Map([["r1", makeScore(90)]])
    const result = rowsToAutoQueue([row], scores, () => false)
    expect(result).toHaveLength(0)
  })

  it("excludes rows with fit score below 80", () => {
    const row = makeRow({ id: "r1" })
    const scores = new Map([["r1", makeScore(79)]])
    const result = rowsToAutoQueue([row], scores, () => false)
    expect(result).toHaveLength(0)
  })

  it("includes rows with fit score exactly 80", () => {
    const row = makeRow({ id: "r1" })
    const scores = new Map([["r1", makeScore(80)]])
    const result = rowsToAutoQueue([row], scores, () => false)
    expect(result).toHaveLength(1)
  })

  it("excludes rows already in queue", () => {
    const row = makeRow({ id: "r1", title: "Eng", company: "Acme" })
    const scores = new Map([["r1", makeScore(90)]])
    // isInQueue always returns true — row already tracked
    const result = rowsToAutoQueue([row], scores, () => true)
    expect(result).toHaveLength(0)
  })

  it("excludes rows with no fit score entry", () => {
    const row = makeRow({ id: "r1" })
    const scores = new Map<string, FitScore>() // no entry for r1
    const result = rowsToAutoQueue([row], scores, () => false)
    expect(result).toHaveLength(0)
  })

  it("returns only qualifying rows from a mixed set", () => {
    const rowA = makeRow({ id: "a", title: "Eng A", company: "Alpha", easy_apply: true })
    const rowB = makeRow({ id: "b", title: "Eng B", company: "Beta",  easy_apply: false })
    const rowC = makeRow({ id: "c", title: "Eng C", company: "Gamma", easy_apply: true })
    const rowD = makeRow({ id: "d", title: "Eng D", company: "Delta", easy_apply: true })
    const scores = new Map([
      ["a", makeScore(85)], // qualifies
      ["b", makeScore(90)], // excluded: easy_apply=false
      ["c", makeScore(75)], // excluded: score too low
      ["d", makeScore(88)], // excluded: already in queue
    ])
    // rowD is already in queue by company name match
    const result = rowsToAutoQueue(
      [rowA, rowB, rowC, rowD],
      scores,
      (job) => job.company === "Delta"
    )
    // Only rowA qualifies
    expect(result.map((r) => r.id)).toEqual(["a"])
  })
})
