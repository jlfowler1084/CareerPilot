import { describe, it, expect } from "vitest"
import {
  buildPhoneScreenPrompt,
  buildInterviewPrompt,
  buildOfferPrompt,
  RESUME_CONTEXT,
  PREP_STAGES,
} from "@/lib/interview-prep-prompts"

describe("PREP_STAGES", () => {
  it("maps application statuses to prep stage keys", () => {
    expect(PREP_STAGES).toContain("phone_screen")
    expect(PREP_STAGES).toContain("interview")
    expect(PREP_STAGES).toContain("offer")
    expect(PREP_STAGES).toHaveLength(3)
  })
})

describe("RESUME_CONTEXT", () => {
  it("includes key experience details", () => {
    expect(RESUME_CONTEXT).toContain("Joseph Fowler")
    expect(RESUME_CONTEXT).toContain("Venable LLP")
    expect(RESUME_CONTEXT).toContain("PowerShell")
    expect(RESUME_CONTEXT).toContain("VMware")
    expect(RESUME_CONTEXT).toContain("Splunk")
    expect(RESUME_CONTEXT).toContain("Azure")
    expect(RESUME_CONTEXT).toContain("Active Directory")
  })
})

describe("buildPhoneScreenPrompt", () => {
  const app = {
    title: "Systems Engineer",
    company: "Acme Corp",
    url: "https://example.com/job/123",
    salary_range: "$90k-$120k",
    notes: "Looks like a good fit",
  }

  it("includes job details", () => {
    const prompt = buildPhoneScreenPrompt(app, [])
    expect(prompt).toContain("Systems Engineer")
    expect(prompt).toContain("Acme Corp")
    expect(prompt).toContain("https://example.com/job/123")
  })

  it("includes resume context", () => {
    const prompt = buildPhoneScreenPrompt(app, [])
    expect(prompt).toContain("Joseph Fowler")
    expect(prompt).toContain("Venable LLP")
  })

  it("requests JSON output with expected keys", () => {
    const prompt = buildPhoneScreenPrompt(app, [])
    expect(prompt).toContain("company_quick_hits")
    expect(prompt).toContain("elevator_pitch")
    expect(prompt).toContain("likely_questions")
    expect(prompt).toContain("talking_points")
    expect(prompt).toContain("questions_to_ask")
    expect(prompt).toContain("red_flags")
    expect(prompt).toContain("salary_prep")
    expect(prompt).toContain("skills_to_study")
  })

  it("includes prior conversation context when provided", () => {
    const convos = [{ notes: "Discussed team size of 5" }]
    const prompt = buildPhoneScreenPrompt(app, convos)
    expect(prompt).toContain("Discussed team size of 5")
  })

  it("handles missing optional fields gracefully", () => {
    const minimal = { title: "SysAdmin", company: "TechCo", url: null, salary_range: null, notes: "" }
    const prompt = buildPhoneScreenPrompt(minimal, [])
    expect(prompt).toContain("SysAdmin")
    expect(prompt).toContain("TechCo")
  })
})

describe("buildInterviewPrompt", () => {
  const app = {
    title: "DevOps Engineer",
    company: "CloudCo",
    url: "https://example.com/job/456",
    salary_range: "$100k-$140k",
    notes: "",
  }

  it("includes STAR story guidance from Venable experience", () => {
    const prompt = buildInterviewPrompt(app, [], [])
    expect(prompt).toContain("SolarWinds")
    expect(prompt).toContain("700+")
    expect(prompt).toContain("Splunk dashboards")
  })

  it("requests JSON output with expected keys", () => {
    const prompt = buildInterviewPrompt(app, [], [])
    expect(prompt).toContain("technical_deep_dive")
    expect(prompt).toContain("scenario_questions")
    expect(prompt).toContain("star_stories")
    expect(prompt).toContain("hands_on_prep")
    expect(prompt).toContain("architecture_questions")
    expect(prompt).toContain("knowledge_refresh")
  })

  it("includes prior debriefs when provided", () => {
    const debriefs = [{ round: 1, went_well: "Good rapport with hiring manager" }]
    const prompt = buildInterviewPrompt(app, [], debriefs)
    expect(prompt).toContain("Good rapport with hiring manager")
  })
})

describe("buildOfferPrompt", () => {
  const app = {
    title: "Sr Systems Engineer",
    company: "BigCorp",
    url: "https://example.com/job/789",
    salary_range: "$120k-$160k",
    notes: "Final round went great",
  }

  it("requests negotiation-specific keys", () => {
    const prompt = buildOfferPrompt(app, [], [])
    expect(prompt).toContain("salary_analysis")
    expect(prompt).toContain("negotiation_scripts")
    expect(prompt).toContain("benefits_checklist")
    expect(prompt).toContain("counter_offer_framework")
    expect(prompt).toContain("decision_matrix")
  })

  it("includes all prior context", () => {
    const debriefs = [{ round: 1, went_well: "Technical deep dive went well" }]
    const convos = [{ notes: "Salary range confirmed at $130k" }]
    const prompt = buildOfferPrompt(app, convos, debriefs)
    expect(prompt).toContain("Technical deep dive went well")
    expect(prompt).toContain("Salary range confirmed at $130k")
  })
})
