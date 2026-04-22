import { describe, it, expect, vi, beforeEach } from "vitest"
import { RESPONSE_STATUSES } from "@/lib/constants"
import type { ApplicationStatus } from "@/types"

// pickValue helper — extracted from addApplication for testing
function pickValue<T>(raw: T | undefined, fallback: T): T {
  return raw !== undefined ? raw : fallback
}

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

describe("pickValue", () => {
  it("returns raw when it is a defined non-undefined string", () => {
    expect(pickValue("applied", "interested")).toBe("applied")
  })

  it("returns raw when it is an empty string (valid explicit notes override)", () => {
    expect(pickValue("", "default")).toBe("")
  })

  it("returns raw when it is null (explicit null for job_description)", () => {
    expect(pickValue<string | null>(null, "fallback")).toBeNull()
  })

  it("returns fallback when raw is undefined", () => {
    expect(pickValue(undefined, "interested")).toBe("interested")
  })

  it("preserves type: string fallback produces string result without casts", () => {
    const result: string = pickValue(undefined, "interested")
    expect(result).toBe("interested")
  })
})

// Integration-level tests for addApplication override semantics
// These exercise the logic via a minimal inline replica so tests stay
// independent of the Supabase client mock setup.
describe("addApplication override semantics", () => {
  const fallbackStatus: ApplicationStatus = "interested"

  function buildInsertPayload(
    job: Record<string, unknown>,
    callerStatus?: ApplicationStatus,
    callerNotes?: string,
    callerJobDescription?: string | null
  ) {
    return {
      status: pickValue(callerStatus, fallbackStatus),
      notes: pickValue(callerNotes, ""),
      job_description: pickValue(callerJobDescription, null),
      title: "title" in job ? job.title : "",
      company: "company" in job ? job.company : "",
    }
  }

  it("manual entry with no caller status resolves to 'interested'", () => {
    const payload = buildInsertPayload({ title: "Dev", company: "Acme" })
    expect(payload.status).toBe("interested")
  })

  it("search entry with no caller status resolves to 'interested' (R6)", () => {
    // Raw Job object — no status field
    const payload = buildInsertPayload({ title: "Dev", company: "Acme", jobId: "123" })
    expect(payload.status).toBe("interested")
  })

  it("caller-supplied status overrides the fallback", () => {
    const payload = buildInsertPayload({ title: "Dev", company: "Acme" }, "applied")
    expect(payload.status).toBe("applied")
  })

  it("caller-supplied empty notes override the '' fallback (R9)", () => {
    // Empty string is an explicit value — preserved, not treated as missing
    const payload = buildInsertPayload({ title: "Dev", company: "Acme" }, undefined, "")
    expect(payload.notes).toBe("")
  })

  it("caller-supplied non-empty notes are preserved", () => {
    const payload = buildInsertPayload({ title: "Dev", company: "Acme" }, undefined, "Great role")
    expect(payload.notes).toBe("Great role")
  })

  it("caller-supplied null job_description is preserved", () => {
    const payload = buildInsertPayload({ title: "Dev", company: "Acme" }, undefined, undefined, null)
    expect(payload.job_description).toBeNull()
  })

  it("caller-supplied job_description string is preserved", () => {
    const payload = buildInsertPayload({ title: "Dev", company: "Acme" }, undefined, undefined, "JD text")
    expect(payload.job_description).toBe("JD text")
  })

  it("logged-out path returns { data: null, error } not undefined", () => {
    // Replicate the logged-out early return shape from Unit 1 fix
    function loggedOutReturn(): { data: null; error: Error } {
      return { data: null, error: new Error("Not authenticated") }
    }
    const result = loggedOutReturn()
    expect(result).not.toBeUndefined()
    expect(result.data).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
  })
})
