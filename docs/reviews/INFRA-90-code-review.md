# CareerPilot Code Review -- INFRA-90

**Reviewed:** 2026-04-03
**Skill Standard:** nextjs-supabase (INFRA-89)
**Reviewer:** Claude Code (Opus)
**Branch:** feature/dashboard-v2
**Scope:** dashboard/src/ (Next.js App Router + Supabase)

---

## Executive Summary

The CareerPilot dashboard has a well-structured Supabase client layer with correct three-client separation, consistent `getUser()` auth checks on 34 of 37 API routes, and RLS enabled on all tables. However, three architectural gaps pose critical risk: **no Next.js middleware exists** (session tokens expire silently after 60 minutes), **three API routes have zero authentication** (exposing Anthropic API and Google Calendar to unauthenticated callers), and **no Supabase-generated types are used** (column name mismatches are invisible at compile time). Every page component is a client component with no server-side data fetching, and no Next.js boundary files (loading/error/not-found) exist anywhere.

---

## Findings by Category

### 3a. Supabase Client Architecture

**Files Reviewed:** `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
**Health: NEEDS WORK**

#### Finding 1: Three-client separation is correct
- **Severity:** Advisory (positive)
- **Skill Reference:** Section 1 -- Three Clients, Three Contexts
- **File(s):** `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
- **Current:** Browser client uses `createBrowserClient` with singleton pattern. Server client uses `createServerClient` with `cookies()` from `next/headers`. Middleware helper uses `createServerClient` with request/response cookies and double cookie-set pattern.
- **Expected:** Exactly this pattern.
- **Assessment:** Correct. Client imports are consistent across the codebase -- all 16 hooks and 7 client components import from `@/lib/supabase/client`, all 34 API routes import from `@/lib/supabase/server`. No cross-context client usage detected.

#### Finding 2: No Database generic type parameter on any client
- **Severity:** Warning
- **Skill Reference:** Section 1 -- all client examples use `<Database>` generic
- **File(s):** `lib/supabase/client.ts:7`, `lib/supabase/server.ts:7`, `lib/supabase/middleware.ts:7`
- **Current:** `createBrowserClient(url, key)` -- no type parameter
- **Expected:** `createBrowserClient<Database>(url, key)` with generated types from `npx supabase gen types typescript`
- **Remediation:** Generate Supabase types (`npx supabase gen types typescript --project-id <id> > src/types/supabase.ts`), then add `<Database>` generic to all three client factories.

---

### 3b. Middleware Auth

**Files Reviewed:** `lib/supabase/middleware.ts`, project root (no `middleware.ts` found)
**Health: CRITICAL**

#### Finding 3: No middleware.ts exists -- session refresh never happens
- **Severity:** Critical
- **Skill Reference:** Section 2 -- "The Non-Negotiable: Session Refresh on Every Request"
- **File(s):** Missing `dashboard/middleware.ts` or `dashboard/src/middleware.ts`
- **Current:** The middleware helper `lib/supabase/middleware.ts` exports `updateSession()`, but no root-level `middleware.ts` file exists to call it. Next.js never invokes this code.
- **Expected:** A `middleware.ts` at project root (or `src/middleware.ts`) that calls `updateSession()` on every request, with a matcher excluding static assets.
- **Remediation:** Create `dashboard/middleware.ts`:
  ```typescript
  import { type NextRequest } from "next/server";
  import { updateSession } from "@/lib/supabase/middleware";
  export async function middleware(request: NextRequest) {
    return await updateSession(request);
  }
  export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
  };
  ```
- **Impact:** Without middleware, Supabase session tokens expire after ~60 minutes. After expiry, all server-side `getUser()` calls return null. Users appear logged out with no visible error. This is the single highest-priority fix.

#### Finding 4: API routes excluded from middleware auth redirect
- **Severity:** Warning
- **Skill Reference:** Section 2 -- middleware should refresh sessions on all routes
- **File(s):** `lib/supabase/middleware.ts:36`
- **Current:** `!request.nextUrl.pathname.startsWith("/api")` -- API routes bypass the redirect check entirely
- **Expected:** API routes should still have session refresh (the `getUser()` call), even if they don't redirect to `/login`. The redirect skip is fine, but the session refresh should still occur for API requests.
- **Remediation:** Keep the redirect skip for `/api` routes, but ensure the `supabase.auth.getUser()` call still executes (it does in the current helper code). The issue is that without a root middleware.ts, none of this runs at all.

---

### 3c. Data Fetching Patterns

**Files Reviewed:** All page components in `app/(main)/`, hooks `use-applications.ts`, `use-emails.ts`, `use-conversations.ts`, `use-intelligence.ts`
**Health: NEEDS WORK**

#### Finding 5: All page components are client components -- no server-side data fetching
- **Severity:** Warning
- **Skill Reference:** Section 1 Decision Table -- server components should use `createServerClient`
- **File(s):** All 10 page files in `app/(main)/` have `"use client"` directive
- **Current:** Every page is a client component that fetches data via hooks (client-side). The overview page (`app/(main)/page.tsx`) directly calls `supabase.from("application_events")` and `supabase.from("search_cache")` inside a `useEffect`.
- **Expected:** Server components fetch data server-side using the server client, passing data as props to client components. Only interactive leaf components need `"use client"`.
- **Remediation:** Convert data-fetching pages to server components. Extract interactive sections into client components that receive data as props. This reduces JavaScript bundle size and improves initial load.
- **Note:** This is a large refactor and may be better addressed as a Phase 2 architectural initiative rather than a point fix.

#### Finding 6: Supabase queries in page components lack error checks
- **Severity:** Warning
- **Skill Reference:** Section 5 -- "Always Check Error Before Data"
- **File(s):** `app/(main)/page.tsx:232-250`
- **Current:** `const { data } = await supabase.from("application_events").select("*")...` -- error is destructured away, data accessed without null check.
- **Expected:** `const { data, error } = await ...` with error check before accessing data.
- **Remediation:** Add error destructuring and null guards to all in-page Supabase queries.

#### Finding 7: 35+ uses of .single() on queries that may return zero rows
- **Severity:** Warning
- **Skill Reference:** Section 5 -- ".single() vs .maybeSingle()"
- **File(s):** `use-applications.ts` (6 instances), `use-auto-apply-queue.ts:88`, `use-emails.ts:568`, `use-search-history.ts:76`, `use-search-profiles.ts:100`, `use-search.ts` (2 instances), `api/interview-prep/route.ts:34`, `api/conversations/[id]/route.ts` (3 instances), `api/intelligence/[applicationId]/route.ts:36`, `api/suggestions/action/route.ts` (3 instances), `lib/intelligence/supabase-helpers.ts` (5 instances)
- **Current:** `.single()` used on SELECT queries where the row may not exist (e.g., fetching by application ID from user input).
- **Expected:** `.maybeSingle()` for any query where zero results is a valid outcome. `.single()` only when exactly one row is guaranteed (e.g., INSERT...RETURNING).
- **Remediation:** Audit each instance. INSERT/UPSERT with `.select().single()` is acceptable. SELECT queries should use `.maybeSingle()` and handle the null case explicitly. The `interview-prep/route.ts:34` SELECT by `applicationId` is a clear candidate for `.maybeSingle()`.
- **Note:** Some uses on INSERT/UPSERT + `.select().single()` are correct (the insert guarantees exactly one row). The risk is on SELECT queries.

---

### 3d. Async State Machine Hooks

**Files Reviewed:** All 16 hooks in `hooks/`
**Health: NEEDS WORK**

#### Finding 8: No hooks implement the defensive state machine pattern
- **Severity:** Warning
- **Skill Reference:** Section 4 -- "The Defensive State Machine Pattern"
- **File(s):** All hooks in `hooks/`
- **Current:** All hooks use bare `useState` + `useEffect` with manual `loading`/`error` state management. None use the discriminated union state type (`idle | loading | success | error`), `operationInFlight` ref guards, or `mountedRef` tracking (except `use-intelligence.ts` and `use-conversations.ts` which have partial implementations).
- **Expected:** Async operations wrapped in state machine pattern with re-entry guards to prevent duplicate concurrent requests.
- **Remediation:** This is a systemic pattern issue. Recommended approach: create a shared `useAsyncOperation<T>()` utility hook implementing the full state machine, then migrate hooks incrementally. Priority: `use-emails.ts` (most complex, 700+ lines), `use-applications.ts` (handles optimistic updates).
- **Note:** The current hooks work because the browser client is a singleton and RLS prevents data leaks, but they are vulnerable to race conditions on rapid user interactions.

#### Finding 9: Module-level Supabase client instantiation in hooks
- **Severity:** Advisory
- **Skill Reference:** Section 1 -- browser client is a singleton
- **File(s):** All hooks call `const supabase = createClient()` at module scope (outside component)
- **Current:** `createClient()` is called at module load time, before any component renders.
- **Expected:** Since `createBrowserClient` returns a singleton, this is functionally safe. However, it's unconventional and can cause issues with testing/SSR.
- **Remediation:** Move `const supabase = createClient()` inside the hook function body. The singleton pattern means there's no performance cost.

#### Finding 10: Partial cancelled/mounted tracking in some hooks
- **Severity:** Advisory (positive)
- **Skill Reference:** Section 4 -- mounted check pattern
- **File(s):** `use-intelligence.ts:53`, `use-training.ts:200`
- **Assessment:** These hooks implement `let cancelled = false` with cleanup `return () => { cancelled = true }` -- a correct lightweight alternative to `mountedRef`. This is good practice already in place for the newer hooks.

---

### 3e. Prerequisite Gate Pattern

**Files Reviewed:** `use-emails.ts` (autoScan logic)
**Health: PASS**

#### Finding 11: Email scan has proper gating with cooldown
- **Severity:** Advisory (positive)
- **Skill Reference:** Section 4 -- "Prerequisite Gate Pattern"
- **File(s):** `use-emails.ts:122-137`
- **Current:** `autoScan()` checks for orphaned unclassified emails first, then enforces a 15-minute cooldown (`SCAN_COOLDOWN_MS`). Classification has a 3-attempt retry limit (`MAX_CLASSIFY_ATTEMPTS`) before marking as irrelevant.
- **Expected:** Gates with caps or timeouts to prevent unbounded backlogs.
- **Assessment:** Well-implemented. The `MAX_CLASSIFY_ATTEMPTS = 3` and `MAX_EMAILS_IN_STATE = 500` constants prevent the exact unbounded backlog issue from CAR-84.

---

### 3f. API Route Security

**Files Reviewed:** All 37 route files in `app/api/`
**Health: CRITICAL**

#### Finding 12: Three API routes have ZERO authentication
- **Severity:** Critical
- **Skill Reference:** Section 3 -- "Every API route must validate the user session before processing"
- **File(s):**
  - `api/extract-job/route.ts` -- calls Anthropic API with web_search tool (consumes API credits)
  - `api/calendar-sync/route.ts` -- creates events on Google Calendar (modifies external state)
  - `api/suggestions/ai-extract/route.ts` -- calls Anthropic API with Haiku (consumes API credits)
- **Current:** No `getUser()` call. No auth check of any kind. Any HTTP client that knows the endpoint can call these routes.
- **Expected:** Every route must start with `const { data: { user }, error } = await supabase.auth.getUser(); if (error || !user) return 401;`
- **Remediation:** Add the standard auth preamble to all three routes. This is the second highest-priority fix after middleware.
- **Impact:** `extract-job` enables unlimited Anthropic API consumption. `calendar-sync` allows arbitrary Google Calendar event creation. `ai-extract` enables unlimited Haiku API consumption.

#### Finding 13: 34 of 37 routes correctly use getUser() for auth
- **Severity:** Advisory (positive)
- **Skill Reference:** Section 2 -- "getUser() vs getSession()"
- **File(s):** All other API routes
- **Assessment:** The codebase consistently uses `getUser()` (server-verified) rather than `getSession()` (cookie-parsed). This is the correct and secure pattern. No route uses `getSession()` for authorization decisions.

#### Finding 14: Input validation is inconsistent across routes
- **Severity:** Warning
- **Skill Reference:** Section 3 -- "Check input validation on all API routes"
- **File(s):**
  - `api/suggestions/action/route.ts` -- validates action type but doesn't validate `id` is a valid UUID
  - `api/conversations/analyze/route.ts` -- validates `conversationId` exists but no format check
  - `api/interview-prep/route.ts` -- validates stage against PREP_STAGES array (good)
  - `api/gmail/scan/route.ts` -- validates `since` exists but no format/range check
- **Current:** Most routes check for required fields but don't validate format, type, or range.
- **Expected:** Validate input types and formats, especially UUIDs and date strings, before passing to Supabase queries.
- **Remediation:** Add a shared input validation utility (e.g., `validateUUID(id)`, `validateISODate(date)`) and apply consistently. Low priority -- RLS provides a second layer of defense.

---

### 3g. Row-Level Security (RLS)

**Files Reviewed:** All 14 migration files in `supabase/migrations/`
**Health: NEEDS WORK**

#### Finding 15: RLS enabled on all 13 tables with migration-tracked schemas
- **Severity:** Advisory (positive)
- **Skill Reference:** Section 5 -- RLS
- **File(s):** All migration files
- **Assessment:** Every `CREATE TABLE` is followed by `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and at least one policy. All policies use `auth.uid() = user_id`. Indexes exist on `user_id` columns for the core tables.

#### Finding 16: RLS policies use auth.uid() directly -- no subquery optimization
- **Severity:** Warning
- **Skill Reference:** Section 5 -- "(SELECT auth.uid()) Pattern"
- **File(s):** All migration files
- **Current:** `USING (auth.uid() = user_id)` -- evaluates `auth.uid()` per row.
- **Expected:** `USING (user_id = (SELECT auth.uid()))` -- evaluates once, reused for all rows (up to 100x improvement).
- **Remediation:** Create a new migration to DROP and recreate all RLS policies with the subquery pattern. This is a performance optimization with zero functional impact.

#### Finding 17: Tables referenced in code may not have migration-tracked RLS
- **Severity:** Warning
- **Skill Reference:** Section 5 -- RLS must be enabled on all user-facing tables
- **File(s):** Code references tables not found in the 14 migration files:
  - `auto_apply_queue` (used in `use-auto-apply-queue.ts`, `api/auto-apply/session/route.ts`)
  - `email_job_suggestions` (used in `api/suggestions/action/route.ts`)
  - `company_briefs` (used in `lib/intelligence/supabase-helpers.ts`)
  - `interview_prep` (used in `lib/intelligence/supabase-helpers.ts`)
  - `debriefs` (used in `lib/intelligence/supabase-helpers.ts`)
  - `skill_mentions` (used in `lib/intelligence/supabase-helpers.ts`)
- **Current:** These tables may have been created via Supabase dashboard or unapplied migrations. Their RLS status cannot be verified from the codebase.
- **Remediation:** Run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` against production to verify all tables have RLS enabled. If any lack RLS, create a migration to enable it. Track ALL schema changes in migration files.

---

### 3h. Type Safety

**Files Reviewed:** `tsconfig.json`, `types/index.ts`, `types/email.ts`, `types/coaching.ts`, `lib/intelligence/supabase-helpers.ts`
**Health: NEEDS WORK**

#### Finding 18: TypeScript strict mode is enabled
- **Severity:** Advisory (positive)
- **Skill Reference:** Section 6 -- type safety
- **File(s):** `tsconfig.json:7`
- **Assessment:** `"strict": true` is set. Good.

#### Finding 19: No Supabase-generated types exist
- **Severity:** Warning
- **Skill Reference:** Section 5 -- "Use generated TypeScript types"
- **File(s):** Missing `types/supabase.ts`
- **Current:** All database types are manually defined in `types/index.ts`, `types/email.ts`, `types/coaching.ts`, and `lib/intelligence/supabase-helpers.ts`. Column names must be manually kept in sync with the database schema.
- **Expected:** Generated types from `npx supabase gen types typescript` that are imported by the Supabase client factories and flow through to all queries.
- **Remediation:** Generate types, add `<Database>` generic to client factories (Finding 2), and replace manual type casts like `data as CompanyBriefRow` with type-safe query results.
- **Impact:** Column name mismatches (e.g., ordering by `created_at` when column is `date_found`) are caught at runtime, not compile time. The skill references this exact scenario in Section 5.

#### Finding 20: Manual type assertions on Supabase query results
- **Severity:** Advisory
- **Skill Reference:** Section 5 -- type-safe queries
- **File(s):** `lib/intelligence/supabase-helpers.ts` (throughout), `use-emails.ts:92-105`, `use-applications.ts:76`
- **Current:** `data as CompanyBriefRow`, `payload.new as unknown as Email`, `data as Pick<Application, ...>[]`
- **Expected:** With generated types and `<Database>` generic, Supabase query results would be correctly typed without manual assertions.
- **Remediation:** Resolves automatically when Finding 19 is addressed.

---

### 3i. Error Handling

**Files Reviewed:** All API routes, all hooks, `components/error-boundary.tsx`
**Health: NEEDS WORK**

#### Finding 21: Error responses returned with HTTP 200 status
- **Severity:** Warning
- **Skill Reference:** Section 3 -- "NEVER return 200 with an error in the body"
- **File(s):** `api/conversations/analyze/route.ts:98`, `api/conversations/analyze/route.ts:134`, `api/conversations/analyze/route.ts:141`
- **Current:**
  ```typescript
  return NextResponse.json({ success: false, error: "Analysis failed" })
  // status defaults to 200!
  ```
- **Expected:** Every error response must include an explicit status code:
  ```typescript
  return NextResponse.json({ error: "Analysis failed" }, { status: 502 })
  ```
- **Remediation:** Add `{ status: 5xx }` to all three error returns in this route.

#### Finding 22: Mixed error response shapes across routes
- **Severity:** Advisory
- **Skill Reference:** Section 3 -- "Error Response Consistency"
- **File(s):** Most routes use `{ error: "message" }`, but some use `{ success: false, error: "message" }` (conversations/analyze, extract-job, calendar-sync)
- **Current:** Two different error shapes coexist. Frontend hooks must handle both.
- **Expected:** Consistent `{ error: "message" }` shape on errors, `{ data: ... }` on success.
- **Remediation:** Standardize on `{ error: "message" }` with appropriate status codes. The `success` field is redundant when HTTP status codes are used correctly.

#### Finding 23: Hooks use finally blocks correctly for loading state
- **Severity:** Advisory (positive)
- **Skill Reference:** Section 4 -- "The Optimistic Finally Anti-Pattern"
- **File(s):** All hooks with finally blocks
- **Assessment:** All `finally` blocks only reset loading/progress state (`setLoading(false)`, `setAnalyzing(false)`, etc.). No success-indicating side effects in `finally`. This matches the skill standard.

#### Finding 24: Some Supabase query errors silently discarded in hooks
- **Severity:** Warning
- **Skill Reference:** Section 5 -- "Always Check Error Before Data"
- **File(s):** `use-applications.ts:56-63`, `use-auto-apply-queue.ts:30-31`, `use-activity-log.ts`, multiple hooks
- **Current:** `const { data } = await supabase.from("...").select(...)` -- error not destructured. Uses `data || []` fallback.
- **Expected:** Destructure error, log it, and potentially surface to user.
- **Remediation:** Add `{ data, error }` destructuring with `if (error) console.error(...)` minimum. For user-facing operations, set error state.

---

### 3j. Next.js Best Practices

**Files Reviewed:** `app/layout.tsx`, `app/(main)/layout.tsx`, all page components
**Health: NEEDS WORK**

#### Finding 25: No loading.tsx, error.tsx, or not-found.tsx boundary files
- **Severity:** Warning
- **Skill Reference:** Section 3 (Next.js patterns) -- "Check for proper use of loading.tsx, error.tsx, not-found.tsx boundary files"
- **File(s):** No boundary files exist anywhere in `app/`
- **Current:** Loading states are handled per-component with inline skeletons (e.g., `app/(main)/page.tsx:282-310`). Errors are caught by the class-based `ErrorBoundary` wrapper in the main layout.
- **Expected:** Next.js App Router boundary files at route group level provide automatic loading/error/404 handling with Suspense integration.
- **Remediation:** Add `app/(main)/loading.tsx` with a shared skeleton, `app/(main)/error.tsx` with error recovery UI, and `app/not-found.tsx` for 404s. The existing `ErrorBoundary` class component can be replaced by `error.tsx`.

#### Finding 26: Root layout wraps children in AuthProvider (client boundary)
- **Severity:** Advisory
- **Skill Reference:** Section 1 -- server vs client component boundaries
- **File(s):** `app/layout.tsx:35`
- **Current:** `<AuthProvider>` (a `"use client"` component) wraps all children in the root layout. This forces the entire component tree into a client boundary.
- **Expected:** For a fully client-rendered SPA pattern (which this project currently is), this is acceptable. If server components are adopted (Finding 5), the AuthProvider should be pushed down to only wrap the authenticated route group.
- **Remediation:** No action needed until server component migration. When that happens, move `<AuthProvider>` to `app/(main)/layout.tsx` only.

#### Finding 27: No environment validation at startup
- **Severity:** Advisory
- **Skill Reference:** Section 6 -- "Environment Validation at Startup"
- **File(s):** No `lib/env.ts` or equivalent exists
- **Current:** Environment variables are accessed with `!` non-null assertions: `process.env.NEXT_PUBLIC_SUPABASE_URL!`. Missing variables cause runtime crashes deep in the call stack.
- **Expected:** A startup validation module that fails fast with clear error messages if required env vars are missing.
- **Remediation:** Create `lib/env.ts` with validation for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, and import it in `app/layout.tsx`.

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Warning  | 10 |
| Advisory | 8 (5 positive, 3 improvement) |

**Categories:**

| Category | Health |
|----------|--------|
| 3a. Supabase Client Architecture | NEEDS WORK |
| 3b. Middleware Auth | CRITICAL |
| 3c. Data Fetching Patterns | NEEDS WORK |
| 3d. Async State Machine Hooks | NEEDS WORK |
| 3e. Prerequisite Gate Pattern | PASS |
| 3f. API Route Security | CRITICAL |
| 3g. Row-Level Security (RLS) | NEEDS WORK |
| 3h. Type Safety | NEEDS WORK |
| 3i. Error Handling | NEEDS WORK |
| 3j. Next.js Best Practices | NEEDS WORK |

**Categories Passing: 1/10**

---

## Recommended Remediation Order

### Batch 1: Security (Critical) -- CAR-xxx

These must be fixed before any deployment to a public-facing environment.

1. **Create middleware.ts** (Finding 3) -- Enables session refresh on every request. Without this, auth silently breaks after 60 minutes. Estimated: 1 file, <20 lines.
2. **Add auth to 3 unprotected API routes** (Finding 12) -- `extract-job`, `calendar-sync`, `suggestions/ai-extract`. Add the standard `getUser()` preamble. Estimated: 3 files, ~10 lines each.
3. **Fix HTTP 200 error responses** (Finding 21) -- Add explicit status codes to 3 error returns in `conversations/analyze/route.ts`. Estimated: 1 file, 3 lines.

### Batch 2: Type Safety Foundation -- CAR-xxx

Prevents an entire class of bugs (column name mismatches, wrong query shapes).

4. **Generate Supabase types** (Finding 19) -- Run `npx supabase gen types typescript` and save to `types/supabase.ts`.
5. **Add Database generic to all clients** (Finding 2) -- Update 3 files to use `<Database>` type parameter.
6. **Verify RLS on non-migration tables** (Finding 17) -- Run SQL check, create migrations for any tables missing RLS.

### Batch 3: Query Safety -- CAR-xxx

Prevents 406 errors and silent data loss.

7. **Audit .single() usage** (Finding 7) -- Replace with `.maybeSingle()` on SELECT queries where zero rows is possible. Keep `.single()` on INSERT/UPSERT returns. Estimated: ~15 files, ~25 changes.
8. **Add error checks to hook queries** (Finding 24) -- Add `{ data, error }` destructuring to hooks that currently discard errors. Estimated: ~10 hooks.

### Batch 4: RLS Performance -- CAR-xxx

Performance optimization with zero functional risk.

9. **Migrate RLS policies to (SELECT auth.uid()) pattern** (Finding 16) -- Single migration file. Estimated: 1 file, ~30 lines.

### Batch 5: Error Consistency -- CAR-xxx

Improves developer experience and frontend error handling.

10. **Standardize error response shape** (Finding 22) -- Align all routes on `{ error: "message" }` + status code pattern. Estimated: ~5 files.
11. **Add input validation utility** (Finding 14) -- Shared UUID/date validators. Estimated: 1 utility file + updates to ~5 routes.

### Batch 6: Next.js Architecture (Large) -- CAR-xxx

Major architectural improvements. Consider as Phase 2 work.

12. **Add boundary files** (Finding 25) -- Create `loading.tsx`, `error.tsx`, `not-found.tsx`. Estimated: 3 files.
13. **Add environment validation** (Finding 27) -- Create `lib/env.ts`. Estimated: 1 file.
14. **Create useAsyncOperation utility** (Finding 8) -- Shared state machine hook. Estimated: 1 file + incremental adoption.
15. **Server component migration** (Finding 5) -- Convert pages to server components with client component leaves. This is a large architectural change that should be planned as a separate initiative.

### Deferred / Monitor

- **Module-level client instantiation** (Finding 9) -- Functionally safe due to singleton. Fix if testing issues arise.
- **AuthProvider scope** (Finding 26) -- Relevant only after server component migration.

---

## Skill Gaps Identified

The following issues were found that are NOT covered by the current nextjs-supabase skill:

1. **Unprotected API routes** -- The skill covers auth patterns but doesn't explicitly call out "audit all routes for missing auth" as a review checklist item. Consider adding a "Route Security Audit" section.
2. **Migration-tracked schema completeness** -- The skill mentions RLS but doesn't address verifying that all tables used in code have corresponding migration files.
3. **Error response shape standardization** -- The skill shows the correct pattern but could benefit from a "Common Error Shape" standard section.
4. **Next.js boundary files** -- Could be added as a "Route Structure" checklist in the skill.
