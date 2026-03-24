import { describe, it, expect } from "vitest"
import { RESPONSE_STATUSES } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

// Test the date-tracking logic that will live in the hook
function computeDateUpdates(
  newStatus: ApplicationStatus,
  currentDateApplied: string | null,
  currentDateResponse: string | null
): { date_applied?: string; date_response?: string } {
  const updates: { date_applied?: string; date_response?: string } = {}
  if (newStatus === "applied" && !currentDateApplied) {
    updates.date_applied = new Date().toISOString()
  }
  if (
    RESPONSE_STATUSES.includes(newStatus) &&
    !currentDateResponse
  ) {
    updates.date_response = new Date().toISOString()
  }
  return updates
}

describe("computeDateUpdates", () => {
  it("sets date_applied when status changes to applied", () => {
    const updates = computeDateUpdates("applied", null, null)
    expect(updates.date_applied).toBeTruthy()
    expect(updates.date_response).toBeUndefined()
  })

  it("does not overwrite existing date_applied", () => {
    const updates = computeDateUpdates("applied", "2026-01-01", null)
    expect(updates.date_applied).toBeUndefined()
  })

  it("sets date_response for phone_screen", () => {
    const updates = computeDateUpdates("phone_screen", null, null)
    expect(updates.date_response).toBeTruthy()
  })

  it("sets date_response for rejected", () => {
    const updates = computeDateUpdates("rejected", null, null)
    expect(updates.date_response).toBeTruthy()
  })

  it("does not set dates for found/interested/withdrawn/ghosted", () => {
    for (const status of ["found", "interested", "withdrawn", "ghosted"] as ApplicationStatus[]) {
      const updates = computeDateUpdates(status, null, null)
      expect(updates.date_applied).toBeUndefined()
      expect(updates.date_response).toBeUndefined()
    }
  })
})
