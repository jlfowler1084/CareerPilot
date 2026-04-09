import { describe, it, expect } from "vitest"
import type { CoachingSession } from "@/types"

/**
 * When fetchSessions loads from DB and analyzeDebrief has already
 * appended a session optimistically, we replace state wholesale
 * (DB is source of truth). This test validates that approach.
 */
function mergeSessionsFromDb(
  dbSessions: CoachingSession[]
): CoachingSession[] {
  // DB fetch replaces state entirely — no dedup needed
  return Array.isArray(dbSessions) ? dbSessions : []
}

const mockSession: CoachingSession = {
  id: "sess-1",
  application_id: "app-1",
  user_id: "user-1",
  session_type: "debrief",
  raw_input: "test notes",
  ai_analysis: { summary: "Good", question_analyses: [], top_3_focus_areas: [] },
  overall_score: 7,
  strong_points: ["PowerShell"],
  improvements: [],
  patterns_detected: null,
  created_at: "2026-04-08T14:00:00Z",
}

describe("mergeSessionsFromDb", () => {
  it("returns sessions array from valid DB response", () => {
    const result = mergeSessionsFromDb([mockSession])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("sess-1")
  })

  it("returns empty array for non-array input", () => {
    expect(mergeSessionsFromDb(null as unknown as CoachingSession[])).toEqual([])
    expect(mergeSessionsFromDb(undefined as unknown as CoachingSession[])).toEqual([])
  })

  it("returns empty array for empty DB response", () => {
    expect(mergeSessionsFromDb([])).toEqual([])
  })
})
