import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { calculateDebriefStats } from "@/app/api/debriefs/stats/route"

function makeDebrief(overrides: {
  overall_rating?: number | null
  created_at?: string
} = {}) {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    overall_rating: overrides.overall_rating ?? null,
    created_at: overrides.created_at ?? "2026-04-06T12:00:00Z",
  }
}

describe("calculateDebriefStats", () => {
  beforeEach(() => {
    // Pin "now" to Wednesday 2026-04-08 14:00 UTC
    // ISO week started Monday 2026-04-06 00:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-08T14:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns zeroed stats for empty array", () => {
    const stats = calculateDebriefStats([])
    expect(stats).toEqual({
      total_debriefs: 0,
      average_rating: null,
      most_recent_at: null,
      debriefs_this_week: 0,
    })
  })

  it("returns null average when all ratings are null", () => {
    const debriefs = [
      makeDebrief({ overall_rating: null }),
      makeDebrief({ overall_rating: null }),
      makeDebrief({ overall_rating: null }),
    ]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.total_debriefs).toBe(3)
    expect(stats.average_rating).toBeNull()
  })

  it("calculates average excluding null ratings", () => {
    const debriefs = [
      makeDebrief({ overall_rating: 4 }),
      makeDebrief({ overall_rating: null }),
      makeDebrief({ overall_rating: 5 }),
      makeDebrief({ overall_rating: 3 }),
    ]
    const stats = calculateDebriefStats(debriefs)
    // (4 + 5 + 3) / 3 = 4.0
    expect(stats.average_rating).toBe(4)
  })

  it("rounds average to one decimal place", () => {
    const debriefs = [
      makeDebrief({ overall_rating: 3 }),
      makeDebrief({ overall_rating: 4 }),
    ]
    const stats = calculateDebriefStats(debriefs)
    // (3 + 4) / 2 = 3.5
    expect(stats.average_rating).toBe(3.5)
  })

  it("returns most_recent_at from first element (assumes desc order)", () => {
    const debriefs = [
      makeDebrief({ created_at: "2026-04-08T10:00:00Z" }),
      makeDebrief({ created_at: "2026-04-06T08:00:00Z" }),
    ]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.most_recent_at).toBe("2026-04-08T10:00:00Z")
  })

  it("counts debriefs this week correctly across Monday boundary", () => {
    // Week started Mon 2026-04-06 00:00 UTC
    const debriefs = [
      makeDebrief({ created_at: "2026-04-08T10:00:00Z" }),  // Wed — in week
      makeDebrief({ created_at: "2026-04-06T00:00:00Z" }),  // Mon 00:00 — in week (boundary inclusive)
      makeDebrief({ created_at: "2026-04-05T23:59:59Z" }),  // Sun — previous week
      makeDebrief({ created_at: "2026-04-01T12:00:00Z" }),  // Last week
    ]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.debriefs_this_week).toBe(2)
  })

  it("handles single debrief with rating", () => {
    const debriefs = [makeDebrief({ overall_rating: 5 })]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.total_debriefs).toBe(1)
    expect(stats.average_rating).toBe(5)
  })
})
