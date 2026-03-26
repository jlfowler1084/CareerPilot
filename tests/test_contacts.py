"""Tests for professional contacts manager CRUD and migration."""

from __future__ import annotations

import os
import sqlite3
import tempfile
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


# --- Schema Tests ---


class TestSchema:
    def test_contacts_table_exists(self, conn):
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'"
        ).fetchone()
        assert row is not None

    def test_contact_interactions_table_exists(self, conn):
        row = conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='contact_interactions'"
        ).fetchone()
        assert row is not None

    def test_submitted_roles_table_exists(self, conn):
        row = conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='submitted_roles'"
        ).fetchone()
        assert row is not None

    def test_no_old_recruiters_table(self, conn):
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='recruiters'"
        ).fetchone()
        assert row is None


# --- Migration Tests ---


class TestMigrationFromRecruiters:
    def test_migrates_recruiter_data(self, tmp_path):
        """Recruiters table data should be migrated to contacts."""
        db_path = tmp_path / "migrate.db"
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        # Create old recruiters table
        c.execute(
            "CREATE TABLE recruiters ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "name TEXT NOT NULL, agency TEXT NOT NULL, email TEXT, "
            "phone TEXT, linkedin_url TEXT, specialization TEXT, "
            "last_contact TEXT, contact_method TEXT, "
            "relationship_status TEXT DEFAULT 'new', "
            "notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
        )
        c.execute(
            "INSERT INTO recruiters (name, agency, email, specialization) "
            "VALUES ('Sarah Kim', 'TEKsystems', 'sarah@tek.com', 'DevOps')"
        )
        c.execute(
            "INSERT INTO recruiters (name, agency, relationship_status) "
            "VALUES ('Mike Chen', 'Robert Half', 'active')"
        )
        c.commit()
        c.close()

        # Now open with get_connection which triggers migration
        conn = models.get_connection(db_path)

        # Old table gone
        old = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='recruiters'"
        ).fetchone()
        assert old is None

        # Data in contacts
        contacts = models.list_contacts(conn)
        assert len(contacts) == 2

        sarah = [c for c in contacts if c["name"] == "Sarah Kim"][0]
        assert sarah["company"] == "TEKsystems"
        assert sarah["contact_type"] == "recruiter"
        assert sarah["source"] == "staffing_agency"
        assert sarah["email"] == "sarah@tek.com"
        assert sarah["specialization"] == "DevOps"

        mike = [c for c in contacts if c["name"] == "Mike Chen"][0]
        assert mike["company"] == "Robert Half"
        assert mike["relationship_status"] == "active"

        conn.close()

    def test_migration_idempotent(self, tmp_path):
        """Running migration twice should not duplicate data."""
        db_path = tmp_path / "idem.db"
        conn1 = models.get_connection(db_path)
        models.add_contact(conn1, "Test User", "recruiter", company="TestCo")
        conn1.close()

        conn2 = models.get_connection(db_path)
        contacts = models.list_contacts(conn2)
        assert len(contacts) == 1
        conn2.close()


class TestMigrationFromTrackerDb:
    def test_migrates_tracker_recruiters(self, tmp_path, monkeypatch):
        """RecruiterTracker DB data should be merged into contacts."""
        # Set DATA_DIR to tmp_path so migration finds our fake tracker db
        monkeypatch.setattr(models.settings, "DATA_DIR", tmp_path)

        # Create a recruiter_tracker.db
        tracker_path = tmp_path / "recruiter_tracker.db"
        tc = sqlite3.connect(str(tracker_path))
        tc.execute(
            "CREATE TABLE recruiters ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, "
            "agency TEXT NOT NULL, title TEXT, specialties TEXT, "
            "notes TEXT, status TEXT DEFAULT 'active', "
            "created_at TEXT DEFAULT (datetime('now')), "
            "updated_at TEXT DEFAULT (datetime('now')))"
        )
        tc.execute(
            "INSERT INTO recruiters (id, name, agency, email, title) "
            "VALUES (1, 'David Perez', 'TEKsystems', 'dperez@tek.com', 'Sr. Recruiter')"
        )
        tc.execute(
            "CREATE TABLE interactions ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "recruiter_id INTEGER NOT NULL, interaction_type TEXT NOT NULL, "
            "direction TEXT DEFAULT 'inbound', subject TEXT, summary TEXT, "
            "roles_discussed TEXT, follow_up_date TEXT, "
            "created_at TEXT DEFAULT (datetime('now')))"
        )
        tc.execute(
            "INSERT INTO interactions (recruiter_id, interaction_type, direction, subject) "
            "VALUES (1, 'email', 'inbound', 'MISO Systems Admin')"
        )
        tc.execute(
            "CREATE TABLE submitted_roles ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "recruiter_id INTEGER NOT NULL, company TEXT NOT NULL, "
            "role_title TEXT NOT NULL, status TEXT DEFAULT 'submitted', "
            "submitted_date TEXT, notes TEXT, pay_rate TEXT, location TEXT, "
            "role_type TEXT DEFAULT 'contract', "
            "created_at TEXT DEFAULT (datetime('now')), "
            "updated_at TEXT DEFAULT (datetime('now')))"
        )
        tc.execute(
            "INSERT INTO submitted_roles (recruiter_id, company, role_title, location) "
            "VALUES (1, 'MISO Energy', 'Systems Administrator', 'Indianapolis, IN')"
        )
        tc.commit()
        tc.close()

        # Open main db with migration
        db_path = tmp_path / "careerpilot.db"
        conn = models.get_connection(db_path)

        contacts = models.list_contacts(conn)
        assert len(contacts) == 1
        assert contacts[0]["name"] == "David Perez"
        assert contacts[0]["company"] == "TEKsystems"
        assert contacts[0]["title"] == "Sr. Recruiter"

        interactions = models.get_contact_interactions(conn, contacts[0]["id"])
        assert len(interactions) == 1
        assert interactions[0]["subject"] == "MISO Systems Admin"

        roles = models.get_submitted_roles(conn, contact_id=contacts[0]["id"])
        assert len(roles) == 1
        assert roles[0]["company"] == "MISO Energy"
        assert roles[0]["role_title"] == "Systems Administrator"

        conn.close()

    def test_deduplicates_by_email(self, tmp_path, monkeypatch):
        """Contacts with same email should not be duplicated during migration."""
        monkeypatch.setattr(models.settings, "DATA_DIR", tmp_path)

        # Create tracker db with a recruiter
        tracker_path = tmp_path / "recruiter_tracker.db"
        tc = sqlite3.connect(str(tracker_path))
        tc.execute(
            "CREATE TABLE recruiters ("
            "id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, "
            "phone TEXT, agency TEXT NOT NULL, title TEXT, specialties TEXT, "
            "notes TEXT, status TEXT DEFAULT 'active', "
            "created_at TEXT DEFAULT (datetime('now')), "
            "updated_at TEXT DEFAULT (datetime('now')))"
        )
        tc.execute(
            "INSERT INTO recruiters (id, name, agency, email) "
            "VALUES (1, 'Dupe Person', 'Agency', 'dupe@test.com')"
        )
        tc.commit()
        tc.close()

        # Pre-populate main db with same email
        db_path = tmp_path / "careerpilot.db"
        # First create schema without migration (no tracker yet)
        c = sqlite3.connect(str(db_path))
        c.executescript(models.SCHEMA_SQL)
        c.execute(
            "INSERT INTO contacts (name, company, email, contact_type) "
            "VALUES ('Dupe Person', 'Agency', 'dupe@test.com', 'recruiter')"
        )
        c.commit()
        c.close()

        # Now open with migration
        conn = models.get_connection(db_path)
        contacts = models.list_contacts(conn)
        assert len(contacts) == 1  # No duplicate
        conn.close()


# --- Add Contact Tests ---


class TestAddContact:
    def test_adds_contact(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        assert cid is not None
        assert cid > 0

    def test_adds_with_all_fields(self, conn):
        cid = models.add_contact(
            conn, "Mike Chen", "hiring_manager",
            company="Eli Lilly", title="Engineering Manager",
            email="mike@lilly.com", phone="317-555-1234",
            linkedin_url="https://linkedin.com/in/mikechen",
            specialization="Infrastructure", source="job_application",
            tags="pharma,priority", notes="Met at career fair",
        )
        c = models.get_contact(conn, cid)
        assert c["name"] == "Mike Chen"
        assert c["company"] == "Eli Lilly"
        assert c["contact_type"] == "hiring_manager"
        assert c["email"] == "mike@lilly.com"
        assert c["tags"] == "pharma,priority"

    def test_default_type_is_recruiter(self, conn):
        cid = models.add_contact(conn, "Jane Doe")
        c = models.get_contact(conn, cid)
        assert c["contact_type"] == "recruiter"

    def test_default_status_is_new(self, conn):
        cid = models.add_contact(conn, "Jane Doe", "recruiter")
        c = models.get_contact(conn, cid)
        assert c["relationship_status"] == "new"


# --- Get Contact Tests ---


class TestGetContact:
    def test_returns_dict(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        c = models.get_contact(conn, cid)
        assert isinstance(c, dict)
        assert c["name"] == "Sarah Kim"

    def test_returns_none_for_missing(self, conn):
        c = models.get_contact(conn, 9999)
        assert c is None


# --- List Contacts Tests ---


class TestListContacts:
    def test_returns_all(self, conn):
        models.add_contact(conn, "Alice", "recruiter")
        models.add_contact(conn, "Bob", "hiring_manager")
        models.add_contact(conn, "Carol", "networking")
        assert len(models.list_contacts(conn)) == 3

    def test_filter_by_type(self, conn):
        models.add_contact(conn, "Alice", "recruiter")
        models.add_contact(conn, "Bob", "hiring_manager")
        result = models.list_contacts(conn, contact_type="recruiter")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

    def test_filter_by_status(self, conn):
        cid = models.add_contact(conn, "Alice", "recruiter")
        models.update_contact(conn, cid, relationship_status="active")
        models.add_contact(conn, "Bob", "recruiter")

        result = models.list_contacts(conn, status="active")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

    def test_filter_by_tag(self, conn):
        cid = models.add_contact(conn, "Alice", "recruiter", tags="indy,priority")
        models.add_contact(conn, "Bob", "recruiter", tags="remote")

        result = models.list_contacts(conn, tag="indy")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

    def test_empty_list(self, conn):
        assert models.list_contacts(conn) == []

    def test_sorted_by_company(self, conn):
        models.add_contact(conn, "Zed", "recruiter", company="TEKsystems")
        models.add_contact(conn, "Alice", "recruiter", company="Apex Systems")
        result = models.list_contacts(conn)
        companies = [r["company"] for r in result]
        assert companies == sorted(companies)


# --- Update Contact Tests ---


class TestUpdateContact:
    def test_updates_fields(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        result = models.update_contact(conn, cid, relationship_status="active")
        assert result is True
        c = models.get_contact(conn, cid)
        assert c["relationship_status"] == "active"

    def test_updates_multiple_fields(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.update_contact(
            conn, cid,
            email="sarah@teksystems.com",
            specialization="DevOps",
            relationship_status="warm",
        )
        c = models.get_contact(conn, cid)
        assert c["email"] == "sarah@teksystems.com"
        assert c["specialization"] == "DevOps"
        assert c["relationship_status"] == "warm"

    def test_returns_false_for_missing(self, conn):
        assert models.update_contact(conn, 9999, name="Nobody") is False

    def test_ignores_unknown_fields(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        result = models.update_contact(conn, cid, bogus_field="xyz")
        assert result is False


# --- Delete Contact Tests ---


class TestDeleteContact:
    def test_soft_delete(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        result = models.delete_contact(conn, cid)
        assert result is True
        c = models.get_contact(conn, cid)
        assert c["relationship_status"] == "do_not_contact"

    def test_hard_delete(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        result = models.delete_contact(conn, cid, force=True)
        assert result is True
        assert models.get_contact(conn, cid) is None

    def test_hard_delete_cascades(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.add_contact_interaction(conn, cid, "email")
        models.add_submitted_role(conn, cid, "CompanyA", "Role1")
        models.delete_contact(conn, cid, force=True)
        assert models.get_contact_interactions(conn, cid) == []
        assert models.get_submitted_roles(conn, contact_id=cid) == []

    def test_returns_false_for_missing(self, conn):
        assert models.delete_contact(conn, 9999) is False


# --- Search Contacts Tests ---


class TestSearchContacts:
    def test_search_by_name(self, conn):
        models.add_contact(conn, "Sarah Kim", "recruiter")
        models.add_contact(conn, "Mike Chen", "recruiter")
        result = models.search_contacts(conn, "Sarah")
        assert len(result) == 1
        assert result[0]["name"] == "Sarah Kim"

    def test_search_by_company(self, conn):
        models.add_contact(conn, "Alice", "recruiter", company="TEKsystems")
        models.add_contact(conn, "Bob", "recruiter", company="Kforce")
        result = models.search_contacts(conn, "TEK")
        assert len(result) == 1

    def test_search_by_email(self, conn):
        models.add_contact(conn, "Alice", "recruiter", email="alice@tek.com")
        result = models.search_contacts(conn, "tek.com")
        assert len(result) == 1

    def test_search_by_notes(self, conn):
        models.add_contact(conn, "Alice", "recruiter", notes="Met at career fair")
        result = models.search_contacts(conn, "career fair")
        assert len(result) == 1

    def test_search_no_results(self, conn):
        models.add_contact(conn, "Alice", "recruiter")
        assert models.search_contacts(conn, "zzzzz") == []


# --- Log Contact Interaction Tests ---


class TestLogContactInteraction:
    def test_updates_last_contact(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        result = models.log_contact_interaction(conn, cid, "email", "Sent resume")
        assert result is True
        c = models.get_contact(conn, cid)
        assert c["last_contact"] is not None
        assert c["contact_method"] == "email"

    def test_appends_to_notes(self, conn):
        cid = models.add_contact(
            conn, "Sarah Kim", "recruiter", notes="Initial contact"
        )
        models.log_contact_interaction(conn, cid, "phone", "Discussed role")
        c = models.get_contact(conn, cid)
        assert "Initial contact" in c["notes"]
        assert "(phone) Discussed role" in c["notes"]

    def test_multiple_logs_append(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.log_contact_interaction(conn, cid, "email", "First contact")
        models.log_contact_interaction(conn, cid, "phone", "Follow-up call")
        c = models.get_contact(conn, cid)
        assert "(email) First contact" in c["notes"]
        assert "(phone) Follow-up call" in c["notes"]

    def test_returns_false_for_missing(self, conn):
        assert models.log_contact_interaction(conn, 9999, "email") is False

    def test_log_without_note(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.log_contact_interaction(conn, cid, "linkedin")
        c = models.get_contact(conn, cid)
        assert "(linkedin)" in c["notes"]


# --- Stale Contacts Tests ---


class TestGetStaleContacts:
    def test_finds_stale_active(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        old_date = (datetime.now() - timedelta(days=20)).isoformat(timespec="seconds")
        models.update_contact(
            conn, cid, relationship_status="active", last_contact=old_date,
        )
        stale = models.get_stale_contacts(conn)
        assert len(stale) == 1
        assert stale[0]["name"] == "Sarah Kim"

    def test_finds_stale_warm(self, conn):
        cid = models.add_contact(conn, "Mike Chen", "recruiter")
        old_date = (datetime.now() - timedelta(days=15)).isoformat(timespec="seconds")
        models.update_contact(
            conn, cid, relationship_status="warm", last_contact=old_date,
        )
        assert len(models.get_stale_contacts(conn)) == 1

    def test_ignores_recent_contact(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        recent = (datetime.now() - timedelta(days=3)).isoformat(timespec="seconds")
        models.update_contact(
            conn, cid, relationship_status="active", last_contact=recent,
        )
        assert len(models.get_stale_contacts(conn)) == 0

    def test_ignores_cold_status(self, conn):
        cid = models.add_contact(conn, "Old Contact", "recruiter")
        old_date = (datetime.now() - timedelta(days=30)).isoformat(timespec="seconds")
        models.update_contact(
            conn, cid, relationship_status="cold", last_contact=old_date,
        )
        assert len(models.get_stale_contacts(conn)) == 0

    def test_ignores_do_not_contact(self, conn):
        cid = models.add_contact(conn, "Blocked", "recruiter")
        old_date = (datetime.now() - timedelta(days=30)).isoformat(timespec="seconds")
        models.update_contact(
            conn, cid, relationship_status="do_not_contact", last_contact=old_date,
        )
        assert len(models.get_stale_contacts(conn)) == 0

    def test_custom_days_threshold(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        date_10_days = (datetime.now() - timedelta(days=10)).isoformat(timespec="seconds")
        models.update_contact(
            conn, cid, relationship_status="active", last_contact=date_10_days,
        )
        assert len(models.get_stale_contacts(conn)) == 0
        assert len(models.get_stale_contacts(conn, days=7)) == 1


# --- Follow-up Due Tests ---


class TestGetFollowupDue:
    def test_finds_due_followup(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        models.update_contact(conn, cid, next_followup=yesterday)
        due = models.get_followup_due(conn)
        assert len(due) == 1

    def test_finds_today_followup(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        today = datetime.now().strftime("%Y-%m-%d")
        models.update_contact(conn, cid, next_followup=today)
        due = models.get_followup_due(conn)
        assert len(due) == 1

    def test_ignores_future_followup(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        future = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        models.update_contact(conn, cid, next_followup=future)
        assert len(models.get_followup_due(conn)) == 0


# --- Tag Tests ---


class TestTags:
    def test_add_tag(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.add_tag(conn, cid, "indy")
        c = models.get_contact(conn, cid)
        assert "indy" in c["tags"]

    def test_add_multiple_tags(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.add_tag(conn, cid, "indy")
        models.add_tag(conn, cid, "priority")
        c = models.get_contact(conn, cid)
        assert "indy" in c["tags"]
        assert "priority" in c["tags"]

    def test_add_duplicate_tag(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.add_tag(conn, cid, "indy")
        models.add_tag(conn, cid, "indy")
        c = models.get_contact(conn, cid)
        assert c["tags"].count("indy") == 1

    def test_remove_tag(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter", tags="indy,priority")
        models.remove_tag(conn, cid, "indy")
        c = models.get_contact(conn, cid)
        assert "indy" not in c["tags"]
        assert "priority" in c["tags"]

    def test_remove_nonexistent_tag(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter", tags="indy")
        result = models.remove_tag(conn, cid, "bogus")
        assert result is True  # Succeeds, just no-op

    def test_returns_false_for_missing_contact(self, conn):
        assert models.add_tag(conn, 9999, "test") is False
        assert models.remove_tag(conn, 9999, "test") is False


# --- Contact Interactions Tests ---


class TestContactInteractions:
    def test_add_interaction(self, conn):
        cid = models.add_contact(conn, "David Perez", "recruiter")
        iid = models.add_contact_interaction(
            conn, cid, "email", "inbound",
            subject="MISO Systems Admin",
            summary="Presented for sys admin role",
        )
        assert iid > 0

    def test_get_interactions(self, conn):
        cid = models.add_contact(conn, "David Perez", "recruiter")
        models.add_contact_interaction(conn, cid, "email", subject="First")
        models.add_contact_interaction(conn, cid, "call", subject="Second")
        interactions = models.get_contact_interactions(conn, cid)
        assert len(interactions) == 2

    def test_interaction_updates_last_contact(self, conn):
        cid = models.add_contact(conn, "David Perez", "recruiter")
        models.add_contact_interaction(conn, cid, "email")
        c = models.get_contact(conn, cid)
        assert c["last_contact"] is not None


# --- Submitted Roles Tests ---


class TestSubmittedRoles:
    def test_add_role(self, conn):
        cid = models.add_contact(conn, "David Perez", "recruiter")
        rid = models.add_submitted_role(
            conn, cid, "MISO Energy", "Systems Administrator",
            pay_rate="$45/hr", location="Indianapolis, IN",
        )
        assert rid > 0

    def test_get_roles_by_contact(self, conn):
        cid = models.add_contact(conn, "David Perez", "recruiter")
        models.add_submitted_role(conn, cid, "MISO", "Sys Admin")
        models.add_submitted_role(conn, cid, "Corteva", "Desktop Support")
        roles = models.get_submitted_roles(conn, contact_id=cid)
        assert len(roles) == 2

    def test_get_roles_by_status(self, conn):
        cid = models.add_contact(conn, "David Perez", "recruiter")
        r1 = models.add_submitted_role(conn, cid, "MISO", "Sys Admin")
        models.add_submitted_role(conn, cid, "Corteva", "Desktop Support")
        models.update_role_status(conn, r1, "interviewing")
        roles = models.get_submitted_roles(conn, status="interviewing")
        assert len(roles) == 1
        assert roles[0]["status"] == "interviewing"

    def test_update_role_status(self, conn):
        cid = models.add_contact(conn, "David Perez", "recruiter")
        rid = models.add_submitted_role(conn, cid, "MISO", "Sys Admin")
        models.update_role_status(conn, rid, "offered", "Great news!")
        roles = models.get_submitted_roles(conn, contact_id=cid)
        assert roles[0]["status"] == "offered"


# --- Summary Tests ---


class TestContactsSummary:
    def test_summary(self, conn):
        cid = models.add_contact(conn, "Test", "recruiter", company="AgencyA")
        models.add_submitted_role(conn, cid, "CompA", "Role1")
        models.add_contact_interaction(conn, cid, "call")
        summary = models.get_contacts_summary(conn)
        assert summary["active_contacts"] >= 1
        assert summary["total_roles_submitted"] == 1
        assert summary["total_interactions"] == 1


# --- Find by Email Tests ---


class TestFindContactByEmail:
    def test_finds_by_email(self, conn):
        models.add_contact(conn, "Sarah Kim", "recruiter", email="sarah@tek.com")
        c = models.find_contact_by_email(conn, "sarah@tek.com")
        assert c is not None
        assert c["name"] == "Sarah Kim"

    def test_case_insensitive(self, conn):
        models.add_contact(conn, "Sarah Kim", "recruiter", email="Sarah@Tek.com")
        c = models.find_contact_by_email(conn, "sarah@tek.com")
        assert c is not None

    def test_returns_none_for_missing(self, conn):
        assert models.find_contact_by_email(conn, "nobody@test.com") is None


# --- Relationship Status Transitions ---


class TestRelationshipStatusTransitions:
    def test_new_to_active(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.update_contact(conn, cid, relationship_status="active")
        c = models.get_contact(conn, cid)
        assert c["relationship_status"] == "active"

    def test_active_to_warm(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.update_contact(conn, cid, relationship_status="active")
        models.update_contact(conn, cid, relationship_status="warm")
        c = models.get_contact(conn, cid)
        assert c["relationship_status"] == "warm"

    def test_to_do_not_contact(self, conn):
        cid = models.add_contact(conn, "Sarah Kim", "recruiter")
        models.update_contact(conn, cid, relationship_status="do_not_contact")
        c = models.get_contact(conn, cid)
        assert c["relationship_status"] == "do_not_contact"
