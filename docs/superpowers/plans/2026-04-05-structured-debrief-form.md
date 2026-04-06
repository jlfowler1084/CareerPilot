# CAR-54: Structured Debrief Form + AI Analysis Feedback Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured post-interview debrief form that captures what happened, runs AI analysis on the notes + all prior debriefs, surfaces cross-application patterns, and feeds insights back into interview prep generation.

**Architecture:** New `DebriefFormModal` component with structured fields (stage, went_well, was_hard, do_differently, tags, star rating). On save, inserts to `debriefs` table, then fires background AI analysis via a new `/api/debriefs/analyze` route that receives all debriefs (this app + cross-app) for pattern detection. Cross-app patterns rendered client-side from aggregated debrief data. Interview prep generation enhanced to query debriefs table and inject debrief context into prompts.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Supabase (client + server), Claude Haiku (AI analysis), existing `@base-ui/react/dialog` for modal, sonner for toasts.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/ui/tag-input.tsx` | Reusable tag/chip input component |
| Create | `src/components/ui/star-rating.tsx` | Clickable 1-5 star rating component |
| Create | `src/components/coaching/debrief-form-modal.tsx` | Structured debrief form in a dialog modal |
| Create | `src/app/api/debriefs/analyze/route.ts` | AI analysis of structured debrief with cross-app context |
| Create | `src/components/coaching/cross-app-patterns.tsx` | Cross-application pattern aggregation display |
| Modify | `src/hooks/use-debriefs.ts` | Add `saveStructuredDebrief()`, `fetchAllDebriefs()` |
| Modify | `src/components/coaching/coaching-section.tsx` | Add "Add Debrief" button, wire modal + cross-app patterns |
| Modify | `src/types/coaching.ts` | Add `DebriefAiAnalysis` interface, `overall_rating` to `DebriefRecord` |
| Modify | `src/types/index.ts` | Add `"debrief_added"` to `ApplicationEventType` |
| Modify | `src/lib/export-debrief.ts` | Include structured fields + new AI analysis fields in export |
| Modify | `src/lib/interview-prep-prompts.ts` | Add `formatDebriefRecords()` for debriefs-table context |
| Modify | `src/app/api/interview-prep/route.ts` | Fetch debriefs from debriefs table, pass to prompt builders |
| Modify | `src/components/coaching/debrief-history.tsx` | Show structured fields + "Analyzing..." badge |
| Modify | `feature-manifest.json` | Add entries for new features |

---

### Task 1: Tag Input + Star Rating UI Components

**Files:**
- Create: `dashboard/src/components/ui/tag-input.tsx`
- Create: `dashboard/src/components/ui/star-rating.tsx`

- [ ] **Step 1: Create TagInput component**

```tsx
// dashboard/src/components/ui/tag-input.tsx
"use client"

import { useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState("")

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault()
      if (!value.includes(input.trim())) {
        onChange([...value, input.trim()])
      }
      setInput("")
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-zinc-200 rounded-lg min-h-[36px] focus-within:border-blue-300">
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded-md"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="text-blue-400 hover:text-blue-600"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent text-zinc-700 placeholder:text-zinc-400"
      />
    </div>
  )
}
```

- [ ] **Step 2: Create StarRating component**

```tsx
// dashboard/src/components/ui/star-rating.tsx
"use client"

import { useState } from "react"
import { Star } from "lucide-react"

interface StarRatingProps {
  value: number
  onChange: (rating: number) => void
  max?: number
}

export function StarRating({ value, onChange, max = 5 }: StarRatingProps) {
  const [hovered, setHovered] = useState(0)

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="p-0.5 transition-colors"
        >
          <Star
            size={16}
            className={
              star <= (hovered || value)
                ? "fill-amber-400 text-amber-400"
                : "text-zinc-300"
            }
          />
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/ui/tag-input.tsx dashboard/src/components/ui/star-rating.tsx
git commit -m "feat: CAR-54 add TagInput and StarRating UI components"
```

---

### Task 2: Type Updates

**Files:**
- Modify: `dashboard/src/types/coaching.ts`
- Modify: `dashboard/src/types/index.ts`

- [ ] **Step 1: Add DebriefAiAnalysis interface and overall_rating to DebriefRecord**

In `dashboard/src/types/coaching.ts`, add after the `DebriefRecord` interface:

```ts
export interface DebriefAiAnalysis {
  patterns: string[]
  strengths: string[]
  improvement_areas: string[]
  study_recommendations: string[]
  next_round_focus: string
}
```

And update `DebriefRecord` to add `overall_rating`:

```ts
export interface DebriefRecord {
  id: string
  application_id: string
  user_id: string
  stage: string
  went_well: string | null
  was_hard: string | null
  do_differently: string | null
  key_takeaways: string[] | null
  interviewer_names: string[] | null
  topics_covered: string[] | null
  overall_rating: number | null        // <-- ADD THIS
  ai_analysis: CoachingAnalysis | null
  model_used: string | null
  generation_cost_cents: number
  created_at: string
}
```

- [ ] **Step 2: Add "debrief_added" to ApplicationEventType**

In `dashboard/src/types/index.ts`, update the union:

```ts
export type ApplicationEventType =
  | "status_change"
  | "note_added"
  | "resume_tailored"
  | "calendar_scheduled"
  | "contact_added"
  | "cover_letter_generated"
  | "follow_up"
  | "tracked"
  | "debrief_added"
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/types/coaching.ts dashboard/src/types/index.ts
git commit -m "feat: CAR-54 add DebriefAiAnalysis type and debrief_added event type"
```

---

### Task 3: Debrief Analyze API Route

**Files:**
- Create: `dashboard/src/app/api/debriefs/analyze/route.ts`

- [ ] **Step 1: Create the API route**

This route receives a debrief ID, fetches all debriefs for context, and runs Haiku analysis.

```ts
// dashboard/src/app/api/debriefs/analyze/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { parseJsonResponse } from "@/lib/json-utils"
import type { Json } from "@/types/database.types"

const DEBRIEF_ANALYSIS_PROMPT = `You are an interview performance analyst. Analyze the candidate's structured debrief notes and identify patterns, strengths, and areas for improvement.

The candidate is Joseph Fowler, a systems administrator/engineer with 20+ years of experience specializing in PowerShell, VMware, Splunk, Active Directory, and Azure.

Respond with raw JSON only. No markdown formatting, no code fences, no preamble.

Return a JSON object with:
{
  "patterns": ["Recurring themes across interviews — be specific, e.g. 'Azure AD questions appeared in 3 of 5 interviews'"],
  "strengths": ["Things consistently done well — e.g. 'PowerShell automation stories land well'"],
  "improvement_areas": ["Specific gaps to address — e.g. 'Struggled with DNS troubleshooting scenario questions'"],
  "study_recommendations": ["Topics to review before next round — e.g. 'Review DHCP failover and split-scope configs'"],
  "next_round_focus": "Summary of what to emphasize in the next interview based on this debrief"
}

Rules:
- Be specific and actionable ("Study DHCP failover" not "Review networking")
- Look for patterns across the full debrief history, not just the current one
- Reference concrete topics, technologies, and question types
- If there are prior debriefs, compare this round to previous rounds

Return ONLY valid JSON. No markdown, no backticks, no preamble.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { debriefId } = await req.json()
    if (!debriefId) {
      return NextResponse.json({ error: "debriefId is required" }, { status: 400 })
    }

    // Fetch the current debrief
    const { data: currentDebrief, error: debriefError } = await supabase
      .from("debriefs")
      .select("*")
      .eq("id", debriefId)
      .eq("user_id", user.id)
      .single()

    if (debriefError || !currentDebrief) {
      return NextResponse.json({ error: "Debrief not found" }, { status: 404 })
    }

    // Fetch application context
    const { data: app } = await supabase
      .from("applications")
      .select("title, company")
      .eq("id", currentDebrief.application_id)
      .maybeSingle()

    // Fetch all prior debriefs for THIS application (for round-over-round progression)
    const { data: appDebriefs } = await supabase
      .from("debriefs")
      .select("stage, went_well, was_hard, do_differently, key_takeaways, topics_covered, ai_analysis, created_at")
      .eq("application_id", currentDebrief.application_id)
      .eq("user_id", user.id)
      .neq("id", debriefId)
      .order("created_at", { ascending: true })

    // Fetch all debriefs across ALL applications (for cross-app patterns)
    const { data: allDebriefs } = await supabase
      .from("debriefs")
      .select("stage, went_well, was_hard, topics_covered, key_takeaways, ai_analysis, created_at, application_id")
      .eq("user_id", user.id)
      .neq("id", debriefId)
      .order("created_at", { ascending: true })

    // Build context for the AI
    const totalDebriefCount = (allDebriefs?.length || 0) + 1
    const contextParts: string[] = [
      `Current application: ${app?.title || "Unknown"} at ${app?.company || "Unknown"}`,
      `This is debrief ${totalDebriefCount} across all applications.`,
      "",
      "--- Current Debrief ---",
      `Stage: ${currentDebrief.stage}`,
      `What went well: ${currentDebrief.went_well || "Not provided"}`,
      `What was hard: ${currentDebrief.was_hard || "Not provided"}`,
      `What I'd do differently: ${currentDebrief.do_differently || "Not provided"}`,
      `Key takeaways: ${(currentDebrief.key_takeaways as string[] || []).join(", ") || "None"}`,
      `Topics covered: ${(currentDebrief.topics_covered as string[] || []).join(", ") || "None"}`,
    ]

    if (appDebriefs && appDebriefs.length > 0) {
      contextParts.push("", "--- Prior Debriefs for This Application ---")
      for (const d of appDebriefs) {
        contextParts.push(
          `\n${d.stage} (${new Date(d.created_at).toLocaleDateString()}):`,
          `  Went well: ${d.went_well || "N/A"}`,
          `  Was hard: ${d.was_hard || "N/A"}`,
          `  Topics: ${(d.topics_covered as string[] || []).join(", ") || "N/A"}`,
        )
      }
    }

    if (allDebriefs && allDebriefs.length > 0) {
      // Summarize cross-app patterns (don't dump everything — summarize topics)
      const allTopics = allDebriefs
        .flatMap((d) => (d.topics_covered as string[]) || [])
      const topicCounts: Record<string, number> = {}
      for (const t of allTopics) {
        topicCounts[t] = (topicCounts[t] || 0) + 1
      }
      const sortedTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([topic, count]) => `${topic} (${count}x)`)

      if (sortedTopics.length > 0) {
        contextParts.push(
          "",
          "--- Cross-Application Topic Frequency ---",
          sortedTopics.join(", ")
        )
      }

      // Summarize what was hard across all debriefs
      const hardItems = allDebriefs
        .filter((d) => d.was_hard)
        .map((d) => d.was_hard as string)
      if (hardItems.length > 0) {
        contextParts.push(
          "",
          "--- Recurring Challenges Across All Interviews ---",
          hardItems.join("\n")
        )
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    // Haiku: structured pattern extraction from debrief notes
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: DEBRIEF_ANALYSIS_PROMPT,
        messages: [{ role: "user", content: contextParts.join("\n") }],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 })
    }

    const data = await resp.json()

    if (data.stop_reason === "max_tokens") {
      console.error("Debrief analysis truncated")
      return NextResponse.json({ error: "AI response truncated" }, { status: 502 })
    }

    const textBlock = data.content?.find((c: { type: string }) => c.type === "text")
    const finalText = textBlock?.text || ""

    if (!finalText) {
      return NextResponse.json({ error: "No response generated" }, { status: 502 })
    }

    let analysis: Record<string, unknown>
    try {
      analysis = parseJsonResponse(finalText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse AI response"
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Update the debrief row with ai_analysis
    const { error: updateError } = await supabase
      .from("debriefs")
      .update({
        ai_analysis: analysis as unknown as Json,
        model_used: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        generation_cost_cents: 0,
      })
      .eq("id", debriefId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to update debrief with analysis:", updateError.message)
      return NextResponse.json({ error: "Failed to store analysis" }, { status: 500 })
    }

    return NextResponse.json({ analysis }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Debrief analyze error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/debriefs/analyze/route.ts
git commit -m "feat: CAR-54 add structured debrief AI analysis API route"
```

---

### Task 4: Update use-debriefs Hook

**Files:**
- Modify: `dashboard/src/hooks/use-debriefs.ts`

- [ ] **Step 1: Add saveStructuredDebrief and fetchAllUserDebriefs**

Replace the full file content:

```ts
// dashboard/src/hooks/use-debriefs.ts
"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DebriefRecord } from "@/types"

const supabase = createClient()

interface StructuredDebriefInput {
  applicationId: string
  stage: string
  went_well: string
  was_hard: string
  do_differently: string
  key_takeaways: string[]
  interviewer_names: string[]
  topics_covered: string[]
  overall_rating: number
}

export function useDebriefs(applicationId: string) {
  const [debriefs, setDebriefs] = useState<DebriefRecord[]>([])
  const [allUserDebriefs, setAllUserDebriefs] = useState<DebriefRecord[]>([])
  const [loading, setLoading] = useState(true)
  const hasFetched = useRef(false)

  const fetchDebriefs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("debriefs")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setDebriefs(data as unknown as DebriefRecord[])
    }
    setLoading(false)
  }, [applicationId])

  const fetchAllUserDebriefs = useCallback(async () => {
    const { data } = await supabase
      .from("debriefs")
      .select("*")
      .order("created_at", { ascending: false })

    if (data) {
      setAllUserDebriefs(data as unknown as DebriefRecord[])
    }
  }, [])

  useEffect(() => {
    hasFetched.current = false
  }, [applicationId])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchDebriefs()
      fetchAllUserDebriefs()
    }
  }, [fetchDebriefs, fetchAllUserDebriefs])

  const addDebrief = useCallback((debrief: DebriefRecord) => {
    setDebriefs((prev) => [debrief, ...prev])
    setAllUserDebriefs((prev) => [debrief, ...prev])
  }, [])

  const saveStructuredDebrief = useCallback(async (input: StructuredDebriefInput): Promise<DebriefRecord | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from("debriefs")
      .insert({
        application_id: input.applicationId,
        user_id: user.id,
        stage: input.stage,
        went_well: input.went_well || null,
        was_hard: input.was_hard || null,
        do_differently: input.do_differently || null,
        key_takeaways: input.key_takeaways.length > 0 ? input.key_takeaways : null,
        interviewer_names: input.interviewer_names.length > 0 ? input.interviewer_names : null,
        topics_covered: input.topics_covered.length > 0 ? input.topics_covered : null,
        overall_rating: input.overall_rating || null,
        ai_analysis: null,
        model_used: null,
        generation_cost_cents: 0,
      })
      .select()
      .single()

    if (error || !data) {
      console.error("Failed to save debrief:", error?.message)
      return null
    }

    const debrief = data as unknown as DebriefRecord
    addDebrief(debrief)
    return debrief
  }, [addDebrief])

  const updateDebriefAnalysis = useCallback((debriefId: string, analysis: Record<string, unknown>) => {
    const update = (prev: DebriefRecord[]) =>
      prev.map((d) => d.id === debriefId ? { ...d, ai_analysis: analysis as DebriefRecord["ai_analysis"] } : d)
    setDebriefs(update)
    setAllUserDebriefs(update)
  }, [])

  return { debriefs, allUserDebriefs, loading, fetchDebriefs, addDebrief, saveStructuredDebrief, updateDebriefAnalysis }
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/hooks/use-debriefs.ts
git commit -m "feat: CAR-54 add saveStructuredDebrief and cross-app debrief fetching"
```

---

### Task 5: Structured Debrief Form Modal

**Files:**
- Create: `dashboard/src/components/coaching/debrief-form-modal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
// dashboard/src/components/coaching/debrief-form-modal.tsx
"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { TagInput } from "@/components/ui/tag-input"
import { StarRating } from "@/components/ui/star-rating"
import type { ApplicationStatus } from "@/types"

interface DebriefFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationStatus: ApplicationStatus
  saving: boolean
  onSave: (data: DebriefFormData) => void
}

export interface DebriefFormData {
  stage: string
  went_well: string
  was_hard: string
  do_differently: string
  key_takeaways: string[]
  interviewer_names: string[]
  topics_covered: string[]
  overall_rating: number
}

const STAGE_OPTIONS = [
  { value: "phone_screen", label: "Phone Screen" },
  { value: "technical", label: "Technical" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "final_round", label: "Final Round" },
  { value: "offer", label: "Offer" },
]

function inferStage(status: ApplicationStatus): string {
  if (status === "phone_screen") return "phone_screen"
  if (status === "interview") return "technical"
  if (status === "offer") return "offer"
  return "phone_screen"
}

export function DebriefFormModal({
  open,
  onOpenChange,
  applicationStatus,
  saving,
  onSave,
}: DebriefFormModalProps) {
  const [stage, setStage] = useState(inferStage(applicationStatus))
  const [wentWell, setWentWell] = useState("")
  const [wasHard, setWasHard] = useState("")
  const [doDifferently, setDoDifferently] = useState("")
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([])
  const [interviewerNames, setInterviewerNames] = useState<string[]>([])
  const [topicsCovered, setTopicsCovered] = useState<string[]>([])
  const [overallRating, setOverallRating] = useState(0)

  const canSave = wentWell.trim() || wasHard.trim() || doDifferently.trim()

  function handleSave() {
    onSave({
      stage,
      went_well: wentWell,
      was_hard: wasHard,
      do_differently: doDifferently,
      key_takeaways: keyTakeaways,
      interviewer_names: interviewerNames,
      topics_covered: topicsCovered,
      overall_rating: overallRating,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post-Interview Debrief</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stage */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Interview Stage *
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-300"
            >
              {STAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* What went well */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              What went well *
            </label>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              placeholder="What aspects of the interview went well?"
              className="w-full h-20 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
            />
          </div>

          {/* What was hard */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              What was hard *
            </label>
            <textarea
              value={wasHard}
              onChange={(e) => setWasHard(e.target.value)}
              placeholder="What questions or topics were challenging?"
              className="w-full h-20 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
            />
          </div>

          {/* What I'd do differently */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              What I'd do differently *
            </label>
            <textarea
              value={doDifferently}
              onChange={(e) => setDoDifferently(e.target.value)}
              placeholder="What would you change about your approach?"
              className="w-full h-20 text-xs border border-zinc-200 rounded-lg p-3 resize-none focus:outline-none focus:border-blue-300 text-zinc-700"
            />
          </div>

          {/* Overall Rating */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Overall Rating
            </label>
            <StarRating value={overallRating} onChange={setOverallRating} />
          </div>

          {/* Key Takeaways */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Key Takeaways
            </label>
            <TagInput
              value={keyTakeaways}
              onChange={setKeyTakeaways}
              placeholder="Type a takeaway and press Enter"
            />
          </div>

          {/* Interviewer Names */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Interviewer Names
            </label>
            <TagInput
              value={interviewerNames}
              onChange={setInterviewerNames}
              placeholder="Type a name and press Enter"
            />
          </div>

          {/* Topics Covered */}
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1 block">
              Topics Covered
            </label>
            <TagInput
              value={topicsCovered}
              onChange={setTopicsCovered}
              placeholder="Type a topic and press Enter"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Saving...
              </>
            ) : (
              "Save Debrief"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/coaching/debrief-form-modal.tsx
git commit -m "feat: CAR-54 add structured debrief form modal component"
```

---

### Task 6: Wire Form into Coaching Section

**Files:**
- Modify: `dashboard/src/components/coaching/coaching-section.tsx`

- [ ] **Step 1: Add imports, state, and handler for the structured debrief form**

Add these imports at the top:
```tsx
import { DebriefFormModal, type DebriefFormData } from "@/components/coaching/debrief-form-modal"
import { useApplicationEvents } from "@/hooks/use-application-events"
```

Add state and handler inside the component (after existing state declarations):
```tsx
const [formOpen, setFormOpen] = useState(false)
const [formSaving, setFormSaving] = useState(false)
const { addEvent } = useApplicationEvents(application.id)

async function handleStructuredDebrief(data: DebriefFormData) {
  setFormSaving(true)
  const debrief = await saveStructuredDebrief({
    applicationId: application.id,
    ...data,
  })
  if (debrief) {
    toast.success("Debrief saved. AI analysis running...")
    setFormOpen(false)

    // Log application event
    addEvent(application.id, "debrief_added", `Post-interview debrief logged for ${data.stage}`)

    // Fire AI analysis in background
    fetch("/api/debriefs/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debriefId: debrief.id }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.analysis) {
          updateDebriefAnalysis(debrief.id, result.analysis)
          toast.success("Analysis complete")
        }
      })
      .catch(() => {
        toast.error("AI analysis failed")
      })
  } else {
    toast.error("Failed to save debrief")
  }
  setFormSaving(false)
}
```

Update the destructured `useDebriefs` return to include new functions:
```tsx
const { debriefs, allUserDebriefs, loading: debriefsLoading, addDebrief, saveStructuredDebrief, updateDebriefAnalysis } = useDebriefs(application.id)
```

- [ ] **Step 2: Add "Add Debrief" button next to "Analyze Debrief"**

In the action buttons `<div className="flex gap-2">`, add a new button BEFORE "Analyze Debrief":

```tsx
<button
  onClick={() => setFormOpen(true)}
  className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
>
  Add Debrief
</button>
```

- [ ] **Step 3: Add the modal and cross-app patterns below practice mode**

After the `{/* Practice mode */}` block (before the closing `</div>` of the `{open && (` block), add:

```tsx
{/* Structured debrief form modal */}
<DebriefFormModal
  open={formOpen}
  onOpenChange={setFormOpen}
  applicationStatus={application.status}
  saving={formSaving}
  onSave={handleStructuredDebrief}
/>
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/coaching/coaching-section.tsx
git commit -m "feat: CAR-54 wire structured debrief form into coaching section"
```

---

### Task 7: Update Debrief History for Structured Fields

**Files:**
- Modify: `dashboard/src/components/coaching/debrief-history.tsx`

- [ ] **Step 1: Show structured fields and "Analyzing..." badge**

In the debrief card header, after the stage badge, add an analyzing indicator when `ai_analysis` is null but the debrief has structured content:

```tsx
{!analysis && debrief.went_well && (
  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded animate-pulse">
    Analyzing...
  </span>
)}
```

In the expanded section, BEFORE the `<CoachingReport>`, add structured fields display when they exist:

```tsx
{/* Structured debrief fields */}
{debrief.went_well && (
  <div className="space-y-2 mb-3">
    <div>
      <span className="text-[10px] font-semibold text-zinc-500">What went well:</span>
      <p className="text-xs text-zinc-700 mt-0.5">{debrief.went_well}</p>
    </div>
    {debrief.was_hard && (
      <div>
        <span className="text-[10px] font-semibold text-zinc-500">What was hard:</span>
        <p className="text-xs text-zinc-700 mt-0.5">{debrief.was_hard}</p>
      </div>
    )}
    {debrief.do_differently && (
      <div>
        <span className="text-[10px] font-semibold text-zinc-500">What I'd do differently:</span>
        <p className="text-xs text-zinc-700 mt-0.5">{debrief.do_differently}</p>
      </div>
    )}
    {debrief.topics_covered && debrief.topics_covered.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {debrief.topics_covered.map((t, i) => (
          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
            {t}
          </span>
        ))}
      </div>
    )}
    {debrief.key_takeaways && debrief.key_takeaways.length > 0 && (
      <div>
        <span className="text-[10px] font-semibold text-zinc-500">Key takeaways:</span>
        <ul className="mt-0.5">
          {debrief.key_takeaways.map((t, i) => (
            <li key={i} className="text-xs text-zinc-700">- {t}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}

{/* AI Analysis (structured debrief format) */}
{analysis && !analysis.question_analyses && (analysis as Record<string, unknown>).patterns && (
  <div className="space-y-2 mb-3">
    {((analysis as Record<string, unknown>).strengths as string[] || []).length > 0 && (
      <div>
        <span className="text-[10px] font-semibold text-emerald-600">Strengths:</span>
        <ul className="mt-0.5">
          {((analysis as Record<string, unknown>).strengths as string[]).map((s, i) => (
            <li key={i} className="text-xs text-zinc-700">- {s}</li>
          ))}
        </ul>
      </div>
    )}
    {((analysis as Record<string, unknown>).improvement_areas as string[] || []).length > 0 && (
      <div>
        <span className="text-[10px] font-semibold text-amber-600">Areas to improve:</span>
        <ul className="mt-0.5">
          {((analysis as Record<string, unknown>).improvement_areas as string[]).map((s, i) => (
            <li key={i} className="text-xs text-zinc-700">- {s}</li>
          ))}
        </ul>
      </div>
    )}
    {((analysis as Record<string, unknown>).study_recommendations as string[] || []).length > 0 && (
      <div>
        <span className="text-[10px] font-semibold text-blue-600">Study recommendations:</span>
        <ul className="mt-0.5">
          {((analysis as Record<string, unknown>).study_recommendations as string[]).map((s, i) => (
            <li key={i} className="text-xs text-zinc-700">- {s}</li>
          ))}
        </ul>
      </div>
    )}
    {(analysis as Record<string, unknown>).next_round_focus && (
      <div>
        <span className="text-[10px] font-semibold text-purple-600">Next round focus:</span>
        <p className="text-xs text-zinc-700 mt-0.5">{(analysis as Record<string, unknown>).next_round_focus as string}</p>
      </div>
    )}
  </div>
)}
```

For debriefs that have the old-style `question_analyses`, still show the existing `<CoachingReport>`. Only show it when `analysis?.question_analyses` exists:

```tsx
{/* Full coaching report (conversation-log style analysis) */}
{analysis?.question_analyses && analysis.question_analyses.length > 0 && (
  <CoachingReport session={debriefToSession(debrief)} />
)}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/coaching/debrief-history.tsx
git commit -m "feat: CAR-54 show structured debrief fields and analyzing badge in history"
```

---

### Task 8: Cross-Application Patterns Component

**Files:**
- Create: `dashboard/src/components/coaching/cross-app-patterns.tsx`
- Modify: `dashboard/src/components/coaching/coaching-section.tsx` (add import + render)

- [ ] **Step 1: Create the component**

```tsx
// dashboard/src/components/coaching/cross-app-patterns.tsx
"use client"

import { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react"
import type { DebriefRecord } from "@/types"

interface CrossAppPatternsProps {
  allDebriefs: DebriefRecord[]
}

export function CrossAppPatterns({ allDebriefs }: CrossAppPatternsProps) {
  const [open, setOpen] = useState(false)

  const patterns = useMemo(() => {
    if (allDebriefs.length < 2) return null

    // Aggregate topics_covered
    const topicCounts: Record<string, number> = {}
    for (const d of allDebriefs) {
      for (const t of d.topics_covered || []) {
        topicCounts[t] = (topicCounts[t] || 0) + 1
      }
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    // Aggregate strengths from ai_analysis
    const strengthCounts: Record<string, number> = {}
    const gapCounts: Record<string, number> = {}

    for (const d of allDebriefs) {
      const analysis = d.ai_analysis as Record<string, unknown> | null
      if (!analysis) continue

      const strengths = (analysis.strengths as string[]) || (analysis.strong_points as string[]) || []
      for (const s of strengths) {
        strengthCounts[s] = (strengthCounts[s] || 0) + 1
      }

      const gaps = (analysis.improvement_areas as string[]) || []
      for (const g of gaps) {
        gapCounts[g] = (gapCounts[g] || 0) + 1
      }
    }

    const recurringStrengths = Object.entries(strengthCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const recurringGaps = Object.entries(gapCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return { topTopics, recurringStrengths, recurringGaps }
  }, [allDebriefs])

  if (!patterns) return null

  const { topTopics, recurringStrengths, recurringGaps } = patterns

  if (topTopics.length === 0 && recurringStrengths.length === 0 && recurringGaps.length === 0) {
    return null
  }

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
      >
        {open ? (
          <ChevronDown size={10} className="text-zinc-400" />
        ) : (
          <ChevronRight size={10} className="text-zinc-400" />
        )}
        <TrendingUp size={10} className="text-purple-500" />
        <span className="text-[10px] font-semibold text-zinc-500">
          Cross-Interview Patterns
        </span>
        <span className="text-[10px] text-zinc-400">
          ({allDebriefs.length} debriefs)
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-zinc-100 pt-2">
          {/* Top topics */}
          {topTopics.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-zinc-500">Most Asked Topics:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {topTopics.map(([topic, count]) => (
                  <span
                    key={topic}
                    className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded"
                  >
                    {topic} ({count}x)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recurring strengths */}
          {recurringStrengths.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-emerald-600">Recurring Strengths:</span>
              <ul className="mt-0.5">
                {recurringStrengths.map(([strength, count]) => (
                  <li key={strength} className="text-xs text-zinc-700">
                    - {strength} ({count}x)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recurring gaps */}
          {recurringGaps.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-amber-600">Recurring Gaps:</span>
              <ul className="mt-0.5">
                {recurringGaps.map(([gap, count]) => (
                  <li key={gap} className="text-xs text-zinc-700">
                    - {gap} ({count}x)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add CrossAppPatterns to coaching-section.tsx**

Import:
```tsx
import { CrossAppPatterns } from "@/components/coaching/cross-app-patterns"
```

Render after `<DebriefHistory>` and before the debrief textarea:

```tsx
{/* Cross-application patterns (CAR-54) */}
<CrossAppPatterns allDebriefs={allUserDebriefs} />
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/coaching/cross-app-patterns.tsx dashboard/src/components/coaching/coaching-section.tsx
git commit -m "feat: CAR-54 add cross-application interview patterns component"
```

---

### Task 9: Interview Prep Feedback Loop

**Files:**
- Modify: `dashboard/src/lib/interview-prep-prompts.ts`
- Modify: `dashboard/src/app/api/interview-prep/route.ts`

- [ ] **Step 1: Add formatDebriefRecords function to interview-prep-prompts.ts**

Add this new type import and function after the existing `formatDebriefs` function:

```ts
import type { Debrief } from "@/types"
import type { DebriefRecord } from "@/types/coaching"
```

Add this new function:

```ts
export function formatDebriefRecords(debriefs: DebriefRecord[]): string {
  if (!debriefs.length) return ""

  const entries = debriefs.map((d) => {
    const analysis = d.ai_analysis as Record<string, unknown> | null
    const parts = [
      `${d.stage} (${new Date(d.created_at).toLocaleDateString()})`,
      `  What went well: ${d.went_well || "N/A"}`,
      `  What was hard: ${d.was_hard || "N/A"}`,
      `  Topics covered: ${(d.topics_covered || []).join(", ") || "N/A"}`,
    ]
    if (analysis) {
      const improvements = (analysis.improvement_areas as string[]) || []
      const studyRecs = (analysis.study_recommendations as string[]) || []
      const nextFocus = analysis.next_round_focus as string
      if (improvements.length) parts.push(`  AI-identified gaps: ${improvements.join(", ")}`)
      if (studyRecs.length) parts.push(`  Study recommendations: ${studyRecs.join(", ")}`)
      if (nextFocus) parts.push(`  Next round focus: ${nextFocus}`)
    }
    return parts.join("\n")
  })

  return `\n\nPrior Interview Debriefs (from structured debrief forms):\n${entries.join("\n\n")}

Use these debrief insights to tailor the prep:
- Address identified gaps with targeted practice questions
- Reinforce strengths with expanded talking points
- Focus on topics the interviewers emphasized`
}
```

- [ ] **Step 2: Update interview-prep route.ts to fetch debriefs and pass to prompts**

In `dashboard/src/app/api/interview-prep/route.ts`, add after the conversations fetch:

```ts
// Fetch structured debriefs for this application (CAR-54 feedback loop)
const { data: debriefRecords } = await supabase
  .from("debriefs")
  .select("stage, went_well, was_hard, do_differently, key_takeaways, topics_covered, ai_analysis, created_at")
  .eq("application_id", applicationId)
  .eq("user_id", user.id)
  .order("created_at", { ascending: true })
```

Update the import to include `formatDebriefRecords`:

```ts
import {
  buildPhoneScreenPrompt,
  buildInterviewPrompt,
  buildOfferPrompt,
  formatDebriefRecords,
  PREP_STAGES,
} from "@/lib/interview-prep-prompts"
```

Update the prompt building to append debrief context. After `let prompt: string` and the switch statement, add:

```ts
// Append structured debrief context if any exist (CAR-54)
if (debriefRecords && debriefRecords.length > 0) {
  const debriefContext = formatDebriefRecords(debriefRecords as unknown as import("@/types/coaching").DebriefRecord[])
  prompt += debriefContext
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/lib/interview-prep-prompts.ts dashboard/src/app/api/interview-prep/route.ts
git commit -m "feat: CAR-54 feed debrief insights into interview prep generation"
```

---

### Task 10: Update Export for Structured Fields

**Files:**
- Modify: `dashboard/src/lib/export-debrief.ts`

- [ ] **Step 1: Add structured analysis fields to export**

After the existing "Top focus areas / study recommendations" section and before the "Question analyses as patterns" section, add:

```ts
// Structured debrief AI analysis (CAR-54 format)
const patterns = analysis?.patterns as string[] | undefined
if (patterns && patterns.length > 0) {
  lines.push("## Patterns Detected")
  for (const p of patterns) lines.push(`- ${p}`)
  lines.push("")
}

const improvementAreas = analysis?.improvement_areas as string[] | undefined
if (improvementAreas && improvementAreas.length > 0) {
  lines.push("## Improvement Areas")
  for (const area of improvementAreas) lines.push(`- ${area}`)
  lines.push("")
}

const studyRecs = analysis?.study_recommendations as string[] | undefined
if (studyRecs && studyRecs.length > 0) {
  lines.push("## Study Recommendations")
  for (const rec of studyRecs) lines.push(`- ${rec}`)
  lines.push("")
}

const nextFocus = analysis?.next_round_focus as string | undefined
if (nextFocus) {
  lines.push("## Next Round Focus", nextFocus, "")
}
```

Also add `do_differently` to the Raw Notes section:

```ts
if (debrief.do_differently) lines.push(`**What I'd do differently:** ${debrief.do_differently}`)
```

And add `interviewer_names`:

```ts
if (debrief.interviewer_names && debrief.interviewer_names.length > 0) {
  lines.push(`**Interviewers:** ${debrief.interviewer_names.join(", ")}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/lib/export-debrief.ts
git commit -m "feat: CAR-54 include structured fields and AI analysis in debrief export"
```

---

### Task 11: Feature Manifest + Regression Check

**Files:**
- Modify: `dashboard/feature-manifest.json`

- [ ] **Step 1: Add feature manifest entries**

Add these entries to the `features` array:

```json
{
  "ticket": "CAR-54",
  "name": "Tag Input Component",
  "file": "src/components/ui/tag-input.tsx",
  "exports": ["TagInput"],
  "patterns": ["handleKeyDown", "removeTag"],
  "area": "ui"
},
{
  "ticket": "CAR-54",
  "name": "Star Rating Component",
  "file": "src/components/ui/star-rating.tsx",
  "exports": ["StarRating"],
  "patterns": ["fill-amber-400"],
  "area": "ui"
},
{
  "ticket": "CAR-54",
  "name": "Structured Debrief Form Modal",
  "file": "src/components/coaching/debrief-form-modal.tsx",
  "exports": ["DebriefFormModal"],
  "patterns": ["STAGE_OPTIONS", "went_well", "was_hard", "do_differently"],
  "area": "coaching"
},
{
  "ticket": "CAR-54",
  "name": "Structured Debrief AI Analysis API",
  "file": "src/app/api/debriefs/analyze/route.ts",
  "exports": ["POST"],
  "patterns": ["DEBRIEF_ANALYSIS_PROMPT", "debriefId"],
  "area": "coaching"
},
{
  "ticket": "CAR-54",
  "name": "Cross-Application Patterns",
  "file": "src/components/coaching/cross-app-patterns.tsx",
  "exports": ["CrossAppPatterns"],
  "patterns": ["topicCounts", "recurringStrengths", "recurringGaps"],
  "area": "coaching"
}
```

- [ ] **Step 2: Run regression check**

```bash
bash tools/regression-check.sh
```

Expected: ALL PASS including the 5 new CAR-54 entries.

- [ ] **Step 3: Commit**

```bash
git add dashboard/feature-manifest.json
git commit -m "feat: CAR-54 add feature manifest entries for structured debrief"
```

---

### Task 12: Build Verification

- [ ] **Step 1: Run npm build**

```bash
cd dashboard && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Fix any build errors, re-run regression check, final commit**

---

## Verification Checklist

After all tasks complete:
1. Open an application -> Performance Coach section
2. Click "Add Debrief" -> fill in structured form -> save
3. Verify debrief appears in history timeline with structured fields
4. Verify AI analysis generates and populates after a few seconds
5. Navigate away and back -> debrief persists
6. Click "Export" -> .md includes structured fields + AI analysis
7. Add a second debrief for a different application
8. Check "Cross-Interview Patterns" section appears
9. Generate interview prep -> verify prep references debrief insights
10. Check application_events table -> should have debrief_added row
11. Verify existing "Analyze Debrief" button still works
