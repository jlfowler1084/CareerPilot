"""Tests for scripts/migrate_applications_sqlite_to_supabase.py (CAR-170)."""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest


# ---------------------------------------------------------------------------
# Dynamically load the migration script — it's in `scripts/` which isn't a
# Python package. importlib.util keeps the project convention (scripts are
# standalone) while letting tests import the reusable functions.
# ---------------------------------------------------------------------------

_SCRIPT_PATH = (
    Path(__file__).resolve().parent.parent
    / "scripts"
    / "migrate_applications_sqlite_to_supabase.py"
)
_spec = importlib.util.spec_from_file_location(
    "migrate_applications_script", _SCRIPT_PATH
)
migrate_mod = importlib.util.module_from_spec(_spec)
sys.modules["migrate_applications_script"] = migrate_mod
_spec.loader.exec_module(migrate_mod)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_sqlite_db(tmp_path: Path, rows: List[Dict[str, Any]]) -> Path:
    """Create a test SQLite DB with an applications table seeded with `rows`."""
    db_path = tmp_path / "test_migrate.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT, company TEXT, location TEXT, url TEXT, source TEXT,
            salary_range TEXT, status TEXT DEFAULT 'found', date_found TEXT,
            date_applied TEXT, date_response TEXT, notes TEXT, profile_id TEXT,
            description TEXT, message_id TEXT, external_status TEXT,
            external_status_updated TEXT, portal_id INTEGER, withdraw_date TEXT
        )
        """
    )
    for r in rows:
        keys = ", ".join(r.keys())
        placeholders = ", ".join("?" * len(r))
        conn.execute(
            f"INSERT INTO applications ({keys}) VALUES ({placeholders})",
            list(r.values()),
        )
    conn.commit()
    conn.close()
    return db_path


# ---------------------------------------------------------------------------
# Row mapping
# ---------------------------------------------------------------------------


class TestMapSqliteRow:
    def test_maps_description_to_job_description(self):
        row = {"title": "X", "company": "Y", "description": "desc text"}
        payload = migrate_mod.map_sqlite_row_to_supabase(row, "user-uuid")
        assert payload["job_description"] == "desc text"
        assert "description" not in payload

    def test_casts_portal_id_to_str(self):
        row = {"title": "X", "company": "Y", "portal_id": 42}
        payload = migrate_mod.map_sqlite_row_to_supabase(row, "user-uuid")
        assert payload["portal_id"] == "42"

    def test_omits_portal_id_when_null(self):
        row = {"title": "X", "company": "Y", "portal_id": None}
        payload = migrate_mod.map_sqlite_row_to_supabase(row, "user-uuid")
        assert "portal_id" not in payload

    def test_sets_user_id(self):
        row = {"title": "X", "company": "Y"}
        payload = migrate_mod.map_sqlite_row_to_supabase(row, "user-uuid-123")
        assert payload["user_id"] == "user-uuid-123"

    def test_omits_null_timestamps(self):
        row = {"title": "X", "company": "Y", "date_applied": None,
               "date_response": None, "withdraw_date": None}
        payload = migrate_mod.map_sqlite_row_to_supabase(row, "u")
        for col in ("date_applied", "date_response", "withdraw_date"):
            assert col not in payload

    def test_includes_present_timestamps(self):
        row = {
            "title": "X", "company": "Y",
            "date_applied": "2026-04-15T10:00:00",
            "date_response": "2026-04-17T12:30:00",
        }
        payload = migrate_mod.map_sqlite_row_to_supabase(row, "u")
        assert payload["date_applied"] == "2026-04-15T10:00:00"
        assert payload["date_response"] == "2026-04-17T12:30:00"

    def test_preserves_empty_strings_for_required_fields(self):
        """Required columns (title, company, url, etc.) default to empty string."""
        row = {"title": None, "company": None}
        payload = migrate_mod.map_sqlite_row_to_supabase(row, "u")
        assert payload["title"] == ""
        assert payload["company"] == ""
        assert payload["url"] == ""


# ---------------------------------------------------------------------------
# read_sqlite_applications
# ---------------------------------------------------------------------------


class TestReadSqliteApplications:
    def test_returns_all_rows_as_dicts(self, tmp_path):
        db = _make_sqlite_db(tmp_path, [
            {"title": "A", "company": "X", "url": "https://a.com/1"},
            {"title": "B", "company": "Y", "url": "https://b.com/2"},
        ])
        rows = migrate_mod.read_sqlite_applications(db)
        assert len(rows) == 2
        assert rows[0]["title"] == "A"
        assert rows[1]["company"] == "Y"

    def test_empty_table_returns_empty_list(self, tmp_path):
        db = _make_sqlite_db(tmp_path, [])
        assert migrate_mod.read_sqlite_applications(db) == []


# ---------------------------------------------------------------------------
# migrate_applications — uses fake_supabase fixture from tests/conftest.py
# ---------------------------------------------------------------------------


class TestMigrateApplications:
    def test_dry_run_reads_but_writes_nothing(self, tmp_path, fake_supabase):
        from src.jobs.tracker import ApplicationTracker

        db = _make_sqlite_db(tmp_path, [
            {"title": "Engineer", "company": "Acme",
             "url": "https://a.com/1", "description": "JD"},
        ])
        tracker = ApplicationTracker()

        result = migrate_mod.migrate_applications(
            db, tracker, fake_supabase, dry_run=True
        )

        assert result.rows_read == 1
        assert result.rows_inserted == 1  # Would-be count
        assert result.rows_skipped_existing == 0
        assert result.errors == []
        # But the fake client has no rows
        assert len(fake_supabase._tables.get("applications", [])) == 0

    def test_live_run_inserts_all_rows(self, tmp_path, fake_supabase):
        from src.jobs.tracker import ApplicationTracker

        db = _make_sqlite_db(tmp_path, [
            {"title": "A", "company": "X", "url": "https://a.com/1"},
            {"title": "B", "company": "Y", "url": "https://b.com/2"},
        ])
        tracker = ApplicationTracker()

        result = migrate_mod.migrate_applications(
            db, tracker, fake_supabase, dry_run=False
        )

        assert result.rows_inserted == 2
        assert result.rows_skipped_existing == 0
        assert len(fake_supabase._tables["applications"]) == 2
        titles = {r["title"] for r in fake_supabase._tables["applications"]}
        assert titles == {"A", "B"}

    def test_idempotent_skips_existing_url(self, tmp_path, fake_supabase):
        """Re-running migration doesn't duplicate — URLs already in Supabase are skipped."""
        from src.jobs.tracker import ApplicationTracker

        tracker = ApplicationTracker()
        # Pre-seed Supabase with a row that has the same URL as one we'll migrate
        tracker.save_job({
            "title": "Pre-existing", "company": "X",
            "url": "https://a.com/1",
        })

        db = _make_sqlite_db(tmp_path, [
            {"title": "A", "company": "X", "url": "https://a.com/1"},  # dup
            {"title": "B", "company": "Y", "url": "https://b.com/2"},  # new
        ])
        result = migrate_mod.migrate_applications(
            db, tracker, fake_supabase, dry_run=False
        )

        assert result.rows_read == 2
        assert result.rows_inserted == 1  # Only the new one
        assert result.rows_skipped_existing == 1
        assert len(fake_supabase._tables["applications"]) == 2  # Pre-existing + new

    def test_empty_url_always_inserts(self, tmp_path, fake_supabase):
        """Rows with empty URL aren't deduped (can't be) — always inserted."""
        from src.jobs.tracker import ApplicationTracker

        db = _make_sqlite_db(tmp_path, [
            {"title": "A", "company": "X", "url": ""},
            {"title": "A", "company": "X", "url": ""},  # same title+company, empty url
        ])
        tracker = ApplicationTracker()

        result = migrate_mod.migrate_applications(
            db, tracker, fake_supabase, dry_run=False
        )

        assert result.rows_inserted == 2

    def test_description_becomes_job_description_in_supabase(
        self, tmp_path, fake_supabase
    ):
        from src.jobs.tracker import ApplicationTracker

        db = _make_sqlite_db(tmp_path, [
            {"title": "A", "company": "X", "url": "https://a.com/1",
             "description": "Long description text"},
        ])
        tracker = ApplicationTracker()

        migrate_mod.migrate_applications(db, tracker, fake_supabase, dry_run=False)

        row = fake_supabase._tables["applications"][0]
        assert row["job_description"] == "Long description text"

    def test_user_id_stamped_on_every_insert(self, tmp_path, fake_supabase):
        from src.jobs.tracker import ApplicationTracker

        db = _make_sqlite_db(tmp_path, [
            {"title": "A", "company": "X", "url": "https://a.com/1"},
            {"title": "B", "company": "Y", "url": "https://b.com/2"},
        ])
        tracker = ApplicationTracker()

        migrate_mod.migrate_applications(db, tracker, fake_supabase, dry_run=False)

        for row in fake_supabase._tables["applications"]:
            assert row["user_id"] == "00000000-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# finalize_sqlite_table
# ---------------------------------------------------------------------------


class TestFinalize:
    def test_renames_applications_table(self, tmp_path):
        db = _make_sqlite_db(tmp_path, [{"title": "X", "company": "Y"}])
        new_name = migrate_mod.finalize_sqlite_table(db)
        assert new_name.startswith("applications_deprecated_")

        conn = sqlite3.connect(str(db))
        try:
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (new_name,),
            )
            assert cur.fetchone() is not None, f"{new_name} should exist"

            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='applications'"
            )
            assert cur.fetchone() is None, "applications should no longer exist"
        finally:
            conn.close()

    def test_preserves_row_data(self, tmp_path):
        db = _make_sqlite_db(tmp_path, [
            {"title": "X", "company": "Y", "url": "https://x.com"},
        ])
        new_name = migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        try:
            rows = conn.execute(f'SELECT * FROM "{new_name}"').fetchall()
            assert len(rows) == 1
        finally:
            conn.close()

    def test_raises_when_applications_table_missing(self, tmp_path):
        db = tmp_path / "empty.db"
        conn = sqlite3.connect(str(db))
        conn.execute("CREATE TABLE other (id INTEGER)")
        conn.commit()
        conn.close()

        with pytest.raises(RuntimeError, match="does not exist"):
            migrate_mod.finalize_sqlite_table(db)


# ---------------------------------------------------------------------------
# main() — CLI entry point safety checks
# ---------------------------------------------------------------------------


class TestMainCli:
    def test_missing_db_returns_2(self, tmp_path):
        nonexistent = tmp_path / "does-not-exist.db"
        rc = migrate_mod.main(["--db-path", str(nonexistent), "--dry-run"])
        assert rc == 2

    def test_finalize_without_yes_returns_2(self, tmp_path, fake_supabase):
        db = _make_sqlite_db(tmp_path, [])
        rc = migrate_mod.main(["--db-path", str(db), "--finalize"])
        assert rc == 2

    def test_finalize_with_yes_renames(self, tmp_path, fake_supabase):
        db = _make_sqlite_db(tmp_path, [])
        rc = migrate_mod.main(["--db-path", str(db), "--finalize", "--yes"])
        assert rc == 0
