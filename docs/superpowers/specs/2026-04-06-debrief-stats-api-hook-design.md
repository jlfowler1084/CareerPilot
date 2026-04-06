# CAR-102: Debrief Stats API + Hook — Design Spec

**Date:** 2026-04-06
**Ticket:** CAR-102
**Status:** Approved
**Model tier:** Sonnet (new feature: API route + React hook + tests)

## Overview

Lightweight stats endpoint and corresponding React hook for debrief activity. Provides total count, average rating, most recent timestamp, and weekly count. No UI integration in this ticket — route, hook, and tests only.

## Live Schema Reference

The `debriefs` table (Supabase, live) has these columns relevant to stats:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `application_id` | uuid | FK to applications |
| `user_id` | uuid | FK to auth.users |
| `overall_rating` | integer, nullable | 1-5 scale, null if not yet rated |
| `stage` | text | Interview stage |
| `went_well` | text, nullable | Free text |
| `was_hard` | text, nullable | Free text |
| `do_differently` | text, nullable | Free text |
| `key_takeaways` | text[], nullable | Array of strings |
| `ai_analysis` | jsonb, nullable | Contains strengths/improvements/next_steps |
| `created_at` | timestamptz | Auto-set |

**Note:** `database.types.ts` is stale (pre-CAR-127). `overall_rating` exists in live schema but not in generated types. The route queries Supabase directly so this is fine; type assertions handle the gap.

## Task 1: API Route — GET /api/debriefs/stats

**File:** `dashboard/src/app/api/debriefs/stats/route.ts`

### Authentication

Standard pattern: `createServerSupabaseClient()` -> `auth.getUser()` -> 401 if missing.

### Query Strategy

Fetch all debriefs for the authenticated user in one `.select()` call, then compute stats in JS. PostgREST doesn't expose aggregate functions through the Supabase client SDK, and row counts will always be small enough for server-side JS aggregation.

### Response Shape

```json
{
  "total_debriefs": 5,
  "average_rating": 3.8,
  "most_recent_at": "2026-04-06T15:30:00Z",
  "debriefs_this_week": 2
}
```

### Calculation Rules

- **total_debriefs:** Count of all rows for the user.
- **average_rating:** Average of `overall_rating` where NOT NULL. Rounded to 1 decimal. Returns `null` if zero rated debriefs exist (not 0).
- **most_recent_at:** `created_at` of the newest debrief. Returns `null` if no debriefs.
- **debriefs_this_week:** Count of debriefs with `created_at >= start of current ISO week (Monday 00:00 UTC)`.

### Zero-Debrief Case

Return zeroed-out stats, not an error:
```json
{
  "total_debriefs": 0,
  "average_rating": null,
  "most_recent_at": null,
  "debriefs_this_week": 0
}
```

### Pure Function Extraction

Extract `calculateDebriefStats(debriefs)` as a named, exported pure function. This enables direct unit testing without mocking Supabase. The route handler calls this function after fetching rows.

### Error Handling

- Auth failure: `{ error: "Unauthorized" }` with 401
- Supabase query failure: `{ error: message }` with 500
- Catch-all: `{ error: message }` with 500

## Task 2: React Hook — useDebriefStats

**File:** `dashboard/src/hooks/use-debrief-stats.ts`

### Return Shape

```typescript
interface DebriefStats {
  total_debriefs: number;
  average_rating: number | null;
  most_recent_at: string | null;
  debriefs_this_week: number;
}

{
  stats: DebriefStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}
```

### Type Location

`DebriefStats` interface defined in `dashboard/src/types/coaching.ts` alongside existing `DebriefRecord`.

### Behaviors

1. **Fetch on mount:** Single fetch via `/api/debriefs/stats`. Uses `hasFetched` ref to prevent double-fetch in StrictMode.
2. **AbortController:** Created per fetch. Aborted on unmount to handle in-flight requests safely.
3. **Fetch guard:** `isFetching` ref prevents concurrent fetches (realtime trigger during active fetch is a no-op).
4. **Realtime subscription:** Supabase client channel on `debriefs` table (`postgres_changes`, event `*`). On any change, debounced re-fetch (500ms matching existing pattern).
5. **Cleanup on unmount:** Remove channel, clear debounce timer, abort in-flight fetch.
6. **Error state:** Set `error` string on fetch failure, clear on successful fetch.

### Client Setup

Uses `createClient()` from `@/lib/supabase/client` (singleton browser client), matching `use-conversations.ts` pattern.

## Task 3: Tests

### Route Test — `dashboard/src/__tests__/api/debriefs-stats.test.ts`

Tests the extracted `calculateDebriefStats` pure function directly:

| Test case | Input | Expected |
|-----------|-------|----------|
| Empty array | `[]` | `{ total: 0, avg: null, recent: null, week: 0 }` |
| All null ratings | 3 debriefs, all `overall_rating: null` | `avg: null`, `total: 3` |
| Mixed ratings | Ratings [4, null, 5, 3] | `avg: 4.0` (nulls excluded from denominator) |
| Single debrief | 1 debrief with rating 5 | `avg: 5.0`, `total: 1` |
| Week boundary | Debriefs spanning Mon boundary | Correct `debriefs_this_week` count |
| Rating rounding | Ratings [3, 4] | `avg: 3.5` (1 decimal) |

### Hook Test — `dashboard/src/__tests__/hooks/use-debrief-stats.test.ts`

- Loading state on mount
- Successful fetch populates stats
- Error state on fetch failure
- Cleanup on unmount (channel removed, timer cleared)

## Task 4: Feature Manifest Entries

Two new entries in `dashboard/feature-manifest.json`:

```json
{
  "ticket": "CAR-102",
  "name": "Debrief Stats API Route",
  "file": "src/app/api/debriefs/stats/route.ts",
  "exports": ["GET", "calculateDebriefStats"],
  "patterns": ["average_rating", "debriefs_this_week", "most_recent_at"],
  "area": "coaching"
},
{
  "ticket": "CAR-102",
  "name": "Debrief Stats Hook",
  "file": "src/hooks/use-debrief-stats.ts",
  "exports": ["useDebriefStats"],
  "patterns": ["DebriefStats", "postgres_changes", "debriefs"],
  "area": "coaching"
}
```

## Scope Guard

- Do NOT integrate into the Overview page or any UI component
- Do NOT modify existing files except to add type exports and manifest entries
- Do NOT touch the debriefs table schema or migrations

## Verification Checklist

- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] `bash tools/regression-check.sh` passes
- [ ] New manifest entries present and passing

## Post-Completion

Add a comment to CAR-102 documenting files created and test results. Do NOT transition to Done.
