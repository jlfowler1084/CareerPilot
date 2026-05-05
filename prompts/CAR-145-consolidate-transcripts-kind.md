# CAR-145 — Consolidate interview_analyses into transcripts table and add transcript kind

**Model tier:** Sonnet (execution session — not Opus)
**Ticket:** https://jlfowler1084.atlassian.net/browse/CAR-145
**Plan:** [docs/plans/2026-04-15-001-refactor-consolidate-transcripts-kind-plan.md](../docs/plans/2026-04-15-001-refactor-consolidate-transcripts-kind-plan.md)
**Project root:** `F:\Projects\CareerPilot`
**Base branch:** `feature/dashboard-v2` (this project's effective main per CLAUDE.md — NOT `master`)
**Worktree path:** `.worktrees/CAR-145-consolidate-transcripts-kind`
**New branch name:** `feature/CAR-145-consolidate-transcripts-kind`

## Before you start

- `git fetch origin && git pull origin feature/dashboard-v2` in the main working directory first so the worktree branches off fresh code.
- There is one untracked file at the repo root unrelated to CAR-145: `docs/brainstorms/local-llm-router-requirements.md`. Leave it alone — it belongs to a different effort.
- Verify `.worktrees/` is in `.gitignore` before creating the worktree (per global rules).

## What you're doing

CareerPilot has two parallel storage paths for interview/conversation analysis: the newer `transcripts` table (used by importers) and the legacy `interview_analyses` table (still used by `InterviewCoach.save_analysis`). Retire the legacy table, add a `kind` column to `transcripts`, and make `InterviewCoach` kind-aware so recruiter prep calls produce context extraction instead of performance grades. Full scope, decisions, and unit breakdown are in the plan file — read it before starting.

## Why this matters

The triggering use case is a recorded pre-interview prep call with a recruiter. Today there is no natural home for it — dropping it in `transcripts` is fine storage-wise but the coach would grade it as if it were an interview performance, which is the wrong frame. After this refactor, a prep call stored with `kind='recruiter_prep'` gets analyzed as *context for the upcoming interview* and automatically feeds the performance-grading prompt when the actual interview transcript is later analyzed.

## Canonical kind values (locked)

`recruiter_intro`, `recruiter_prep`, `phone_screen`, `technical`, `panel`, `debrief`, `mock`, `interview` (generic default). Enforced via CHECK constraint on fresh DBs, plus app-layer validation in the click `--kind` flag and in `store_transcript`.

## Execution workflow

1. **Start with the plan.** Read [docs/plans/2026-04-15-001-refactor-consolidate-transcripts-kind-plan.md](../docs/plans/2026-04-15-001-refactor-consolidate-transcripts-kind-plan.md) fully. It lists 6 implementation units with dependency order, test scenarios, and file paths.
2. **Create a worktree.** From `F:\Projects\CareerPilot`, run `git worktree add .worktrees/CAR-145-consolidate-transcripts-kind -b feature/CAR-145-consolidate-transcripts-kind feature/dashboard-v2`. Confirm `.worktrees/` is gitignored first. Work from the worktree directory for the rest of the session.
3. **Run regression-check before starting.** Per global rules, snapshot the feature manifest before code changes.
4. **Execute units in order.** 1 → 2 → 3 → 4 → 5 → 6. Each unit should be one focused commit.
5. **Follow the execution notes.** Unit 1 is characterization-first (write the migration test with seeded legacy data *first*, then implement). Unit 3 is test-first for the kind-branching and context-aggregation behavior.
6. **Commit after each unit.** Don't batch. Use `feat(CAR-145)` / `refactor(CAR-145)` / `test(CAR-145)` prefixes depending on the unit. Follow the project commit convention from recent history (`git log --oneline -20`).
7. **Run `python -m pytest tests/` after each unit.** If any test fails, stop and diagnose — do not stack fixes.
8. **Run regression-check after the last unit.** Any PASS→FAIL must be fixed before declaring done.

## Resolved decisions you don't need to re-litigate

- **CHECK constraint + app-layer validation.** Both. Match the `llm_calls.provider_used` precedent.
- **Mid-session kind morphing:** out of scope. One row per kind. User splits the import.
- **Dashboard "prep brief" surface:** deferred to a separate ticket.
- **New router task names for kind-aware prompts:** no. Reuse `interview_transcript_analyze`.
- **Migration rollback:** none. One-way.
- **Backfill policy for orphan legacy rows:** `application_id=NULL`, `kind='interview'`, `source='legacy_interview_analyses'`. Best-effort `full_text` read from `transcript_file` path.

## When you're done

- All 6 units committed
- `python -m pytest tests/` passes
- `regression-check` shows no PASS→FAIL
- `interview_analyses` table no longer exists in `src/db/models.py` schema or any test fixture
- Push the branch and open a PR referencing CAR-145
- Transition CAR-145 in Jira to In Review (or whatever the project workflow step is)
- Run `ce:compound` to add a `docs/solutions/` entry capturing the two-table-drift consolidation pattern

## Things NOT to do

- Do not work on `feature/dashboard-v2` directly. Worktree first.
- Do not modify the dashboard. This refactor is scoped to `src/db/`, `src/transcripts/`, `src/interviews/`, `cli.py`, and `tests/`.
- Do not change `TranscriptRecord.segments` format or `analysis_json` JSON keys for performance-kind transcripts. Existing display code reads those.
- Do not add new router task names. Reuse `interview_transcript_analyze` with branched prompts.
- Do not force-push. Do not bypass hooks. Do not commit `.claude/settings.local.json`.
- Do not mark units complete without running tests between them.
