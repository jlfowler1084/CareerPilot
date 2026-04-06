# CAR-102: Debrief Stats API + Hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GET /api/debriefs/stats endpoint and a useDebriefStats React hook so consumers can show debrief activity at a glance.

**Architecture:** Single API route fetches all user debriefs and computes stats in JS via an exported pure function (`calculateDebriefStats`). Client hook fetches on mount, subscribes to realtime changes on the `debriefs` table, and exposes `{ stats, loading, error, refresh }`.

**Tech Stack:** Next.js App Router, Supabase (server client for route, browser client for realtime), Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-04-06-debrief-stats-api-hook-design.md`

---

### Task 1: Add DebriefStats type to coaching.ts

**Files:**
- Modify: `dashboard/src/types/coaching.ts` (append after line 77)

- [ ] **Step 1: Add the DebriefStats interface**

Add this interface at the end of `dashboard/src/types/coaching.ts`, after the `DebriefAiAnalysis` interface:

```typescript
export interface DebriefStats {
  total_debriefs: number
  average_rating: number | null
  most_recent_at: string | null
  debriefs_this_week: number
}
```

- [ ] **Step 2: Verify the type compiles**

Run: `cd dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `DebriefStats`. (Pre-existing errors from stale `database.types.ts` are OK — ignore those.)

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/types/coaching.ts
git commit -m "feat(CAR-102): add DebriefStats type to coaching.ts"
```

---

### Task 2: Write and test calculateDebriefStats pure function

**Files:**
- Create: `dashboard/src/app/api/debriefs/stats/route.ts` (partial — just the pure function and its type for now)
- Create: `dashboard/src/__tests__/api/debriefs-stats.test.ts`

- [ ] **Step 1: Create the route file with just the pure function**

Create `dashboard/src/app/api/debriefs/stats/route.ts` with:

```typescript
import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { DebriefStats } from "@/types/coaching"

interface DebriefRow {
  id: string
  user_id: string
  overall_rating: number | null
  created_at: string
}

function getStartOfISOWeek(): Date {
  const now = new Date()
  const day = now.getUTCDay()
  // ISO week starts on Monday (1). Sunday (0) maps to 6 days back.
  const daysToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToMonday
  ))
  return monday
}

export function calculateDebriefStats(debriefs: DebriefRow[]): DebriefStats {
  if (debriefs.length === 0) {
    return {
      total_debriefs: 0,
      average_rating: null,
      most_recent_at: null,
      debriefs_this_week: 0,
    }
  }

  const total_debriefs = debriefs.length

  // Average rating — exclude nulls from both sum and denominator
  const rated = debriefs.filter((d) => d.overall_rating !== null)
  const average_rating =
    rated.length > 0
      ? Math.round((rated.reduce((sum, d) => sum + d.overall_rating!, 0) / rated.length) * 10) / 10
      : null

  // Most recent — debriefs are ordered by created_at desc from the query
  const most_recent_at = debriefs[0].created_at

  // This week — created_at >= Monday 00:00 UTC
  const weekStart = getStartOfISOWeek()
  const debriefs_this_week = debriefs.filter(
    (d) => new Date(d.created_at) >= weekStart
  ).length

  return { total_debriefs, average_rating, most_recent_at, debriefs_this_week }
}

export async function GET() {
  // Placeholder — implemented in Task 3
  return NextResponse.json({})
}
```

- [ ] **Step 2: Write the test file**

Create `dashboard/src/__tests__/api/debriefs-stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { calculateDebriefStats } from "@/app/api/debriefs/stats/route"

function makeDebrief(overrides: {
  overall_rating?: number | null
  created_at?: string
} = {}) {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    overall_rating: overrides.overall_rating ?? null,
    created_at: overrides.created_at ?? "2026-04-06T12:00:00Z",
  }
}

describe("calculateDebriefStats", () => {
  beforeEach(() => {
    // Pin "now" to Wednesday 2026-04-08 14:00 UTC
    // ISO week started Monday 2026-04-06 00:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-08T14:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns zeroed stats for empty array", () => {
    const stats = calculateDebriefStats([])
    expect(stats).toEqual({
      total_debriefs: 0,
      average_rating: null,
      most_recent_at: null,
      debriefs_this_week: 0,
    })
  })

  it("returns null average when all ratings are null", () => {
    const debriefs = [
      makeDebrief({ overall_rating: null }),
      makeDebrief({ overall_rating: null }),
      makeDebrief({ overall_rating: null }),
    ]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.total_debriefs).toBe(3)
    expect(stats.average_rating).toBeNull()
  })

  it("calculates average excluding null ratings", () => {
    const debriefs = [
      makeDebrief({ overall_rating: 4 }),
      makeDebrief({ overall_rating: null }),
      makeDebrief({ overall_rating: 5 }),
      makeDebrief({ overall_rating: 3 }),
    ]
    const stats = calculateDebriefStats(debriefs)
    // (4 + 5 + 3) / 3 = 4.0
    expect(stats.average_rating).toBe(4)
  })

  it("rounds average to one decimal place", () => {
    const debriefs = [
      makeDebrief({ overall_rating: 3 }),
      makeDebrief({ overall_rating: 4 }),
    ]
    const stats = calculateDebriefStats(debriefs)
    // (3 + 4) / 2 = 3.5
    expect(stats.average_rating).toBe(3.5)
  })

  it("returns most_recent_at from first element (assumes desc order)", () => {
    const debriefs = [
      makeDebrief({ created_at: "2026-04-08T10:00:00Z" }),
      makeDebrief({ created_at: "2026-04-06T08:00:00Z" }),
    ]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.most_recent_at).toBe("2026-04-08T10:00:00Z")
  })

  it("counts debriefs this week correctly across Monday boundary", () => {
    // Week started Mon 2026-04-06 00:00 UTC
    const debriefs = [
      makeDebrief({ created_at: "2026-04-08T10:00:00Z" }),  // Wed — in week
      makeDebrief({ created_at: "2026-04-06T00:00:00Z" }),  // Mon 00:00 — in week (boundary inclusive)
      makeDebrief({ created_at: "2026-04-05T23:59:59Z" }),  // Sun — previous week
      makeDebrief({ created_at: "2026-04-01T12:00:00Z" }),  // Last week
    ]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.debriefs_this_week).toBe(2)
  })

  it("handles single debrief with rating", () => {
    const debriefs = [makeDebrief({ overall_rating: 5 })]
    const stats = calculateDebriefStats(debriefs)
    expect(stats.total_debriefs).toBe(1)
    expect(stats.average_rating).toBe(5)
  })
})
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd dashboard && npx vitest run src/__tests__/api/debriefs-stats.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/api/debriefs/stats/route.ts dashboard/src/__tests__/api/debriefs-stats.test.ts
git commit -m "feat(CAR-102): calculateDebriefStats pure function with tests"
```

---

### Task 3: Complete the API route handler

**Files:**
- Modify: `dashboard/src/app/api/debriefs/stats/route.ts` (replace the placeholder GET)

- [ ] **Step 1: Replace the placeholder GET handler**

Replace the `GET` function in `dashboard/src/app/api/debriefs/stats/route.ts` with:

```typescript
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("debriefs")
      .select("id, user_id, overall_rating, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to fetch debrief stats:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Cast needed because database.types.ts is stale (pre-CAR-127, missing overall_rating)
    const stats = calculateDebriefStats((data || []) as unknown as DebriefRow[])
    return NextResponse.json(stats)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd dashboard && npx tsc --noEmit --pretty 2>&1 | grep -i "debriefs/stats" || echo "No errors in stats route"`
Expected: No errors referencing the stats route.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/app/api/debriefs/stats/route.ts
git commit -m "feat(CAR-102): GET /api/debriefs/stats route handler"
```

---

### Task 4: Write the useDebriefStats hook

**Files:**
- Create: `dashboard/src/hooks/use-debrief-stats.ts`

- [ ] **Step 1: Create the hook file**

Create `dashboard/src/hooks/use-debrief-stats.ts`:

```typescript
"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DebriefStats } from "@/types/coaching"

const supabase = createClient()
const DEBOUNCE_MS = 500

export function useDebriefStats() {
  const [stats, setStats] = useState<DebriefStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)
  const isFetching = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortController = useRef<AbortController | null>(null)

  const fetchStats = useCallback(async () => {
    if (isFetching.current) return
    isFetching.current = true

    // Abort any previous in-flight request
    if (abortController.current) abortController.current.abort()
    abortController.current = new AbortController()

    try {
      const resp = await fetch("/api/debriefs/stats", {
        signal: abortController.current.signal,
      })
      if (!resp.ok) {
        const data = await resp.json()
        setError(data.error || "Failed to load debrief stats")
        return
      }
      const data = await resp.json()
      setStats(data)
      setError(null)
    } catch (err) {
      // Ignore abort errors — component unmounted
      if (err instanceof DOMException && err.name === "AbortError") return
      setError("Network error")
    } finally {
      isFetching.current = false
      setLoading(false)
    }
  }, [])

  const debouncedFetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(fetchStats, DEBOUNCE_MS)
  }, [fetchStats])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchStats()
    }

    const channel = supabase
      .channel("debrief-stats")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debriefs",
        },
        () => {
          debouncedFetch()
        }
      )
      .subscribe()

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (abortController.current) abortController.current.abort()
      supabase.removeChannel(channel)
    }
  }, [fetchStats, debouncedFetch])

  const refresh = useCallback(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, error, refresh }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd dashboard && npx tsc --noEmit --pretty 2>&1 | grep -i "use-debrief-stats" || echo "No errors in hook"`
Expected: No errors referencing the hook.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/hooks/use-debrief-stats.ts
git commit -m "feat(CAR-102): useDebriefStats hook with realtime subscription"
```

---

### Task 5: Write hook tests

**Files:**
- Create: `dashboard/src/__tests__/hooks/use-debrief-stats.test.ts`

- [ ] **Step 1: Create the hook test file**

Create `dashboard/src/__tests__/hooks/use-debrief-stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { useDebriefStats } from "@/hooks/use-debrief-stats"

// Mock the supabase client module
const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe })
const mockChannel = vi.fn().mockReturnValue({ on: mockOn })
const mockRemoveChannel = vi.fn()

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}))

const MOCK_STATS = {
  total_debriefs: 5,
  average_rating: 3.8,
  most_recent_at: "2026-04-06T15:30:00Z",
  debriefs_this_week: 2,
}

describe("useDebriefStats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts in loading state", () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})) // Never resolves
    const { result } = renderHook(() => useDebriefStats())
    expect(result.current.loading).toBe(true)
    expect(result.current.stats).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it("fetches stats on mount", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_STATS,
    })

    const { result } = renderHook(() => useDebriefStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.stats).toEqual(MOCK_STATS)
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/debriefs/stats",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("sets error on fetch failure", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Unauthorized" }),
    })

    const { result } = renderHook(() => useDebriefStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe("Unauthorized")
    expect(result.current.stats).toBeNull()
  })

  it("cleans up channel on unmount", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_STATS,
    })

    const { unmount } = renderHook(() => useDebriefStats())
    unmount()

    expect(mockRemoveChannel).toHaveBeenCalled()
  })

  it("refresh triggers a new fetch", async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_STATS })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...MOCK_STATS, total_debriefs: 6 }) })

    const { result } = renderHook(() => useDebriefStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.stats?.total_debriefs).toBe(6)
    })
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `cd dashboard && npx vitest run src/__tests__/api/debriefs-stats.test.ts src/__tests__/hooks/use-debrief-stats.test.ts`
Expected: All tests pass (7 route + 5 hook = 12 total).

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/__tests__/hooks/use-debrief-stats.test.ts
git commit -m "test(CAR-102): useDebriefStats hook tests"
```

---

### Task 6: Add feature manifest entries

**Files:**
- Modify: `dashboard/feature-manifest.json`

- [ ] **Step 1: Add two new entries to the features array**

Add these two entries at the end of the `features` array in `dashboard/feature-manifest.json` (before the closing `]`):

```json
    {
      "ticket": "CAR-102",
      "name": "Debrief Stats API Route",
      "file": "src/app/api/debriefs/stats/route.ts",
      "exports": [
        "GET",
        "calculateDebriefStats"
      ],
      "patterns": [
        "average_rating",
        "debriefs_this_week",
        "most_recent_at"
      ],
      "area": "coaching"
    },
    {
      "ticket": "CAR-102",
      "name": "Debrief Stats Hook",
      "file": "src/hooks/use-debrief-stats.ts",
      "exports": [
        "useDebriefStats"
      ],
      "patterns": [
        "DebriefStats",
        "postgres_changes",
        "debriefs"
      ],
      "area": "coaching"
    }
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/feature-manifest.json
git commit -m "chore(CAR-102): add debrief stats manifest entries"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `cd dashboard && npx vitest run`
Expected: All tests pass, including the 12 new ones.

- [ ] **Step 2: Run the build**

Run: `cd dashboard && npm run build 2>&1 | tail -20`
Expected: Build succeeds. TypeScript errors in the stats route from stale `database.types.ts` are handled by the `as unknown as DebriefRow[]` cast.

- [ ] **Step 3: Run regression check**

Run: `bash tools/regression-check.sh`
Expected: All features pass, including the two new CAR-102 entries.

- [ ] **Step 4: Commit any fixes if needed, then push**

```bash
git push origin feature/dashboard-v2
```

---

### Task 8: Post-completion — Jira comment

- [ ] **Step 1: Add a comment to CAR-102**

Comment on CAR-102 with the following details:
- Files created: `dashboard/src/app/api/debriefs/stats/route.ts`, `dashboard/src/hooks/use-debrief-stats.ts`, `dashboard/src/__tests__/api/debriefs-stats.test.ts`, `dashboard/src/__tests__/hooks/use-debrief-stats.test.ts`
- File modified: `dashboard/src/types/coaching.ts` (added `DebriefStats` interface), `dashboard/feature-manifest.json` (2 new entries)
- Test results: X tests passed
- Build: passed
- Regression: passed

Do NOT transition to Done — evaluation of skill compliance happens separately.
