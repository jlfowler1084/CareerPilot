---
date: 2026-04-22
topic: car-160-dashboard-create-application-parity
---

# CAR-160 — Dashboard "Create Application" flow: UI parity with CLI `tracker add`

## Problem Frame

After CAR-163 consolidation (M2–M5b, shipped 2026-04-21), the dashboard is the canonical browser UI for creating applications per the Option-C decision, and both CLI and dashboard write to the same Supabase `applications` table. However, the dashboard "Add Application Manually" form (`dashboard/src/components/applications/add-form.tsx`) captures only a subset of the fields the CLI `tracker add` wizard (`cli.py` — `_run_tracker_add_wizard`) captures. Dashboard users who want to set status, job description, or notes at creation time must instead create a bare row and then open the detail view to edit each field — friction the CAR-163 audit (§5) explicitly flagged to be closed post-M2.

The dashboard write path `addApplication` in `dashboard/src/hooks/use-applications.ts` additionally silently ignores any `status`, `notes`, or `job_description` the caller passes — it reconstructs status from `entryPoint` and hardcodes the other two to empty strings. Closing the field gap means widening that single write path rather than introducing a parallel one.

## Requirements

**Form fields**
- R1. The dashboard manual-entry form exposes, in addition to the existing `title`, `company`, `location`, `url`, and `source` fields: `status` (select), `notes` (textarea), and `job_description` (textarea).
- R2. The three new fields live behind a single **"More details"** disclosure control, nested *inside* the existing outer "Add Application Manually" card disclosure. The existing outer disclosure continues to gate the whole form; "More details" is a second-tier toggle within it. The core five fields remain visible whenever the outer card is expanded; the three new fields become visible only after the user opens "More details".
- R3. The `status` select offers six choices — `found`, `interested`, `applied`, `phone_screen`, `interview`, `offer` — with default `interested`. The remaining CLI statuses (`rejected`, `withdrawn`, `ghosted`) are intentionally excluded from the **form selector at creation time only**; users can transition to them later via the detail view. The six-status constraint is a form-level UX decision; the `addApplication` write path itself accepts any value in the `ApplicationStatus` union. Non-form callers (search-page flow, URL-extract flow, future API clients) are unaffected.
- R4. On manual-entry submit:
  - When the user **does not open "More details"**, the application is created with `status = "interested"`, `notes = ""`, and `job_description = null`.
  - The new `interested` default is a deliberate change from the current `"found"` default (see Key Decisions). It applies only to the **manual-entry path**; the search-page path's existing `"interested"` default at `addApplication` (`use-applications.ts:110`) is unchanged.

**Write path**
- R5. The existing `addApplication` hook remains the single write path for manual-entry and search-entry flows. Its contract is widened so that caller-supplied `status`, `notes`, and `job_description` win when present; entryPoint-based defaults apply only when the caller omits the field. "Present" means `value !== undefined`, not the key's existence in the object — to prevent callers that spread a partial object from accidentally overriding defaults with `undefined`.
- R6. No existing caller breaks:
  - **Search-page callers** (`dashboard/src/app/(main)/search/page.tsx` lines 417, 442, 468) pass raw `Job` objects that have no `status`, `notes`, or `job_description` fields. They continue to receive the `entryPoint === "search"` default of `"interested"`, unchanged.
  - **Manual-entry callers** today do not pass `status`/`notes`/`job_description` either, so the change in manual default (R4) is the *only* observable behavior change for existing callers.
- R7. (See Dependencies/Assumptions — column mapping is a verified existing fact, not a net-new requirement.)

**Parity and behavior**
- R8. (See Regression Notes — URL-duplicate detection preservation is a non-regression test item, not a net-new requirement.)
- R9. The trimmed-whitespace + required-`title`/`company` validation rules of the current form are preserved for the new fields: empty `notes` is stored as `""` (matching the existing non-null sentinel at `use-applications.ts:137` and the `Application.notes: string` type), empty `job_description` is stored as `null` (matching the column's nullability and the `createFromExtraction` precedent).

**Interaction states and accessibility** (added after design-lens and feasibility review)
- R10. The "More details" trigger is a `<button>` element with `aria-expanded` reflecting its open state and `aria-controls` pointing at the disclosed region. Activating it via keyboard moves focus to the first field inside the disclosed region (the `status` select). The trigger is positioned **above** the submit button so the keyboard tab order is `… url → More details → (disclosed fields when open) → submit`.
- R11. Disclosure state on submit: on successful submit, the outer card resets and closes (existing behavior); the "More details" inner disclosure resets to closed. On `window.confirm` cancel of the URL-duplicate warning, all field values and the "More details" open/closed state are preserved (existing early-return behavior covers this).
- R12. Submit-failure state preservation: on Supabase insert error, the form does **not** wipe `notes` or `job_description`. The user's in-flight text is preserved so they can retry without re-typing. `title`, `company`, `location`, `url`, `source` preservation on failure is also adopted to match.
- R13. When the "More details" disclosure is opened but the user submits with fields left at defaults, no warning or "confirm defaults" dialog is shown — R4 defaults are treated as valid user intent.

## Success Criteria

- A dashboard user can, in a single submit, create an application with every field the CLI `tracker add` wizard captures, and the resulting Supabase row is indistinguishable from one created by the CLI with the same inputs.
- `addApplication` has one code path. No new top-level `addManualApplication` or parallel insert exists.
- Quick-add workflow (user never opens "More details") takes no more clicks than it did before this change. The row produced carries the new `interested` default rather than the prior `found` default — see Key Decisions for why this is deliberate.
- CAR-163 audit §5 ("UI parity with tracker add") can be marked resolved.
- Keyboard-only users can open "More details", fill all new fields, and submit without losing focus or needing mouse input.

## Scope Boundaries

- Not in scope: unifying the "Add Application Manually" form with the "Paste URL to auto-extract" flow. Two distinct entry paths stay distinct.
- Not in scope: adding `rejected` / `withdrawn` / `ghosted` to the creation-time status selector. These remain reachable only via the detail view.
- Not in scope: changes to the CLI wizard, to `ApplicationTracker.save_job`, or CLI bug fixes discovered during implementation. CLI-side discrepancies found mid-implementation are logged as separate tickets; they do not expand this ticket's scope.
- Not in scope: changes to the `createFromExtraction` (URL auto-extract) flow.
- Not in scope: rich-text editing for `job_description` or `notes`. Plain textareas only — matches CLI plain-text behavior and the existing raw-`<textarea>` pattern used throughout the dashboard (13 files).
- Not in scope: a modal-based redesign of the add form. The existing inline disclosure pattern is extended, not replaced.
- Not in scope: collapsing the search-page's `addApplication(job, "search")` + `updateApplication(id, { status: "applied" })` two-step into a single insert. R5 makes that refactor *possible*; it is deliberately left for a future ticket.
- Not in scope: backfilling historical `status = "found"` rows to `"interested"`. The default change is forward-only; historical rows remain as originally recorded.

## Key Decisions

- **Two-tier inline layout (R2)** — chosen over full-form-inline, modal, and per-field collapsibles because it preserves the existing "quick add" feel, doesn't introduce a new UI pattern on the page, and matches how users separate "just tracking it" from "carefully recording it". Note: this is a *nested* disclosure inside the existing outer card disclosure; the outer toggle continues to gate the entire form.
- **Six-status subset (R3)** — chosen over mirroring all nine CLI statuses because `rejected` / `withdrawn` / `ghosted` at creation time are rare (historical backfill only) and surface UX confusion in the common case. The tradeoff: a creation/edit asymmetry where the detail view exposes 9 statuses but the add form exposes 6. Accepted because the common-case cognitive load reduction outweighs the occasional backfill friction. Data model is unchanged; only the creation-time selector is narrowed.
- **Caller-supplied wins, entryPoint is fallback (R5)** — chosen over splitting `addApplication` or adding a second hook because the CAR-163 audit explicitly flagged "do not introduce a second write path for applications". Widening the existing contract is additive and leaves every caller backward-compatible. "Present" is defined as `value !== undefined` to avoid spread-object accidents.
- **Default status `interested` for manual (R4) — this is a deliberate behavior change, not a parity restatement.** The existing dashboard default is `"found"`; the CLI default is `"interested"`. Aligning both on `interested` has a downstream consequence the planning session should be aware of: the `overview-content.tsx` "active pipeline" metric (`overview-content.tsx:346-349`) counts `interested + applied + phone_screen + interview` and excludes `found`. After this change, every manually-created row immediately counts toward "active pipeline", whereas historical manual rows with `status = "found"` did not. The author accepts this metric shift as the correct semantics (a user actively adding a row through the dashboard form *does* indicate interest); historical `found` rows are not backfilled.

## Dependencies / Assumptions

- Supabase `applications` table already has `status`, `notes`, and `job_description` columns — verified in `src/jobs/tracker.py` (`save_job` payload writes CLI `description` → `job_description`) and `dashboard/src/hooks/use-applications.ts` (`createFromExtraction` inserts `job_description` directly, and `addApplication` writes `notes`). No schema change required.
- The CLI's `save_job` is the canonical CLI-side write path for these fields. The column-name mapping (CLI `description` → Supabase `job_description`) is already handled inside `save_job` and does not need to be redone on the dashboard side (which already uses `job_description` natively).
- TypeScript type nullability (verified in `dashboard/src/types/database.types.ts` lines 97, 101, 107 and `dashboard/src/types/index.ts` lines 96, 102, 114, 118–127):
  - `applications.notes` is `string | null` at the DB level; the dashboard `Application` type declares `notes: string` (non-nullable). The hook's existing `""` sentinel keeps the type invariant satisfied and must be preserved for empty input.
  - `applications.job_description` is `string | null` at both levels; `null` is the correct empty value.
  - `ApplicationStatus` is a 9-value string union covering every value in `src/jobs/tracker.py` `VALID_STATUSES`. The R3 selector filters this union at the form level only.
- The `STATUSES` constant in `dashboard/src/lib/constants.ts` already provides label/color metadata for the six creation-time statuses. The form's select reuses this constant (filtered) rather than redefining labels.
- No dedicated `<Textarea>` primitive exists in `dashboard/src/components/ui/` — raw `<textarea>` is the established dashboard pattern (13 files). The new fields follow that pattern.
- Dashboard session boundaries apply: `tools/regression-check.sh` and `npm run build` must pass before this ticket is considered done (per `dashboard/CLAUDE.md`).

## Regression Notes

- URL-duplicate detection (CAR-167): the `findApplicationByUrl` + `window.confirm` flow at `add-form.tsx:37-45` runs on submit regardless of whether "More details" is open. Adding the disclosure does not touch the submit path. Existing test coverage for CAR-167 should continue to pass without modification.
- `addApplication` existing behavior for search-page callers: R6 above. Verify with a test that `addApplication(searchJob, "search")` still produces a row with `status = "interested"` when `searchJob` has no `status` field.

## Outstanding Questions

### Resolve Before Planning

(none — all product decisions are resolved; remaining questions are documented in Key Decisions or Regression Notes)

### Deferred to Planning

- [Affects R1][Technical] What textarea row heights feel right for `notes` (small, e.g. 3 rows) vs `job_description` (larger, e.g. 8 rows)? Decide at implementation time from visual fit.
- [Affects R5][Technical] Should `addApplication`'s input type tighten from `Partial<Application> | Job` to something more disciplined now that three new caller-supplied fields matter? Answer in planning based on a call-site survey; defer unless the current union produces a concrete bug.
- [Affects R10–R13][Testing] Which existing tests cover `addApplication` and the manual form, and what new test cases are needed for the new fields, the widened contract, and the new interaction states (disclosure keyboard control, focus movement, submit-failure preservation)? Answer after planning surveys `dashboard/src/**/*.test.*`.

## Next Steps

-> /ce:plan for structured implementation planning
