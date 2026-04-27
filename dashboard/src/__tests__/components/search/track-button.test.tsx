import { describe, it, expect } from "vitest"
import { buildApplicationInput } from "@/lib/search-results/track-input"
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
    salary: "$150k",
    job_type: "Full-time",
    posted_date: "2 days ago",
    easy_apply: false,
    profile_id: "profile-a",
    profile_label: "Profile A",
    description: "Job description text",
    requirements: ["Req 1"],
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

describe("buildApplicationInput", () => {
  it("capitalizes lowercase source so the applications surface keeps its label", () => {
    const indeed = buildApplicationInput(row({ source: "indeed" }))
    const dice = buildApplicationInput(row({ source: "dice" }))
    expect(indeed.source).toBe("Indeed")
    expect(dice.source).toBe("Dice")
  })

  it("preserves an already-capitalized source", () => {
    const input = buildApplicationInput(row({ source: "Dice" }))
    expect(input.source).toBe("Dice")
  })

  it("maps the search-result fields to the addApplication contract", () => {
    const input = buildApplicationInput(
      row({
        title: "Staff SRE",
        company: "Hooli",
        location: "Indianapolis",
        salary: "$170k",
        url: "https://indeed.com/jobs/xyz",
        job_type: "Contract",
        posted_date: "1 day ago",
        profile_id: "profile-z",
        description: "DESCRIPTION",
      })
    )
    expect(input).toMatchObject({
      title: "Staff SRE",
      company: "Hooli",
      location: "Indianapolis",
      salary_range: "$170k",
      url: "https://indeed.com/jobs/xyz",
      job_type: "Contract",
      posted_date: "1 day ago",
      profile_id: "profile-z",
      job_description: "DESCRIPTION",
    })
  })

  it("converts null fields on the row into nulls on the input (not undefined)", () => {
    const input = buildApplicationInput(
      row({
        title: null,
        company: null,
        location: null,
        salary: null,
        job_type: null,
        posted_date: null,
        description: null,
        profile_id: null,
      })
    )
    expect(input.title).toBe("")
    expect(input.company).toBe("")
    expect(input.location).toBeNull()
    expect(input.salary_range).toBeNull()
    expect(input.job_type).toBeNull()
    expect(input.posted_date).toBeNull()
    expect(input.job_description).toBeNull()
    expect(input.profile_id).toBe("")
  })

  it("regression for the screenshot symptom: row.url must always make it onto the application", () => {
    // The bug was that the legacy /search detail panel had no apply link;
    // when Track ran without url, the resulting application also had no url.
    // job_search_results.url is non-null in the schema, so the mapping must
    // forward it intact.
    const input = buildApplicationInput(row({ url: "https://example.com/apply/1" }))
    expect(input.url).toBe("https://example.com/apply/1")
  })
})
