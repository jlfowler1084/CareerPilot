"""Tests for ATS portal tracker."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

import pytest

from src.db import models
from src.jobs.tracker import ApplicationTracker


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


class TestStalePortals:
    def test_stale_detection(self, conn):
        """Portal checked 8 days ago with pending app is stale."""
        pid = models.add_portal(conn, "Acme", "Workday", "https://acme.wd.com")
        eight_days_ago = (datetime.now() - timedelta(days=8)).isoformat()
        models.update_portal(conn, pid, last_checked=eight_days_ago)

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
