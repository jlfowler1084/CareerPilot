import { describe, it, expect } from "vitest"
import type { Debrief } from "@/types"

function validateDebrief(input: {
  rating?: number
  round?: number
}): string[] {
  const errors: string[] = []
  if (!input.rating || input.rating < 1 || input.rating > 5) {
    errors.push("Rating must be between 1 and 5")
  }
  if (input.round !== undefined && (input.round < 1 || !Number.isInteger(input.round))) {
    errors.push("Round must be a positive integer")
  }
  return errors
}

function computeNextRound(debriefs: Debrief[]): number {
  return debriefs.length + 1
}

describe("validateDebrief", () => {
  it("accepts valid rating", () => {
    expect(validateDebrief({ rating: 4 })).toEqual([])
  })

  it("rejects missing rating", () => {
    expect(validateDebrief({})).toContainEqual("Rating must be between 1 and 5")
  })

  it("rejects rating below 1", () => {
    expect(validateDebrief({ rating: 0 })).toContainEqual("Rating must be between 1 and 5")
  })

  it("rejects rating above 5", () => {
    expect(validateDebrief({ rating: 6 })).toContainEqual("Rating must be between 1 and 5")
  })

  it("accepts all valid ratings 1-5", () => {
    for (let i = 1; i <= 5; i++) {
      expect(validateDebrief({ rating: i })).toEqual([])
    }
  })
})

describe("computeNextRound", () => {
  it("returns 1 for empty debriefs", () => {
    expect(computeNextRound([])).toBe(1)
  })

  it("returns 2 after one debrief", () => {
    const debriefs = [{
      round: 1, date: "2026-03-20", rating: 4,
      questions_asked: "", went_well: "", challenging: "",
      takeaways: "", interviewer_name: "", interviewer_role: "",
    }]
    expect(computeNextRound(debriefs)).toBe(2)
  })

  it("returns 4 after three debriefs", () => {
    const debriefs = Array.from({ length: 3 }, (_, i) => ({
      round: i + 1, date: "2026-03-20", rating: 4,
      questions_asked: "", went_well: "", challenging: "",
      takeaways: "", interviewer_name: "", interviewer_role: "",
    }))
    expect(computeNextRound(debriefs)).toBe(4)
  })
})
