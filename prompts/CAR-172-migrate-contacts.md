# CAR-172 — One-time SQLite → Supabase contacts migration (CAR-168 M5b)

**Model tier:** Sonnet (execution session — not Opus)
**Ticket:** https://jlfowler1084.atlassian.net/browse/CAR-172
**Parent story:** https://jlfowler1084.atlassian.net/browse/CAR-168
**Predecessor:** CAR-171 (M5a) — merged in PR #21 on 2026-04-21 (commit `75caa32`)
**Plan:** [docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md](../docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md) (Tasks 11-15)
**Project root:** `F:\Projects\CareerPilot`
**Base branch:** `feature/dashboard-v2` (this project's effective main per CLAUDE.md — NOT `master`)
**Worktree path:** `.worktrees/feature-CAR-172-migrate-contacts`
**New branch name:** `feature/CAR-172-migrate-contacts`

## Before you start

- `git fetch origin && git pull origin feature/dashboard-v2` in the main working directory so the worktree branches off the post-CAR-171-merge HEAD. The expected tip is `9c6039e` (feat(CAR-171): rewire CLI contacts commands to Supabase ContactManager) or later.
- There are untracked files at the repo root from earlier sessions (LLM router brainstorms, CAR-145/148/151/154 prompts, CAR-145 migration backup, `scripts/find_attachment_emails.py`, `scripts/check_car145_migration.py`, `data/attempted-jobs.jsonl`). Leave them alone.
- Verify `.worktrees/` is in `.gitignore`.
- Confirm env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CAREERPILOT_USER_ID` are set in `.env` — the script uses the same `ContactManager` bootstrap path as the CLI.

## What you're doing

Write a one-time data migration script for local SQLite `contacts` → Supabase, following the CAR-170 pattern exactly. This is **M5b** of the CAR-168 migration. Plan Tasks 11-15 in [the plan doc](../docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md) have the full breakdown.

Scope in one sentence: write `scripts/migrate_contacts_sqlite_to_supabase.py` with `--dry-run` / `--finalize --yes` flags, dedup on email, map SQLite fields (including comma-CSV `tags` → Postgres `TEXT[]` and `last_contact` TEXT → `last_contact_date`), then run it against the live local DB.

## Why this matters

Applications migrated cleanly in CAR-170; contacts need the mirror. Today's local DB has **1 real contact row** (Sarah Kim, sarah@tek.com, recruiter, email_import source) that was written by the SQLite-era `contacts create-from-email` command (CAR-155) before M5a shipped. Without M5b, that row stays stranded in the deprecated SQLite table after finalize. CAR-168 parent story can't close until this lands.

## Current-state facts (probed 2026-04-21 post-CAR-171-merge)

Before writing a line of code, confirm these with `sqlite3` / a Python probe. If they've changed, adjust the plan accordingly and note it in the Phase 1 report.

| Fact | Value | Why it matters |
|---|---|---|
| `contacts` row count | **1** (Sarah Kim) | The migration is not a no-op. Real data to move. |
| `contact_interactions` row count | **0** | FK rewrite pass is a no-op on this local DB, but still write the code — defensive, and future-proof for other machines. |
| `submitted_roles` row count | **0** | Same as above. |
| `contact_uuid` column on interactions/submitted_roles | **Already TEXT PK** (CAR-171 rebuilt the tables, did NOT use shadow-column approach) | Plan Task 7 said "shadow column"; reality is "rebuilt". This simplifies M5b: no "drop INTEGER contact_id" step needed — the INTEGER column is already gone. |
| Supabase `contacts` row count for your user | ≥1 from CAR-117 pre-migration (source='migration') | M5b dedups on email; any CAR-117 row with the same email as a SQLite row → script skips the SQLite insert. Don't overwrite the CAR-117 row. |
| CAR-171 merge state | Merged, `75caa32`, PR #21 | Your worktree base should include it. |

## Resolved decisions — do NOT re-litigate

- **Email-based dedup.** Not URL (that was CAR-170). The Supabase `contacts` table has a unique partial index on `(user_id, email) WHERE email IS NOT NULL`. Use `ContactManager.find_by_email(email)`; rows without email always insert.
- **CAR-117 rows are sacred.** Any Supabase contact row from the CAR-117 `DO $$ ... $$` migration has `source='migration'`. When M5b's dedup finds an email match on one of these, it **skips** (does not update). Verified 2026-04-21 planning session.
- **`tags` shape conversion.** SQLite stores CSV TEXT (`"foo,bar,baz"` or empty string); Supabase expects `TEXT[]`. Script converts via `tags.split(",")` with a None/empty guard → always produces a list (possibly empty). Empty list is fine to insert.
- **`last_contact` → `last_contact_date` rename + type change.** SQLite TEXT → Supabase TIMESTAMPTZ. Pass through as ISO string; null → omit from the insert payload (don't send null explicitly).
- **`next_followup` TEXT → DATE.** Script parses dates tolerantly; unparseable or empty → omit from payload.
- **Finalize step simpler than the plan said.** Plan Task 13 Step 6 lists dropping `contact_id INTEGER` columns — **skip that**. CAR-171 already rebuilt `contact_interactions` and `submitted_roles` with `contact_uuid TEXT` as the primary FK. All finalize needs to do is rename `contacts` → `contacts_deprecated_2026_04_21`. Confirm with a schema probe before coding.
- **FK rewrite pass.** Even though both tables are at zero rows locally, write the rewrite logic. It walks `contact_interactions` + `submitted_roles` for any row with `contact_uuid IS NULL` and attempts to map from a captured id-map. At zero rows it's a trivial iteration; at non-zero rows elsewhere (or for future re-use) the code is there.
- **Commit granularity.** Target 4-6 commits, not strict per-task. Flex based on natural review boundaries. Reference TDD pattern from `tests/test_migrate_applications.py`.

## Hidden constraints / gotchas

1. **Script scaffolding:** Start by `cp scripts/migrate_applications_sqlite_to_supabase.py scripts/migrate_contacts_sqlite_to_supabase.py` and walk it line-by-line. Don't paste-rewrite — the structure (argparse layout, `MigrationResult` dataclass, exit-code semantics, `_log_summary`) is battle-tested; just swap the domain.
2. **Test scaffold too:** `cp tests/test_migrate_applications.py tests/test_migrate_contacts.py` and rename. The `fake_supabase` fixture in `tests/conftest.py` and the `ApplicationTracker` → `ContactManager` swap are the core changes.
3. **`ContactManager` import path:** `from src.db.contacts import ContactManager`. Shipped in CAR-171. Constructor contract matches `ApplicationTracker` — requires `CAREERPILOT_USER_ID` env var, reuses `get_supabase_client()` singleton.
4. **Dedup is idempotent, not strict.** Re-running the live script after a successful run should report all rows as "skipped (email exists)" with zero errors and exit 0. Plan Task 13 Step 5 is the check.
5. **SQLite `ALTER TABLE RENAME` requires `DROP INDEX` first in some SQLite versions** — or the indexes follow. The CAR-170 script's finalize handles this; mirror that pattern exactly. Don't innovate.
6. **Backup before live run.** `cp data/careerpilot.db data/careerpilot.db.pre-CAR-168`. This is not version-controlled insurance; it's insurance against the script writing to the wrong table. Plan Task 13 Step 1.
7. **Don't run the script from the worktree directory** unless the worktree has its own `data/careerpilot.db`. The real DB lives in the main working directory at `F:\Projects\CareerPilot\data\careerpilot.db`. Script resolves via `settings.DB_PATH` — `cd` back to the main dir or pass `--db-path`.

## Execution workflow

1. **Read [the plan doc Tasks 11-15](../docs/plans/2026-04-21-001-CAR-168-contacts-supabase-port-plan.md).** Task 14 is "Open M5b PR"; Task 15 is "Close CAR-155 + CAR-168 parent".
2. **Read these reference files before writing code:**
   - [scripts/migrate_applications_sqlite_to_supabase.py](../scripts/migrate_applications_sqlite_to_supabase.py) — your structural template (302 lines)
   - [tests/test_migrate_applications.py](../tests/test_migrate_applications.py) — your test template (326 lines)
   - [src/db/contacts.py](../src/db/contacts.py) — the `ContactManager` you're inserting through (shipped in CAR-171)
   - [src/db/models.py](../src/db/models.py) — current SQLite contacts schema; confirm column list
3. **Create a worktree off the merged `feature/dashboard-v2`.**
   ```bash
   git worktree add .worktrees/feature-CAR-172-migrate-contacts -b feature/CAR-172-migrate-contacts feature/dashboard-v2
   cd .worktrees/feature-CAR-172-migrate-contacts
   ```
4. **Phase 1 — audit (read-only):** probe the local DB and confirm the facts table above. Report any deltas before writing code. Specifically check:
   ```bash
   python -c "import sqlite3; c = sqlite3.connect('data/careerpilot.db'); [print(row) for row in c.execute('SELECT sql FROM sqlite_master WHERE type=\"table\" AND name IN (\"contacts\", \"contact_interactions\", \"submitted_roles\")').fetchall()]"
   ```
   Schema confirmation is mandatory before any DDL in the script.
5. **Phase 2 — TDD cycle through test classes in order:**
   - `TestMapSqliteContactRow` — field mapping (tags CSV→list, last_contact→last_contact_date, next_followup parse, etc.)
   - `TestMigrateContacts` — dry-run, live, email-dedup
   - `TestRewriteInteractionFKs` + `TestRewriteSubmittedRoleFKs` — no-op on this DB but code-complete
   - `TestFinalize` — rename contacts table; skip the INTEGER-drop step (confirm schema first)
   - `TestMainCli` — argparse, exit codes 0/1/2
6. **Run `python -m pytest tests/test_migrate_contacts.py -v` after each test class.** Every failing test is a decision point — stop and diagnose.
7. **Phase 3 — live dry run against real DB:**
   ```bash
   cp data/careerpilot.db data/careerpilot.db.pre-CAR-168
   python scripts/migrate_contacts_sqlite_to_supabase.py --dry-run
   ```
   Expected output: `SQLite rows read: 1 / Would insert: 1 / Errors: 0`. Zero Supabase writes.
8. **Phase 4 — live run:**
   ```bash
   python scripts/migrate_contacts_sqlite_to_supabase.py
   ```
   Expected: Sarah Kim's row inserted; exit 0. Verify on the dashboard at `/contacts` — the row should appear.
9. **Phase 5 — idempotency check:**
   ```bash
   python scripts/migrate_contacts_sqlite_to_supabase.py
   ```
   Expected: `Inserted: 0 / Skipped (email exists): 1 / Errors: 0`. Exit 0. (If this prints errors, STOP — that's a dedup bug.)
10. **Phase 6 — CLI smoke test BEFORE finalize:**
    ```bash
    python -m cli contacts list
    python -m cli contacts show <supabase-uuid>
    ```
    Confirm the migrated Sarah Kim row renders correctly via the Supabase-backed `ContactManager`.
11. **Phase 7 — finalize:**
    ```bash
    python scripts/migrate_contacts_sqlite_to_supabase.py --finalize --yes
    ```
    Expected: `contacts` table renamed to `contacts_deprecated_2026_04_21`; exit 0. After this, `SELECT * FROM contacts` via SQLite should fail with "no such table".
12. **Phase 8 — post-finalize smoke:** rerun `contacts list` / `contacts show`. All data comes from Supabase now.
13. **Run `python -m pytest tests/` fully.** No new regressions.
14. **Run `tools/regression-check.sh`** if it exists. No PASS→FAIL.

## When you're done

- All Task 11-15 checkboxes in the plan doc are ticked
- `python -m pytest tests/` passes
- Local SQLite `contacts` table has been renamed to `contacts_deprecated_2026_04_21`; the row is preserved but no longer serves as the live table
- Supabase `contacts` contains the migrated row (verifiable via dashboard `/contacts`)
- Branch is pushed; PR is opened against `feature/dashboard-v2` (NOT `master`)
- CAR-172 has a PR-link comment and a close-out comment after merge
- **After CAR-172 merges:** transition **CAR-168 parent** to Done with a summary comment listing CAR-171 and CAR-172 PRs. (CAR-155 is already Done from its original ship — no action needed there.)

## Things NOT to do

- **Do not** work on `feature/dashboard-v2` directly. Worktree first.
- **Do not** target `master` — effective main is `feature/dashboard-v2`.
- **Do not** drop the `contact_id INTEGER` columns from `contact_interactions` / `submitted_roles` — they're already gone (CAR-171 rebuilt the tables). If your schema probe in Phase 1 finds them still present, STOP and report — something diverged from the expected CAR-171 merge state.
- **Do not** skip the backup step. `data/careerpilot.db.pre-CAR-168` must exist before the live run.
- **Do not** run the script against a pre-CAR-171 `feature/dashboard-v2` (before commit `75caa32` in your base). `ContactManager` must exist.
- **Do not** overwrite CAR-117 pre-migrated rows. Email dedup via `ContactManager.find_by_email` is the correct behavior — skip, don't update.
- **Do not** attempt to bulk-migrate `contact_interactions` or `submitted_roles` to Supabase. Option (c) keeps them local. Explicit choice.
- **Do not** force-push. Do not bypass hooks. Do not commit `.claude/settings.local.json` or `data/careerpilot.db*` files.
- **Do not** mark tests complete without running them. `pytest tests/test_migrate_contacts.py -v` between phases.

## Invocation

```bash
claude --model sonnet "[CAR-172] one-time SQLite → Supabase contacts migration -- Read prompts/CAR-172-migrate-contacts.md and follow the instructions"
```
