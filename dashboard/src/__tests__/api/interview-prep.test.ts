import { describe, it, expect } from "vitest"
import type {
  InterviewPrep,
  PhoneScreenContent,
  InterviewContent,
  OfferContent,
  PrepStageKey,
} from "@/types"

// Test the response extraction logic used in the API route
function extractTextFromResponse(response: { content: Array<{ type: string; text?: string }> }): string {
  const textBlock = response.content.find((c) => c.type === "text")
  return textBlock?.text || ""
}

function parseStructuredPrep<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

function buildPrepUpdate(
  existing: InterviewPrep,
  stage: PrepStageKey,
  content: unknown
): InterviewPrep {
  return {
    ...existing,
    [stage]: {
      generated_at: new Date().toISOString(),
      content,
    },
  }
}

describe("extractTextFromResponse", () => {
  it("extracts text from a simple response", () => {
    const response = {
      content: [{ type: "text", text: '{"company_quick_hits": ["Founded 2010"]}' }],
    }
    expect(extractTextFromResponse(response)).toContain("company_quick_hits")
  })

  it("extracts text from multi-block response (after tool use)", () => {
    const response = {
      content: [
        { type: "tool_use", text: undefined },
        { type: "text", text: '{"elevator_pitch": "Hello"}' },
      ],
    }
    expect(extractTextFromResponse(response)).toContain("elevator_pitch")
  })

  it("returns empty string when no text block exists", () => {
    const response = { content: [{ type: "tool_use" }] }
    expect(extractTextFromResponse(response)).toBe("")
  })
})

describe("parseStructuredPrep", () => {
  it("parses valid phone screen JSON", () => {
    const json = JSON.stringify({
      company_quick_hits: ["Founded 2010", "500 employees"],
      elevator_pitch: "I bring 20+ years...",
      likely_questions: ["Tell me about yourself"],
      talking_points: ["At Venable, I managed 700+ VMs"],
      questions_to_ask: ["What does the team look like?"],
      red_flags: ["High turnover mentioned"],
      salary_prep: { low: 90000, mid: 105000, high: 120000, target: 110000, source: "Glassdoor" },
      skills_to_study: ["Terraform"],
    })
    const result = parseStructuredPrep<PhoneScreenContent>(json)
    expect(result).not.toBeNull()
    expect(result!.company_quick_hits).toHaveLength(2)
    expect(result!.salary_prep.mid).toBe(105000)
    expect(result!.skills_to_study).toContain("Terraform")
  })

  it("parses JSON embedded in surrounding text", () => {
    const text = 'Here is the prep:\n{"elevator_pitch": "Hello"}\nDone.'
    const result = parseStructuredPrep<Partial<PhoneScreenContent>>(text)
    expect(result).not.toBeNull()
    expect(result!.elevator_pitch).toBe("Hello")
  })

  it("returns null for invalid JSON", () => {
    expect(parseStructuredPrep("not json")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseStructuredPrep("")).toBeNull()
  })
})

describe("buildPrepUpdate", () => {
  it("adds phone_screen prep to empty interview_prep", () => {
    const existing: InterviewPrep = {}
    const content = { company_quick_hits: ["test"], elevator_pitch: "Hi" }
    const updated = buildPrepUpdate(existing, "phone_screen", content)
    expect(updated.phone_screen).toBeDefined()
    expect(updated.phone_screen!.content).toBe(content)
    expect(updated.phone_screen!.generated_at).toBeTruthy()
  })

  it("preserves existing stages when adding new one", () => {
    const existing: InterviewPrep = {
      phone_screen: {
        generated_at: "2026-03-20",
        content: { elevator_pitch: "Old" } as PhoneScreenContent,
      },
    }
    const content = { technical_deep_dive: ["topic"] }
    const updated = buildPrepUpdate(existing, "interview", content)
    expect(updated.phone_screen).toBeDefined()
    expect(updated.interview).toBeDefined()
  })

  it("overwrites existing stage prep on refresh", () => {
    const existing: InterviewPrep = {
      phone_screen: {
        generated_at: "2026-03-20",
        content: { elevator_pitch: "Old" } as PhoneScreenContent,
      },
    }
    const content = { elevator_pitch: "New" }
    const updated = buildPrepUpdate(existing, "phone_screen", content)
    expect((updated.phone_screen!.content as PhoneScreenContent).elevator_pitch).toBe("New")
  })

  it("preserves debriefs when updating stages", () => {
    const existing: InterviewPrep = {
      debriefs: [{ round: 1, date: "2026-03-20", rating: 4, questions_asked: "", went_well: "", challenging: "", takeaways: "", interviewer_name: "", interviewer_role: "" }],
    }
    const updated = buildPrepUpdate(existing, "interview", { technical_deep_dive: [] })
    expect(updated.debriefs).toHaveLength(1)
  })
})

describe("stage validation", () => {
  const VALID_STAGES: PrepStageKey[] = ["phone_screen", "interview", "offer"]

  it("accepts valid stage keys", () => {
    for (const stage of VALID_STAGES) {
      expect(VALID_STAGES.includes(stage)).toBe(true)
    }
  })

  it("rejects invalid stage keys", () => {
    const invalid = ["applied", "found", "rejected", "phone", ""]
    for (const stage of invalid) {
      expect(VALID_STAGES.includes(stage as PrepStageKey)).toBe(false)
    }
  })
})
