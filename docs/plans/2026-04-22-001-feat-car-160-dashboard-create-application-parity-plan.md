---
title: CAR-160 — Dashboard Create Application parity with CLI tracker add
type: feat
status: active
date: 2026-04-22
origin: docs/brainstorms/2026-04-22-CAR-160-dashboard-create-application-parity-requirements.md
deepened: 2026-04-22
---

# CAR-160 — Dashboard Create Application parity with CLI tracker add

## Overview

Close the last UX parity gap left open by CAR-163 consolidation: the dashboard "Add Application Manually" form currently captures only 5 of the 8 fields the CLI `tracker add` wizard captures, and the `addApplication` hook silently drops caller-supplied status, notes, and job_description. This plan widens the hook contract and extends the form with a nested "More details" disclosure exposing `status`, `notes`, and `job_description`. Both CLI and dashboard continue to write the same Supabase `applications` row through a single write path.

## Problem Frame

After CAR-163 M2–M5b (shipped 2026-04-21), dashboard is the canonical browser UX for creating applications per the Option-C decision. But dashboard manual entry still forces a two-step workflow — create bare row, open detail view, edit each field — when the user has status intent, notes, or a pasted job description at creation time. The CLI wizard at `cli.py:1569-1625` collects all three up front; the dashboard form at `dashboard/src/components/applications/add-form.tsx` does not. See origin: `docs/brainstorms/2026-04-22-CAR-160-dashboard-create-application-parity-requirements.md`.

## Requirements Trace

- R1. Form exposes `status`, `notes`, `job_description` behind a "More details" disclosure (see origin).
- R2. "More details" is nested inside the existing outer card disclosure (see origin).
- R3. Status select offers 6 creation-time choices (`found`, `interested`, `applied`, `phone_screen`, `interview`, `offer`), default `interested`. Write path still accepts all 9.
- R4. Quick-submit (disclosure never opened) creates row with `status = "interested"`, `notes = ""`, `job_description = null`. Manual-path default changes from `"found"` to `"interested"`; search-path default at `use-applications.ts:110` unchanged.
- R5. `addApplication` widened so caller-supplied fields win when `value !== undefined`.
- R6. Search-page callers at `dashboard/src/app/(main)/search/page.tsx:417,442,468` continue to produce `status = "interested"` rows without modification.
- R9. Empty `notes` stored as `""`; empty `job_description` stored as `null`. Trim whitespace + require title/company rules preserved.

*(R7 and R8 from the origin are regression constraints, not new work. R7 — `job_description` column mapping — is a verified existing fact captured in Context & Research. R8 — URL-duplicate detection — is a non-regression requirement captured in Regression Notes and exercised by Unit 2 test scenarios.)*
- R10. "More details" trigger is a `<button>` with `aria-expanded` / `aria-controls`; focus moves to first field on open; positioned above submit button for tab order.
- R11. Disclosure state on successful submit: outer card closes, inner "More details" resets to closed. On duplicate-URL confirm cancel, all state preserved.
- R12. On Supabase insert error, form does not wipe any field state — user can retry without re-typing.
- R13. Default values on quick-submit are treated as valid; no defaults-confirmation dialog.

## Scope Boundaries

- No changes to the CLI wizard, `ApplicationTracker.save_job`, or any CLI code.
- No changes to the URL-extract flow (`createFromExtraction`).
- No unification of manual and URL-extract forms.
- No modal-based redesign — existing inline disclosure pattern is extended.
- No rich-text editor; plain `<textarea>` only, mirroring the 13-file dashboard convention.
- No backfill of historical `status = "found"` rows.
- No collapse of the search-page `addApplication + updateApplication` two-step at `search/page.tsx:452-483`.

## Context & Research

### Relevant Code and Patterns

- **Hook to widen:** `dashboard/src/hooks/use-applications.ts:103-165` (`addApplication`). Current `entryPoint` branch at line 110 must become a fallback-only default. Existing `createFromExtraction` at lines 285-324 is the template for how the widened insert payload should look.
- **Form to extend:** `dashboard/src/components/applications/add-form.tsx`. Existing duplicate-URL check at lines 37-45 (CAR-167) must be preserved verbatim.
- **Status constant:** `dashboard/src/lib/constants.ts:3-13` (`STATUSES`). The 6 creation-time choices are `STATUSES.slice(0, 6)` — the file's order already matches the required subset.
- **Native `<select>` with STATUSES precedent:** `dashboard/src/components/applications/application-row.tsx:91,246` uses `React.ChangeEvent<HTMLSelectElement>` and maps over `STATUSES` to render `<option>` elements. Use native `<select>`, not the shadcn `Select` primitive — matches the existing applications-area pattern and gets keyboard accessibility for free.
- **Textarea pattern:** raw `<textarea>` across 13 files in `dashboard/src`; no `ui/textarea.tsx` primitive exists. Mirror the styling classes used by `dashboard/src/components/applications/application-row.tsx` notes editor.
- **Hook test precedent:** `dashboard/src/__tests__/hooks/use-applications.test.ts` tests extracted logic (`computeDateUpdates`) rather than the hook itself with `renderHook`. Extending that pattern for the widened override semantics avoids pulling in full Supabase client mocking.
- **Type nullability:** `dashboard/src/types/database.types.ts:97,101,107` and `dashboard/src/types/index.ts:96,102,114,118-127`. `notes: string` is non-null in the dashboard `Application` type (must keep `""` sentinel); `job_description: string | null` accepts null.
- **Feature manifest:** `dashboard/feature-manifest.json` lines ~644-648 and ~1950-1956 already track the hook and form. New patterns/flags need appending — see Unit 3.

### Institutional Learnings

- `docs/solutions/` — no directly-matching prior solution for form expansion. The most relevant adjacent pattern is the URL-extract flow which writes the same column set; this plan intentionally mirrors its null/empty-string conventions.
- CAR-167 (existing) introduced the `findApplicationByUrl` + `window.confirm` dedup flow referenced in R8/R11. Preserving it is a regression constraint.

### External References

- None required. Work is entirely in a well-patterned area with native HTML elements and existing Supabase conventions.

## Key Technical Decisions

- **Native `<select>` over shadcn `Select` primitive.** The applications area consistently uses native `<select>` (see `application-row.tsx:91`). Native selects satisfy R10's keyboard accessibility requirements automatically; the shadcn primitive would add a dependency and a different interaction model for no added value.
- **Single disclosure state variable for "More details"** (`detailsOpen: boolean`) independent of the existing outer `open` state. The outer state gates the whole card; the inner state gates three fields within. Independence matches the requirement that closing "More details" preserves field state (R11).
- **Override semantics: `value !== undefined`, not `"key" in obj`.** Prevents accidental override by spread-object callers that carry a literal `undefined`. See origin Key Decisions.
- **Change manual-path default in the hook, not in the form.** The form passes `status: undefined` when the user hasn't opened "More details"; the hook's fallback resolves that to `"interested"`. Collapse the existing ternary at `use-applications.ts:110` — both search and manual paths now default to `"interested"`, so the constant `"interested"` is the truthful expression of the default. The earlier draft preserved the ternary "for future divergence headroom," but reviewers correctly observed that this creates two policy locations (form visible default in JSX, hook fallback in code) whose agreement is coincidental and would silently drift if either side changed. Single constant, single location.
- **Form preserves all field state on submit failure (R12).** Current form resets on any path through `handleSubmit`. New behavior: reset only on successful submit (hook returns `{ data, error: null }`); on error, leave field state intact. This requires the hook's logged-out early-return path (`use-applications.ts:108`) to also return `{ data: null, error }` rather than `undefined`, matching `createFromExtraction`'s shape at `use-applications.ts:287`. Otherwise a submit in a logged-out edge case resolves to `undefined` and crashes the form's `result.error` check.
- **Feature-manifest update is part of the plan, not post-hoc.** `dashboard/CLAUDE.md` gates task completion on `tools/regression-check.sh` passing; adding the new capabilities to `feature-manifest.json` is in-scope for this ticket.

## Open Questions

### Resolved During Planning

- **Textarea row heights.** Decision: `notes` at `rows={3}`, `job_description` at `rows={8}`. Both use `resize-none` to match the existing applications-area styling.
- **Shadcn Select vs native `<select>`.** Decision: native `<select>` — see Key Technical Decisions.
- **Whether to tighten `addApplication`'s input type.** Decision: defer. The `Partial<Application> | Job` union with `"X" in job ? ... : ...` works. Tightening is a separate refactor ticket and not load-bearing for CAR-160. Capture as a deferred note in implementation comments.
- **Hook-test strategy.** Decision: extend the existing extracted-logic test pattern. Add unit tests for the override-semantics logic by extracting the status-fallback resolution into a small pure function that is testable without renderHook. Form-level behavior is covered by the new React Testing Library tests in Unit 2.

### Deferred to Implementation

- Exact ARIA attribute wiring for the "More details" button (`aria-controls` needs a stable id — generate with `useId()` at implementation time).
- Exact Tailwind class combinations for the disclosure affordance (match outer card's chevron styling).
- Final placement of new feature-manifest entries relative to existing CAR-62 and CAR-115 blocks — align with alphabetical/ticket-sorted order on read.

## Implementation Units

- [ ] **Unit 1: Widen `addApplication` hook contract**

**Goal:** Make `addApplication` honor caller-supplied `status`, `notes`, and `job_description` when present, falling back to entryPoint-based defaults when not. Change manual-entry default from `"found"` to `"interested"`. No other hook behavior changes.

**Requirements:** R4, R5, R6, R9

**Dependencies:** None.

**Files:**
- Modify: `dashboard/src/hooks/use-applications.ts`
- Modify: `dashboard/src/__tests__/hooks/use-applications.test.ts`

**Approach:**
- At line 110, replace the ternary with a single constant: `const fallbackStatus: ApplicationStatus = "interested"`. Both search and manual entries now use the same default; the previous ternary's second branch changes from `"found"` to `"interested"` per R4.
- Extract the override logic into a small pure helper `pickValue<T>(raw: T | undefined, fallback: T): T` — returns `raw` when it is not `undefined`, otherwise `fallback`. Operating on *already-extracted* values (not on the `job` object with a dynamic key) sidesteps the union-key typing problem inherent to `Partial<Application> | Job`. This helper is the testing seam.
- At the insert call site, read each caller-override value once with the existing `"X" in job ? ... : undefined` pattern, then pass through `pickValue`:
  - `status`: `pickValue("status" in job ? job.status : undefined, fallbackStatus)`
  - `notes`: `pickValue("notes" in job ? job.notes : undefined, "")` (preserves `Application.notes: string` non-null contract from `types/index.ts:102`)
  - `job_description`: `pickValue("job_description" in job ? job.job_description : undefined, null)` (column is `string | null`)
- Fix the logged-out early return at line 108: replace `if (!user) return` with `if (!user) return { data: null, error: new Error("Not authenticated") }`. Matches `createFromExtraction` at line 287 and closes the R12 hole where a logged-out submit would otherwise resolve to `undefined` and crash the form's error check.
- Add a JSDoc block on `addApplication` documenting the override semantics.

**Execution note:** Implement test-first. The `pickValue` helper is trivial to test in isolation — write its tests before touching `addApplication`.

**Patterns to follow:**
- `dashboard/src/hooks/use-applications.ts:285-324` (`createFromExtraction`) for the insert payload shape including `profile_id: ""` sentinel and `notes: ""` sentinel.
- `dashboard/src/__tests__/hooks/use-applications.test.ts` for the test style (extracted pure function, Vitest `describe/it/expect`, no renderHook).

**Test scenarios:**
- Happy path: `pickValue(raw, fallback)` returns `raw` when it is a defined non-undefined value — exercised for a string ("applied"), an empty string ("" — valid explicit notes override, not a missing signal), and `null` (explicit null for `job_description` is meaningful, distinct from undefined).
- Edge case: `pickValue(undefined, fallback)` returns `fallback` — the spread-object-with-literal-undefined case.
- Edge case: `pickValue` preserves type parameter inference — calling with a `string` fallback produces a `string` return without casts at the call site.
- Happy path: manual-entryPoint default status resolves to `"interested"` when caller provides no status.
- Happy path: search-entryPoint default status resolves to `"interested"` when caller provides no status (same constant now — validates R6 explicitly).
- Integration (manual): calling the hook with `{ title, company, status: "applied" }` and `entryPoint = "manual"` produces a Supabase insert payload whose `status` is `"applied"` (mock the Supabase client's `.insert()` to capture the payload).
- Integration (search compatibility): calling the hook with a raw `Job` object (no status field) and `entryPoint = "search"` produces an insert payload with `status = "interested"` — proves R6.
- Integration (logged-out): calling the hook when `user` is `null` returns `{ data: null, error: <Error> }` — not `undefined` — so the form's downstream `result.error` check does not crash on an unauthenticated edge.

**Verification:**
- `npm test` passes all test cases above.
- `npm run build` passes with no new TypeScript errors.
- Grep for callers of `addApplication` in `dashboard/src/app/(main)/search/page.tsx` and `dashboard/src/app/(main)/overview-content.tsx` shows no caller passes `status`, `notes`, or `job_description` — so widened contract is backward compatible in practice.

---

- [ ] **Unit 2: Extend `AddForm` with "More details" disclosure and three new fields**

**Goal:** Add the nested disclosure control, the `status` select (6 options), `notes` textarea (3 rows), and `job_description` textarea (8 rows) to the manual-entry form. Preserve URL-dedup behavior (R8), preserve field state on submit failure (R12), and wire proper keyboard-accessibility semantics (R10, R11, R13).

**Requirements:** R1, R2, R3, R8, R10, R11, R12, R13

**Dependencies:** Unit 1 (hook must accept the new fields before form can submit them meaningfully).

**Files:**
- Modify: `dashboard/src/components/applications/add-form.tsx`
- Create: `dashboard/src/__tests__/components/applications/add-form.test.tsx`

**Approach:**
- Introduce state: `detailsOpen: boolean` (independent of outer `open`), `status: ApplicationStatus | undefined` (undefined means "not touched — use hook default"), `notes: string`, `jobDescription: string`. Generate a stable id for `aria-controls` with `React.useId()`.
- Render order within the opened outer card:
  1. Existing 2-col grid (title, company, location, source)
  2. Existing full-width URL row
  3. **New:** "More details" disclosure `<button type="button" aria-expanded={detailsOpen} aria-controls={detailsId}>`, positioned below URL and above submit, so keyboard tab order is `… url → More details → (disclosed fields when open) → submit`.
  4. **New (conditional on `detailsOpen`):** a `<div id={detailsId}>` containing the status select, notes textarea, job_description textarea.
  5. Existing submit button row.
- Status select: native `<select>` iterating `STATUSES.slice(0, 6)`, value bound to `status ?? "interested"` for display, onChange updates state. Initial state is `undefined` so that untouched-by-user means the hook receives `undefined` and applies the entryPoint default.
- On disclosure open via keyboard, move focus to the status select. Use a ref + `useEffect` that fires when `detailsOpen` transitions false→true.
- On submit success: reset all field state (existing behavior), set `detailsOpen = false`, close outer card. On submit failure: do **not** reset any field state — only `setSubmitting(false)`. Determine success by inspecting `onAdd`'s return; since Unit 1 makes the hook consistently return `{ data, error }` (including in the logged-out path), widen `AddFormProps.onAdd` to return `Promise<{ data: unknown; error: unknown }>` and check `error == null`. No `| undefined` branch needed once Unit 1 fixes the logged-out return.
- Preserve existing duplicate-URL check at lines 37-45 verbatim. Duplicate confirm cancel returns early before `setSubmitting`, so field state is preserved naturally.
- Pass new fields to `onAdd`: `{ title, company, location, url, source, status, notes, job_description: jobDescription || null }`. `status: undefined` when user never opens disclosure — hook handles fallback per Unit 1.

**Execution note:** Implement test-first. Start with the a11y and failure-preservation scenarios because those are the most implementer-forgettable.

**Technical design:** *(directional guidance, not implementation specification)*

    [outer card button — existing]
      └─ [outer card body, conditional on `open`]
           ├─ [title / company 2-col row — existing]
           ├─ [location / source 2-col row — existing]
           ├─ [url full-width row — existing]
           ├─ [ More details ▾ ]  ← new, <button>, aria-expanded, aria-controls=detailsId
           ├─ [details panel, conditional on detailsOpen, id=detailsId]  ← new
           │    ├─ [status <select>]
           │    ├─ [notes <textarea rows=3>]
           │    └─ [job_description <textarea rows=8>]
           └─ [Add button row — existing]

**Patterns to follow:**
- `dashboard/src/components/applications/application-row.tsx:91,246` for native `<select>` + `STATUSES.map` + `onChange: React.ChangeEvent<HTMLSelectElement>`.
- `dashboard/src/components/applications/add-form.tsx:71-84` for the existing outer disclosure button — mirror its `<button>` + `ChevronDown`/`ChevronUp` **icon-swap** pattern (not icon-rotate) for the inner "More details" trigger. The outer trigger swaps icons conditionally on `open`; the inner trigger should do the same on `detailsOpen` so the two disclosures use one consistent convention. Upgrade the inner trigger with explicit `aria-expanded` and `aria-controls`.
- **Labels** for the three new fields: match the existing add-form label pattern at `add-form.tsx:92-93` (`text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 block`). Do **not** pull label classes from `application-row.tsx` — the detail view uses a different label convention that would look inconsistent inside the creation form.
- **Textarea styling** (border radius, focus ring, padding) can match `application-row.tsx`'s notes/job-description textareas — that part of the reference is right.
- **Placeholder copy:** `notes` → `"Private notes about this role..."`; `job_description` → `"Paste the job description here..."`. Do *not* reuse the detail-view `job_description` placeholder's Intelligence-tab reference — that feature isn't available at creation time and the copy would confuse a new user.
- `dashboard/src/lib/url-dedup.ts` — no change, reuse existing `findApplicationByUrl` and `formatDuplicateConfirmMessage`.

**Test scenarios:**
- Happy path: renders with outer card closed; clicking the outer trigger opens the card and reveals 5 core fields + a "More details" button.
- Happy path: clicking "More details" reveals status select, notes textarea, job_description textarea; `aria-expanded` flips to `true` and focus moves to the status select (assert via `document.activeElement`).
- Happy path: filling only title + company and submitting calls `onAdd` with `{ status: undefined, notes: "", job_description: null }` (quick-add path, R4).
- Happy path: opening disclosure, choosing `status = "applied"`, typing notes and JD, submitting calls `onAdd` with those literal values (R1, R5 round-trip).
- Edge case: `status` select renders exactly the 6 creation-time choices in STATUSES order; `rejected`/`withdrawn`/`ghosted` are not in the DOM (R3).
- Edge case: disclosure starts closed on first render; after a successful submit, disclosure is reset to closed on the next mount (R11).
- Edge case: pressing Tab from the URL input lands on the "More details" button before the submit button (R10 keyboard order).
- Error path: `onAdd` returns `{ error: <something> }`; form does not reset `notes` or `job_description` values — user can re-click submit without re-typing (R12).
- Error path: submitting with empty title (whitespace only) does not call `onAdd`.
- Integration (with duplicate check): URL matches existing application → `window.confirm` fires; user cancels → `onAdd` is not called, all field values (including new fields) remain (R8, R11).
- Integration (with duplicate check): URL matches existing application → user confirms → `onAdd` is called with all new-field values intact.
- Integration (logged-out): rendering the form outside an authenticated context and submitting → the hook returns `{ error: <Error> }`; form does **not** reset fields or crash on `result.error` (closes the R12 hole for the auth-loading edge case).

**Verification:**
- `npm test` passes all new test cases.
- `npm run build` passes with no new TypeScript errors.
- Manual smoke in browser: open the applications page, add a manual application with and without opening "More details", confirm both paths produce rows in Supabase with the expected `status`, `notes`, `job_description` values; cancel a duplicate-URL warn and confirm fields are preserved; force a Supabase error (e.g., temporarily break `profile_id`) and confirm fields are preserved on the next render.

---

- [ ] **Unit 3: Feature manifest update and regression gate**

**Goal:** Update `dashboard/feature-manifest.json` to reflect the widened hook patterns and new form capabilities so `tools/regression-check.sh` continues to pass. Run full verification gate.

**Requirements:** All (manifest is the cross-cutting regression surface).

**Dependencies:** Units 1 and 2 complete.

**Files:**
- Modify: `dashboard/feature-manifest.json`

**Approach:**
- `tools/regression-check.sh:49` uses `grep -q "$pat" "$FULL_PATH"` per manifest entry. Patterns must be **behavior-visible literal strings** that survive refactors by identity, not implementation-namespace names that any rename breaks.
- Append a new feature entry for "Application Add Form — More Details" under CAR-160: `file: dashboard/src/components/applications/add-form.tsx`, `exports: ["AddForm"]`. Patterns:
  - `"More details"` — the literal UX trigger label. If this disappears, the disclosure is gone.
  - `"aria-controls"` — disclosure-specific a11y wiring (the existing outer button doesn't use it, so this pattern is new and specific).
  - `"STATUSES.slice"` — locks in the 6-option creation-time subset choice.
  - `"rows={3}"` and `"rows={8}"` — textarea sizing; changing either is an observable UX shift.
  - `"job_description"` — the new long-text field identifier in the form.
- Update the existing `addApplication` hook manifest entry (at `dashboard/feature-manifest.json:644-648`) to add one new pattern:
  - `"pickValue"` — the extracted helper name from Unit 1. Locked in during Unit 1 before Unit 3 runs.
- Do **not** add weak patterns like `"status"`, `"notes"`, or `"detailsOpen"` — they are too generic (first two match unrelated code) or implementation-namespace (third is a local variable name that a refactor could rename).
- Do **not** remove or rename existing CAR-62 / CAR-115 manifest entries.
- Note: `tools/regression-check.sh` is run from the repo root, not from `dashboard/`. The script handles both locations.

**Patterns to follow:**
- Existing CAR-167 and CAR-115 manifest entries for structure (ticket, name, file, exports, patterns).

**Test scenarios:**
- Test expectation: none — this unit has no behavioral change. Verification is the regression-check run, below.

**Verification:**
- `tools/regression-check.sh` exits 0 with both new feature entries and all existing entries still matching.
- `npm run build` passes.
- `npm test` passes (no new failures in the existing or new test suites).

## System-Wide Impact

- **Interaction graph:** The widened `addApplication` contract is an additive change — three new optional input fields, no caller signature breaks. Search-page flow (`search/page.tsx:417,442,468`) and overview-content (`overview-content.tsx`) continue to pass `Job` objects without these fields. The `application_events` emission pattern inside `addApplication` (lines 152-159 for `resume_tailored`) is unchanged; the new fields do not emit additional events on creation.
- **Error propagation:** Hook continues to return `{ data, error }` and emits a `toast.error` on failure (line 145). Form now reads `error` to decide whether to reset state — the only new error-path dependency.
- **State lifecycle risks:** Manual-path default flip from `"found"` to `"interested"` is a one-way data-shape change for forward rows only (no backfill). Documented in origin Key Decisions. The "active pipeline" tile at `overview-content.tsx:346-349` will immediately count new manual-entry rows.
- **API surface parity:** CLI `tracker add` remains unchanged. CLI `save_job` already maps `description` → `job_description`; dashboard writes `job_description` natively. Parity is at the data-shape level post-ticket.
- **Integration coverage:** The "form submits → hook persists → Supabase row → realtime subscription updates UI" chain is implicit and worth manual smoke-testing because no one unit exercises the full path.
- **Unchanged invariants:** `Application.notes: string` non-null contract in `types/index.ts:102` stays (via `""` sentinel); `ApplicationStatus` union stays at 9 values (R3 filters at form level only); duplicate-URL CAR-167 behavior stays; search-page flow `status = "interested"` default stays; CLI `save_job` stays; URL-extract `createFromExtraction` stays.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Search-page default `"interested"` silently flips when the ternary is collapsed to a single constant. | Unit 1 collapses the ternary intentionally (both branches now equal), and its integration test asserts that a raw `Job` object with no status produces `status = "interested"`. |
| `pickValue` called with spread-object `undefined` accidentally overrides the fallback. | `pickValue` operates on already-extracted values; explicit test for `pickValue(undefined, fallback) === fallback`. |
| Field state wiped on Supabase failure, losing long `job_description` text. | Unit 2 error-path test + Unit 1 logged-out early-return test (the two failure surfaces for R12). |
| "More details" button lacks `aria-expanded` or `<button>` semantics, breaking keyboard accessibility. | Unit 2 test asserts `aria-expanded` attribute and focus move on open. |
| Feature manifest patterns too weak to detect regressions (e.g., `"status"` matches unrelated code). | Unit 3 uses behavior-visible literal strings only (`"More details"`, `"aria-controls"`, `"STATUSES.slice"`, `rows={8}`, etc.); see Unit 3 Approach for the rationale. |
| Native `<select>` styling inconsistent with the rest of the form. | Mirror `application-row.tsx` styling classes. Accept minor browser-native chrome differences as consistent with the rest of the applications area. |
| Inner disclosure's icon-swap differs from outer, producing two disclosure conventions in one form. | Unit 2 patterns explicitly call out `ChevronDown`/`ChevronUp` icon-swap (same as outer), not icon-rotate. |

## Documentation / Operational Notes

- `dashboard/CLAUDE.md` gate: `tools/regression-check.sh` must pass before done (Unit 3 verification).
- `dashboard/CLAUDE.md` gate: `npm run build` must pass before done.
- No migration, no env var changes, no rollout concerns. Change is shipped when merged; realtime subscription picks up new rows without action.
- Origin Key Decisions note on "active pipeline" metric shift — mention in commit body so it's searchable if the metric number surprises future-you.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-22-CAR-160-dashboard-create-application-parity-requirements.md](../brainstorms/2026-04-22-CAR-160-dashboard-create-application-parity-requirements.md)
- Hook under change: [dashboard/src/hooks/use-applications.ts](../../dashboard/src/hooks/use-applications.ts)
- Form under change: [dashboard/src/components/applications/add-form.tsx](../../dashboard/src/components/applications/add-form.tsx)
- Native `<select>` precedent: [dashboard/src/components/applications/application-row.tsx](../../dashboard/src/components/applications/application-row.tsx)
- STATUSES constant: [dashboard/src/lib/constants.ts](../../dashboard/src/lib/constants.ts)
- Hook test pattern: [dashboard/src/__tests__/hooks/use-applications.test.ts](../../dashboard/src/__tests__/hooks/use-applications.test.ts)
- Feature manifest: [dashboard/feature-manifest.json](../../dashboard/feature-manifest.json)
- Related tickets: CAR-163 (consolidation), CAR-167 (URL-dedup), CAR-62 (original add-form), CAR-115 (realtime subscription)
