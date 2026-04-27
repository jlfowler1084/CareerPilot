import { describe, it, expect } from "vitest"
import { STATUSES, RESPONSE_STATUSES, DEFAULT_SEARCH_PROFILES, SEARCH_PROFILES, IRRELEVANT_KEYWORDS } from "@/lib/constants"

describe("STATUSES", () => {
  it("has all 9 statuses from Python CLI", () => {
    const ids = STATUSES.map((s) => s.id)
    expect(ids).toEqual([
      "found", "interested", "applied", "phone_screen",
      "interview", "offer", "rejected", "withdrawn", "ghosted",
    ])
  })

  it("each status has id, label, and color", () => {
    for (const s of STATUSES) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe("RESPONSE_STATUSES", () => {
  it("mirrors Python tracker.py RESPONSE_STATUSES", () => {
    expect(RESPONSE_STATUSES).toEqual([
      "phone_screen", "interview", "offer", "rejected",
    ])
  })
})

describe("DEFAULT_SEARCH_PROFILES", () => {
  it("has 8 profiles", () => {
    expect(DEFAULT_SEARCH_PROFILES).toHaveLength(8)
  })

  it("each profile has required fields", () => {
    for (const p of DEFAULT_SEARCH_PROFILES) {
      expect(p.id).toBeTruthy()
      expect(p.keyword).toBeTruthy()
      expect(p.location).toBeTruthy()
      expect(["both", "dice", "indeed"]).toContain(p.source)
    }
  })

  it("backward-compat SEARCH_PROFILES alias still works", () => {
    expect(SEARCH_PROFILES).toBe(DEFAULT_SEARCH_PROFILES)
  })
})

describe("IRRELEVANT_KEYWORDS", () => {
  it("has all 11 keywords from Python searcher.py", () => {
    expect(IRRELEVANT_KEYWORDS).toHaveLength(11)
    expect(IRRELEVANT_KEYWORDS).toContain("pest control")
    expect(IRRELEVANT_KEYWORDS).toContain("custodian")
  })
})
