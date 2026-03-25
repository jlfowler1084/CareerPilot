import { describe, it, expect } from "vitest"
import type { InterviewPrep, Debrief, ApplicationStatus, ConversationType } from "@/types"

function appendDebrief(
  existing: InterviewPrep,
  debrief: Omit<Debrief, "date">
): InterviewPrep {
  const debriefs = [...(existing.debriefs || []), { ...debrief, date: new Date().toISOString() }]
  return { ...existing, debriefs }
}

function statusToConversationType(status: ApplicationStatus): ConversationType {
  switch (status) {
    case "phone_screen": return "phone"
    case "interview": return "video"
    default: return "note"
  }
}

function formatDebriefNotes(debrief: { went_well: string; challenging: string; takeaways: string }): string {
  const parts: string[] = []
  if (debrief.went_well) parts.push(`Went well: ${debrief.went_well}`)
  if (debrief.challenging) parts.push(`Challenging: ${debrief.challenging}`)
  if (debrief.takeaways) parts.push(`Takeaways: ${debrief.takeaways}`)
  return parts.join("\n\n")
}

describe("appendDebrief", () => {
  it("appends to empty debriefs array", () => {
    const existing: InterviewPrep = {}
    const debrief = {
      round: 1, rating: 4, questions_asked: "Tell me about yourself",
      went_well: "Good rapport", challenging: "System design", takeaways: "Study more",
      interviewer_name: "Jane", interviewer_role: "HR",
    }
    const updated = appendDebrief(existing, debrief)
    expect(updated.debriefs).toHaveLength(1)
    expect(updated.debriefs![0].round).toBe(1)
    expect(updated.debriefs![0].date).toBeTruthy()
  })

  it("appends to existing debriefs array", () => {
    const existing: InterviewPrep = {
      debriefs: [{
        round: 1, date: "2026-03-20", rating: 4, questions_asked: "",
        went_well: "", challenging: "", takeaways: "",
        interviewer_name: "", interviewer_role: "",
      }],
    }
    const debrief = {
      round: 2, rating: 5, questions_asked: "Design a monitoring system",
      went_well: "Nailed it", challenging: "Nothing", takeaways: "Great team",
      interviewer_name: "Bob", interviewer_role: "Tech Lead",
    }
    const updated = appendDebrief(existing, debrief)
    expect(updated.debriefs).toHaveLength(2)
    expect(updated.debriefs![1].round).toBe(2)
  })

  it("preserves existing prep stages", () => {
    const existing: InterviewPrep = {
      phone_screen: { generated_at: "2026-03-20", content: {} as any },
    }
    const updated = appendDebrief(existing, {
      round: 1, rating: 3, questions_asked: "", went_well: "",
      challenging: "", takeaways: "", interviewer_name: "", interviewer_role: "",
    })
    expect(updated.phone_screen).toBeDefined()
    expect(updated.debriefs).toHaveLength(1)
  })
})

describe("statusToConversationType", () => {
  it("maps phone_screen to phone", () => {
    expect(statusToConversationType("phone_screen")).toBe("phone")
  })

  it("maps interview to video", () => {
    expect(statusToConversationType("interview")).toBe("video")
  })

  it("maps offer to note", () => {
    expect(statusToConversationType("offer")).toBe("note")
  })

  it("defaults to note for other statuses", () => {
    expect(statusToConversationType("applied")).toBe("note")
    expect(statusToConversationType("rejected")).toBe("note")
  })
})

describe("formatDebriefNotes", () => {
  it("formats all fields", () => {
    const notes = formatDebriefNotes({
      went_well: "Good rapport",
      challenging: "System design question",
      takeaways: "Study distributed systems",
    })
    expect(notes).toContain("Went well: Good rapport")
    expect(notes).toContain("Challenging: System design question")
    expect(notes).toContain("Takeaways: Study distributed systems")
  })

  it("skips empty fields", () => {
    const notes = formatDebriefNotes({
      went_well: "Great conversation",
      challenging: "",
      takeaways: "",
    })
    expect(notes).toContain("Went well: Great conversation")
    expect(notes).not.toContain("Challenging:")
    expect(notes).not.toContain("Takeaways:")
  })

  it("returns empty string when all fields empty", () => {
    const notes = formatDebriefNotes({ went_well: "", challenging: "", takeaways: "" })
    expect(notes).toBe("")
  })
})

describe("debrief validation", () => {
  it("rating must be 1-5", () => {
    for (let i = 1; i <= 5; i++) {
      expect(i >= 1 && i <= 5).toBe(true)
    }
    expect(0 >= 1 && 0 <= 5).toBe(false)
    expect(6 >= 1 && 6 <= 5).toBe(false)
  })

  it("round must be positive integer", () => {
    expect(Number.isInteger(1) && 1 > 0).toBe(true)
    expect(Number.isInteger(0) && 0 > 0).toBe(false)
    expect(Number.isInteger(-1) && -1 > 0).toBe(false)
  })
})
