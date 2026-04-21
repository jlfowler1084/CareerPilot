# CAR-171 — Port CLI contacts to Supabase + extend schema (CAR-168 M5a)

**Model tier:** Sonnet (execution session — not Opus)
**Ticket:** https://jlfowler1084.atlassian.net/browse/CAR-171
**Parent story:** https://jlfowler1084.atlassian.net/browse/CAR-168
**Plan:** [docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md](../docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md)
**Project root:** `F:\Projects\CareerPilot`
**Base branch:** `feature/dashboard-v2` (this project's effective main per CLAUDE.md — NOT `master`)
**Worktree path:** `.worktrees/feature-CAR-171-contacts-port`
**New branch name:** `feature/CAR-171-contacts-port`

## Before you start

- `git fetch origin && git pull origin feature/dashboard-v2` in the main working directory first so the worktree branches off fresh code.
- There are several untracked files at the repo root from earlier sessions (LLM router brainstorms, CAR-154/151/148 prompts, CAR-145 migration backup, scripts/find_attachment_emails.py, scripts/check_car145_migration.py, data/attempted-jobs.jsonl). Leave them alone — they belong to unrelated efforts.
- Verify `.worktrees/` is in `.gitignore` before creating the worktree.
- Confirm env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CAREERPILOT_USER_ID` are set in `.env` — CAR-164 established these; `ContactManager` requires all three.

## What you're doing

Port the CLI's `contacts` main table from local SQLite to Supabase, following the exact same pattern CAR-165 established for `ApplicationTracker`. This is **M5a** of the CAR-168 migration. The plan doc has the full task-by-task breakdown (10 tasks, ~4 commits) — read it first.

Scope in one sentence: add 7 Supabase columns → write `src/db/contacts.py::ContactManager` → change `contact_interactions.contact_id` and `submitted_roles.contact_id` from INTEGER to a shadow `contact_uuid TEXT` → rewire every `contacts *` click command to use `ContactManager`.

## Why this matters

CAR-163 committed us to Option (c): unify application + contact storage on Supabase so the dashboard and CLI write the same rows. M1-M4 (CAR-164, CAR-165, CAR-170, CAR-167) shipped for applications. M5a is the mirror for contacts. Closing this unblocks CAR-172 (one-time data migration) and closes CAR-155 (`contacts create-from-email` was the last pre-Option-c CLI write path for contacts).

## Resolved decisions — do NOT re-litigate

Scope fork was resolved **Option (c) "Hybrid"** during planning:
- Supabase `contacts` main table gains 7 CLI-side columns: `contact_type`, `linkedin_url`, `specialization`, `contact_method`, `next_followup DATE`, `relationship_status`, `tags TEXT[]`. Migration is a simple ALTER.
- `contact_interactions` + `submitted_roles` **stay local SQLite** per Option (c). They gain a `contact_uuid TEXT` shadow column so they can reference the Supabase UUID. The INTEGER `contact_id` column stays until CAR-172 finalize.
- **Why not port interactions too (Option B, rejected):** no dashboard counterpart planned; extra surface area; CLAUDE.md data-layer doc explicitly permits "tables where 'stay local' was an explicit choice".
- **Why not drop CLI fields (Option A, rejected):** causes feature regression on `contacts log`, `contacts stale`, `contacts followups` — and closing CAR-155 under the new pattern still requires the CLI to work.

Other locked decisions:
- `tags` on Supabase is **Postgres `TEXT[]`**, not comma-separated TEXT. `add_tag` / `remove_tag` do read-modify-write with Python list math (no RPC). CAR-172's migration will split the SQLite CSV string into array elements.
- `last_contact` (SQLite TEXT) maps to `last_contact_date` (Supabase TIMESTAMPTZ). The column rename is already reality on the dashboard side.
- `next_followup` (SQLite TEXT) maps to `next_followup DATE` (new Supabase column). CLI passes a date string; `ContactManager` tolerates blank/`None`.
- `ContactManager` follows the exact same constructor pattern as `ApplicationTracker` in `src/jobs/tracker.py`: optional client injection, user_id from `CAREERPILOT_USER_ID` env, raise `ContactManagerNotConfiguredError` if missing. Service-role key (not user auth) — bypasses RLS; every query adds `.eq("user_id", self._user_id)`.
- **No sub-ticket split beyond CAR-171/CAR-172.** The Supabase schema ALTER lands in the same PR as the port. Keep it atomic.

## Hidden constraints / gotchas

1. **CAR-117 already pre-migrated some rows.** The 2026-04-14 migration inserted Supabase `contacts` from `applications.contact_email` flat fields with `source='migration'`. CAR-172 will dedupe on email against these — that's correct. Don't touch those rows.
2. **Dashboard reads `contacts.tags`?** The plan assumes no. Verify with a grep before applying the migration — if the dashboard already reads a differently-shaped `tags`, split the migration into "add nullable → backfill → set NOT NULL" to avoid breaking the dashboard mid-flight. Current belief (from research): no dashboard code reads `tags` yet.
3. **SQLite `ALTER TABLE ... ADD COLUMN` is not idempotent.** The DDL for `contact_uuid` shadow columns must be wrapped in try/except for `duplicate column name` so `init_db()` stays re-runnable.
4. **`contacts show <id>` CLI argument type changes from INTEGER to UUID string.** This is a small click type change (`type=int` → `type=str`); make sure downstream formatting doesn't assume an integer.
5. **`contacts log` is bi-writer post-port.** It writes a local `contact_interactions` row (by UUID) AND updates `last_contact_date` on Supabase via `ContactManager.update_contact`. Both must succeed; don't silently swallow a Supabase write failure.
6. **Probe `contact_interactions` + `submitted_roles` row counts** before deciding on the shadow-column dance:
   ```bash
   sqlite3 data/careerpilot.db "SELECT COUNT(*) FROM contact_interactions; SELECT COUNT(*) FROM submitted_roles;"
   ```
   If both are zero or near-zero, you can simplify: just recreate the tables with TEXT `contact_uuid` as PK-foreign and don't bother with the shadow column. Note this as an "assumption changed" at the Phase 1 report if you take that path.
7. **Plan doc path correction:** The plan was written on `feature/dashboard-v2` and is committed in the same branch. If you're starting from the worktree before the plan-doc commit has landed, `git fetch origin feature/dashboard-v2` first.

## Execution workflow

1. **Read the full plan at [docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md](../docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md).** It has 10 tasks for CAR-171 (Tasks 1-10). Tasks 11-15 are CAR-172 and out of scope for this session.
2. **Also read these reference files before touching code** — the port mirrors them exactly:
   - [src/jobs/tracker.py](../src/jobs/tracker.py) — `ApplicationTracker` class shape (418 lines)
   - [tests/test_tracker.py](../tests/test_tracker.py) — `FakeSupabaseClient` test fixture (558 lines)
   - [src/db/supabase_client.py](../src/db/supabase_client.py) — singleton client helper (reuse; no new code)
   - [cli.py:3077-3534](../cli.py#L3077-L3534) — current `contacts` subcommand surface
   - [dashboard/supabase/migrations/20260414164841_add_contacts.sql](../dashboard/supabase/migrations/20260414164841_add_contacts.sql) — current Supabase `contacts` schema + `contact_application_links` join
3. **Create a worktree off `feature/dashboard-v2`.**
   ```bash
   git worktree add .worktrees/feature-CAR-171-contacts-port -b feature/CAR-171-contacts-port feature/dashboard-v2
   cd .worktrees/feature-CAR-171-contacts-port
   ```
4. **Run `tools/regression-check.sh`** (if it exists per dashboard/CLAUDE.md) before starting. Snapshot features before code changes.
5. **Execute Tasks 1-10 in order.** Each task has explicit steps. Don't skip TDD cycles.
6. **Expected commit sequence** (4 commits across the PR):
   1. `feat(CAR-171): extend Supabase contacts schema with CLI fields` (Task 2)
   2. `feat(CAR-171): scaffold ContactManager with user-scoped client` (Task 4) — can be combined into #3 if small
   3. `feat(CAR-171): ContactManager CRUD + query + tag methods` (Tasks 5-6 batched is fine)
   4. `refactor(CAR-171): contact_interactions + submitted_roles keyed by UUID` (Task 7)
   5. `refactor(CAR-171): drop SQLite contact helpers (owned by ContactManager)` (Task 8)
   6. `feat(CAR-171): rewire CLI contacts commands to Supabase ContactManager` (Task 9)
   Flex commit granularity based on size — 4-6 commits is the target, not a mandate.
7. **Run `python -m pytest tests/` after every commit.** If any test fails, stop and diagnose — do not stack fixes.
8. **Run `npm run build` in `dashboard/` after the Supabase migration lands.** TypeScript types must regenerate cleanly.
9. **Manual smoke before opening PR:** the four scenarios from Task 9 Step 4 (`create-from-email`, `list`, `show`, `log`, `show` again). Verify a row appears on the dashboard `/contacts` page.
10. **Run `tools/regression-check.sh` at the end.** Any PASS→FAIL must be fixed before declaring done.

## When you're done

- All Task 1-10 checkboxes in the plan doc are ticked
- `python -m pytest tests/` passes (CLI + new ContactManager tests)
- `npm run build` in `dashboard/` is clean
- `tools/regression-check.sh` shows no PASS→FAIL
- Branch is pushed; PR is opened against `feature/dashboard-v2` (NOT `master`)
- Jira CAR-171 has a PR-link comment and is transitioned to In Review
- **Do NOT** close CAR-155 yet — that happens when this PR merges. Just note in the CAR-171 PR body "closes CAR-155 on merge".

## Things NOT to do

- **Do not** work on `feature/dashboard-v2` directly. Worktree first.
- **Do not** target `master` — this project's effective main is `feature/dashboard-v2`.
- **Do not** port `contact_interactions` or `submitted_roles` to Supabase. Explicit Option (c) choice — they stay local.
- **Do not** touch dashboard UI (`dashboard/src/app/(main)/contacts/`). The new columns land in the DB and TS types; any UI update is a separate ticket.
- **Do not** start CAR-172 in this session. That needs its own worktree, after CAR-171 merges.
- **Do not** force-push. Do not bypass hooks. Do not commit `.claude/settings.local.json`.
- **Do not** use `ALLOW_MAIN_COMMIT` / `ALLOW_MAIN_PUSH` env vars — human-only emergency overrides.
- **Do not** mark tasks complete without running tests between them.
- **Do not** skip the Phase 1 probe of `contact_interactions` + `submitted_roles` row counts — the answer may simplify Task 7.

## Invocation

```bash
claude --model sonnet "[CAR-171] port contacts CLI to Supabase + extend schema — Read prompts/CAR-171-contacts-port.md and follow the instructions"
```
