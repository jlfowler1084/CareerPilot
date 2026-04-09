# CAR-134: Debrief Analysis Timeout & Persistence Fix

**Date:** 2026-04-09
**Ticket:** CAR-134
**Approach:** Mirror Interview Prep Pattern (Approach A)

## Problem

Two bugs in the "Analyze Debrief" flow (coaching/analyze path):

1. **Timeout**: The `/api/coaching/analyze` route uses `AbortSignal.timeout(120_000)` which leaks a raw "The operation was aborted due to timeout" error to the UI. No cleanup, no user-friendly message, no retry guidance.
2. **No persistence**: Coaching sessions are stored only in React `useState`. The `fetchSessions` GET path has no server handler (comment: "No GET handler yet"). When the user collapses the Performance Coach section, switches tabs, or navigates away, all analysis results are lost.

## Working Reference: Interview Prep

Interview Prep does not have these problems because it:
- Uses a manual `AbortController` + `setTimeout(90_000)` with explicit `clearTimeout` in both success and error paths
- Returns a 504 status with a user-friendly timeout message
- Persists results to Supabase (`applications.interview_prep` JSONB) immediately after generation
- Reads persisted data on mount via the parent application object

## Changes

### 1. API Route: `/api/coaching/analyze/route.ts`

**Timeout fix (POST handler):**
- Replace `AbortSignal.timeout(120_000)` with manual `AbortController` + `setTimeout(() => controller.abort(), 90_000)`
- Wrap the `fetch` call in a try/catch that catches `AbortError` specifically
- `clearTimeout` in both catch and success paths
- Return `504` with message: "Analysis timed out after 90s. Try a shorter transcript or click Retry."

**Persistence fix (new GET handler):**
- Add `GET` export that accepts `?applicationId=` query param
- Auth check (same pattern as POST)
- Query `interview_coaching` table filtered by `application_id` + `user_id`, ordered by `created_at` desc
- Return JSON array of sessions

### 2. Hook: `use-coaching.ts`

- Add `hasFetched` ref (same pattern as `use-debriefs.ts`)
- Update `fetchSessions` to call `GET /api/coaching/analyze?applicationId=...` and populate `sessions` state
- Add `useEffect` that calls `fetchSessions` on mount and resets `hasFetched` when `applicationId` changes
- Existing `analyzeDebrief` continues to append new sessions to state optimistically

### 3. Component: `coaching-section.tsx`

- Replace the plain error banner with one that includes a "Retry" button
- Retry button calls `handleAnalyzeDebrief()` (re-submits the existing textarea content)
- Hide retry when `analyzing` is true (prevent double-submit)
- Matches the pattern at `interview-prep-section.tsx:313-324`

## Files Modified

| File | Change |
|------|--------|
| `dashboard/src/app/api/coaching/analyze/route.ts` | Replace AbortSignal.timeout with manual AbortController; add GET handler |
| `dashboard/src/hooks/use-coaching.ts` | Add hasFetched ref, fetch on mount, reset on applicationId change |
| `dashboard/src/components/coaching/coaching-section.tsx` | Add retry button to error banner |

## Out of Scope

- Interview Prep (working correctly, read-only reference)
- `/api/debriefs/analyze` route (separate "Add Debrief" background path, not the reported bug)
- Streaming responses (overkill for Haiku completion times)
- Background job/polling pattern (unnecessary complexity)

## Acceptance Criteria

1. Debrief analysis via "Analyze Debrief" textarea completes without raw timeout errors
2. If a timeout does occur, user sees a friendly 504 message with Retry button
3. Coaching sessions persist across tab switches and section collapse/expand
4. No regressions to Interview Prep functionality
