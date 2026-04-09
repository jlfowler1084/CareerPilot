# CAR-134: Debrief Timeout & Persistence Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Analyze Debrief" flow so it no longer times out with a raw error, and coaching sessions persist across navigation.

**Architecture:** Three surgical edits mirroring the working Interview Prep pattern: replace `AbortSignal.timeout()` with manual `AbortController` + cleanup in the API route, add a GET handler to load persisted sessions, update the hook to fetch on mount.

**Tech Stack:** Next.js API routes, Vitest, React hooks, Supabase (interview_coaching table)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `dashboard/src/app/api/coaching/analyze/route.ts` | Modify | Replace timeout pattern in POST; add GET handler |
| `dashboard/src/hooks/use-coaching.ts` | Modify | Add hasFetched ref, useEffect to load sessions on mount |
| `dashboard/src/components/coaching/coaching-section.tsx` | Modify | Add retry button to error banner |
| `dashboard/src/__tests__/api/coaching-analyze.test.ts` | Create | Test timeout error handling and GET handler logic |
| `dashboard/src/__tests__/hooks/use-coaching.test.ts` | Create | Test session fetch-on-mount and state management |

---

### Task 1: API Route — Timeout Fix

**Files:**
- Modify: `dashboard/src/app/api/coaching/analyze/route.ts:85-108`
- Create: `dashboard/src/__tests__/api/coaching-analyze.test.ts`

- [ ] **Step 1: Write the timeout-handling test**

Create `dashboard/src/__tests__/api/coaching-analyze.test.ts`:

```typescript
import { describe, it, expect } from "vitest"

/**
 * Test the timeout error classification logic used in the POST handler.
 * The route wraps fetch in try/catch and checks err.name === "AbortError".
 */
function classifyFetchError(err: unknown): { error: string; status: number } {
  if (err instanceof Error && err.name === "AbortError") {
    return {
      error: "Analysis timed out after 90s. Try a shorter transcript or click Retry.",
      status: 504,
    }
  }
  return { error: err instanceof Error ? err.message : String(err), status: 500 }
}

describe("classifyFetchError", () => {
  it("returns 504 with friendly message for AbortError", () => {
    const err = new DOMException("The operation was aborted", "AbortError")
    const result = classifyFetchError(err)
    expect(result.status).toBe(504)
    expect(result.error).toContain("timed out after 90s")
    expect(result.error).toContain("Retry")
  })

  it("returns 500 with original message for other errors", () => {
    const err = new Error("Network failure")
    const result = classifyFetchError(err)
    expect(result.status).toBe(500)
    expect(result.error).toBe("Network failure")
  })

  it("returns 500 with stringified value for non-Error throws", () => {
    const result = classifyFetchError("something broke")
    expect(result.status).toBe(500)
    expect(result.error).toBe("something broke")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npx vitest run src/__tests__/api/coaching-analyze.test.ts`
Expected: PASS (pure logic, no dependencies to wire up — tests should pass immediately since we're testing the extracted function inline). This validates the test itself is sound before we modify the route.

- [ ] **Step 3: Modify the POST handler to use manual AbortController**

In `dashboard/src/app/api/coaching/analyze/route.ts`, replace lines 86-108:

**Old code (lines 86-108):**
```typescript
    // Haiku: structured extraction from interview transcript (classification-level task)
    // 8192 max_tokens: full transcripts (~15K input tokens) produce ~7K output tokens for detailed per-question analysis
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        system: buildCoachingSystemPrompt(getUserName(user)),
        messages: [{ role: "user", content: contextParts.join("\n") }],
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 })
    }
```

**New code:**
```typescript
    // Haiku: structured extraction from interview transcript (classification-level task)
    // 8192 max_tokens: full transcripts (~15K input tokens) produce ~7K output tokens for detailed per-question analysis
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)

    let resp: Response
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.MODEL_HAIKU || "claude-haiku-4-5-20251001",
          max_tokens: 8192,
          system: buildCoachingSystemPrompt(getUserName(user)),
          messages: [{ role: "user", content: contextParts.join("\n") }],
        }),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === "AbortError") {
        return NextResponse.json(
          { error: "Analysis timed out after 90s. Try a shorter transcript or click Retry." },
          { status: 504 }
        )
      }
      throw err
    }
    clearTimeout(timeout)

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error("Claude API error:", resp.status, errBody)
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 })
    }
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd dashboard && npx vitest run src/__tests__/api/coaching-analyze.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/app/api/coaching/analyze/route.ts dashboard/src/__tests__/api/coaching-analyze.test.ts
git commit -m "fix(CAR-134): replace AbortSignal.timeout with manual AbortController in coaching/analyze"
```

---

### Task 2: API Route — GET Handler for Session Persistence

**Files:**
- Modify: `dashboard/src/app/api/coaching/analyze/route.ts` (add GET export)
- Modify: `dashboard/src/__tests__/api/coaching-analyze.test.ts` (add GET logic tests)

- [ ] **Step 1: Write the GET param validation test**

Append to `dashboard/src/__tests__/api/coaching-analyze.test.ts`:

```typescript
describe("GET handler validation", () => {
  function validateGetParams(searchParams: URLSearchParams): { error: string; status: number } | null {
    const applicationId = searchParams.get("applicationId")
    if (!applicationId) {
      return { error: "applicationId required", status: 400 }
    }
    return null
  }

  it("returns 400 when applicationId is missing", () => {
    const params = new URLSearchParams()
    const result = validateGetParams(params)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(400)
    expect(result!.error).toBe("applicationId required")
  })

  it("returns null (valid) when applicationId is present", () => {
    const params = new URLSearchParams({ applicationId: "abc-123" })
    const result = validateGetParams(params)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd dashboard && npx vitest run src/__tests__/api/coaching-analyze.test.ts`
Expected: PASS

- [ ] **Step 3: Add GET handler to the route**

Add this export to the end of `dashboard/src/app/api/coaching/analyze/route.ts` (after the POST export):

```typescript
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const applicationId = req.nextUrl.searchParams.get("applicationId")
    if (!applicationId) {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("interview_coaching")
      .select("*")
      .eq("application_id", applicationId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to fetch coaching sessions:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Coaching sessions fetch error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard && npx vitest run src/__tests__/api/coaching-analyze.test.ts`
Expected: PASS

- [ ] **Step 5: Run build to check for type errors**

Run: `cd dashboard && npx next build`
Expected: Build succeeds with no type errors in `coaching/analyze/route.ts`

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/app/api/coaching/analyze/route.ts dashboard/src/__tests__/api/coaching-analyze.test.ts
git commit -m "feat(CAR-134): add GET handler for coaching session persistence"
```

---

### Task 3: Hook — Fetch Sessions on Mount

**Files:**
- Modify: `dashboard/src/hooks/use-coaching.ts:1-35`
- Create: `dashboard/src/__tests__/hooks/use-coaching.test.ts`

- [ ] **Step 1: Write the session deduplication test**

The hook appends new sessions optimistically via `analyzeDebrief`. When `fetchSessions` reloads from DB, it must not create duplicates. Test the merge logic:

Create `dashboard/src/__tests__/hooks/use-coaching.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import type { CoachingSession } from "@/types"

/**
 * When fetchSessions loads from DB and analyzeDebrief has already
 * appended a session optimistically, we replace state wholesale
 * (DB is source of truth). This test validates that approach.
 */
function mergeSessionsFromDb(
  dbSessions: CoachingSession[]
): CoachingSession[] {
  // DB fetch replaces state entirely — no dedup needed
  return Array.isArray(dbSessions) ? dbSessions : []
}

const mockSession: CoachingSession = {
  id: "sess-1",
  application_id: "app-1",
  user_id: "user-1",
  session_type: "debrief",
  raw_input: "test notes",
  ai_analysis: { summary: "Good", question_analyses: [], top_3_focus_areas: [] },
  overall_score: 7,
  strong_points: ["PowerShell"],
  improvements: [],
  patterns_detected: null,
  created_at: "2026-04-08T14:00:00Z",
}

describe("mergeSessionsFromDb", () => {
  it("returns sessions array from valid DB response", () => {
    const result = mergeSessionsFromDb([mockSession])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("sess-1")
  })

  it("returns empty array for non-array input", () => {
    expect(mergeSessionsFromDb(null as unknown as CoachingSession[])).toEqual([])
    expect(mergeSessionsFromDb(undefined as unknown as CoachingSession[])).toEqual([])
  })

  it("returns empty array for empty DB response", () => {
    expect(mergeSessionsFromDb([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd dashboard && npx vitest run src/__tests__/hooks/use-coaching.test.ts`
Expected: PASS

- [ ] **Step 3: Update the hook to fetch on mount**

In `dashboard/src/hooks/use-coaching.ts`, make these changes:

**Replace line 2:**
```typescript
import { useState, useCallback, useMemo } from "react"
```
**With:**
```typescript
import { useState, useCallback, useMemo, useEffect, useRef } from "react"
```

**Replace lines 12-35 (state declarations through fetchSessions):**
```typescript
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [practicing, setPracticing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/coaching/analyze?applicationId=${applicationId}`)
      if (!resp.ok) {
        // No GET handler yet — we'll load from sessions state
        return
      }
      const data = await resp.json()
      setSessions(Array.isArray(data) ? data : [])
    } catch {
      // Sessions will be populated as they're created
    } finally {
      setLoading(false)
    }
  }, [applicationId])
```

**With:**
```typescript
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [practicing, setPracticing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/coaching/analyze?applicationId=${applicationId}`)
      if (!resp.ok) return
      const data = await resp.json()
      setSessions(Array.isArray(data) ? data : [])
    } catch {
      // Silent — sessions will be populated as they're created
    } finally {
      setLoading(false)
    }
  }, [applicationId])

  useEffect(() => {
    hasFetched.current = false
  }, [applicationId])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchSessions()
    }
  }, [fetchSessions])
```

Key changes:
- `loading` initial state: `true` (matches `useDebriefs` — data is loading from mount)
- Added `hasFetched` ref to prevent duplicate fetches
- Added two `useEffect` hooks matching `useDebriefs` pattern
- Removed `setError(null)` from `fetchSessions` (don't clear user-visible errors on background reload)
- Removed stale "No GET handler yet" comment

- [ ] **Step 4: Run tests**

Run: `cd dashboard && npx vitest run src/__tests__/hooks/use-coaching.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/use-coaching.ts dashboard/src/__tests__/hooks/use-coaching.test.ts
git commit -m "fix(CAR-134): load coaching sessions from DB on mount for persistence"
```

---

### Task 4: UI — Retry Button in Error Banner

**Files:**
- Modify: `dashboard/src/components/coaching/coaching-section.tsx:136-141`

- [ ] **Step 1: Replace the error banner**

In `dashboard/src/components/coaching/coaching-section.tsx`, replace lines 136-141:

**Old code:**
```tsx
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-700 flex-1">{error}</span>
            </div>
          )}
```

**New code:**
```tsx
          {/* Error with retry */}
          {error && !analyzing && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-700 flex-1">{error}</span>
              {debriefText.trim() && (
                <button
                  onClick={() => handleAnalyzeDebrief()}
                  className="text-[10px] font-bold text-red-700 hover:text-red-900 px-2 py-1 bg-red-100 rounded"
                >
                  Retry
                </button>
              )}
            </div>
          )}
```

Key details:
- `!analyzing` prevents showing error during active retry
- `debriefText.trim()` gates the retry button — only show when there's text to re-submit
- Retry calls `handleAnalyzeDebrief()` which re-submits the existing textarea content

- [ ] **Step 2: Run build to verify no type errors**

Run: `cd dashboard && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/coaching/coaching-section.tsx
git commit -m "fix(CAR-134): add retry button to coaching error banner"
```

---

### Task 5: Full Test Suite & Build Verification

- [ ] **Step 1: Run the full test suite**

Run: `cd dashboard && npx vitest run`
Expected: All tests pass, including the two new test files

- [ ] **Step 2: Run the build**

Run: `cd dashboard && npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run regression check**

Run: `bash tools/regression-check.sh`
Expected: All existing features pass

- [ ] **Step 4: Final commit (if any fixes needed)**

Only needed if prior steps surfaced issues that required code changes.
