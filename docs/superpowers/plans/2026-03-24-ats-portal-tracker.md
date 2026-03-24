# ATS Portal Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ATS portal account tracking with centralized application status management to CareerPilot.

**Architecture:** New `ats_portals` table + migration of 4 columns onto `applications`. Portal CRUD in `models.py`, application extensions in `tracker.py`, CLI commands in `cli.py`. TDD throughout.

**Tech Stack:** Python 3.8+, SQLite, Click, Rich, pytest

**Spec:** `docs/superpowers/specs/2026-03-24-ats-portal-tracker-design.md`

---

### Task 1: Schema + Migration in models.py

**Files:**
- Modify: `src/db/models.py:14-76`
- Test: `tests/test_portals.py` (create)

- [ ] **Step 1: Create test file with migration tests**

Create `tests/test_portals.py` with the migration tests first — these validate the schema and migration before any CRUD code exists.

```python
"""Tests for ATS portal tracker."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

import pytest

from src.db import models


@pytest.fixture
def conn(tmp_path):
    """Get a connection to a fresh test database."""
    db_path = tmp_path / "test.db"
    c = models.get_connection(db_path)
    yield c
    c.close()


def _get_columns(conn, table):
    """Get column names for a table."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row["name"] for row in rows}


class TestMigration:
    def test_migration_adds_columns(self, tmp_path):
        """Create DB with old schema, then get_connection() adds new columns."""
        db_path = tmp_path / "old.db"
        old_conn = sqlite3.connect(str(db_path))
        old_conn.execute(
            "CREATE TABLE applications ("
            "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "  title TEXT NOT NULL,"
            "  company TEXT NOT NULL,"
            "  status TEXT NOT NULL DEFAULT 'found',"
            "  date_found TEXT,"
            "  date_applied TEXT,"
            "  date_response TEXT,"
            "  notes TEXT DEFAULT '',"
            "  profile_id TEXT DEFAULT '',"
            "  location TEXT DEFAULT '',"
            "  url TEXT DEFAULT '',"
            "  source TEXT DEFAULT '',"
            "  salary_range TEXT DEFAULT ''"
            ")"
        )
        old_conn.close()

        conn = models.get_connection(db_path)
        cols = _get_columns(conn, "applications")
        conn.close()

        assert "portal_id" in cols
        assert "external_status" in cols
        assert "external_status_updated" in cols
        assert "withdraw_date" in cols

    def test_migration_idempotent(self, tmp_path):
        """Calling get_connection() twice doesn't error."""
        db_path = tmp_path / "idem.db"
        c1 = models.get_connection(db_path)
        c1.close()
        c2 = models.get_connection(db_path)
        cols = _get_columns(c2, "applications")
        c2.close()
        assert "portal_id" in cols
```

- [ ] **Step 2: Run tests — expect FAIL (no ats_portals table, no migration)**

Run: `python -m pytest tests/test_portals.py::TestMigration -v`
Expected: FAIL — `portal_id` not in columns

- [ ] **Step 3: Add ats_portals table to SCHEMA_SQL and migration to get_connection()**

In `src/db/models.py`, add the `ats_portals` CREATE TABLE to `SCHEMA_SQL` (after `kv_store`):

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

Add `_column_exists()` helper and migration block to `get_connection()`:

```python
def _column_exists(conn, table, column):
    """Check if a column exists in a table."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def get_connection(db_path: Path = None) -> sqlite3.Connection:
    """Get a SQLite connection, creating the database and schema if needed."""
    db_path = db_path or settings.DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_SQL)

    # --- Migrations ---
    _migrate_applications(conn)

    # Re-issue after executescript may have reset it
    conn.execute("PRAGMA foreign_keys = ON")

    return conn


def _migrate_applications(conn):
    """Add new columns to applications table if they don't exist."""
    migrations = [
        ("portal_id", "INTEGER REFERENCES ats_portals(id)"),
        ("external_status", "TEXT"),
        ("external_status_updated", "TEXT"),
        ("withdraw_date", "TEXT"),
    ]
    for col_name, col_def in migrations:
        if not _column_exists(conn, "applications", col_name):
            try:
                conn.execute(f"ALTER TABLE applications ADD COLUMN {col_name} {col_def}")
                logger.debug("Migrated applications: added column '%s'", col_name)
            except sqlite3.OperationalError:
                logger.warning("Failed to add column '%s' to applications", col_name)
    conn.commit()
```

- [ ] **Step 4: Run migration tests — expect PASS**

Run: `python -m pytest tests/test_portals.py::TestMigration -v`
Expected: 2 passed

- [ ] **Step 5: Run full test suite to verify no regression**

Run: `python -m pytest tests/ -v`
Expected: All existing tests still pass

---

### Task 2: Portal CRUD Functions in models.py

**Files:**
- Modify: `src/db/models.py` (append after kv_store section)
- Test: `tests/test_portals.py` (add TestPortalCRUD, TestStalePortals)

- [ ] **Step 1: Write TestPortalCRUD tests**

Append to `tests/test_portals.py`:

```python
class TestPortalCRUD:
    def test_add_portal_returns_id(self, conn):
        """Insert returns positive row id."""
        pid = models.add_portal(
            conn, company="Acme", ats_type="Workday",
            portal_url="https://acme.workday.com",
        )
        assert pid > 0

    def test_list_portals_active_only(self, conn):
        """Deactivated portals excluded by default."""
        models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        pid2 = models.add_portal(conn, "Beta", "Lever", "https://beta.lever.co")
        models.deactivate_portal(conn, pid2)

        portals = models.list_portals(conn)
        assert len(portals) == 1
        assert portals[0]["company"] == "Acme"

    def test_list_portals_all(self, conn):
        """active_only=False includes deactivated."""
        models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        pid2 = models.add_portal(conn, "Beta", "Lever", "https://beta.lever.co")
        models.deactivate_portal(conn, pid2)

        portals = models.list_portals(conn, active_only=False)
        assert len(portals) == 2

    def test_update_portal(self, conn):
        """Updates fields correctly."""
        pid = models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        now = datetime.now().isoformat()
        result = models.update_portal(conn, pid, last_checked=now, notes="Updated")
        assert result is True

        portals = models.list_portals(conn)
        assert portals[0]["last_checked"] == now
        assert portals[0]["notes"] == "Updated"

    def test_deactivate_portal(self, conn):
        """Sets active=0, still in DB."""
        pid = models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        result = models.deactivate_portal(conn, pid)
        assert result is True

        portals = models.list_portals(conn, active_only=False)
        assert len(portals) == 1
        assert portals[0]["active"] == 0
```

- [ ] **Step 2: Run tests — expect FAIL (functions don't exist yet)**

Run: `python -m pytest tests/test_portals.py::TestPortalCRUD -v`
Expected: FAIL — `AttributeError: module 'src.db.models' has no attribute 'add_portal'`

- [ ] **Step 3: Implement portal CRUD functions**

Append to `src/db/models.py` after the kv_store section:

```python
# --- ATS Portal CRUD ---


VALID_ATS_TYPES = {"Workday", "Greenhouse", "Lever", "iCIMS", "Taleo", "Custom"}


def add_portal(conn, company, ats_type, portal_url, email_used="jlfowler1084@gmail.com",
               username=None, notes=None):
    """Insert a new ATS portal. Returns the row id."""
    cursor = conn.execute(
        "INSERT INTO ats_portals (company, ats_type, portal_url, email_used, username, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (company, ats_type, portal_url, email_used, username, notes),
    )
    conn.commit()
    logger.debug("Added portal: %s (%s)", company, ats_type)
    return cursor.lastrowid


def list_portals(conn, active_only=True):
    """Get all portals. If active_only, exclude deactivated."""
    sql = "SELECT * FROM ats_portals"
    if active_only:
        sql += " WHERE active = 1"
    sql += " ORDER BY company"
    rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


def update_portal(conn, portal_id, **kwargs):
    """Update portal fields. Returns True if found."""
    if not kwargs:
        return False
    row = conn.execute("SELECT id FROM ats_portals WHERE id = ?", (portal_id,)).fetchone()
    if not row:
        return False
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    conn.execute(
        f"UPDATE ats_portals SET {sets} WHERE id = ?",
        (*kwargs.values(), portal_id),
    )
    conn.commit()
    return True


def deactivate_portal(conn, portal_id):
    """Set a portal as inactive. Returns True if found."""
    return update_portal(conn, portal_id, active=0)


def get_stale_portals(conn, days=7):
    """Get active portals not checked in `days` with pending applications.

    Pending = application status NOT IN ('withdrawn', 'rejected', 'ghosted').
    """
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    rows = conn.execute(
        "SELECT p.*, COUNT(a.id) AS pending_app_count "
        "FROM ats_portals p "
        "JOIN applications a ON a.portal_id = p.id "
        "WHERE p.active = 1 "
        "  AND a.status NOT IN ('withdrawn', 'rejected', 'ghosted') "
        "  AND (p.last_checked IS NULL OR p.last_checked < ?) "
        "GROUP BY p.id "
        "ORDER BY p.last_checked ASC",
        (cutoff,),
    ).fetchall()
    return [dict(r) for r in rows]
```

Also add `from datetime import datetime, timedelta` (update the existing import line at the top of models.py to include `timedelta`).

- [ ] **Step 4: Run CRUD tests — expect PASS**

Run: `python -m pytest tests/test_portals.py::TestPortalCRUD -v`
Expected: 5 passed

- [ ] **Step 5: Write TestStalePortals tests**

Append to `tests/test_portals.py`. Note: add `from src.jobs.tracker import ApplicationTracker` to the **top-level imports** at the top of the file (next to the existing `from src.db import models` line), not inline between classes.

```python
class TestStalePortals:
    def test_stale_detection(self, conn):
        """Portal checked 8 days ago with pending app is stale."""
        pid = models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        eight_days_ago = (datetime.now() - timedelta(days=8)).isoformat()
        models.update_portal(conn, pid, last_checked=eight_days_ago)

        # Link an application
        conn.execute(
            "INSERT INTO applications (title, company, status, portal_id) "
            "VALUES (?, ?, ?, ?)",
            ("Engineer", "Acme", "applied", pid),
        )
        conn.commit()

        stale = models.get_stale_portals(conn)
        assert len(stale) == 1
        assert stale[0]["company"] == "Acme"
        assert stale[0]["pending_app_count"] == 1

    def test_recently_checked_not_stale(self, conn):
        """Portal checked today is not stale."""
        pid = models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        models.update_portal(conn, pid, last_checked=datetime.now().isoformat())

        conn.execute(
            "INSERT INTO applications (title, company, status, portal_id) "
            "VALUES (?, ?, ?, ?)",
            ("Engineer", "Acme", "applied", pid),
        )
        conn.commit()

        stale = models.get_stale_portals(conn)
        assert len(stale) == 0

    def test_no_pending_apps_not_stale(self, conn):
        """Portal with no linked apps is not stale even if old."""
        pid = models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        old = (datetime.now() - timedelta(days=30)).isoformat()
        models.update_portal(conn, pid, last_checked=old)

        stale = models.get_stale_portals(conn)
        assert len(stale) == 0

    def test_custom_days_threshold(self, conn):
        """Respects custom days parameter."""
        pid = models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        two_days_ago = (datetime.now() - timedelta(days=2)).isoformat()
        models.update_portal(conn, pid, last_checked=two_days_ago)

        conn.execute(
            "INSERT INTO applications (title, company, status, portal_id) "
            "VALUES (?, ?, ?, ?)",
            ("Engineer", "Acme", "applied", pid),
        )
        conn.commit()

        assert len(models.get_stale_portals(conn, days=7)) == 0
        assert len(models.get_stale_portals(conn, days=1)) == 1
```

- [ ] **Step 6: Run stale tests — expect PASS**

Run: `python -m pytest tests/test_portals.py::TestStalePortals -v`
Expected: 4 passed

- [ ] **Step 7: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: All tests pass, no regressions

---

### Task 3: Application Extensions in tracker.py

**Files:**
- Modify: `src/jobs/tracker.py:59-183`
- Test: `tests/test_portals.py` (add TestApplicationPortalLink, TestWithdraw, TestStaleApplications)

- [ ] **Step 1: Write tests for application extensions**

Append to `tests/test_portals.py`:

```python
@pytest.fixture
def tracker(tmp_path):
    """Create an ApplicationTracker with a temp database."""
    db_path = tmp_path / "test.db"
    t = ApplicationTracker(db_path=db_path)
    yield t
    t.close()


def _sample_job(**overrides):
    """Create a sample job dict with defaults."""
    job = {
        "title": "Systems Administrator",
        "company": "Acme Corp",
        "location": "Indianapolis, IN",
        "url": "https://example.com/job/1",
        "source": "indeed",
        "salary": "$80k-$100k",
    }
    job.update(overrides)
    return job


class TestApplicationPortalLink:
    def test_link_application_to_portal(self, tracker):
        """portal_id FK set correctly."""
        pid = models.add_portal(
            tracker._conn, "Acme", "Workday", "https://acme.wd.com"
        )
        job_id = tracker.save_job(_sample_job())
        tracker.update_external_status(job_id, "Under Review", portal_id=pid)

        job = tracker.get_job(job_id)
        assert job["portal_id"] == pid

    def test_update_external_status(self, tracker):
        """Sets status and timestamp."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_external_status(job_id, "Application Received")

        job = tracker.get_job(job_id)
        assert job["external_status"] == "Application Received"
        assert job["external_status_updated"] is not None
        assert job["external_status_updated"].startswith(
            datetime.now().strftime("%Y-%m-%d")
        )

    def test_external_status_preserves_internal(self, tracker):
        """Changing external status doesn't touch internal status."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied")
        tracker.update_external_status(job_id, "Under Review")

        job = tracker.get_job(job_id)
        assert job["status"] == "applied"
        assert job["external_status"] == "Under Review"


class TestWithdraw:
    def test_withdraw_sets_status_and_date(self, tracker):
        """Sets status to withdrawn and populates withdraw_date."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied")
        result = tracker.withdraw_application(job_id)
        assert result is True

        job = tracker.get_job(job_id)
        assert job["status"] == "withdrawn"
        assert job["withdraw_date"] is not None
        assert job["withdraw_date"].startswith(
            datetime.now().strftime("%Y-%m-%d")
        )

    def test_withdraw_nonexistent_returns_false(self, tracker):
        """Returns False for nonexistent job ID."""
        result = tracker.withdraw_application(999)
        assert result is False


class TestStaleApplications:
    def test_stale_applications_detected(self, tracker):
        """Application with no external update in 14+ days flagged."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied")

        # Manually set external_status_updated to 15 days ago
        old = (datetime.now() - timedelta(days=15)).isoformat()
        tracker._conn.execute(
            "UPDATE applications SET external_status_updated = ? WHERE id = ?",
            (old, job_id),
        )
        tracker._conn.commit()

        stale = tracker.get_stale_applications()
        assert len(stale) == 1
        assert stale[0]["id"] == job_id

    def test_withdrawn_not_stale(self, tracker):
        """Withdrawn/rejected apps excluded from stale list."""
        j1 = tracker.save_job(_sample_job(title="Job A"))
        j2 = tracker.save_job(_sample_job(title="Job B"))
        tracker.update_status(j1, "withdrawn")
        tracker.update_status(j2, "rejected")

        stale = tracker.get_stale_applications()
        assert len(stale) == 0
```

- [ ] **Step 2: Run tests — expect FAIL (methods don't exist)**

Run: `python -m pytest tests/test_portals.py::TestApplicationPortalLink tests/test_portals.py::TestWithdraw tests/test_portals.py::TestStaleApplications -v`
Expected: FAIL — `AttributeError: 'ApplicationTracker' object has no attribute 'update_external_status'`

- [ ] **Step 3: Implement application extensions in tracker.py**

Add these methods to the `ApplicationTracker` class in `src/jobs/tracker.py`, before the `close()` method:

```python
    def update_external_status(self, job_id: int, status: str,
                               portal_id: int = None) -> bool:
        """Update the external ATS status on an application.

        Args:
            job_id: Application row id.
            status: Free-text status from the ATS portal.
            portal_id: Optional portal id to link.

        Returns:
            True if updated, False if job not found.
        """
        row = self._conn.execute(
            "SELECT id FROM applications WHERE id = ?", (job_id,)
        ).fetchone()
        if not row:
            logger.warning("Application id=%d not found", job_id)
            return False

        now = datetime.now().isoformat()
        updates = ["external_status = ?", "external_status_updated = ?"]
        params = [status, now]

        if portal_id is not None:
            updates.append("portal_id = ?")
            params.append(portal_id)

        params.append(job_id)
        self._conn.execute(
            f"UPDATE applications SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        self._conn.commit()
        logger.info("Updated external status for id=%d: '%s'", job_id, status)
        return True

    def withdraw_application(self, job_id: int) -> bool:
        """Withdraw an application — sets status and withdraw_date.

        Returns:
            True if updated, False if job not found.
        """
        row = self._conn.execute(
            "SELECT id FROM applications WHERE id = ?", (job_id,)
        ).fetchone()
        if not row:
            logger.warning("Application id=%d not found", job_id)
            return False

        now = datetime.now().isoformat()
        self._conn.execute(
            "UPDATE applications SET status = 'withdrawn', withdraw_date = ? WHERE id = ?",
            (now, job_id),
        )
        self._conn.commit()
        logger.info("Withdrew application id=%d", job_id)
        return True

    def get_stale_applications(self, days: int = 14) -> List[Dict]:
        """Get applications with no external status update in `days`.

        Excludes withdrawn, rejected, and ghosted applications.
        """
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        rows = self._conn.execute(
            "SELECT * FROM applications "
            "WHERE status NOT IN ('withdrawn', 'rejected', 'ghosted') "
            "  AND (external_status_updated IS NULL OR external_status_updated < ?) "
            "ORDER BY date_found DESC",
            (cutoff,),
        ).fetchall()
        return [dict(r) for r in rows]
```

Also add `timedelta` to the existing `datetime` import at the top of `tracker.py`:
```python
from datetime import datetime, timedelta
```

- [ ] **Step 4: Run application extension tests — expect PASS**

Run: `python -m pytest tests/test_portals.py::TestApplicationPortalLink tests/test_portals.py::TestWithdraw tests/test_portals.py::TestStaleApplications -v`
Expected: 5 passed

- [ ] **Step 5: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: All tests pass

---

### Task 4: CLI — portals Group

**Files:**
- Modify: `cli.py` (add portals group after the tracker group, ~line 1108)

- [ ] **Step 1: Add the portals group with list, add, check, stale subcommands**

Add after the existing tracker commands block (after `tracker_applied_today`, before the `@cli.command` for `analyze`). Insert the following:

```python
@cli.group(invoke_without_command=True)
@click.pass_context
def portals(ctx):
    """Manage ATS portal accounts."""
    if ctx.invoked_subcommand is not None:
        return
    ctx.invoke(portals_list)


@portals.command("list")
def portals_list():
    """List all ATS portal accounts."""
    from datetime import datetime

    from src.db import models

    conn = models.get_connection()
    all_portals = models.list_portals(conn)
    conn_for_apps = conn  # reuse same connection

    if not all_portals:
        console.print("[yellow]No portal accounts tracked. Run 'portals add' to add one.[/yellow]")
        conn.close()
        return

    table = Table(title=f"ATS Portal Accounts ({len(all_portals)})")
    table.add_column("ID", style="dim", width=5)
    table.add_column("Company", style="bold")
    table.add_column("ATS Type")
    table.add_column("Portal URL")
    table.add_column("Email")
    table.add_column("Last Checked")
    table.add_column("Apps", justify="center")

    for p in all_portals:
        # Count pending apps for this portal
        app_count = conn_for_apps.execute(
            "SELECT COUNT(*) as cnt FROM applications "
            "WHERE portal_id = ? AND status NOT IN ('withdrawn', 'rejected', 'ghosted')",
            (p["id"],),
        ).fetchone()["cnt"]

        # Determine staleness color
        style = ""
        if app_count > 0 and p["last_checked"]:
            try:
                last = datetime.fromisoformat(p["last_checked"])
                days_ago = (datetime.now() - last).days
                if days_ago >= 14:
                    style = "red"
                elif days_ago >= 7:
                    style = "yellow"
            except (ValueError, TypeError):
                pass
        elif app_count > 0 and not p["last_checked"]:
            style = "red"

        last_checked_display = ""
        if p["last_checked"]:
            try:
                last = datetime.fromisoformat(p["last_checked"])
                days_ago = (datetime.now() - last).days
                if days_ago == 0:
                    last_checked_display = "Today"
                elif days_ago == 1:
                    last_checked_display = "Yesterday"
                else:
                    last_checked_display = f"{days_ago} days ago"
            except (ValueError, TypeError):
                last_checked_display = p["last_checked"][:10]
        else:
            last_checked_display = "Never"

        table.add_row(
            str(p["id"]),
            f"[{style}]{p['company']}[/{style}]" if style else p["company"],
            p["ats_type"],
            str(p["portal_url"])[:40],
            p["email_used"],
            last_checked_display,
            str(app_count),
        )

    console.print(table)
    conn.close()


@portals.command("add")
def portals_add():
    """Add a new ATS portal account."""
    from src.db import models

    company = click.prompt("Company")
    ats_type = click.prompt(
        "ATS type",
        type=click.Choice(["Workday", "Greenhouse", "Lever", "iCIMS", "Taleo", "Custom"]),
    )
    portal_url = click.prompt("Portal URL")
    email_used = click.prompt("Email", default="jlfowler1084@gmail.com")
    notes = click.prompt("Notes", default="", show_default=False)

    conn = models.get_connection()
    pid = models.add_portal(
        conn, company=company, ats_type=ats_type, portal_url=portal_url,
        email_used=email_used, notes=notes or None,
    )
    conn.close()

    console.print(f"[green]Portal added (id={pid}): {company} ({ats_type})[/green]")


@portals.command("check")
@click.argument("portal_id", type=int)
def portals_check(portal_id):
    """Open a portal in the browser and mark as checked."""
    import webbrowser
    from datetime import datetime

    from src.db import models

    conn = models.get_connection()
    portal_list = models.list_portals(conn, active_only=False)
    portal = None
    for p in portal_list:
        if p["id"] == portal_id:
            portal = p
            break

    if not portal:
        console.print(f"[red]Portal id={portal_id} not found.[/red]")
        conn.close()
        return

    console.print(f"Opening [bold]{portal['company']}[/bold] ({portal['ats_type']})")
    console.print(f"  URL: {portal['portal_url']}")

    webbrowser.open(portal["portal_url"])
    models.update_portal(conn, portal_id, last_checked=datetime.now().isoformat())
    conn.close()

    console.print("[green]Marked as checked.[/green]")


@portals.command("stale")
def portals_stale():
    """Show portals not checked in 7+ days with pending applications."""
    from datetime import datetime

    from src.db import models

    conn = models.get_connection()
    stale = models.get_stale_portals(conn)
    conn.close()

    if not stale:
        console.print("[green]All portals are up to date.[/green]")
        return

    console.print(Panel("[bold yellow]Stale Portals[/bold yellow] — not checked in 7+ days", border_style="yellow"))

    table = Table()
    table.add_column("ID", style="dim", width=5)
    table.add_column("Company", style="bold yellow")
    table.add_column("ATS Type")
    table.add_column("Portal URL")
    table.add_column("Last Checked")
    table.add_column("Pending Apps", justify="center")

    for p in stale:
        last = "Never"
        if p["last_checked"]:
            try:
                days_ago = (datetime.now() - datetime.fromisoformat(p["last_checked"])).days
                last = f"{days_ago} days ago"
            except (ValueError, TypeError):
                last = p["last_checked"][:10]
        table.add_row(
            str(p["id"]),
            p["company"],
            p["ats_type"],
            str(p["portal_url"])[:40],
            last,
            str(p["pending_app_count"]),
        )

    console.print(table)
```

- [ ] **Step 2: Verify portals CLI loads without error**

Run: `python cli.py portals --help`
Expected: Shows help with list, add, check, stale subcommands

- [ ] **Step 3: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: All tests pass

---

### Task 5: CLI — Extended tracker Commands

**Files:**
- Modify: `cli.py` (add status, withdraw, stale subcommands to tracker group)

- [ ] **Step 1: Add tracker status, withdraw, and stale subcommands**

Add after the existing `tracker_applied_today` command (before the portals group):

```python
@tracker.command("status")
@click.argument("job_id", type=int)
@click.argument("status", type=str)
def tracker_ext_status(job_id, status):
    """Set external ATS status on an application."""
    from src.jobs.tracker import ApplicationTracker

    t = ApplicationTracker()
    job = t.get_job(job_id)

    if not job:
        console.print(f"[red]Job id={job_id} not found.[/red]")
        t.close()
        return

    old_ext = job.get("external_status") or "(none)"
    if t.update_external_status(job_id, status):
        console.print(f"[bold]{job['title']}[/bold] at {job['company']}")
        console.print(f"  External status: {old_ext} → [green]{status}[/green]")
    else:
        console.print("[red]Update failed.[/red]")

    t.close()


@tracker.command("withdraw")
@click.argument("job_id", type=int)
def tracker_withdraw(job_id):
    """Withdraw an application."""
    from src.jobs.tracker import ApplicationTracker

    t = ApplicationTracker()
    job = t.get_job(job_id)

    if not job:
        console.print(f"[red]Job id={job_id} not found.[/red]")
        t.close()
        return

    if t.withdraw_application(job_id):
        console.print(
            f"[yellow]Withdrawn:[/yellow] [bold]{job['title']}[/bold] at {job['company']}"
        )
    else:
        console.print("[red]Withdraw failed.[/red]")

    t.close()


@tracker.command("stale")
def tracker_stale():
    """Show applications with no status update in 14+ days."""
    from datetime import datetime

    from src.jobs.tracker import ApplicationTracker

    t = ApplicationTracker()
    stale = t.get_stale_applications()
    t.close()

    if not stale:
        console.print("[green]No stale applications.[/green]")
        return

    table = Table(title=f"Stale Applications ({len(stale)})")
    table.add_column("ID", style="dim", width=5)
    table.add_column("Title", style="bold")
    table.add_column("Company")
    table.add_column("Status")
    table.add_column("External Status")
    table.add_column("Days Since Update", justify="center")

    for j in stale:
        days = ""
        ref = j.get("external_status_updated") or j.get("date_found") or ""
        if ref:
            try:
                dt = datetime.fromisoformat(ref)
                days = str((datetime.now() - dt).days)
            except (ValueError, TypeError):
                pass

        table.add_row(
            str(j["id"]),
            str(j.get("title", ""))[:40],
            str(j.get("company", ""))[:25],
            j.get("status", ""),
            j.get("external_status") or "(none)",
            days,
        )

    console.print(table)
```

- [ ] **Step 2: Verify tracker CLI loads without error**

Run: `python cli.py tracker --help`
Expected: Shows help including status, withdraw, stale subcommands

- [ ] **Step 3: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: All tests pass

---

### Task 6: Morning Scan Integration

**Files:**
- Modify: `cli.py` — `morning()` function, insert between inbox digest block and scan timestamp block

- [ ] **Step 1: Add portal reminders to morning command**

In `cli.py`, in the `morning()` function, add the following block between the inbox digest `except Exception: pass` (currently around line 1846) and the `# Record scan timestamp` comment:

```python
    # --- Portal check reminders ---
    # Note: `datetime` and `models` are already imported at the top of morning()
    try:
        _conn = models.get_connection()
        # Get all active portals with pending app counts
        _portals = _conn.execute(
            "SELECT p.*, COUNT(a.id) AS pending_app_count "
            "FROM ats_portals p "
            "LEFT JOIN applications a ON a.portal_id = p.id "
            "  AND a.status NOT IN ('withdrawn', 'rejected', 'ghosted') "
            "WHERE p.active = 1 "
            "GROUP BY p.id "
            "HAVING pending_app_count > 0 "
            "ORDER BY p.last_checked ASC",
        ).fetchall()

        if _portals:
            console.print()
            console.print("[bold]📋 Portal Check Reminders:[/bold]")
            for _p in _portals:
                _p = dict(_p)
                if _p["last_checked"]:
                    try:
                        _last = datetime.fromisoformat(_p["last_checked"])
                        _days_ago = (datetime.now() - _last).days
                        if _days_ago == 0:
                            _time_str = "checked today"
                        elif _days_ago == 1:
                            _time_str = "last checked yesterday"
                        else:
                            _time_str = f"last checked {_days_ago} days ago"
                    except (ValueError, TypeError):
                        _time_str = "unknown last check"
                        _days_ago = 999
                else:
                    _time_str = "never checked"
                    _days_ago = 999

                _app_label = "application" if _p["pending_app_count"] == 1 else "applications"

                if _days_ago >= 7:
                    console.print(
                        f"  [yellow]⚠ {_p['company']} ({_p['ats_type']})[/yellow] — "
                        f"{_time_str}, {_p['pending_app_count']} pending {_app_label}"
                    )
                else:
                    console.print(
                        f"  [green]✅ {_p['company']}[/green] — {_time_str}"
                    )

        _conn.close()
    except Exception:
        pass
```

- [ ] **Step 2: Verify morning command loads without error**

Run: `python cli.py morning --help`
Expected: Shows help text

- [ ] **Step 3: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: All tests pass

---

### Task 7: Final Verification + Commit

- [ ] **Step 1: Run the complete test suite**

Run: `python -m pytest tests/ -v`
Expected: All tests pass — report total count

- [ ] **Step 2: Run the new portal tests specifically**

Run: `python -m pytest tests/test_portals.py -v`
Expected: 18 tests pass

- [ ] **Step 3: Verify CLI commands are accessible**

Run: `python cli.py portals --help && python cli.py tracker --help`
Expected: Both show their subcommands including new ones

- [ ] **Step 4: Commit and push**

```bash
git add src/db/models.py src/jobs/tracker.py cli.py tests/test_portals.py
git commit -m "feat: ATS portal tracker with centralized application status management

- New ats_portals table with CRUD functions (add, list, update, deactivate, stale detection)
- Migration adds portal_id, external_status, external_status_updated, withdraw_date to applications
- CLI: portals group (list/add/check/stale) + tracker extensions (status/withdraw/stale)
- Morning scan integration with portal check reminders
- 18 new tests in test_portals.py

To seed Eli Lilly portal: python cli.py portals add
  Company: Eli Lilly | ATS: Workday
  URL: https://lilly.wd5.myworkdayjobs.com/en-US/LLY/userHome

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin feature/dashboard-v2
```
