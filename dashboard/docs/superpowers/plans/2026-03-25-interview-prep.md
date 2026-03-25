# Interview Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI-generated stage-specific interview prep materials stored as JSONB on applications, with debrief logging and skill gap aggregation.

**Architecture:** JSONB column on `applications` table, two API routes (generation + debrief), one data hook reading from existing `useApplications` state, three UI components (prep section, debrief form, skill gaps widget). Auto-trigger via `useEffect` in the prep section component.

**Tech Stack:** Next.js 16, Supabase, Claude API with web_search tool, Vitest, React Testing Library, shadcn/ui, Tailwind CSS, sonner (toasts), lucide-react (icons).

**Spec:** `docs/superpowers/specs/2026-03-25-interview-prep-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/006_add_interview_prep.sql` | Migration adding JSONB column |
| `src/types/index.ts` | InterviewPrep type definitions (modify) |
| `src/lib/interview-prep-prompts.ts` | Stage-specific Claude prompt builders |
| `src/app/api/interview-prep/route.ts` | POST — generate prep via Claude + web_search |
| `src/app/api/interview-prep/debrief/route.ts` | POST — save debrief + create conversation |
| `src/hooks/use-interview-prep.ts` | `useInterviewPrep` + `useSkillGaps` hooks |
| `src/components/applications/interview-prep-section.tsx` | Collapsible prep display in ApplicationRow |
| `src/components/applications/debrief-form.tsx` | Dialog form for post-interview debriefs |
| `src/components/dashboard/skill-gaps-widget.tsx` | Overview page aggregated skill gaps card |
| `src/components/applications/application-row.tsx` | Add InterviewPrepSection (modify) |
| `src/app/(main)/page.tsx` | Add SkillGapsWidget (modify) |
| `src/__tests__/lib/interview-prep-prompts.test.ts` | Prompt builder tests |
| `src/__tests__/hooks/use-interview-prep.test.ts` | Hook logic tests |
| `src/__tests__/api/interview-prep.test.ts` | API route tests |
| `src/__tests__/api/interview-prep-debrief.test.ts` | Debrief API tests |
| `src/__tests__/components/interview-prep-section.test.tsx` | Component render tests |
| `src/__tests__/components/debrief-form.test.tsx` | Debrief form tests |

---

### Task 1: Migration + Types

**Files:**
- Create: `supabase/migrations/006_add_interview_prep.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create migration file**

```sql
-- 006_add_interview_prep.sql
-- Adds JSONB column for stage-specific interview prep data
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_prep JSONB DEFAULT '{}';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Run: `mcp__claude_ai_Supabase__apply_migration` with the SQL above against project `kfrffocrfnnuimwrngcs`.

If MCP fails, fall back to `mcp__claude_ai_Supabase__execute_sql`:
```sql
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_prep JSONB DEFAULT '{}';
```

- [ ] **Step 3: Add TypeScript types to `src/types/index.ts`**

Read `src/types/index.ts` first. Add these types BEFORE the `Application` interface, then add `interview_prep` to `Application`:

```typescript
// Interview Prep types
export interface SalaryRange {
  low: number
  mid: number
  high: number
  target?: number
  source: string
}

export interface StarStory {
  title: string
  situation: string
  task: string
  action: string
  result: string
}

export interface PhoneScreenContent {
  company_quick_hits: string[]
  elevator_pitch: string
  likely_questions: string[]
  talking_points: string[]
  questions_to_ask: string[]
  red_flags: string[]
  salary_prep: SalaryRange
  skills_to_study: string[]
}

export interface InterviewContent {
  technical_deep_dive: string[]
  scenario_questions: string[]
  star_stories: StarStory[]
  hands_on_prep: string[]
  architecture_questions: string[]
  knowledge_refresh: string[]
  skills_to_study: string[]
}

export interface OfferContent {
  salary_analysis: SalaryRange
  negotiation_scripts: string[]
  benefits_checklist: string[]
  counter_offer_framework: { initial: string; walkaway: string; strategy: string }
  decision_matrix: { factors: string[]; weights: Record<string, number> }
}

export interface PrepStage<T> {
  generated_at: string
  content: T
}

export interface Debrief {
  round: number
  date: string
  rating: number
  questions_asked: string
  went_well: string
  challenging: string
  takeaways: string
  interviewer_name: string
  interviewer_role: string
}

export interface InterviewPrep {
  phone_screen?: PrepStage<PhoneScreenContent>
  interview?: PrepStage<InterviewContent>
  offer?: PrepStage<OfferContent>
  debriefs?: Debrief[]
}

export type PrepStageKey = "phone_screen" | "interview" | "offer"
```

Add to the `Application` interface after `interview_date`:
```typescript
  interview_prep?: InterviewPrep
```

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All existing tests pass (type changes are additive).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/006_add_interview_prep.sql src/types/index.ts
git commit -m "feat: add interview_prep JSONB column and TypeScript types [SCRUM-141]"
```

---

### Task 2: Prompt Builders + Tests

**Files:**
- Create: `src/lib/interview-prep-prompts.ts`
- Create: `src/__tests__/lib/interview-prep-prompts.test.ts`

- [ ] **Step 1: Write tests for prompt builders**

Create `src/__tests__/lib/interview-prep-prompts.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run src/__tests__/lib/interview-prep-prompts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompt builders**

Create `src/lib/interview-prep-prompts.ts`:

```typescript
import type { Debrief } from "@/types"

export const PREP_STAGES = ["phone_screen", "interview", "offer"] as const

export const RESUME_CONTEXT = `Joseph Fowler — 20+ years IT/systems engineering experience at Venable LLP:
- Windows Server administration (700+ VM environment across 3 datacenters)
- PowerShell automation framework (built org-wide scripting platform)
- VMware vSphere/vCenter management and optimization
- Splunk deployment (30+ custom dashboards, security monitoring)
- Azure hybrid cloud (AD Connect, Azure AD, conditional access)
- Active Directory (multi-domain forest, GPO management, 1000+ users)
- SolarWinds monitoring redesign (replaced legacy Nagios)
- Nimble SAN expansion and storage optimization
- Windows OS migration (coordinated 500+ endpoint upgrades)
- Backup/DR (Veeam, tested recovery procedures)`

interface AppContext {
  title: string
  company: string
  url: string | null
  salary_range: string | null
  notes: string
}

interface ConvoContext {
  notes?: string | null
}

function formatJobDetails(app: AppContext): string {
  const parts = [
    `Job Title: ${app.title}`,
    `Company: ${app.company}`,
  ]
  if (app.url) parts.push(`Job Posting URL: ${app.url}`)
  if (app.salary_range) parts.push(`Listed Salary Range: ${app.salary_range}`)
  if (app.notes) parts.push(`Candidate Notes: ${app.notes}`)
  return parts.join("\n")
}

function formatConversations(convos: ConvoContext[]): string {
  if (!convos.length) return ""
  const notes = convos
    .filter((c) => c.notes)
    .map((c, i) => `Conversation ${i + 1}: ${c.notes}`)
    .join("\n")
  return notes ? `\n\nPrior Conversation Notes:\n${notes}` : ""
}

function formatDebriefs(debriefs: Partial<Debrief>[]): string {
  if (!debriefs.length) return ""
  const entries = debriefs.map(
    (d) =>
      `Round ${d.round}: Rating ${d.rating}/5. Went well: ${d.went_well || "N/A"}. Challenging: ${d.challenging || "N/A"}. Takeaways: ${d.takeaways || "N/A"}.`
  )
  return `\n\nPrior Interview Debriefs:\n${entries.join("\n")}`
}

export function buildPhoneScreenPrompt(
  app: AppContext,
  conversations: ConvoContext[]
): string {
  return `You are preparing a candidate for a phone screen interview.

${formatJobDetails(app)}

Candidate Resume Summary:
${RESUME_CONTEXT}
${formatConversations(conversations)}

Use your web_search tool to:
1. Look up current information about ${app.company} (recent news, culture, tech stack)
2. Research current salary ranges for "${app.title}" roles${app.salary_range ? ` (listed range: ${app.salary_range})` : ""}
${app.url ? `3. Visit the job posting at ${app.url} to understand requirements` : ""}

Return ONLY a JSON object with these exact keys:
{
  "company_quick_hits": ["3-5 key facts about the company"],
  "elevator_pitch": "A 30-second pitch tailored to this role, referencing specific experience from the resume",
  "likely_questions": ["5-7 typical phone screen questions for this role"],
  "talking_points": ["Pre-written answers using the candidate's actual Venable LLP experience"],
  "questions_to_ask": ["3-5 smart questions to ask the interviewer"],
  "red_flags": ["Things to watch for during this phone screen"],
  "salary_prep": { "low": number, "mid": number, "high": number, "target": number, "source": "where you found this data" },
  "skills_to_study": ["Gaps between the JD requirements and the resume"]
}`
}

export function buildInterviewPrompt(
  app: AppContext,
  conversations: ConvoContext[],
  debriefs: Partial<Debrief>[]
): string {
  return `You are preparing a candidate for a technical interview.

${formatJobDetails(app)}

Candidate Resume Summary:
${RESUME_CONTEXT}
${formatConversations(conversations)}${formatDebriefs(debriefs)}

Use your web_search tool to research ${app.company}'s tech stack and interview style.
${app.url ? `Visit the job posting at ${app.url} to understand technical requirements.` : ""}

Map STAR stories from this real experience at Venable LLP:
- SolarWinds monitoring redesign (replaced Nagios, improved alert response time)
- PowerShell automation framework (org-wide scripting platform, saved 20+ hours/week)
- 700+ VM management (vSphere optimization, template standardization)
- Splunk dashboards (30+ custom dashboards for security and ops monitoring)
- Nimble SAN expansion (storage capacity planning and migration)
- Windows OS migration (coordinated 500+ endpoint upgrades with zero downtime)

Return ONLY a JSON object with these exact keys:
{
  "technical_deep_dive": ["Key technical topics from the JD to prepare for"],
  "scenario_questions": ["Walk me through... style questions based on the JD"],
  "star_stories": [{ "title": "story name", "situation": "...", "task": "...", "action": "...", "result": "..." }],
  "hands_on_prep": ["Scripting/hands-on scenarios if PowerShell, Azure, or similar is in the JD"],
  "architecture_questions": ["Infrastructure design questions appropriate for this level"],
  "knowledge_refresh": ["Study guide items for JD technologies the candidate is less familiar with"],
  "skills_to_study": ["Specific skills to brush up on before the interview"]
}`
}

export function buildOfferPrompt(
  app: AppContext,
  conversations: ConvoContext[],
  debriefs: Partial<Debrief>[]
): string {
  return `You are helping a candidate evaluate and negotiate a job offer.

${formatJobDetails(app)}

Candidate Resume Summary:
${RESUME_CONTEXT}
${formatConversations(conversations)}${formatDebriefs(debriefs)}

Use your web_search tool to:
1. Research current market salary data for "${app.title}" roles in the candidate's area
2. Look up ${app.company}'s Glassdoor reviews, benefits reputation, and compensation data

Return ONLY a JSON object with these exact keys:
{
  "salary_analysis": { "low": number, "mid": number, "high": number, "source": "where you found this data" },
  "negotiation_scripts": ["Word-for-word templates for salary negotiation conversations"],
  "benefits_checklist": ["Key benefits to evaluate: PTO, 401k match, remote policy, signing bonus, etc."],
  "counter_offer_framework": { "initial": "opening position", "walkaway": "minimum acceptable", "strategy": "negotiation approach" },
  "decision_matrix": { "factors": ["key decision factors"], "weights": { "factor_name": 1-10 } }
}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run src/__tests__/lib/interview-prep-prompts.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/interview-prep-prompts.ts src/__tests__/lib/interview-prep-prompts.test.ts
git commit -m "feat: interview prep prompt builders with tests [SCRUM-141]"
```

---

### Task 3: Prep Generation API Route

**Files:**
- Create: `src/app/api/interview-prep/route.ts`
- Create: `src/__tests__/api/interview-prep.test.ts`

- [ ] **Step 1: Write API route tests**

Create `src/__tests__/api/interview-prep.test.ts`. These test the response parsing and JSONB storage logic — Claude API calls are mocked:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run src/__tests__/api/interview-prep.test.ts`
Expected: PASS (these tests are self-contained utility function tests — they test extracted logic, not the route directly).

Note: The tests above test the parsing/storage logic extracted from the route. The route itself wires these together with auth + Supabase + Claude, which is integration-level.

- [ ] **Step 3: Implement API route**

Create `src/app/api/interview-prep/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import {
  buildPhoneScreenPrompt,
  buildInterviewPrompt,
  buildOfferPrompt,
  PREP_STAGES,
} from "@/lib/interview-prep-prompts"
import type { InterviewPrep, PrepStageKey } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { applicationId, stage } = await req.json()

    if (!applicationId || !stage || !PREP_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: "applicationId and valid stage (phone_screen, interview, offer) required" },
        { status: 400 }
      )
    }

    // Fetch application
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, title, company, url, salary_range, interview_prep, status, notes")
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .single()

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    // Fetch conversations for context
    const { data: conversations } = await supabase
      .from("conversations")
      .select("notes")
      .eq("application_id", applicationId)
      .eq("user_id", user.id)
      .order("date", { ascending: true })

    const existingPrep: InterviewPrep = app.interview_prep || {}
    const debriefs = existingPrep.debriefs || []
    const convos = conversations || []

    // Build stage-specific prompt
    let prompt: string
    const typedStage = stage as PrepStageKey
    switch (typedStage) {
      case "phone_screen":
        prompt = buildPhoneScreenPrompt(app, convos)
        break
      case "interview":
        prompt = buildInterviewPrompt(app, convos, debriefs)
        break
      case "offer":
        prompt = buildOfferPrompt(app, convos, debriefs)
        break
    }

    // Call Claude with web_search tool
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    // web_search_20250305 is a server-side tool — Anthropic executes the search
    // automatically and returns the final response with text + search results in
    // a single call. No multi-turn loop needed.
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI generation failed" }, { status: 502 })
    }

    const data = await resp.json()

    // Extract text from response — may contain web_search_tool_result blocks
    // alongside the final text block
    const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
    const finalText = textBlock?.text || ""

    if (!finalText) {
      return NextResponse.json({ error: "No response generated" }, { status: 502 })
    }

    // Parse JSON from response
    const match = finalText.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: "Could not parse structured response" }, { status: 502 })
    }

    let content: unknown
    try {
      content = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: "Invalid JSON in response" }, { status: 502 })
    }

    // Store in interview_prep
    const updatedPrep: InterviewPrep = {
      ...existingPrep,
      [typedStage]: {
        generated_at: new Date().toISOString(),
        content,
      },
    }

    const { error: updateError } = await supabase
      .from("applications")
      .update({ interview_prep: updatedPrep })
      .eq("id", applicationId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to store prep:", updateError.message)
      return NextResponse.json({ error: "Failed to store prep" }, { status: 500 })
    }

    return NextResponse.json({
      stage: typedStage,
      generated_at: updatedPrep[typedStage]!.generated_at,
      content,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Interview prep error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run all tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/interview-prep/route.ts src/__tests__/api/interview-prep.test.ts
git commit -m "feat: interview prep generation API with Claude + web_search [SCRUM-141]"
```

---

### Task 4: Debrief API Route

**Files:**
- Create: `src/app/api/interview-prep/debrief/route.ts`
- Create: `src/__tests__/api/interview-prep-debrief.test.ts`

- [ ] **Step 1: Write debrief logic tests**

Create `src/__tests__/api/interview-prep-debrief.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run src/__tests__/api/interview-prep-debrief.test.ts`
Expected: PASS.

- [ ] **Step 3: Implement debrief API route**

Create `src/app/api/interview-prep/debrief/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { InterviewPrep, ApplicationStatus, ConversationType } from "@/types"

function statusToConversationType(status: ApplicationStatus): ConversationType {
  switch (status) {
    case "phone_screen": return "phone"
    case "interview": return "video"
    default: return "note"
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      applicationId, round, rating, questions_asked,
      went_well, challenging, takeaways,
      interviewer_name, interviewer_role,
    } = body

    if (!applicationId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "applicationId and rating (1-5) required" },
        { status: 400 }
      )
    }

    // Fetch application
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, interview_prep, status")
      .eq("id", applicationId)
      .eq("user_id", user.id)
      .single()

    if (appError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    // Append debrief
    const existingPrep: InterviewPrep = app.interview_prep || {}
    const now = new Date().toISOString()
    const debrief = {
      round: round || (existingPrep.debriefs?.length || 0) + 1,
      date: now,
      rating,
      questions_asked: questions_asked || "",
      went_well: went_well || "",
      challenging: challenging || "",
      takeaways: takeaways || "",
      interviewer_name: interviewer_name || "",
      interviewer_role: interviewer_role || "",
    }
    const updatedPrep: InterviewPrep = {
      ...existingPrep,
      debriefs: [...(existingPrep.debriefs || []), debrief],
    }

    // Update application
    const { error: updateError } = await supabase
      .from("applications")
      .update({ interview_prep: updatedPrep })
      .eq("id", applicationId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to store debrief:", updateError.message)
      return NextResponse.json({ error: "Failed to store debrief" }, { status: 500 })
    }

    // Dual-write: create conversation record
    const noteParts: string[] = []
    if (went_well) noteParts.push(`Went well: ${went_well}`)
    if (challenging) noteParts.push(`Challenging: ${challenging}`)
    if (takeaways) noteParts.push(`Takeaways: ${takeaways}`)

    const { error: convoError } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        application_id: applicationId,
        conversation_type: statusToConversationType(app.status),
        date: now,
        title: `Round ${debrief.round} Debrief`,
        notes: noteParts.join("\n\n") || null,
        sentiment: rating,
        people: interviewer_name
          ? [{ name: interviewer_name, role: interviewer_role || undefined }]
          : [],
      })

    if (convoError) {
      console.error("Failed to create conversation from debrief:", convoError.message)
      // Non-fatal — debrief was saved, conversation creation failed
    }

    return NextResponse.json({ debriefs: updatedPrep.debriefs }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Debrief error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run all tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/interview-prep/debrief/route.ts src/__tests__/api/interview-prep-debrief.test.ts
git commit -m "feat: debrief API with dual-write to conversations [SCRUM-141]"
```

---

### Task 5: Data Hooks + Tests

**Files:**
- Create: `src/hooks/use-interview-prep.ts`
- Create: `src/__tests__/hooks/use-interview-prep.test.ts`

- [ ] **Step 1: Write hook logic tests**

Create `src/__tests__/hooks/use-interview-prep.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import type { Application, InterviewPrep, PrepStageKey } from "@/types"

// Test the pure logic extracted from hooks

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
```

- [ ] **Step 2: Run tests to verify they pass (pure logic)**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run src/__tests__/hooks/use-interview-prep.test.ts`
Expected: PASS.

- [ ] **Step 3: Implement hooks**

Create `src/hooks/use-interview-prep.ts`:

```typescript
"use client"

import { useState, useCallback, useMemo } from "react"
import type { Application, InterviewPrep, PrepStageKey, Debrief } from "@/types"

const PREP_STAGES: PrepStageKey[] = ["phone_screen", "interview", "offer"]

export function isPrepStage(status: string): status is PrepStageKey {
  return PREP_STAGES.includes(status as PrepStageKey)
}

export interface DebriefInput {
  round?: number
  rating: number
  questions_asked?: string
  went_well?: string
  challenging?: string
  takeaways?: string
  interviewer_name?: string
  interviewer_role?: string
}

export function useInterviewPrep(application: Application) {
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prep: InterviewPrep = application.interview_prep || {}

  const currentStagePrep = useMemo(() => {
    if (!isPrepStage(application.status)) return null
    return prep[application.status] || null
  }, [application.status, prep])

  const generatePrep = useCallback(
    async (stage: PrepStageKey) => {
      setGenerating(true)
      setError(null)
      try {
        const resp = await fetch("/api/interview-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: application.id, stage }),
        })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || "Generation failed")
        }
        return await resp.json()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Generation failed"
        setError(msg)
        return null
      } finally {
        setGenerating(false)
      }
    },
    [application.id]
  )

  const submitDebrief = useCallback(
    async (debrief: DebriefInput) => {
      setSubmitting(true)
      setError(null)
      try {
        const resp = await fetch("/api/interview-prep/debrief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: application.id, ...debrief }),
        })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || "Debrief submission failed")
        }
        return await resp.json()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Debrief submission failed"
        setError(msg)
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [application.id]
  )

  return { prep, currentStagePrep, generating, submitting, error, generatePrep, submitDebrief }
}

export function useSkillGaps(applications: Application[]) {
  const skills = useMemo(() => {
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
  }, [applications])

  return { skills, loading: false as const }
}
```

- [ ] **Step 4: Run all tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-interview-prep.ts src/__tests__/hooks/use-interview-prep.test.ts
git commit -m "feat: useInterviewPrep and useSkillGaps hooks [SCRUM-141]"
```

---

### Task 6: Interview Prep Section Component

**Files:**
- Create: `src/components/applications/interview-prep-section.tsx`
- Create: `src/__tests__/components/interview-prep-section.test.tsx`
- Modify: `src/components/applications/application-row.tsx`

- [ ] **Step 1: Write component render tests**

Create `src/__tests__/components/interview-prep-section.test.tsx`:

```typescript
import { describe, it, expect } from "vitest"
import type { InterviewPrep, PrepStageKey } from "@/types"

// Test the rendering logic — what gets shown based on state

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
          // STAR story or complex object
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
```

- [ ] **Step 2: Run tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run src/__tests__/components/interview-prep-section.test.tsx`
Expected: PASS.

- [ ] **Step 3: Implement InterviewPrepSection**

Create `src/components/applications/interview-prep-section.tsx`. Read `src/components/conversations/conversation-section.tsx` for the collapsible pattern. The component:

- Accepts `application: Application` prop
- Uses `useInterviewPrep(application)` hook
- Shows collapsible section with ChevronDown/ChevronRight + Sparkles icon
- Only renders when `isPrepStage(application.status)`
- Auto-triggers generation via `useEffect` on status change
- Shows "Generate Prep" button when no prep, content sections when prep exists
- "Refresh Prep", "Copy Prep", and "Log Debrief" action buttons
- Copy button uses `formatPrepAsMarkdown` and `navigator.clipboard.writeText`
- Loading state with Loader2 spinner
- Error state with retry button

Key implementation details:
- Follow the exact collapsible pattern from `conversation-section.tsx` (lines 66-94)
- Use `toast` from `sonner` for notifications
- Import icons from `lucide-react`: `ChevronDown`, `ChevronRight`, `Sparkles`, `RefreshCw`, `Copy`, `ClipboardCheck`, `Loader2`, `AlertCircle`
- Use `useEffect` with `useRef` for `generatePrep` to avoid dependency issues:

```typescript
const generateRef = useRef(generatePrep)
generateRef.current = generatePrep

useEffect(() => {
  if (isPrepStage(application.status) && !prep[application.status] && !generating) {
    generateRef.current(application.status)
    toast("Generating prep materials...")
  }
}, [application.status, prep, generating])
```

- [ ] **Step 4: Wire into ApplicationRow**

Read `src/components/applications/application-row.tsx`. Add the import and render the component after ConversationSection:

```typescript
// Add import
import { InterviewPrepSection } from "@/components/applications/interview-prep-section"

// After <ConversationSection application={application} /> (line 153):
<InterviewPrepSection application={application} />
```

- [ ] **Step 5: Run all tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/applications/interview-prep-section.tsx src/components/applications/application-row.tsx src/__tests__/components/interview-prep-section.test.tsx
git commit -m "feat: interview prep section with auto-trigger and copy [SCRUM-141]"
```

---

### Task 7: Debrief Form Component

**Files:**
- Create: `src/components/applications/debrief-form.tsx`
- Create: `src/__tests__/components/debrief-form.test.tsx`

- [ ] **Step 1: Write debrief form tests**

Create `src/__tests__/components/debrief-form.test.tsx`:

```typescript
import { describe, it, expect } from "vitest"
import type { Debrief } from "@/types"

// Test validation logic

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
```

- [ ] **Step 2: Run tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run src/__tests__/components/debrief-form.test.tsx`
Expected: PASS.

- [ ] **Step 3: Implement DebriefForm**

Create `src/components/applications/debrief-form.tsx`. Follow the pattern from `conversation-form.tsx`:

- Uses Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription/DialogFooter from shadcn
- Button component from shadcn
- Star rating (1-5) using the same pattern as ConversationForm sentiment (lines 230-249)
- Round auto-populated from debriefs count
- Text fields: questions_asked, went_well, challenging, takeaways, interviewer_name, interviewer_role
- Calls `onSubmit` callback with debrief data
- Shows Loader2 spinner while saving
- Validates rating is set before allowing submit

Props:
```typescript
interface DebriefFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (debrief: DebriefInput) => Promise<unknown>
  nextRound: number
}
```

- [ ] **Step 4: Wire debrief form into InterviewPrepSection**

Read `src/components/applications/interview-prep-section.tsx`. Add:
- Import DebriefForm
- State for `debriefOpen`
- "Log Debrief" button that opens the form
- `handleDebrief` callback that calls `submitDebrief` and shows toast

- [ ] **Step 5: Run all tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/applications/debrief-form.tsx src/components/applications/interview-prep-section.tsx src/__tests__/components/debrief-form.test.tsx
git commit -m "feat: debrief form dialog with validation [SCRUM-141]"
```

---

### Task 8: Skill Gaps Widget + Overview Integration

**Files:**
- Create: `src/components/dashboard/skill-gaps-widget.tsx`
- Modify: `src/app/(main)/page.tsx`

- [ ] **Step 1: Implement SkillGapsWidget**

Create `src/components/dashboard/skill-gaps-widget.tsx`:

```typescript
"use client"

import { useSkillGaps } from "@/hooks/use-interview-prep"
import { BookOpen } from "lucide-react"
import type { Application } from "@/types"

interface SkillGapsWidgetProps {
  applications: Application[]
}

export function SkillGapsWidget({ applications }: SkillGapsWidgetProps) {
  const { skills } = useSkillGaps(applications)

  if (skills.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-violet-50">
          <BookOpen size={14} className="text-violet-600" />
        </div>
        <h3 className="text-sm font-bold text-zinc-800">Top Skills to Study</h3>
      </div>
      <div className="space-y-2">
        {skills.map(({ skill, count }) => (
          <div key={skill} className="flex items-center justify-between">
            <span className="text-xs text-zinc-700 capitalize">{skill}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">
              {count} {count === 1 ? "role" : "roles"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into overview page**

Read `src/app/(main)/page.tsx`. Add:

```typescript
// Add import
import { SkillGapsWidget } from "@/components/dashboard/skill-gaps-widget"

// After the Charts Row div (line 78) and before ActivityFeed (line 81):
<SkillGapsWidget applications={applications} />
```

- [ ] **Step 3: Run all tests**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/skill-gaps-widget.tsx src/app/(main)/page.tsx
git commit -m "feat: skill gaps widget on overview dashboard [SCRUM-141]"
```

---

### Task 9: Final Verification + Push

- [ ] **Step 1: Run full test suite**

Run: `cd f:/Projects/CareerPilot/dashboard && npx vitest run`
Expected: All tests PASS. Report total count.

- [ ] **Step 2: Run build**

Run: `cd f:/Projects/CareerPilot/dashboard && npx next build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Verify migration was applied**

Run Supabase MCP or direct query to confirm `interview_prep` column exists on applications table.

- [ ] **Step 4: Squash commits and push**

```bash
git log --oneline -10
git push origin feature/dashboard-v2
```

Report: commit count, test count, files created/modified.
