# ATS Portal Account Tracker + Centralized Application Status

**Date:** 2026-03-24
**Status:** Approved
**Scope:** New SQLite table, CRUD functions, CLI commands, migration, morning scan integration, tests

---

## 1. Problem

Job applications go through many external ATS portals (Workday, Greenhouse, Lever, etc.). There is no centralized way to:
- Track which portals have accounts
- Know when a portal was last checked for status updates
- Link applications to their portal for quick access
- Track external status separately from internal pipeline status
- Identify stale applications or unchecked portals

## 2. Data Layer

### 2.1 New Table: `ats_portals`

Added to `SCHEMA_SQL` in `src/db/models.py`:

```sql
CREATE TABLE IF NOT EXISTS ats_portals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    ats_type TEXT NOT NULL,
    portal_url TEXT NOT NULL,
    email_used TEXT NOT NULL DEFAULT 'jlfowler1084@gmail.com',
    username TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1 CHECK(active IN (0, 1))
);
```

Valid `ats_type` values: `Workday`, `Greenhouse`, `Lever`, `iCIMS`, `Taleo`, `Custom`.

### 2.2 Migration: New Columns on `applications`

Four new columns added via `ALTER TABLE` with a `_column_exists()` helper that checks `PRAGMA table_info(applications)` before each ALTER:

| Column | Type | Purpose |
|--------|------|---------|
| `portal_id` | `INTEGER REFERENCES ats_portals(id)` | Links application to its ATS portal |
| `external_status` | `TEXT` | Status from the ATS portal (free text) |
| `external_status_updated` | `TEXT` | ISO timestamp of last external status check |
| `withdraw_date` | `TEXT` | ISO timestamp when application was withdrawn |

Migration runs inside `get_connection()` after `executescript(SCHEMA_SQL)`. Each ALTER is a separate `conn.execute()` call (not `executescript()`) wrapped in its own try/except. After the migration block, `PRAGMA foreign_keys = ON` is re-issued to ensure FK enforcement is active regardless of what `executescript()` did to the pragma state. Uses `PRAGMA table_info(applications)` to check column existence before each ALTER — safe to run repeatedly, idempotent.

### 2.3 CRUD Functions (in `src/db/models.py`)

Module-level functions matching existing patterns (`add_skill`, `get_all_skills`, etc.):

| Function | Signature | Returns |
|----------|-----------|---------|
| `add_portal` | `(conn, company, ats_type, portal_url, email_used='jlfowler1084@gmail.com', username=None, notes=None)` | Row id (int) |
| `list_portals` | `(conn, active_only=True)` | List of dicts |
| `update_portal` | `(conn, portal_id, **kwargs)` | Bool (success) |
| `deactivate_portal` | `(conn, portal_id)` | Bool (success) |
| `get_stale_portals` | `(conn, days=7)` | List of dicts (see below) |

**`get_stale_portals` definition:** Returns active portals where `last_checked` is NULL or older than `days` ago, AND the portal has at least one linked application whose internal status is NOT in the terminal set `{'withdrawn', 'rejected', 'ghosted'}`. The SQL JOIN uses `applications.portal_id = ats_portals.id` with a `WHERE applications.status NOT IN ('withdrawn', 'rejected', 'ghosted')` filter. Each returned dict includes a `pending_app_count` field.

### 2.4 Application Extensions (in `src/jobs/tracker.py`)

New methods on `ApplicationTracker`:

| Method | Signature | Behavior |
|--------|-----------|----------|
| `update_external_status` | `(job_id, status, portal_id=None)` | Sets `external_status`, `external_status_updated` to now; optionally links `portal_id` |
| `withdraw_application` | `(job_id)` | Sets internal status to "withdrawn", sets `withdraw_date` to now |
| `get_stale_applications` | `(days=14)` | Applications where `external_status_updated` is NULL or older than N days, AND status NOT IN `('withdrawn', 'rejected', 'ghosted')` |

### 2.5 Pre-populated Data

Seed the Eli Lilly portal as a manual one-time CLI command documented in the commit message. Not automated in `get_connection()` — avoids duplicate insertion risk:

```
python cli.py portals add
# Company: Eli Lilly
# ATS type: Workday
# Portal URL: https://lilly.wd5.myworkdayjobs.com/en-US/LLY/userHome
# Email: jlfowler1084@gmail.com
# Notes: Candidate Home account created 2026-03-24. R-101006 Operational Success Engineer submitted.
```

Alternatively, a seed script can be run once after implementation. The CRUD layer does not enforce uniqueness on `(company, portal_url)` — deduplication is the user's responsibility.

## 3. CLI Commands

### 3.1 New `portals` Group (top-level)

Registered as `@cli.group(invoke_without_command=True)` with `@click.pass_context`, defaulting to the list subcommand when invoked without arguments (same pattern as the existing `tracker` group).

Separate from `tracker` — portals manage account access, tracker manages pipeline.

#### `python cli.py portals` (default: list)

Rich table with columns: ID, Company, ATS Type, Portal URL (truncated to 40 chars), Email, Last Checked, Apps (count of linked applications).

Color coding by staleness (only when pending apps exist):
- **Red:** not checked in 14+ days
- **Yellow:** not checked in 7-13 days
- **Default:** checked recently or no pending apps

#### `python cli.py portals add`

Interactive wizard using `click.prompt()` and `click.Choice()`:

1. Company name — `click.prompt("Company")`
2. ATS type — `click.Choice(["Workday", "Greenhouse", "Lever", "iCIMS", "Taleo", "Custom"])`
3. Portal URL — `click.prompt("Portal URL")`
4. Email used — `click.prompt("Email", default="jlfowler1084@gmail.com")`
5. Notes — `click.prompt("Notes", default="", show_default=False)`

Prints confirmation with the new portal ID.

#### `python cli.py portals check <id>`

Prints the portal company/URL, opens portal URL with `webbrowser.open()`, updates `last_checked` to now via `update_portal()`, prints confirmation. No confirmation prompt — this is intentionally a quick-fire command for the morning workflow. The user explicitly chose the portal ID, and `last_checked` is easily correctable via `portals check` again.

#### `python cli.py portals stale`

Filtered view showing only portals not checked in 7+ days that have pending applications (status NOT IN `withdrawn`, `rejected`, `ghosted`). Same Rich table format with a warning header panel.

### 3.2 Extended `tracker` Commands

#### `python cli.py tracker status <id> <status>`

New subcommand. Sets `external_status` and `external_status_updated` on an application. Accepts free-text status string (e.g., "Application Received", "Under Review", "Interview Scheduled", "Rejected"). Prints before/after status.

#### `python cli.py tracker withdraw <id>`

Sets internal status to "withdrawn", sets `withdraw_date` to now. Prints confirmation with job title and company.

#### `python cli.py tracker stale`

Applications where `external_status_updated` is NULL or older than 14 days, and internal status is NOT IN `('withdrawn', 'rejected', 'ghosted')`. Rich table with a "Days Since Update" column.

### 3.3 Morning Scan Integration

Added in the `morning()` command in `cli.py`, between the inbox digest block and the scan timestamp recording block. Wrapped in try/except like all other morning scan sections.

Output format:
```
📋 Portal Check Reminders:
  ⚠ Eli Lilly (Workday) — last checked 3 days ago, 1 pending application
  ✅ Indeed — checked today
```

Only shows active portals with pending applications (status NOT IN `withdrawn`, `rejected`, `ghosted`). Uses:
- `⚠` (yellow) for stale portals (7+ days since last check)
- `✅` (green) for recently checked portals

## 4. Testing

New file: `tests/test_portals.py`. Uses `tmp_path` fixture for isolated SQLite DB, class-based grouping matching `test_tracker.py` patterns.

### TestPortalCRUD (~5 tests)
- `test_add_portal_returns_id` — insert returns positive row id
- `test_list_portals_active_only` — deactivated portals excluded by default
- `test_list_portals_all` — `active_only=False` includes deactivated
- `test_update_portal` — updates fields (notes, last_checked)
- `test_deactivate_portal` — sets `active=0`, still queryable

### TestStalePortals (~4 tests)
- `test_stale_detection` — portal with `last_checked` 8 days ago + pending app (status="applied") flagged
- `test_recently_checked_not_stale` — checked today, not flagged
- `test_no_pending_apps_not_stale` — old check but no linked applications, not flagged
- `test_custom_days_threshold` — `get_stale_portals(days=3)` respects parameter

### TestApplicationPortalLink (~3 tests)
- `test_link_application_to_portal` — `portal_id` FK set correctly
- `test_update_external_status` — sets status + timestamp
- `test_external_status_preserves_internal` — changing external doesn't touch internal status

### TestWithdraw (~2 tests)
- `test_withdraw_sets_status_and_date` — status="withdrawn", `withdraw_date` populated
- `test_withdraw_nonexistent_returns_false`

### TestStaleApplications (~2 tests)
- `test_stale_applications_detected` — no update in 14+ days, active status (e.g., "applied")
- `test_withdrawn_not_stale` — withdrawn/rejected apps excluded from stale list

### TestMigration (~2 tests)
- `test_migration_adds_columns` — create `applications` table directly using the old schema (without new columns) via raw `CREATE TABLE` SQL in the test, then call `get_connection()` on the same db_path, verify all 4 new columns exist via `PRAGMA table_info`
- `test_migration_idempotent` — call `get_connection()` twice on the same db_path, no errors

**Total: ~18 test cases.** All use tmp_path SQLite — no external dependencies.

## 5. Files Modified

| File | Change |
|------|--------|
| `src/db/models.py` | Add `ats_portals` to `SCHEMA_SQL`, `_column_exists()` helper, migration block in `get_connection()` with PRAGMA re-issue, portal CRUD functions |
| `src/jobs/tracker.py` | Add `update_external_status()`, `withdraw_application()`, `get_stale_applications()` to `ApplicationTracker` |
| `cli.py` | Add `portals` group with `invoke_without_command=True` + `pass_context` (list/add/check/stale subcommands), add `tracker status`/`withdraw`/`stale` subcommands, morning scan portal reminders |
| `tests/test_portals.py` | New — 18 test cases |

## 6. Git

Single commit: `feat: ATS portal tracker with centralized application status management`
