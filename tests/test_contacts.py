"""Tests for contacts SQLite helpers (interaction/role tables only).

Contact CRUD (add_contact, list_contacts, etc.) moved to ContactManager
(Supabase-backed) — tested in test_contact_manager.py.
"""

from __future__ import annotations

import sqlite3

import pytest

from src.db import models


@pytest.fixture
def conn(tmp_path):
    """Create a test database connection with schema."""
    db_path = tmp_path / "test.db"
    c = models.get_connection(db_path)
    yield c
    c.close()


def _seed_contact(conn, name="Test Contact"):
    """Insert a minimal contact row directly; returns its INTEGER id."""
    cursor = conn.execute(
        "INSERT INTO contacts (name, contact_type) VALUES (?, 'recruiter')",
        (name,),
    )
    conn.commit()
    return cursor.lastrowid


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

    def test_contact_interactions_has_contact_uuid_column(self, conn):
        cols = [r[1] for r in conn.execute(
            "PRAGMA table_info(contact_interactions)"
        ).fetchall()]
        assert "contact_uuid" in cols
        assert "contact_id" not in cols

    def test_submitted_roles_has_contact_uuid_column(self, conn):
        cols = [r[1] for r in conn.execute(
            "PRAGMA table_info(submitted_roles)"
        ).fetchall()]
        assert "contact_uuid" in cols
        assert "contact_id" not in cols


# --- Contact Interactions Tests ---


class TestContactInteractions:
    def test_add_interaction(self, conn):
        cid = _seed_contact(conn, "David Perez")
        iid = models.add_contact_interaction(
            conn, str(cid), "email", "inbound",
            subject="MISO Systems Admin",
            summary="Presented for sys admin role",
        )
        assert iid > 0

    def test_get_interactions(self, conn):
        cid = _seed_contact(conn, "David Perez")
        models.add_contact_interaction(conn, str(cid), "email", subject="First")
        models.add_contact_interaction(conn, str(cid), "call", subject="Second")
        interactions = models.get_contact_interactions(conn, str(cid))
        assert len(interactions) == 2

    def test_get_interactions_limit(self, conn):
        cid = _seed_contact(conn)
        for i in range(5):
            models.add_contact_interaction(conn, str(cid), "email", subject=str(i))
        assert len(models.get_contact_interactions(conn, str(cid), limit=3)) == 3

    def test_get_interactions_empty(self, conn):
        assert models.get_contact_interactions(conn, "nonexistent-uuid") == []

    def test_interaction_stored_with_uuid(self, conn):
        cid = _seed_contact(conn)
        models.add_contact_interaction(conn, str(cid), "phone")
        row = conn.execute("SELECT contact_uuid FROM contact_interactions").fetchone()
        assert row["contact_uuid"] == str(cid)


# --- Submitted Roles Tests ---


class TestSubmittedRoles:
    def test_add_role(self, conn):
        cid = _seed_contact(conn, "David Perez")
        rid = models.add_submitted_role(
            conn, str(cid), "MISO Energy", "Systems Administrator",
            pay_rate="$45/hr", location="Indianapolis, IN",
        )
        assert rid > 0

    def test_get_roles_by_contact(self, conn):
        cid = _seed_contact(conn, "David Perez")
        models.add_submitted_role(conn, str(cid), "MISO", "Sys Admin")
        models.add_submitted_role(conn, str(cid), "Corteva", "Desktop Support")
        roles = models.get_submitted_roles(conn, contact_uuid=str(cid))
        assert len(roles) == 2

    def test_get_roles_by_status(self, conn):
        cid = _seed_contact(conn, "David Perez")
        r1 = models.add_submitted_role(conn, str(cid), "MISO", "Sys Admin")
        models.add_submitted_role(conn, str(cid), "Corteva", "Desktop Support")
        models.update_role_status(conn, r1, "interviewing")
        roles = models.get_submitted_roles(conn, status="interviewing")
        assert len(roles) == 1
        assert roles[0]["status"] == "interviewing"

    def test_update_role_status(self, conn):
        cid = _seed_contact(conn, "David Perez")
        rid = models.add_submitted_role(conn, str(cid), "MISO", "Sys Admin")
        models.update_role_status(conn, rid, "offered", "Great news!")
        roles = models.get_submitted_roles(conn, contact_uuid=str(cid))
        assert roles[0]["status"] == "offered"

    def test_get_all_roles(self, conn):
        c1 = _seed_contact(conn, "Alice")
        c2 = _seed_contact(conn, "Bob")
        models.add_submitted_role(conn, str(c1), "CompA", "Role1")
        models.add_submitted_role(conn, str(c2), "CompB", "Role2")
        assert len(models.get_submitted_roles(conn)) == 2

    def test_role_stored_with_uuid(self, conn):
        cid = _seed_contact(conn)
        models.add_submitted_role(conn, str(cid), "Corp", "Engineer")
        row = conn.execute("SELECT contact_uuid FROM submitted_roles").fetchone()
        assert row["contact_uuid"] == str(cid)
