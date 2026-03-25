# SCRUM-141: Stage-Specific Interview Prep

**Date:** 2026-03-25
**Status:** Approved
**Branch:** feature/dashboard-v2

## Overview

AI-generated prep materials for phone screens, technical interviews, and offers. Prep is stored as a JSONB column on the `applications` table and auto-generated when application status changes. Debriefs feed back into subsequent rounds. Skill gaps aggregate across all active applications into a dashboard widget.

## Migration

**File:** `supabase/migrations/006_add_interview_prep.sql`

Applied via Supabase MCP (consistent with 002/003 pattern — migration file committed for reference).

```sql
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_prep JSONB DEFAULT '{}';
```

### JSONB Schema

```json
{
  "phone_screen": {
    "generated_at": "ISO timestamp",
    "content": {
      "company_quick_hits": ["string"],
      "elevator_pitch": "string",
      "likely_questions": ["string"],
      "talking_points": ["string"],
      "questions_to_ask": ["string"],
      "red_flags": ["string"],
      "salary_prep": { "low": 0, "mid": 0, "high": 0, "target": 0, "source": "string" },
      "skills_to_study": ["string"]
    }
  },
  "interview": {
    "generated_at": "ISO timestamp",
    "content": {
      "technical_deep_dive": ["string"],
      "scenario_questions": ["string"],
      "star_stories": [{ "title": "string", "situation": "string", "task": "string", "action": "string", "result": "string" }],
      "hands_on_prep": ["string"],
      "architecture_questions": ["string"],
      "knowledge_refresh": ["string"],
      "skills_to_study": ["string"]
    }
  },
  "offer": {
    "generated_at": "ISO timestamp",
    "content": {
      "salary_analysis": { "low": 0, "mid": 0, "high": 0, "source": "string" },
      "negotiation_scripts": ["string"],
      "benefits_checklist": ["string"],
      "counter_offer_framework": { "initial": "string", "walkaway": "string", "strategy": "string" },
      "decision_matrix": { "factors": ["string"], "weights": {} }
    }
  },
  "debriefs": [{
    "round": 1,
    "date": "ISO",
    "rating": 4,
    "questions_asked": "string",
    "went_well": "string",
    "challenging": "string",
    "takeaways": "string",
    "interviewer_name": "string",
    "interviewer_role": "string"
  }]
}
```

### TypeScript Types

```typescript
interface SalaryRange {
  low: number
  mid: number
  high: number
  target?: number
  source: string
}

interface StarStory {
  title: string
  situation: string
  task: string
  action: string
  result: string
}

interface PhoneScreenContent {
  company_quick_hits: string[]
  elevator_pitch: string
  likely_questions: string[]
  talking_points: string[]
  questions_to_ask: string[]
  red_flags: string[]
  salary_prep: SalaryRange
  skills_to_study: string[]
}

interface InterviewContent {
  technical_deep_dive: string[]
  scenario_questions: string[]
  star_stories: StarStory[]
  hands_on_prep: string[]
  architecture_questions: string[]
  knowledge_refresh: string[]
  skills_to_study: string[]
}

interface OfferContent {
  salary_analysis: SalaryRange
  negotiation_scripts: string[]
  benefits_checklist: string[]
  counter_offer_framework: { initial: string; walkaway: string; strategy: string }
  decision_matrix: { factors: string[]; weights: Record<string, number> }
}

interface PrepStage<T> {
  generated_at: string
  content: T
}

interface Debrief {
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

interface InterviewPrep {
  phone_screen?: PrepStage<PhoneScreenContent>
  interview?: PrepStage<InterviewContent>
  offer?: PrepStage<OfferContent>
  debriefs?: Debrief[]
}
```

The `Application` interface gains: `interview_prep: InterviewPrep` (typed as optional — existing rows default to `'{}'` from the migration, but pre-migration rows may have `null`)

## API Routes

### POST /api/interview-prep

**Input:** `{ applicationId: string, stage: "phone_screen" | "interview" | "offer" }`

**Flow:**
1. Auth check via `createServerSupabaseClient`
2. Fetch application (`title`, `company`, `url`, `salary_range`, `interview_prep`, `status`, `notes`)
   - Note: field is `url` (not `job_url`). No `description` column exists — the Claude prompt includes the URL so web_search can fetch the job posting content.
3. Fetch conversations for this application (prior debrief context from `conversations` table)
4. Build stage-specific Claude prompt with:
   - Job details: title, company, url, salary_range, notes
   - Resume context (Joseph Fowler — 20+ years IT/systems engineering at Venable LLP, PowerShell, VMware, Splunk, Azure, AD, 700+ VM environment, 30+ Splunk dashboards)
   - Prior debriefs from `interview_prep.debriefs[]` and conversation notes
   - `tools: [{ type: "web_search_20250305", name: "web_search" }]` for company/salary lookup and job posting content
5. Parse Claude response — must handle multi-step tool_use/tool_result blocks before the final text response. Extract the text block content, parse as JSON.
6. Model: `claude-sonnet-4-6` (consistent with search-indeed, search-dice, gmail classify)
7. **Web search multi-turn loop:** Check `stop_reason` — if `"tool_use"`, extract tool_use blocks, execute web_search, re-send with `tool_result` blocks. Repeat until `stop_reason === "end_turn"`. Then extract the final text block and parse as JSON.
8. Store in `applications.interview_prep[stage]` with `generated_at` timestamp via Supabase update
9. Return the generated content

**Error handling for web search:**
- If web search returns no results, Claude falls back to generating content from title/company/resume context alone
- If the API call fails entirely, return 500 with error message — UI shows retry button
- Timeout: 120s (web search + generation can take 15-30s)

**Stage-specific prompts:**
- **phone_screen:** Company facts (via web search), elevator pitch, likely questions, talking points, questions to ask, red flags, salary range (via web search), skill gaps
- **interview:** Everything above + prior phone screen debriefs + technical deep dive, scenario questions, STAR stories mapped from Venable experience (SolarWinds redesign, PowerShell framework, 700+ VM management, Splunk dashboards, Nimble SAN expansion, Windows OS migration), hands-on prep, architecture questions, knowledge refresh
- **offer:** Everything above + all prior debriefs + salary analysis (via web search), negotiation scripts, benefits checklist, counter-offer framework, decision matrix

### POST /api/interview-prep/debrief

**Input:** `{ applicationId, round, rating, questions_asked, went_well, challenging, takeaways, interviewer_name, interviewer_role }`

**Flow:**
1. Auth check
2. Fetch current application's `interview_prep`
3. Append debrief (with `date: new Date().toISOString()`) to `interview_prep.debriefs[]` array
4. Update application via Supabase
5. Create a conversation record in `conversations` table:
   - `application_id`: from input
   - `conversation_type`: `"phone"` if application status is `phone_screen`, `"video"` if `interview`, `"note"` if `offer`
   - `date`: `new Date().toISOString()`
   - `notes`: formatted string combining went_well, challenging, takeaways
   - `sentiment`: rating (1-5)
   - `people`: `[{ name: interviewer_name, role: interviewer_role }]` (maps to `ConversationPerson`)
   - `title`: `"Round ${round} Debrief"`
6. Return updated debriefs array

## Data Layer

### use-interview-prep.ts

**Key design decision:** Since `useApplications` does `select("*")`, the `interview_prep` JSONB is already loaded on every `Application` object via the real-time subscription. The hook does NOT fetch separately — it provides action methods only.

```typescript
// Accepts the application object (already loaded by useApplications)
useInterviewPrep(application: Application)
  → {
      prep: InterviewPrep,           // reads from application.interview_prep
      currentStagePrep: PrepStage | null,  // prep for application's current status
      generating: boolean,           // loading state for generation
      submitting: boolean,           // loading state for debrief
      generatePrep(stage: string) → POST /api/interview-prep
        // Real-time subscription in useApplications auto-updates the UI
      submitDebrief(debrief: DebriefInput) → POST /api/interview-prep/debrief
    }

// Accepts applications array (already loaded by useApplications)
useSkillGaps(applications: Application[])
  → {
      skills: Array<{ skill: string; count: number }>,  // top 5
      loading: false  // pure client-side computation, no fetch
    }
  // Filters to active statuses (phone_screen, interview, offer)
  // Extracts skills_to_study from all stages' content
  // Counts frequency, returns top 5
```

## UI Components

### interview-prep-section.tsx

**Location:** In ApplicationRow, after ConversationSection.

- Collapsible section following existing ChevronDown/ChevronRight + border-t pattern
- Shows prep for the application's current status stage (maps status to stage key)
- Only visible when status is `phone_screen`, `interview`, or `offer`
- No prep → "Generate Prep" button with Sparkles icon
- Prep exists → expandable subsections per content area
- "Refresh Prep" button to regenerate with latest context
- "Copy Prep" button — copies as markdown-formatted text to clipboard
- "Log Debrief" button → opens DebriefForm dialog
- Content rendering:
  - Questions → numbered list
  - Talking points → bullet points with bold headers
  - STAR stories → structured cards (Situation/Task/Action/Result)
  - Salary data → formatted range with target highlighted
  - Skills to study → colored chips/tags
- **Loading state:** Spinner with "Generating prep..." text during API call (can take 15-30s)
- **Error state:** Error message with "Retry" button

### debrief-form.tsx

- Dialog form triggered by "Log Debrief" button in prep section
- Fields: rating (1-5 interactive stars, required), questions_asked (textarea), went_well (textarea), challenging (textarea), takeaways (textarea), interviewer_name (text input), interviewer_role (text input)
- `round` auto-populated: `(existing debriefs count) + 1`
- Validation: rating required (1-5 range)
- On submit: calls submitDebrief (dual-writes to interview_prep.debriefs AND conversations)
- Toast on success: "Debrief saved. Prep for your next round will incorporate this feedback."

### skill-gaps-widget.tsx

- Card on overview/dashboard page, placed after charts row, before ActivityFeed
- Follows KpiCard visual pattern but with list content
- Title: "Top Skills to Study"
- Each skill shows name + count badge (how many JDs mention it)
- Empty state: "No skill gaps detected yet" when no active applications have prep
- Accepts `applications` prop from the page (already loaded)

## Auto-Trigger

**Location:** `useEffect` inside `interview-prep-section.tsx` — NOT in `useApplications`.

Rationale: `computeDateUpdates` is a pure function. Coupling `useApplications` to interview prep logic creates unnecessary dependency. Instead, the prep section component watches its own application's status:

```typescript
// Inside InterviewPrepSection component
useEffect(() => {
  const prepStages = ["phone_screen", "interview", "offer"]
  if (prepStages.includes(application.status) && !prep[application.status]) {
    // Auto-generate if status is a prep stage and no prep exists yet
    generatePrep(application.status)
    toast("Generating prep materials...")
  }
}, [application.status])
```

The real-time subscription in `useApplications` ensures the UI auto-updates when the Supabase row is written by the API route.

## Tests

- Prep generation API: mock Claude response (including web_search tool_use blocks), verify structured output stored for each stage
- Debrief submission: verify dual-write to interview_prep.debriefs AND conversations table
- Skill gap aggregation: multiple applications with overlapping skills_to_study, verify top-5 ranking by frequency
- Status change auto-trigger: render prep section, change application status, verify generatePrep called
- Prep section rendering: two states — prep exists (shows content) vs doesn't exist (shows Generate button)
- Debrief form validation: rating required (1-5), round auto-increments
- Copy-to-clipboard: verify markdown format output

## Files Created/Modified

| File | Action |
|---|---|
| `supabase/migrations/006_add_interview_prep.sql` | Create |
| `src/app/api/interview-prep/route.ts` | Create |
| `src/app/api/interview-prep/debrief/route.ts` | Create |
| `src/hooks/use-interview-prep.ts` | Create |
| `src/components/applications/interview-prep-section.tsx` | Create |
| `src/components/applications/debrief-form.tsx` | Create |
| `src/components/dashboard/skill-gaps-widget.tsx` | Create |
| `src/types/index.ts` | Modify (add InterviewPrep types) |
| `src/components/applications/application-row.tsx` | Modify (add InterviewPrepSection) |
| `src/app/(main)/page.tsx` | Modify (add SkillGapsWidget) |
