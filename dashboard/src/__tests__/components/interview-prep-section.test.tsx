import { describe, it, expect } from "vitest"
import type { InterviewPrep, PrepStageKey } from "@/types"

function getVisibleSections(prep: InterviewPrep, status: string): string[] {
  const prepStages: PrepStageKey[] = ["phone_screen", "interview", "offer"]
  if (!prepStages.includes(status as PrepStageKey)) return []

  const stagePrep = prep[status as PrepStageKey]
  if (!stagePrep?.content) return ["generate_button"]

  return Object.keys(stagePrep.content)
}

function formatPrepAsMarkdown(prep: InterviewPrep, stage: PrepStageKey): string {
  const stagePrep = prep[stage]
  if (!stagePrep?.content) return ""

  const content = stagePrep.content as Record<string, unknown>
  const lines: string[] = [`# ${stage.replace("_", " ").toUpperCase()} Prep\n`]

  for (const [key, value] of Object.entries(content)) {
    const heading = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    lines.push(`## ${heading}\n`)

    if (typeof value === "string") {
      lines.push(value + "\n")
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          lines.push(`- ${item}`)
        } else if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, string>
          if (obj.situation) {
            lines.push(`### ${obj.title || "Story"}`)
            lines.push(`- **Situation:** ${obj.situation}`)
            lines.push(`- **Task:** ${obj.task}`)
            lines.push(`- **Action:** ${obj.action}`)
            lines.push(`- **Result:** ${obj.result}`)
          } else {
            lines.push(`- ${JSON.stringify(item)}`)
          }
        }
      }
      lines.push("")
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`- **${k}:** ${v}`)
      }
      lines.push("")
    }
  }

  return lines.join("\n")
}

describe("getVisibleSections", () => {
  it("shows generate button when no prep exists", () => {
    expect(getVisibleSections({}, "phone_screen")).toEqual(["generate_button"])
  })

  it("shows content sections when prep exists", () => {
    const prep: InterviewPrep = {
      phone_screen: {
        generated_at: "2026-03-20",
        content: {
          company_quick_hits: ["Founded 2010"],
          elevator_pitch: "Hi",
          likely_questions: [],
          talking_points: [],
          questions_to_ask: [],
          red_flags: [],
          salary_prep: { low: 90000, mid: 105000, high: 120000, target: 110000, source: "Glassdoor" },
          skills_to_study: [],
        },
      },
    }
    const sections = getVisibleSections(prep, "phone_screen")
    expect(sections).toContain("company_quick_hits")
    expect(sections).toContain("elevator_pitch")
    expect(sections).toContain("salary_prep")
  })

  it("returns empty for non-prep statuses", () => {
    expect(getVisibleSections({}, "applied")).toEqual([])
    expect(getVisibleSections({}, "found")).toEqual([])
    expect(getVisibleSections({}, "rejected")).toEqual([])
  })
})

describe("formatPrepAsMarkdown", () => {
  it("formats phone screen prep as markdown", () => {
    const prep: InterviewPrep = {
      phone_screen: {
        generated_at: "2026-03-20",
        content: {
          company_quick_hits: ["Founded 2010", "500 employees"],
          elevator_pitch: "I bring 20+ years of systems engineering...",
          likely_questions: ["Tell me about yourself"],
          talking_points: ["Managed 700+ VMs at Venable"],
          questions_to_ask: ["Team structure?"],
          red_flags: ["High turnover"],
          salary_prep: { low: 90000, mid: 105000, high: 120000, target: 110000, source: "Glassdoor" },
          skills_to_study: ["Terraform"],
        },
      },
    }
    const md = formatPrepAsMarkdown(prep, "phone_screen")
    expect(md).toContain("PHONE SCREEN Prep")
    expect(md).toContain("Founded 2010")
    expect(md).toContain("I bring 20+ years")
    expect(md).toContain("Tell me about yourself")
    expect(md).toContain("Terraform")
  })

  it("formats STAR stories with structure", () => {
    const prep: InterviewPrep = {
      interview: {
        generated_at: "2026-03-21",
        content: {
          technical_deep_dive: [],
          scenario_questions: [],
          star_stories: [{
            title: "SolarWinds Redesign",
            situation: "Legacy Nagios monitoring",
            task: "Replace with modern solution",
            action: "Deployed SolarWinds across 3 DCs",
            result: "80% reduction in false alerts",
          }],
          hands_on_prep: [],
          architecture_questions: [],
          knowledge_refresh: [],
          skills_to_study: [],
        },
      },
    }
    const md = formatPrepAsMarkdown(prep, "interview")
    expect(md).toContain("SolarWinds Redesign")
    expect(md).toContain("**Situation:**")
    expect(md).toContain("**Result:**")
  })

  it("returns empty string for missing stage", () => {
    expect(formatPrepAsMarkdown({}, "phone_screen")).toBe("")
  })
})
