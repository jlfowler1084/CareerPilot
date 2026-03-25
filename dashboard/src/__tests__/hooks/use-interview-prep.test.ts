import { describe, it, expect } from "vitest"
import type { Application, InterviewPrep, PrepStageKey } from "@/types"

const PREP_STAGES: PrepStageKey[] = ["phone_screen", "interview", "offer"]

function getCurrentStagePrep(prep: InterviewPrep, status: string) {
  if (!PREP_STAGES.includes(status as PrepStageKey)) return null
  return prep[status as PrepStageKey] || null
}

function isPrepStage(status: string): status is PrepStageKey {
  return PREP_STAGES.includes(status as PrepStageKey)
}

function computeSkillGaps(
  applications: Pick<Application, "status" | "interview_prep">[]
): Array<{ skill: string; count: number }> {
  const counts = new Map<string, number>()
  const activeStatuses = ["phone_screen", "interview", "offer"]

  for (const app of applications) {
    if (!activeStatuses.includes(app.status)) continue
    const prep = app.interview_prep || {}
    for (const stage of PREP_STAGES) {
      const stagePrep = prep[stage]
      if (!stagePrep?.content) continue
      const content = stagePrep.content as { skills_to_study?: string[] }
      if (!content.skills_to_study) continue
      for (const skill of content.skills_to_study) {
        const normalized = skill.toLowerCase().trim()
        counts.set(normalized, (counts.get(normalized) || 0) + 1)
      }
    }
  }

  return Array.from(counts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

describe("getCurrentStagePrep", () => {
  it("returns prep for current stage", () => {
    const prep: InterviewPrep = {
      phone_screen: { generated_at: "2026-03-20", content: { elevator_pitch: "Hi" } as any },
    }
    expect(getCurrentStagePrep(prep, "phone_screen")).toBeTruthy()
  })

  it("returns null for non-prep stage", () => {
    const prep: InterviewPrep = {}
    expect(getCurrentStagePrep(prep, "applied")).toBeNull()
    expect(getCurrentStagePrep(prep, "found")).toBeNull()
    expect(getCurrentStagePrep(prep, "rejected")).toBeNull()
  })

  it("returns null when no prep exists for stage", () => {
    const prep: InterviewPrep = {}
    expect(getCurrentStagePrep(prep, "phone_screen")).toBeNull()
  })
})

describe("isPrepStage", () => {
  it("returns true for prep stages", () => {
    expect(isPrepStage("phone_screen")).toBe(true)
    expect(isPrepStage("interview")).toBe(true)
    expect(isPrepStage("offer")).toBe(true)
  })

  it("returns false for non-prep stages", () => {
    expect(isPrepStage("found")).toBe(false)
    expect(isPrepStage("applied")).toBe(false)
    expect(isPrepStage("rejected")).toBe(false)
    expect(isPrepStage("withdrawn")).toBe(false)
    expect(isPrepStage("ghosted")).toBe(false)
  })
})

describe("computeSkillGaps", () => {
  it("aggregates skills across active applications", () => {
    const apps = [
      {
        status: "phone_screen" as const,
        interview_prep: {
          phone_screen: {
            generated_at: "2026-03-20",
            content: { skills_to_study: ["Terraform", "Kubernetes"] },
          },
        },
      },
      {
        status: "interview" as const,
        interview_prep: {
          interview: {
            generated_at: "2026-03-21",
            content: { skills_to_study: ["Terraform", "Azure DevOps"] },
          },
        },
      },
    ] as Pick<Application, "status" | "interview_prep">[]

    const gaps = computeSkillGaps(apps)
    expect(gaps[0].skill).toBe("terraform")
    expect(gaps[0].count).toBe(2)
    expect(gaps).toHaveLength(3)
  })

  it("returns top 5 only", () => {
    const apps = [
      {
        status: "interview" as const,
        interview_prep: {
          interview: {
            generated_at: "2026-03-20",
            content: { skills_to_study: ["A", "B", "C", "D", "E", "F", "G"] },
          },
        },
      },
    ] as Pick<Application, "status" | "interview_prep">[]

    const gaps = computeSkillGaps(apps)
    expect(gaps).toHaveLength(5)
  })

  it("ignores non-active applications", () => {
    const apps = [
      {
        status: "found" as const,
        interview_prep: {
          phone_screen: {
            generated_at: "2026-03-20",
            content: { skills_to_study: ["Should be ignored"] },
          },
        },
      },
      {
        status: "rejected" as const,
        interview_prep: {
          interview: {
            generated_at: "2026-03-20",
            content: { skills_to_study: ["Also ignored"] },
          },
        },
      },
    ] as Pick<Application, "status" | "interview_prep">[]

    const gaps = computeSkillGaps(apps)
    expect(gaps).toHaveLength(0)
  })

  it("returns empty array when no prep exists", () => {
    const apps = [
      { status: "phone_screen" as const, interview_prep: undefined },
    ] as Pick<Application, "status" | "interview_prep">[]

    const gaps = computeSkillGaps(apps)
    expect(gaps).toHaveLength(0)
  })

  it("normalizes skill names (case-insensitive)", () => {
    const apps = [
      {
        status: "phone_screen" as const,
        interview_prep: {
          phone_screen: {
            generated_at: "2026-03-20",
            content: { skills_to_study: ["Terraform"] },
          },
        },
      },
      {
        status: "interview" as const,
        interview_prep: {
          interview: {
            generated_at: "2026-03-21",
            content: { skills_to_study: ["terraform"] },
          },
        },
      },
    ] as Pick<Application, "status" | "interview_prep">[]

    const gaps = computeSkillGaps(apps)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].count).toBe(2)
  })
})
