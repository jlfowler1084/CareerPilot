import { describe, it, expect } from "vitest"
import { deduplicateJobs, filterIrrelevant, deduplicateAgainstCache } from "@/lib/search-utils"
import type { Job } from "@/types"

const makeJob = (title: string, company: string, source: "Indeed" | "Dice" = "Dice"): Job => ({
  title, company, location: "", salary: "", url: "", posted: "", type: "",
  source, profileId: "test", profileLabel: "Test",
})

describe("deduplicateJobs", () => {
  it("removes duplicates by title+company (case insensitive)", () => {
    const jobs = [
      makeJob("Systems Admin", "Acme"),
      makeJob("systems admin", "ACME"),
      makeJob("DevOps Engineer", "Acme"),
    ]
    expect(deduplicateJobs(jobs)).toHaveLength(2)
  })

  it("keeps first occurrence", () => {
    const jobs = [
      makeJob("Admin", "Corp", "Indeed"),
      makeJob("Admin", "Corp", "Dice"),
    ]
    const result = deduplicateJobs(jobs)
    expect(result[0].source).toBe("Indeed")
  })
})

describe("filterIrrelevant", () => {
  it("removes pest control, hvac, etc.", () => {
    const jobs = [
      makeJob("Systems Administrator", "Good Co"),
      makeJob("Pest Control Technician", "Bug Co"),
      makeJob("HVAC Systems Engineer", "Cool Co"),
      makeJob("DevOps Engineer", "Tech Co"),
    ]
    const filtered = filterIrrelevant(jobs)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((j) => j.title)).toEqual([
      "Systems Administrator",
      "DevOps Engineer",
    ])
  })
})

describe("deduplicateAgainstCache", () => {
  it("splits jobs into new and seen", () => {
    const newJobs = [
      makeJob("Admin", "Acme"),
      makeJob("Engineer", "TechCo"),
      makeJob("DevOps", "CloudCo"),
    ]
    const cached = [makeJob("Admin", "Acme"), makeJob("DevOps", "CloudCo")]
    const result = deduplicateAgainstCache(newJobs, cached)
    expect(result.new).toHaveLength(1)
    expect(result.new[0].title).toBe("Engineer")
    expect(result.seen).toHaveLength(2)
  })
})
