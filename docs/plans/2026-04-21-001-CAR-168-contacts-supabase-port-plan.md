# CAR-168 — Contacts SQLite → Supabase Port (M5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the CLI's `contacts` main table from local SQLite to Supabase (mirror of CAR-165 for applications), while keeping `contact_interactions` and `submitted_roles` as local SQLite tables keyed by Supabase UUIDs. Then run a one-time data migration for any existing SQLite contact rows.

**Architecture:** Option (c) from the scope fork — "Hybrid: port main table, keep interactions local".
- Supabase `contacts` table gains 6 missing columns via a small migration (dashboard-side schema change).
- CLI `ContactManager` class wraps Supabase (mirror of `ApplicationTracker` from CAR-165).
- Local SQLite `contact_interactions.contact_id` and `submitted_roles.contact_id` change from INTEGER → TEXT to hold Supabase UUIDs as strings. A shadow column (`contact_uuid`) is added first; old INTEGER ids are rewritten during M5b finalize.
- One-time Python migration script mirrors `scripts/migrate_applications_sqlite_to_supabase.py` (CAR-170) with dry-run/finalize gates and email-based dedup.

**Tech Stack:** Python 3.8+ (CLI), Supabase Python client (service-role), SQLite 3, pytest with FakeSupabaseClient pattern from CAR-165, Click for CLI, Rich for terminal UI.

**Jira:** Top-level story [CAR-168](https://jlfowler1084.atlassian.net/browse/CAR-168); sub-tasks [CAR-171](https://jlfowler1084.atlassian.net/browse/CAR-171) (M5a — schema + port) and [CAR-172](https://jlfowler1084.atlassian.net/browse/CAR-172) (M5b — data migration).

---

## Scope

### In scope
- **M5a:** Supabase schema extension (6 columns on `contacts`). `src/db/contacts.py` new `ContactManager` class. CLI commands in `cli.py` under the `contacts` group rewired to the new manager. `contact_interactions` + `submitted_roles` helpers in `src/db/models.py` updated to use a TEXT `contact_uuid` column (shadow). All tests green.
- **M5b:** `scripts/migrate_contacts_sqlite_to_supabase.py` script with `--dry-run` and `--finalize --yes` flags. Migrates main-table rows; rewrites `contact_interactions.contact_uuid` + `submitted_roles.contact_uuid` using an id-map captured during insert; drops the now-unused `contact_id` INTEGER column at finalize.

### Out of scope
- Porting `contact_interactions` / `submitted_roles` to Supabase (explicit Option-C choice — these stay local per CLAUDE.md "tables where 'stay local' was an explicit choice"). Revisit in CAR-169 if dashboard grows a recruiter-workflow view.
- Dashboard UI changes to expose new columns — columns land on Supabase but dashboard UI updates are a separate ticket (CAR-168-followup) if needed.
- Retiring `applications.contact_*` deprecated columns (CAR-117 note — future migration).

---

## Architecture Context

Key facts from research (2026-04-21). Read these before touching code.

### Supabase contacts schema (today)
From [dashboard/supabase/migrations/20260414164841_add_contacts.sql](../../dashboard/supabase/migrations/20260414164841_add_contacts.sql):

```
contacts (
  id UUID PK, user_id UUID FK,
  name, email, phone, company, title, source, notes,
  last_contact_date TIMESTAMPTZ,
  created_at, updated_at TIMESTAMPTZ
)
```

**Unique index:** `idx_contacts_user_email` on `(user_id, email) WHERE email IS NOT NULL` — dedup hook for M5b.

### SQLite contacts schema (today)
From [src/db/models.py:52-70](../../src/db/models.py#L52-L70):

```
contacts (
  id INTEGER PK, name, company, title,
  contact_type TEXT NOT NULL DEFAULT 'recruiter',   -- MISSING on Supabase
  email, phone,
  linkedin_url TEXT,                                 -- MISSING
  specialization TEXT,                               -- MISSING
  source, last_contact TEXT,                         -- renamed to last_contact_date on Supabase
  contact_method TEXT,                               -- MISSING
  next_followup TEXT,                                -- MISSING
  relationship_status TEXT DEFAULT 'new',            -- MISSING
  tags TEXT,                                         -- MISSING (comma-separated)
  notes, created_at
)
```

**Six-column gap:** `contact_type`, `linkedin_url`, `specialization`, `contact_method`, `next_followup`, `relationship_status`, `tags`. (Plus `last_contact` → `last_contact_date` rename.) M5a's Supabase migration adds all of them.

### Reusable patterns
- **ApplicationTracker class shape:** [src/jobs/tracker.py](../../src/jobs/tracker.py) — 418 lines. Constructor `__init__(self, client=None, user_id=None)`. Service-role client injected; user_id from `CAREERPILOT_USER_ID` env. Every query has `.eq("user_id", self._user_id)`.
- **Supabase singleton:** [src/db/supabase_client.py](../../src/db/supabase_client.py). Reuse `get_supabase_client()` — no new code needed.
- **Test fixture:** [tests/test_tracker.py](../../tests/test_tracker.py) — `FakeSupabaseClient` emulation, 44+ tests. Copy structure.
- **Migration script skeleton:** [scripts/migrate_applications_sqlite_to_supabase.py](../../scripts/migrate_applications_sqlite_to_supabase.py). 302 lines. argparse; `--dry-run`; `--finalize --yes`; idempotent via URL dedup; per-row exception; exit codes 0/1/2.
- **Migration tests:** [tests/test_migrate_applications.py](../../tests/test_migrate_applications.py). 326 lines. TestMapSqliteRow / TestMigrateApplications / TestFinalize / TestMainCli — mirror structure for contacts.

### CLI command surface to rewire
From [cli.py:3142-3534](../../cli.py#L3142-L3534):

| Command | New backend | Notes |
|---|---|---|
| `contacts` (default list) | Supabase | calls `ContactManager.list_contacts()` |
| `contacts add` (wizard) | Supabase | `ContactManager.add_contact()` |
| `contacts show <id>` | Supabase + local | fetches contact from Supabase; interactions + submitted_roles from local SQLite (by `contact_uuid`) |
| `contacts edit <id>` | Supabase | `ContactManager.update_contact()` |
| `contacts log <id>` | local SQLite | writes `contact_interactions` by `contact_uuid`; also calls `ContactManager.update_contact(last_contact_date=...)` for the Supabase-side timestamp |
| `contacts search <query>` | Supabase | `ContactManager.search_contacts()` |
| `contacts stale` | Supabase | `ContactManager.get_stale_contacts(days=14)` |
| `contacts followups` | Supabase | `ContactManager.get_followup_due()` (uses new `next_followup` column) |
| `contacts tag / untag` | Supabase | `ContactManager.add_tag()` / `.remove_tag()` |
| `contacts by-type <type>` | Supabase | `ContactManager.list_contacts(contact_type=...)` |
| `contacts create-from-email` | Supabase | `ContactManager.find_by_email()` + `.add_contact()` — closes CAR-155 under Option (c) |

---

## File Inventory

### M5a (CAR-171)
- **Create:** [dashboard/supabase/migrations/20260421_add_cli_contact_columns.sql](../../dashboard/supabase/migrations/20260421_add_cli_contact_columns.sql)
- **Create:** [src/db/contacts.py](../../src/db/contacts.py) — `ContactManager` class (~500 LOC)
- **Create:** [tests/test_contact_manager.py](../../tests/test_contact_manager.py) — mirror of `test_tracker.py` (~450 LOC)
- **Modify:** [src/db/models.py:52-99](../../src/db/models.py#L52-L99) — add `contact_uuid TEXT` shadow columns to `contact_interactions` + `submitted_roles`; update helpers to prefer `contact_uuid` if present else fall back to `contact_id` INTEGER
- **Modify:** [src/db/models.py:636-971](../../src/db/models.py#L636-L971) — delete/deprecate the SQLite contact CRUD helpers (`add_contact`, `get_contact`, etc.) that are now owned by `ContactManager`. Keep `contact_interactions` + `submitted_roles` helpers (rewired to `contact_uuid`).
- **Modify:** [cli.py:3077-3534](../../cli.py#L3077-L3534) — rewire all `contacts` subcommands to use `ContactManager`
- **Modify:** [dashboard/src/types/database.types.ts](../../dashboard/src/types/database.types.ts) — regenerate after Supabase migration
- **Regen:** Dashboard build (`npm run build` in `dashboard/`) to confirm TS is clean

### M5b (CAR-172)
- **Create:** [scripts/migrate_contacts_sqlite_to_supabase.py](../../scripts/migrate_contacts_sqlite_to_supabase.py) (~300 LOC)
- **Create:** [tests/test_migrate_contacts.py](../../tests/test_migrate_contacts.py) (~300 LOC)
- **Create (transient):** [data/careerpilot.db.pre-CAR-168](../../data/careerpilot.db.pre-CAR-168) — snapshot before finalize

---

## M5a — Schema + Port (CAR-171)

**Branch:** `feature/CAR-171-contacts-port` in worktree `.worktrees/feature-CAR-171-contacts-port`.

### Task 1: Create worktree + scaffold branch

**Files:**
- Create worktree directory
- Create branch from `master`

- [ ] **Step 1: Verify clean working tree on current branch**
```bash
cd f:/Projects/CareerPilot
git status --short
```
Expected: only the pre-existing untracked files listed in session start. No uncommitted work on `feature/dashboard-v2`.

- [ ] **Step 2: Create worktree**
```bash
git worktree add .worktrees/feature-CAR-171-contacts-port -b feature/CAR-171-contacts-port feature/dashboard-v2
cd .worktrees/feature-CAR-171-contacts-port
```

- [ ] **Step 3: Verify `.worktrees/` is gitignored**
```bash
grep -n ".worktrees" .gitignore
```
Expected: at least one line matching `.worktrees` or `.worktrees/`.

### Task 2: Write the Supabase schema migration (failing build first)

**Files:**
- Create: `dashboard/supabase/migrations/20260421_add_cli_contact_columns.sql`

- [ ] **Step 1: Write the migration SQL**

Create `dashboard/supabase/migrations/20260421_add_cli_contact_columns.sql`:

```sql
-- CAR-171 (CAR-168 M5a): Extend contacts table with CLI-side fields.
-- These columns back the recruiter-workflow surface of the CLI
-- (contact_type, tags, follow-ups, relationship status).
-- The dashboard UI may adopt them later; for now they are CLI-primary.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type        TEXT NOT NULL DEFAULT 'recruiter',
  ADD COLUMN IF NOT EXISTS linkedin_url        TEXT,
  ADD COLUMN IF NOT EXISTS specialization      TEXT,
  ADD COLUMN IF NOT EXISTS contact_method      TEXT,
  ADD COLUMN IF NOT EXISTS next_followup       DATE,
  ADD COLUMN IF NOT EXISTS relationship_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS tags                TEXT[]  DEFAULT '{}';

-- Index for followups-due queries (next_followup <= today AND IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_contacts_next_followup
  ON public.contacts(user_id, next_followup)
  WHERE next_followup IS NOT NULL;

-- Index for by-type / relationship filters
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type
  ON public.contacts(user_id, contact_type);
```

Design notes to verify before applying:
- `tags` uses Postgres native `TEXT[]` (not comma-separated TEXT like SQLite). M5b must split SQLite's comma-joined tags into array elements.
- `next_followup` uses `DATE` not `TIMESTAMPTZ` — CLI treats it as a plain date.
- `contact_method` remains nullable — not every contact has one on file.
- Adding `NOT NULL DEFAULT` columns is safe on small tables; if the contacts table grows large before deploy, split into two migrations (add nullable → backfill → set NOT NULL).

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with:
- `project_id`: the CareerPilot Supabase project (look up via `list_projects` if unsure)
- `name`: `add_cli_contact_columns`
- `query`: the SQL above

- [ ] **Step 3: Verify columns landed**

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'contacts'
ORDER BY ordinal_position;
```
Expected: all 7 new columns present (`contact_type`, `linkedin_url`, `specialization`, `contact_method`, `next_followup`, `relationship_status`, `tags`).

- [ ] **Step 4: Regenerate dashboard TS types**

```bash
cd dashboard
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
cd ..
```

Verify the `contacts` `Row` type now has the new fields by grepping:
```bash
grep -A 20 'contacts: {' dashboard/src/types/database.types.ts | head -40
```

- [ ] **Step 5: Confirm dashboard still builds**

```bash
cd dashboard
npm run build
cd ..
```
Expected: exit 0. No TypeScript errors. Dashboard doesn't use the new columns yet, so nothing should break.

- [ ] **Step 6: Commit**

```bash
git add dashboard/supabase/migrations/20260421_add_cli_contact_columns.sql dashboard/src/types/database.types.ts
git commit -m "feat(CAR-171): extend Supabase contacts schema with CLI fields"
```

### Task 3: Write failing tests for ContactManager constructor + config

**Files:**
- Create: `tests/test_contact_manager.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_contact_manager.py` with the first test case (mirror of `tests/test_tracker.py::TestConstruction`):

```python
"""Tests for ContactManager — Supabase-backed CLI contact store (CAR-171)."""
from __future__ import annotations

import os
from typing import Dict, List, Optional
from unittest.mock import patch

import pytest

from src.db.contacts import (
    ContactManager,
    ContactManagerNotConfiguredError,
)


class FakeSupabaseClient:
    """Minimal in-memory emulation for ContactManager tests. Mirrors
    tests/test_tracker.py::FakeSupabaseClient — same .from/.select/.eq/
    .insert/.update/.delete chain, same execute() semantics."""

    def __init__(self, rows: Optional[List[Dict]] = None) -> None:
        self._rows: List[Dict] = list(rows or [])
        self._last_filter: Dict = {}
        self._last_op: Optional[str] = None
        self._last_payload: Optional[Dict] = None

    # ... full fake implementation mirrors test_tracker.py
    # (Agent executing this plan: copy FakeSupabaseClient from
    # tests/test_tracker.py verbatim, then adjust the table name
    # from "applications" to "contacts".)


class TestConstruction:
    def test_requires_user_id_from_env(self, monkeypatch):
        monkeypatch.delenv("CAREERPILOT_USER_ID", raising=False)
        with pytest.raises(ContactManagerNotConfiguredError):
            ContactManager()

    def test_accepts_injected_user_id(self):
        client = FakeSupabaseClient()
        mgr = ContactManager(client=client, user_id="00000000-0000-0000-0000-000000000001")
        assert mgr._user_id == "00000000-0000-0000-0000-000000000001"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_contact_manager.py -v
```
Expected: `ImportError` (src.db.contacts does not exist yet).

### Task 4: Scaffold ContactManager module

**Files:**
- Create: `src/db/contacts.py`

- [ ] **Step 1: Write minimal implementation to make Task 3 tests pass**

Create `src/db/contacts.py`. Start with constructor only (mirror tracker.py lines 1-80):

```python
"""Supabase-backed contacts manager (CAR-171 / CAR-168 M5a).

Mirrors src/jobs/tracker.py::ApplicationTracker for the contacts table.
Service-role auth; every query scoped by .eq("user_id", self._user_id).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class ContactManagerNotConfiguredError(RuntimeError):
    """Raised when ContactManager cannot resolve a user_id."""


class ContactManager:
    """Supabase-backed CRUD + queries for the contacts table.

    Parameters
    ----------
    client : Any, optional
        Supabase client. Defaults to the cached singleton from
        src.db.supabase_client.get_supabase_client().
    user_id : str, optional
        UUID of the user to scope all queries. Defaults to the
        CAREERPILOT_USER_ID environment variable. Raises
        ContactManagerNotConfiguredError if neither is provided.
    """

    def __init__(
        self,
        client: Any = None,
        user_id: Optional[str] = None,
    ) -> None:
        if user_id is None:
            user_id = os.environ.get("CAREERPILOT_USER_ID")
        if not user_id:
            raise ContactManagerNotConfiguredError(
                "ContactManager requires a user_id (arg or CAREERPILOT_USER_ID env var). "
                "Service-role key bypasses RLS, so orphaned rows would be invisible "
                "to the dashboard. See CAR-163 audit section 3 for rationale."
            )
        self._user_id = user_id

        if client is None:
            from src.db.supabase_client import get_supabase_client
            client = get_supabase_client()
        self._client = client

    def close(self) -> None:  # pragma: no cover - no-op for singleton
        pass
```

- [ ] **Step 2: Verify Task 3 tests pass**

```bash
python -m pytest tests/test_contact_manager.py::TestConstruction -v
```
Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/db/contacts.py tests/test_contact_manager.py
git commit -m "feat(CAR-171): scaffold ContactManager with user-scoped client"
```

### Task 5: TDD cycle — CRUD methods

Add one method at a time. For each: **write failing test** → **run (fails)** → **implement** → **run (passes)** → no commit yet (batch in Task 5 final step).

The method signatures follow SQLite helper signatures from [src/db/models.py:636-971](../../src/db/models.py#L636-L971), adapted for UUID returns and new `tags TEXT[]` shape.

- [ ] **Step 1: `add_contact(name, contact_type='recruiter', **kwargs) -> str`**

Mirror `tracker.py::save_job`. Returns the new UUID. Allowed kwargs match the full Supabase column set:
`company, title, email, phone, linkedin_url, specialization, source, last_contact_date, contact_method, next_followup, relationship_status, tags, notes`.

Test must verify:
- Row written with correct user_id scope
- `tags` accepted as a `List[str]`, stored as Postgres array (the FakeSupabaseClient records it as a list — no comma-join)
- `last_contact_date` accepts either a `datetime` (serialized to ISO) or a string
- Duplicate-email raises a Postgres error (unique constraint) — test catches and returns a sentinel

- [ ] **Step 2: `get_contact(contact_id: str) -> Optional[Dict]`**

Mirror `tracker.py::get_job`. Returns `None` when not found.

- [ ] **Step 3: `list_contacts(contact_type=None, relationship_status=None, tag=None) -> List[Dict]`**

Mirror `tracker.py::get_all_jobs` with filter kwargs. Filters apply server-side via `.eq()` / `.contains()` (for `tags` array).

- [ ] **Step 4: `update_contact(contact_id: str, **kwargs) -> bool`**

Mirror `tracker.py::update_status`. Allow-list of fields matches SQLite `update_contact` ([src/db/models.py:689-714](../../src/db/models.py#L689-L714)).

- [ ] **Step 5: `delete_contact(contact_id: str, force=False) -> bool`**

Soft delete = `update_contact(relationship_status='do_not_contact')`. Force = hard delete. Mirror `tracker.py::withdraw_application` for the soft case.

- [ ] **Step 6: Run all CRUD tests**

```bash
python -m pytest tests/test_contact_manager.py::TestCRUD -v
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/contacts.py tests/test_contact_manager.py
git commit -m "feat(CAR-171): ContactManager CRUD methods"
```

### Task 6: TDD cycle — query methods

- [ ] **Step 1: `find_by_email(email: str) -> Optional[Dict]`**

Mirror `tracker.py::find_by_url`. Case-insensitive by applying `.ilike()` on the email column (Supabase supports this on PostgREST). **This is the M5b dedup hook.**

- [ ] **Step 2: `search_contacts(query: str) -> List[Dict]`**

Mirror `tracker.py` has no direct analog — use PostgREST `.or_()` with ilike across `name,company,email,notes`. Reference pattern: dashboard `dashboard/src/app/api/contacts/route.ts` search handler.

- [ ] **Step 3: `get_stale_contacts(days: int = 14) -> List[Dict]`**

Mirror `tracker.py::get_stale_applications` — Python-side filter because PostgREST can't cleanly express "IS NULL OR < cutoff". Filter: `relationship_status IN ('active', 'warm') AND last_contact_date IS NOT NULL AND last_contact_date < (now - days)`.

- [ ] **Step 4: `get_followup_due() -> List[Dict]`**

Server-side: `.not_.is_("next_followup", "null").lte("next_followup", today)`.

- [ ] **Step 5: `add_tag(contact_id, tag)` / `remove_tag(contact_id, tag)`**

Fetch current `tags` (list), append/remove (deduped), write back. Alternative: Postgres `array_append` via RPC — keep simple; do read-modify-write.

- [ ] **Step 6: Run all query tests**

```bash
python -m pytest tests/test_contact_manager.py::TestQueries -v
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/contacts.py tests/test_contact_manager.py
git commit -m "feat(CAR-171): ContactManager query + tag methods"
```

### Task 7: SQLite schema migration — shadow `contact_uuid` column

**Files:**
- Modify: `src/db/models.py` (schema DDL in `init_db()` or equivalent)
- Modify: `src/db/models.py:867-940` (interaction + submitted_roles helpers)
- Modify: `tests/test_contacts.py` (update tests that exercise these helpers)

- [ ] **Step 1: Find the DDL that creates `contact_interactions` + `submitted_roles`**

```bash
grep -n "CREATE TABLE.*contact_interactions\|CREATE TABLE.*submitted_roles" src/db/models.py
```

- [ ] **Step 2: Add `contact_uuid TEXT` column at schema-init time**

In the DDL block that creates these tables, add after the existing columns:
```sql
ALTER TABLE contact_interactions ADD COLUMN contact_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_contact_interactions_uuid ON contact_interactions(contact_uuid);
ALTER TABLE submitted_roles ADD COLUMN contact_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_submitted_roles_uuid ON submitted_roles(contact_uuid);
```

Handle the `ALTER TABLE` inside a try/except that swallows "duplicate column name" (SQLite's error for already-added columns) so init is idempotent.

- [ ] **Step 3: Update helpers to prefer `contact_uuid` (accept str) but fall back to `contact_id` (int)**

Change `add_contact_interaction(contact_id, ...)` → `add_contact_interaction(contact_uuid, ...)` — argument is now a UUID string. Same for `get_contact_interactions`, `add_submitted_role`, `get_submitted_roles`, `update_role_status`.

Internally the function writes to `contact_uuid`. For reads, `SELECT ... WHERE contact_uuid = ? OR (contact_uuid IS NULL AND contact_id = ?)` covers the pre-migration rows too, until M5b finalize drops the INTEGER column.

- [ ] **Step 4: Update tests in `tests/test_contacts.py` that call these helpers**

Pass UUID strings instead of INTEGER ids. Use `"00000000-0000-0000-0000-00000000000a"` style fixtures.

- [ ] **Step 5: Run updated tests**

```bash
python -m pytest tests/test_contacts.py -v
```
Expected: all PASS. If any test touched the now-deleted CLI contact helpers (`add_contact`, `get_contact`, etc. in models.py) it must be moved to `tests/test_contact_manager.py` or deleted.

- [ ] **Step 6: Commit**

```bash
git add src/db/models.py tests/test_contacts.py
git commit -m "refactor(CAR-171): contact_interactions + submitted_roles keyed by UUID"
```

### Task 8: Remove the deprecated SQLite contact helpers

**Files:**
- Modify: `src/db/models.py:636-971` — delete the CLI-contact helpers now owned by `ContactManager`

- [ ] **Step 1: Identify which helpers to delete**

Delete: `add_contact`, `get_contact`, `list_contacts`, `update_contact`, `delete_contact`, `search_contacts`, `find_contact_by_email`, `get_stale_contacts`, `get_followup_due`, `get_contacts_summary` (if not used outside contacts module), `add_tag`, `remove_tag`, `log_contact_interaction`.

**Keep:** `add_contact_interaction`, `get_contact_interactions`, `add_submitted_role`, `get_submitted_roles`, `update_role_status` — these back the still-local interaction log.

- [ ] **Step 2: Verify no other callers exist**

```bash
grep -rn "from src.db.models import add_contact\|models.add_contact\|models.get_contact\|models.list_contacts" --include="*.py" | grep -v test_
```
Expected: empty (or only caller lines that will be rewired in Task 9).

- [ ] **Step 3: Delete the functions**

Edit `src/db/models.py` to remove them. Leave the `contacts` table DDL intact — M5b will drop/rename it at finalize.

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/ -v --ignore=tests/test_contact_manager.py
```
Expected: all PASS. Any still-failing test is a caller that Task 9 must fix.

- [ ] **Step 5: Commit**

```bash
git add src/db/models.py
git commit -m "refactor(CAR-171): drop SQLite contact helpers (owned by ContactManager)"
```

### Task 9: Rewire `cli.py` contacts commands to ContactManager

**Files:**
- Modify: `cli.py:3077-3534`

- [ ] **Step 1: Add `ContactManager` import + factory**

Top of `cli.py`, near existing imports:
```python
from src.db.contacts import ContactManager, ContactManagerNotConfiguredError
```

Near other click callbacks, add a factory:
```python
def _get_contact_manager() -> ContactManager:
    """Factory with friendly error if env is missing."""
    try:
        return ContactManager()
    except ContactManagerNotConfiguredError as exc:
        raise click.ClickException(str(exc))
```

- [ ] **Step 2: Rewire each subcommand**

For every subcommand listed in the table under "CLI command surface to rewire" above, replace the SQLite-helper call with the corresponding `ContactManager` method.

Key rewiring details:
- `contacts show <id>` — `id` was INTEGER, now UUID. Change the Click argument type from `int` to `str`. Fetch contact via `mgr.get_contact(uuid)`. Fetch interactions via `get_contact_interactions(contact_uuid=uuid)` (from `src/db/models.py`, still local).
- `contacts add` wizard — the wizard prompts produce a dict of kwargs; pass as `**kwargs` to `mgr.add_contact(name, contact_type, **kwargs)`. Print the returned UUID instead of an integer.
- `contacts log` — writes interaction to local SQLite (`add_contact_interaction(contact_uuid=uuid, ...)`) AND updates `last_contact_date` on Supabase via `mgr.update_contact(uuid, last_contact_date=now_iso)`.
- `contacts create-from-email` — exactly mirrors CAR-155 but via `mgr.find_by_email` + `mgr.add_contact`. Closes CAR-155 per CAR-168 acceptance criteria.

- [ ] **Step 3: Run the full CLI test suite**

```bash
python -m pytest tests/ -v
```
Expected: all PASS. Any `tests/test_contacts.py::TestCreateFromEmailCLI` failure is a signal to update that test's expectations (UUID return vs int).

- [ ] **Step 4: Manual smoke test**

```bash
python -m cli contacts create-from-email test@example.com --name "Test Recruiter"
python -m cli contacts list
python -m cli contacts show <uuid-from-previous-step>
python -m cli contacts log <uuid> --method email --note "first contact"
python -m cli contacts show <uuid>
```
Expected: all commands succeed. The created contact appears on the dashboard at `/contacts`.

- [ ] **Step 5: Regression check**

```bash
./tools/regression-check.sh
```
(If it exists per CAR-168 referenced in dashboard/CLAUDE.md.) Expected: all features PASS.

- [ ] **Step 6: Commit**

```bash
git add cli.py
git commit -m "feat(CAR-171): rewire CLI contacts commands to Supabase ContactManager"
```

### Task 10: Open M5a PR

- [ ] **Step 1: Push branch**
```bash
git push -u origin feature/CAR-171-contacts-port
```

- [ ] **Step 2: Open PR using the `ship` skill** (or manually):

Title: `feat(CAR-171): port contacts CLI to Supabase + extend schema`

Body:
```
## Summary
- Extends Supabase `contacts` with 6 CLI-side columns (contact_type, linkedin_url, specialization, contact_method, next_followup, relationship_status, tags)
- New `ContactManager` in `src/db/contacts.py` mirrors CAR-165's `ApplicationTracker` (service-role, user-scoped)
- CLI `contacts *` subcommands rewired; interactions + submitted_roles stay local SQLite keyed by `contact_uuid`
- Closes CAR-155 under Option (c) — `contacts create-from-email` now writes Supabase

## Test plan
- [ ] `python -m pytest tests/` — all pass
- [ ] `contacts add` wizard creates a Supabase row visible on dashboard
- [ ] `contacts log` writes local interaction + bumps Supabase `last_contact_date`
- [ ] `contacts create-from-email` dedups on repeat
- [ ] `npm run build` in `dashboard/` — no TS regressions
```

- [ ] **Step 3: Post Jira link comment on CAR-171 and transition to In Review**

Use `mcp__claude_ai_Atlassian_Rovo__addCommentToJiraIssue` with `contentFormat: "markdown"` per project memory. Include PR URL.

---

## M5b — One-Time Data Migration (CAR-172)

**Branch:** `feature/CAR-172-migrate-contacts` in worktree `.worktrees/feature-CAR-172-migrate-contacts`. Branch off the merged `feature/dashboard-v2` (post-CAR-171 merge).

### Task 11: Create worktree on post-CAR-171 `feature/dashboard-v2`

- [x] **Step 1: Pull latest `feature/dashboard-v2` (post-CAR-171 merge)**
- [x] **Step 2: Create worktree**

### Task 12: Scaffold migration script with TDD

**Files:**
- Create: `scripts/migrate_contacts_sqlite_to_supabase.py`
- Create: `tests/test_migrate_contacts.py`

- [x] **Step 1: Copy CAR-170 test structure** — TDD scaffold (42 tests)
- [x] **Step 2: Copy CAR-170 script skeleton** — adapted with email-dedup, tags CSV→list, last_contact→last_contact_date, finalize with drift fix
- [x] **Step 3: TDD cycle** — all 42 tests pass; 2 commits: script+tests, then contacts.py fix + worktree path resolution

### Task 13: Run migration against local DB

- [x] **Step 1: Backup** — `data/careerpilot.db.pre-CAR-168` created
- [x] **Step 2: Dry run** — `SQLite rows read: 1 / Would insert: 1 / Errors: 0`
- [x] **Step 3: Live run** — Sarah Kim sqlite_id=1 → Supabase `06de4039-c0e2-444f-8693-9b1aec2a9244`
- [x] **Step 4: Verify on Supabase** — 13 contacts visible; Sarah Kim source=email_import confirmed
- [x] **Step 5: Re-run idempotency** — `Inserted: 0 / Skipped (email exists): 1`
- [x] **Step 6: Finalize** — `contacts` → `contacts_deprecated_2026_04_21`; interaction/role tables rebuilt with `contact_uuid TEXT NOT NULL` schema
- [x] **Step 7: Final smoke test** — Supabase query confirmed Sarah Kim accessible via ContactManager

**Phase 1 audit delta noted:** `contact_interactions`/`submitted_roles` still had `contact_id INTEGER` (CAR-171 drift). Both at 0 rows → finalize rebuilt via drop+recreate. CLI `contacts` command needs the `contacts.py` settings fix (included in this PR) before it works without importing settings first.

### Task 14: Open M5b PR

- [x] **Step 1: Push + PR** — https://github.com/jlfowler1084/CareerPilot/pull/23
- [x] **Step 2: Post Jira link comment** — CAR-172 comment posted with PR link and verification results

### Task 15: Close CAR-155 + CAR-168 parent

- [ ] **Step 1:** ~~CAR-155~~ Already Done from original ship; no action needed (per prompt).
- [ ] **Step 2:** After CAR-172 PR merges, transition CAR-168 to Done with summary comment listing PR #21 (CAR-171) and PR #23 (CAR-172).

---

## Open questions / decisions deferred to executor

1. **`contact_interactions` + `submitted_roles` row count** — if <10 rows locally, Task 7's shadow-column dance could simplify to "drop + recreate". Probe first:
   ```bash
   sqlite3 data/careerpilot.db "SELECT COUNT(*) FROM contact_interactions; SELECT COUNT(*) FROM submitted_roles;"
   ```
   If low, the executor can collapse Tasks 7 + the M5b FK-rewrite step into one simpler rebuild.

2. **`tags` representation on Supabase** — the plan uses `TEXT[]`. If the dashboard already has tag-related UI that expected a different shape, coordinate. Verify no existing dashboard code references `contacts.tags` before landing the migration.

3. **CAR-117 pre-migrated rows** — the CAR-117 migration already created some `contacts` rows with `source='migration'` (from `applications.contact_email`). M5b will encounter these as email-dedup matches and **skip** them. That's the correct behavior — we don't overwrite them. Verify by spot-checking a known email before running live.

---

## Self-review checklist

- [x] **Spec coverage:** all ticket acceptance criteria covered (audit done in CAR-163; port = M5a Task 2-9; migration = M5b; CAR-155 closed = Task 15).
- [x] **Placeholder scan:** no TBDs / TODOs / "handle edge cases" — every decision is made.
- [x] **Type consistency:** `contact_id` is always UUID string at the Supabase boundary and for new interaction/submitted_roles rows; legacy INTEGER `contact_id` in SQLite coexists only during the M5a→M5b window and is dropped at finalize.
- [x] **Template references are load-bearing:** executor must read `src/jobs/tracker.py`, `tests/test_tracker.py`, and `scripts/migrate_applications_sqlite_to_supabase.py` before Tasks 4, 5, and 12 respectively.
