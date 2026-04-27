import { describe, it, expect } from "vitest"
import { applySearchResultFilters } from "@/lib/search-results/filters"
import type { JobSearchResultRow } from "@/types/supabase"

function row(over: Partial<JobSearchResultRow> = {}): JobSearchResultRow {
  return {
    id: "row-1",
    user_id: "user-1",
    source: "indeed",
    source_id: "abc",
    url: "https://indeed.com/jobs/abc",
    title: "Senior Engineer",
    company: "Acme",
    location: "Remote",
    salary: null,
    job_type: null,
    posted_date: null,
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

describe("applySearchResultFilters", () => {
  it("hides stale and dismissed rows when no status filter is set", () => {
    const rows = [
      row({ id: "n", status: "new" }),
      row({ id: "v", status: "viewed" }),
      row({ id: "t", status: "tracked" }),
      row({ id: "d", status: "dismissed" }),
      row({ id: "s", status: "stale" }),
    ]
    const result = applySearchResultFilters(rows, {})
    expect(result.map((r) => r.id).sort()).toEqual(["n", "t", "v"])
  })

  it("includes only rows matching an explicit status filter", () => {
    const rows = [
      row({ id: "n", status: "new" }),
      row({ id: "v", status: "viewed" }),
      row({ id: "t", status: "tracked" }),
    ]
    const result = applySearchResultFilters(rows, { status: "new" })
    expect(result.map((r) => r.id)).toEqual(["n"])
  })

  it("'all' status filter is the same default-active set: stale and dismissed stay hidden", () => {
    // The UI labels this option "All Active" — the contract is "all active
    // statuses, not a graveyard." Stale/dismissed require an explicit pick.
    const rows = [
      row({ id: "n", status: "new" }),
      row({ id: "v", status: "viewed" }),
      row({ id: "t", status: "tracked" }),
      row({ id: "s", status: "stale" }),
      row({ id: "d", status: "dismissed" }),
    ]
    const result = applySearchResultFilters(rows, { status: "all" })
    expect(result.map((r) => r.id).sort()).toEqual(["n", "t", "v"])
  })

  it("explicit stale filter surfaces stale rows that 'all' would hide", () => {
    const rows = [
      row({ id: "n", status: "new" }),
      row({ id: "s", status: "stale" }),
    ]
    const result = applySearchResultFilters(rows, { status: "stale" })
    expect(result.map((r) => r.id)).toEqual(["s"])
  })

  it("filters by profile_id when set", () => {
    const rows = [
      row({ id: "a", profile_id: "profile-a" }),
      row({ id: "b", profile_id: "profile-b" }),
    ]
    const result = applySearchResultFilters(rows, { profileId: "profile-b" })
    expect(result.map((r) => r.id)).toEqual(["b"])
  })

  it("filters by source when set", () => {
    const rows = [
      row({ id: "i", source: "indeed" }),
      row({ id: "d", source: "dice" }),
    ]
    const result = applySearchResultFilters(rows, { source: "dice" })
    expect(result.map((r) => r.id)).toEqual(["d"])
  })

  it("'all' source filter is a no-op", () => {
    const rows = [
      row({ id: "i", source: "indeed" }),
      row({ id: "d", source: "dice" }),
    ]
    const result = applySearchResultFilters(rows, { source: "all" })
    expect(result.map((r) => r.id).sort()).toEqual(["d", "i"])
  })

  it("composes profile + status + source filters", () => {
    const rows = [
      row({ id: "match", profile_id: "p1", source: "indeed", status: "new" }),
      row({ id: "wrong-profile", profile_id: "p2", source: "indeed", status: "new" }),
      row({ id: "wrong-status", profile_id: "p1", source: "indeed", status: "viewed" }),
      row({ id: "wrong-source", profile_id: "p1", source: "dice", status: "new" }),
    ]
    const result = applySearchResultFilters(rows, {
      profileId: "p1",
      source: "indeed",
      status: "new",
    })
    expect(result.map((r) => r.id)).toEqual(["match"])
  })
})
