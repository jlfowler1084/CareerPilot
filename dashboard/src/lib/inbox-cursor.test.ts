import { describe, it, expect } from "vitest"
import { shouldAdvanceCursor } from "./inbox-cursor"

describe("shouldAdvanceCursor (CAR-197)", () => {
  it("does not advance when the scan failed", () => {
    expect(shouldAdvanceCursor({ scanSucceeded: false, newInsertedCount: 0 })).toBe(false)
  })

  it("does not advance on a successful scan that ingested zero new emails", () => {
    // Pre-CAR-197 the cursor advanced unconditionally on any successful page,
    // so an empty result (whether legitimate or due to a downstream silent
    // failure) ratcheted last_email_scan to "now" and hid the staleness.
    expect(shouldAdvanceCursor({ scanSucceeded: true, newInsertedCount: 0 })).toBe(false)
  })

  it("advances when the scan succeeded and ingested at least one new email", () => {
    expect(shouldAdvanceCursor({ scanSucceeded: true, newInsertedCount: 1 })).toBe(true)
    expect(shouldAdvanceCursor({ scanSucceeded: true, newInsertedCount: 73 })).toBe(true)
  })

  it("does not advance even if newInsertedCount > 0 when scanSucceeded is false", () => {
    // Defense-in-depth: scan flagged failure overrides any stray inserts.
    expect(shouldAdvanceCursor({ scanSucceeded: false, newInsertedCount: 5 })).toBe(false)
  })
})
