[CAR-160] Dashboard Create Application parity with CLI tracker add

## Model Tier
**Sonnet** — Implementation work following a deepened plan with specific test scenarios, pattern references, and design decisions documented. No architectural reasoning needed; execute the units in order.

## Plan
Read the full implementation plan at: `docs/plans/2026-04-22-001-feat-car-160-dashboard-create-application-parity-plan.md`

The plan was produced via `ce:brainstorm` → `ce:plan` with a two-pass reviewer deepening. Every non-obvious design decision (why `pickValue` not `resolveOverride`, why collapse the `entryPoint` ternary to a single constant, why mirror the outer card's icon-swap chevron pattern, why pull label classes from `add-form.tsx:92-93` not `application-row.tsx`, why fix the logged-out early-return to match `createFromExtraction`'s shape) is documented inline in the plan — if something looks arbitrary, check Key Technical Decisions first.

## Execution Instructions
1. Use `ce:work` to execute the plan if the CE plugin is available.
2. Otherwise, work through the three implementation units sequentially — they are dependency-ordered (Unit 2 depends on Unit 1; Unit 3 depends on both).
3. Implement test-first per the Execution notes on Units 1 and 2 — the `pickValue` helper and the form's a11y + failure-preservation scenarios both have clear unit tests that should land before the implementation code.
4. Before declaring done, run `tools/regression-check.sh` from the repo root and `npm run build` + `npm test` in `dashboard/` — these are the gates defined in `dashboard/CLAUDE.md`.

## Key Constraints
- Do **not** modify `src/jobs/tracker.py`, `cli.py`, or any CLI code. The CLI wizard is the parity target, not the subject of the change.
- Do **not** modify `createFromExtraction` (URL-extract flow) in `dashboard/src/hooks/use-applications.ts:285-324`. Only `addApplication` widens.
- Do **not** introduce a second write path. The entire point of CAR-160 is closing the audit's "single write path" loop — widen `addApplication`, don't add `addManualApplication`.
- Do **not** add a `<Textarea>` shadcn primitive. Raw `<textarea>` is the established 13-file dashboard convention.
- Do **not** introduce a modal for manual-add. The existing inline two-tier disclosure pattern is what the plan extends.
- Do **not** backfill historical `status = "found"` rows to `"interested"`. The default flip is forward-only by deliberate choice (see plan Key Decisions on the `overview-content.tsx:346-349` active-pipeline metric shift — the user accepted this).
- Do **not** add `rejected`, `withdrawn`, or `ghosted` to the creation-time status selector. The 6-status subset at `STATUSES.slice(0, 6)` is intentional; the detail view remains the path for those.
- Do **not** collapse the search-page `addApplication + updateApplication` two-step at `search/page.tsx:452-483` during this ticket. R5 makes that refactor *possible*; it is deliberately left for a future ticket.
