"""Tests for recruiter relationship tracker CRUD."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from src.db import models


@pytest.fixture
def conn(tmp_path):
    """Create a test database connection with schema."""
    db_path = tmp_path / "test.db"
    c = models.get_connection(db_path)
    yield c
    c.close()


class TestAddRecruiter:
    def test_adds_recruiter(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        assert rid is not None
        assert rid > 0

    def test_adds_with_all_fields(self, conn):
        rid = models.add_recruiter(
            conn, "Mike Chen", "Robert Half",
            email="mike@roberthalf.com",
            phone="317-555-1234",
            linkedin_url="https://linkedin.com/in/mikechen",
            specialization="Infrastructure",
            notes="Met at career fair",
        )
        r = models.get_recruiter(conn, rid)
        assert r["name"] == "Mike Chen"
        assert r["agency"] == "Robert Half"
        assert r["email"] == "mike@roberthalf.com"
        assert r["phone"] == "317-555-1234"
        assert r["specialization"] == "Infrastructure"

    def test_default_status_is_new(self, conn):
        rid = models.add_recruiter(conn, "Jane Doe", "Kforce")
        r = models.get_recruiter(conn, rid)
        assert r["relationship_status"] == "new"


class TestGetRecruiter:
    def test_returns_dict(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        r = models.get_recruiter(conn, rid)
        assert isinstance(r, dict)
        assert r["name"] == "Sarah Kim"

    def test_returns_none_for_missing(self, conn):
        r = models.get_recruiter(conn, 9999)
        assert r is None


class TestListRecruiters:
    def test_returns_all(self, conn):
        models.add_recruiter(conn, "Alice", "Kforce")
        models.add_recruiter(conn, "Bob", "TEKsystems")
        models.add_recruiter(conn, "Carol", "Apex Systems")

        result = models.list_recruiters(conn)
        assert len(result) == 3

    def test_sorted_by_agency(self, conn):
        models.add_recruiter(conn, "Zed", "TEKsystems")
        models.add_recruiter(conn, "Alice", "Apex Systems")
        models.add_recruiter(conn, "Mike", "Kforce")

        result = models.list_recruiters(conn)
        agencies = [r["agency"] for r in result]
        assert agencies == sorted(agencies)

    def test_empty_list(self, conn):
        result = models.list_recruiters(conn)
        assert result == []


class TestUpdateRecruiter:
    def test_updates_fields(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        result = models.update_recruiter(conn, rid, relationship_status="active")
        assert result is True

        r = models.get_recruiter(conn, rid)
        assert r["relationship_status"] == "active"

    def test_updates_multiple_fields(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        models.update_recruiter(
            conn, rid,
            email="sarah@teksystems.com",
            specialization="DevOps",
            relationship_status="warm",
        )
        r = models.get_recruiter(conn, rid)
        assert r["email"] == "sarah@teksystems.com"
        assert r["specialization"] == "DevOps"
        assert r["relationship_status"] == "warm"

    def test_returns_false_for_missing(self, conn):
        result = models.update_recruiter(conn, 9999, name="Nobody")
        assert result is False

    def test_ignores_unknown_fields(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        result = models.update_recruiter(conn, rid, bogus_field="xyz")
        assert result is False


class TestGetStaleRecruiters:
    def test_finds_stale_active(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        old_date = (datetime.now() - timedelta(days=20)).isoformat(timespec="seconds")
        models.update_recruiter(
            conn, rid,
            relationship_status="active",
            last_contact=old_date,
        )

        stale = models.get_stale_recruiters(conn)
        assert len(stale) == 1
        assert stale[0]["name"] == "Sarah Kim"

    def test_finds_stale_warm(self, conn):
        rid = models.add_recruiter(conn, "Mike Chen", "Robert Half")
        old_date = (datetime.now() - timedelta(days=15)).isoformat(timespec="seconds")
        models.update_recruiter(
            conn, rid,
            relationship_status="warm",
            last_contact=old_date,
        )

        stale = models.get_stale_recruiters(conn)
        assert len(stale) == 1

    def test_ignores_recent_contact(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        recent = (datetime.now() - timedelta(days=3)).isoformat(timespec="seconds")
        models.update_recruiter(
            conn, rid,
            relationship_status="active",
            last_contact=recent,
        )

        stale = models.get_stale_recruiters(conn)
        assert len(stale) == 0

    def test_ignores_cold_status(self, conn):
        rid = models.add_recruiter(conn, "Old Contact", "Kforce")
        old_date = (datetime.now() - timedelta(days=30)).isoformat(timespec="seconds")
        models.update_recruiter(
            conn, rid,
            relationship_status="cold",
            last_contact=old_date,
        )

        stale = models.get_stale_recruiters(conn)
        assert len(stale) == 0

    def test_ignores_do_not_contact(self, conn):
        rid = models.add_recruiter(conn, "Blocked", "Randstad")
        old_date = (datetime.now() - timedelta(days=30)).isoformat(timespec="seconds")
        models.update_recruiter(
            conn, rid,
            relationship_status="do_not_contact",
            last_contact=old_date,
        )

        stale = models.get_stale_recruiters(conn)
        assert len(stale) == 0

    def test_custom_days_threshold(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        date_10_days = (datetime.now() - timedelta(days=10)).isoformat(timespec="seconds")
        models.update_recruiter(
            conn, rid,
            relationship_status="active",
            last_contact=date_10_days,
        )

        # Default 14 days — should not be stale
        assert len(models.get_stale_recruiters(conn)) == 0
        # Custom 7 days — should be stale
        assert len(models.get_stale_recruiters(conn, days=7)) == 1


class TestLogRecruiterContact:
    def test_updates_last_contact(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        result = models.log_recruiter_contact(conn, rid, "email", "Sent resume")
        assert result is True

        r = models.get_recruiter(conn, rid)
        assert r["last_contact"] is not None
        assert r["contact_method"] == "email"

    def test_appends_to_notes(self, conn):
        rid = models.add_recruiter(
            conn, "Sarah Kim", "TEKsystems", notes="Initial contact"
        )
        models.log_recruiter_contact(conn, rid, "phone", "Discussed role")

        r = models.get_recruiter(conn, rid)
        assert "Initial contact" in r["notes"]
        assert "(phone) Discussed role" in r["notes"]

    def test_multiple_logs_append(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        models.log_recruiter_contact(conn, rid, "email", "First contact")
        models.log_recruiter_contact(conn, rid, "phone", "Follow-up call")

        r = models.get_recruiter(conn, rid)
        assert "(email) First contact" in r["notes"]
        assert "(phone) Follow-up call" in r["notes"]

    def test_returns_false_for_missing(self, conn):
        result = models.log_recruiter_contact(conn, 9999, "email")
        assert result is False

    def test_log_without_note(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        models.log_recruiter_contact(conn, rid, "linkedin")

        r = models.get_recruiter(conn, rid)
        assert "(linkedin)" in r["notes"]


class TestRelationshipStatusTransitions:
    def test_new_to_active(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        models.update_recruiter(conn, rid, relationship_status="active")
        r = models.get_recruiter(conn, rid)
        assert r["relationship_status"] == "active"

    def test_active_to_warm(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        models.update_recruiter(conn, rid, relationship_status="active")
        models.update_recruiter(conn, rid, relationship_status="warm")
        r = models.get_recruiter(conn, rid)
        assert r["relationship_status"] == "warm"

    def test_warm_to_cold(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        models.update_recruiter(conn, rid, relationship_status="warm")
        models.update_recruiter(conn, rid, relationship_status="cold")
        r = models.get_recruiter(conn, rid)
        assert r["relationship_status"] == "cold"

    def test_to_do_not_contact(self, conn):
        rid = models.add_recruiter(conn, "Sarah Kim", "TEKsystems")
        models.update_recruiter(conn, rid, relationship_status="do_not_contact")
        r = models.get_recruiter(conn, rid)
        assert r["relationship_status"] == "do_not_contact"
