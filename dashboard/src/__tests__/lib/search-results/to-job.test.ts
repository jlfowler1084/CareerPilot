import { describe, it, expect } from "vitest"
import { rowToJob } from "@/lib/search-results/to-job"
import type { JobSearchResultRow } from "@/types/supabase"

function row(over: Partial<JobSearchResultRow> = {}): JobSearchResultRow {
  return {
    id: "row-1",
    user_id: "user-1",
    source: "indeed",
    source_id: "abc",
    url: "https://indeed.com/jobs/abc",
    title: "Systems Engineer",
    company: "Acme Corp",
    location: "Remote, USA",
    salary: "$120k/yr",
    job_type: "Full-time",
    posted_date: "2 days ago",
    easy_apply: false,
    profile_id: "profile-a",
    profile_label: "Profile A",
    description: "Job description",
    requirements: ["5 years experience"],
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

describe("rowToJob", () => {
  it("maps all populated fields to the Job shape", () => {
    const job = rowToJob(row())
    expect(job).toMatchObject({
      title: "Systems Engineer",
      company: "Acme Corp",
      location: "Remote, USA",
      salary: "$120k/yr",
      url: "https://indeed.com/jobs/abc",
      posted: "2 days ago",
      type: "Full-time",
      source: "Indeed",
      easyApply: false,
      profileId: "profile-a",
      profileLabel: "Profile A",
    })
  })

  it("capitalizes 'indeed' source → 'Indeed'", () => {
    const job = rowToJob(row({ source: "indeed" }))
    expect(job.source).toBe("Indeed")
  })

  it("capitalizes 'dice' source → 'Dice'", () => {
    const job = rowToJob(row({ source: "dice" }))
    expect(job.source).toBe("Dice")
  })

  it("normalizes already-capitalized 'Indeed' correctly", () => {
    const job = rowToJob(row({ source: "Indeed" }))
    expect(job.source).toBe("Indeed")
  })

  it("normalizes already-capitalized 'DICE' correctly (cap first, lower rest)", () => {
    const job = rowToJob(row({ source: "DICE" }))
    expect(job.source).toBe("Dice")
  })

  it("defaults null title to empty string", () => {
    const job = rowToJob(row({ title: null }))
    expect(job.title).toBe("")
  })

  it("defaults null company to empty string", () => {
    const job = rowToJob(row({ company: null }))
    expect(job.company).toBe("")
  })

  it("defaults null location to empty string", () => {
    const job = rowToJob(row({ location: null }))
    expect(job.location).toBe("")
  })

  it("defaults null salary to 'Not listed'", () => {
    const job = rowToJob(row({ salary: null }))
    expect(job.salary).toBe("Not listed")
  })

  it("defaults null posted_date to empty string", () => {
    const job = rowToJob(row({ posted_date: null }))
    expect(job.posted).toBe("")
  })

  it("defaults null job_type to empty string", () => {
    const job = rowToJob(row({ job_type: null }))
    expect(job.type).toBe("")
  })

  it("defaults null profile_id to empty string", () => {
    const job = rowToJob(row({ profile_id: null }))
    expect(job.profileId).toBe("")
  })

  it("defaults null profile_label to empty string", () => {
    const job = rowToJob(row({ profile_label: null }))
    expect(job.profileLabel).toBe("")
  })

  it("passes through non-null url unchanged", () => {
    const job = rowToJob(row({ url: "https://example.com/apply/123" }))
    expect(job.url).toBe("https://example.com/apply/123")
  })

  it("passes through easy_apply boolean", () => {
    expect(rowToJob(row({ easy_apply: true })).easyApply).toBe(true)
    expect(rowToJob(row({ easy_apply: false })).easyApply).toBe(false)
  })

  it("all-null variant produces fully safe defaults (no undefined)", () => {
    const job = rowToJob(
      row({
        title: null,
        company: null,
        location: null,
        salary: null,
        posted_date: null,
        job_type: null,
        profile_id: null,
        profile_label: null,
      })
    )
    expect(job.title).toBe("")
    expect(job.company).toBe("")
    expect(job.location).toBe("")
    expect(job.salary).toBe("Not listed")
    expect(job.posted).toBe("")
    expect(job.type).toBe("")
    expect(job.profileId).toBe("")
    expect(job.profileLabel).toBe("")
    expect(job.source).toBe("Indeed")
    expect(job.url).toBeDefined()
  })
})
