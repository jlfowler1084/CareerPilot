import { describe, it, expect } from "vitest"
import { computeStats } from "@/hooks/use-stats"
import type { Application } from "@/types"

const makeApp = (status: string, source: string = "Dice", dateApplied?: string, dateResponse?: string): Application => ({
  id: Math.random().toString(),
  user_id: "u1",
  title: "Test",
  company: "Co",
  location: null,
  url: null,
  source,
  salary_range: null,
  status: status as Application["status"],
  job_type: null,
  posted_date: null,
  date_found: "2026-03-01T00:00:00Z",
  date_applied: dateApplied || null,
  date_response: dateResponse || null,
  notes: "",
  profile_id: "",
  updated_at: "2026-03-01T00:00:00Z",
})

describe("computeStats", () => {
  it("computes by_status correctly", () => {
    const apps = [
      makeApp("applied"),
      makeApp("applied"),
      makeApp("interview"),
      makeApp("rejected"),
    ]
    const stats = computeStats(apps)
    expect(stats.by_status.applied).toBe(2)
    expect(stats.by_status.interview).toBe(1)
    expect(stats.by_status.rejected).toBe(1)
    expect(stats.by_status.found).toBe(0)
  })

  it("computes response_rate matching Python logic", () => {
    const apps = [
      makeApp("applied", "Dice", "2026-03-01"),
      makeApp("phone_screen", "Dice", "2026-03-01", "2026-03-05"),
      makeApp("rejected", "Indeed", "2026-03-01", "2026-03-10"),
      makeApp("found"),
    ]
    const stats = computeStats(apps)
    // 3 applied (have date_applied), 2 responded (have date_response)
    expect(stats.response_rate).toBeCloseTo(66.67, 0)
  })

  it("computes source_distribution", () => {
    const apps = [
      makeApp("applied", "Indeed"),
      makeApp("applied", "Dice"),
      makeApp("applied", "Dice"),
    ]
    const stats = computeStats(apps)
    expect(stats.source_distribution).toEqual([
      { name: "Indeed", value: 1 },
      { name: "Dice", value: 2 },
    ])
  })

  it("returns zeros for empty array", () => {
    const stats = computeStats([])
    expect(stats.total).toBe(0)
    expect(stats.response_rate).toBe(0)
  })
})
