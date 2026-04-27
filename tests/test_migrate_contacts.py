"""Tests for scripts/migrate_contacts_sqlite_to_supabase.py (CAR-172)."""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest


# ---------------------------------------------------------------------------
# Dynamically load the migration script
# ---------------------------------------------------------------------------

_SCRIPT_PATH = (
    Path(__file__).resolve().parent.parent
    / "scripts"
    / "migrate_contacts_sqlite_to_supabase.py"
)
_spec = importlib.util.spec_from_file_location(
    "migrate_contacts_script", _SCRIPT_PATH
)
migrate_mod = importlib.util.module_from_spec(_spec)
sys.modules["migrate_contacts_script"] = migrate_mod
_spec.loader.exec_module(migrate_mod)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_contacts_db(tmp_path: Path, rows: List[Dict[str, Any]]) -> Path:
    """Create a test SQLite DB with the legacy contacts schema seeded with rows."""
    db_path = tmp_path / "test_contacts.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            company TEXT,
            title TEXT,
            contact_type TEXT NOT NULL DEFAULT 'recruiter',
            email TEXT,
            phone TEXT,
            linkedin_url TEXT,
            specialization TEXT,
            source TEXT,
            last_contact TEXT,
            contact_method TEXT,
            next_followup TEXT,
            relationship_status TEXT DEFAULT 'new',
            tags TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE contact_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER NOT NULL,
            interaction_type TEXT NOT NULL,
            FOREIGN KEY (contact_id) REFERENCES contacts(id)
        )
    """)
    conn.execute("""
        CREATE TABLE submitted_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER NOT NULL,
            company TEXT NOT NULL,
            role_title TEXT NOT NULL,
            FOREIGN KEY (contact_id) REFERENCES contacts(id)
        )
    """)
    for r in rows:
        keys = ", ".join(r.keys())
        placeholders = ", ".join("?" * len(r))
        conn.execute(
            f"INSERT INTO contacts ({keys}) VALUES ({placeholders})",
            list(r.values()),
        )
    conn.commit()
    conn.close()
    return db_path


def _make_interactions_db(
    tmp_path: Path,
    contacts: List[Dict],
    interactions: List[Dict],
) -> Path:
    """Create a DB with contact_uuid column in contact_interactions."""
    db_path = _make_contacts_db(tmp_path, contacts)
    conn = sqlite3.connect(str(db_path))
    # Add contact_uuid column (new schema)
    conn.execute("ALTER TABLE contact_interactions ADD COLUMN contact_uuid TEXT")
    for r in interactions:
        keys = ", ".join(r.keys())
        phs = ", ".join("?" * len(r))
        conn.execute(
            f"INSERT INTO contact_interactions ({keys}) VALUES ({phs})",
            list(r.values()),
        )
    conn.commit()
    conn.close()
    return db_path


# ---------------------------------------------------------------------------
# TestMapSqliteContactRow
# ---------------------------------------------------------------------------


class TestMapSqliteContactRow:
    def test_maps_last_contact_to_last_contact_date(self):
        row = {"name": "Alice", "last_contact": "2026-01-15", "last_contact": "2026-01-15"}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert payload["last_contact_date"] == "2026-01-15"
        assert "last_contact" not in payload

    def test_omits_last_contact_date_when_null(self):
        row = {"name": "Alice", "last_contact": None}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert "last_contact_date" not in payload

    def test_tags_csv_becomes_list(self):
        row = {"name": "Alice", "tags": "python,django,react"}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert payload["tags"] == ["python", "django", "react"]

    def test_tags_empty_string_becomes_empty_list(self):
        row = {"name": "Alice", "tags": ""}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert payload["tags"] == []

    def test_tags_none_becomes_empty_list(self):
        row = {"name": "Alice", "tags": None}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert payload["tags"] == []

    def test_next_followup_parsed_to_date(self):
        row = {"name": "Alice", "next_followup": "2026-05-01"}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert payload["next_followup"] == "2026-05-01"

    def test_next_followup_unparseable_omitted(self):
        row = {"name": "Alice", "next_followup": "soon"}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert "next_followup" not in payload

    def test_next_followup_none_omitted(self):
        row = {"name": "Alice", "next_followup": None}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid")
        assert "next_followup" not in payload

    def test_sets_user_id(self):
        row = {"name": "Alice"}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "user-uuid-123")
        assert payload["user_id"] == "user-uuid-123"

    def test_source_preserved(self):
        row = {"name": "Alice", "source": "email_import"}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "u")
        assert payload["source"] == "email_import"

    def test_source_defaults_to_sqlite_migration_when_empty(self):
        row = {"name": "Alice", "source": None}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "u")
        assert payload["source"] == "sqlite_migration"

    def test_optional_string_fields_omitted_when_null(self):
        row = {"name": "Alice", "company": None, "email": None, "phone": None}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "u")
        assert "company" not in payload
        assert "email" not in payload
        assert "phone" not in payload

    def test_optional_string_fields_included_when_present(self):
        row = {
            "name": "Alice",
            "company": "Acme",
            "email": "alice@acme.com",
            "phone": "555-1234",
            "linkedin_url": "https://linkedin.com/in/alice",
            "notes": "met at conf",
        }
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "u")
        assert payload["company"] == "Acme"
        assert payload["email"] == "alice@acme.com"
        assert payload["phone"] == "555-1234"
        assert payload["linkedin_url"] == "https://linkedin.com/in/alice"
        assert payload["notes"] == "met at conf"

    def test_contact_type_defaults_to_recruiter(self):
        row = {"name": "Alice", "contact_type": None}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "u")
        assert payload["contact_type"] == "recruiter"

    def test_relationship_status_defaults_to_new(self):
        row = {"name": "Alice", "relationship_status": None}
        payload = migrate_mod.map_sqlite_contact_to_supabase(row, "u")
        assert payload["relationship_status"] == "new"


# ---------------------------------------------------------------------------
# TestReadSqliteContacts
# ---------------------------------------------------------------------------


class TestReadSqliteContacts:
    def test_returns_all_rows_as_dicts(self, tmp_path):
        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},
            {"name": "Bob", "email": "bob@b.com"},
        ])
        rows = migrate_mod.read_sqlite_contacts(db)
        assert len(rows) == 2
        assert rows[0]["name"] == "Alice"
        assert rows[1]["email"] == "bob@b.com"

    def test_empty_table_returns_empty_list(self, tmp_path):
        db = _make_contacts_db(tmp_path, [])
        assert migrate_mod.read_sqlite_contacts(db) == []


# ---------------------------------------------------------------------------
# TestMigrateContacts
# ---------------------------------------------------------------------------


class TestMigrateContacts:
    def test_dry_run_reads_but_writes_nothing(self, tmp_path, fake_supabase):
        from src.db.contacts import ContactManager

        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com", "source": "email_import"},
        ])
        mgr = ContactManager()

        result = migrate_mod.migrate_contacts(
            db, mgr, fake_supabase, dry_run=True
        )

        assert result.rows_read == 1
        assert result.rows_inserted == 1  # would-be count
        assert result.rows_skipped_existing == 0
        assert result.errors == []
        assert len(fake_supabase._tables.get("contacts", [])) == 0

    def test_live_run_inserts_all_rows(self, tmp_path, fake_supabase):
        from src.db.contacts import ContactManager

        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},
            {"name": "Bob", "email": "bob@b.com"},
        ])
        mgr = ContactManager()

        result = migrate_mod.migrate_contacts(
            db, mgr, fake_supabase, dry_run=False
        )

        assert result.rows_inserted == 2
        assert result.rows_skipped_existing == 0
        assert len(fake_supabase._tables["contacts"]) == 2
        names = {r["name"] for r in fake_supabase._tables["contacts"]}
        assert names == {"Alice", "Bob"}

    def test_email_dedup_skips_existing(self, tmp_path, fake_supabase):
        """Re-running migration doesn't duplicate — emails already in Supabase are skipped."""
        from src.db.contacts import ContactManager

        mgr = ContactManager()
        # Pre-seed Supabase with a row matching one we'll migrate
        mgr.add_contact("Pre-existing Alice", email="alice@a.com", source="migration")

        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},  # dup
            {"name": "Bob", "email": "bob@b.com"},      # new
        ])
        result = migrate_mod.migrate_contacts(
            db, mgr, fake_supabase, dry_run=False
        )

        assert result.rows_read == 2
        assert result.rows_inserted == 1
        assert result.rows_skipped_existing == 1
        # Pre-existing Alice + new Bob
        assert len(fake_supabase._tables["contacts"]) == 2

    def test_no_email_always_inserts(self, tmp_path, fake_supabase):
        """Rows without email aren't deduped — always inserted."""
        from src.db.contacts import ContactManager

        db = _make_contacts_db(tmp_path, [
            {"name": "Alice"},
            {"name": "Alice"},  # same name, no email
        ])
        mgr = ContactManager()

        result = migrate_mod.migrate_contacts(
            db, mgr, fake_supabase, dry_run=False
        )

        assert result.rows_inserted == 2

    def test_user_id_stamped_on_every_insert(self, tmp_path, fake_supabase):
        from src.db.contacts import ContactManager

        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},
            {"name": "Bob", "email": "bob@b.com"},
        ])
        mgr = ContactManager()

        migrate_mod.migrate_contacts(db, mgr, fake_supabase, dry_run=False)

        for row in fake_supabase._tables["contacts"]:
            assert row["user_id"] == "00000000-0000-0000-0000-000000000001"

    def test_id_map_populated_on_insert(self, tmp_path, fake_supabase):
        from src.db.contacts import ContactManager

        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},
        ])
        mgr = ContactManager()

        result = migrate_mod.migrate_contacts(
            db, mgr, fake_supabase, dry_run=False
        )

        assert len(result.id_map) == 1
        sqlite_id = list(result.id_map.keys())[0]
        supabase_uuid = result.id_map[sqlite_id]
        assert isinstance(supabase_uuid, str)
        assert len(supabase_uuid) > 0

    def test_tags_csv_converted_to_list_in_supabase(self, tmp_path, fake_supabase):
        from src.db.contacts import ContactManager

        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com", "tags": "python,react"},
        ])
        mgr = ContactManager()

        migrate_mod.migrate_contacts(db, mgr, fake_supabase, dry_run=False)

        row = fake_supabase._tables["contacts"][0]
        assert row["tags"] == ["python", "react"]

    # CAR-180: defensive None-guard on sqlite_id before id_map assignment.

    def test_row_without_sqlite_id_is_skipped_from_id_map(
        self, tmp_path, fake_supabase, monkeypatch, caplog
    ):
        """A row missing the 'id' key must not land a None key in id_map.

        Not reachable via normal SQLite (AUTOINCREMENT PKs are always present),
        so the path is exercised by monkeypatching read_sqlite_contacts.
        """
        import logging

        from src.db.contacts import ContactManager

        db = _make_contacts_db(tmp_path, [])
        monkeypatch.setattr(
            migrate_mod,
            "read_sqlite_contacts",
            lambda _p: [{"name": "Alice", "email": "alice@a.com"}],  # no 'id'
        )
        mgr = ContactManager()

        with caplog.at_level(logging.WARNING):
            result = migrate_mod.migrate_contacts(
                db, mgr, fake_supabase, dry_run=False
            )

        assert result.rows_inserted == 1
        assert result.id_map == {}
        assert None not in result.id_map
        assert any(
            "FK rewrite will skip" in rec.message for rec in caplog.records
        )


# ---------------------------------------------------------------------------
# TestRewriteInteractionFKs
# ---------------------------------------------------------------------------


class TestRewriteInteractionFKs:
    def test_noop_when_column_missing(self, tmp_path):
        """Legacy schema (contact_id only, no contact_uuid) → skip gracefully."""
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        count = migrate_mod.rewrite_interaction_fks(db, {1: "uuid-1"})
        assert count == 0

    def test_rewrites_null_contact_uuid(self, tmp_path):
        """With contact_uuid column present, rows with NULL uuid get rewritten."""
        contacts = [{"name": "Alice"}]
        interactions = [{"contact_id": 1, "interaction_type": "call", "contact_uuid": None}]
        db = _make_interactions_db(tmp_path, contacts, interactions)

        count = migrate_mod.rewrite_interaction_fks(db, {1: "supabase-uuid-1"})
        assert count == 1

        conn = sqlite3.connect(str(db))
        rows = conn.execute("SELECT contact_uuid FROM contact_interactions").fetchall()
        conn.close()
        assert rows[0][0] == "supabase-uuid-1"

    def test_noop_on_empty_table(self, tmp_path):
        contacts = [{"name": "Alice"}]
        db = _make_interactions_db(tmp_path, contacts, [])
        count = migrate_mod.rewrite_interaction_fks(db, {1: "uuid-1"})
        assert count == 0

    def test_skips_unmapped_ids(self, tmp_path):
        """contact_id not in id_map → not rewritten, no error."""
        contacts = [{"name": "Alice"}]
        interactions = [{"contact_id": 99, "interaction_type": "call", "contact_uuid": None}]
        db = _make_interactions_db(tmp_path, contacts, interactions)

        count = migrate_mod.rewrite_interaction_fks(db, {1: "uuid-1"})
        assert count == 0

    # CAR-177: asymmetric schema guard must raise when rows would be lost.

    def test_raises_when_legacy_rows_without_contact_uuid_column(self, tmp_path):
        """contact_uuid missing + contact_id rows present → raise, not silent 0."""
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        conn.execute(
            "INSERT INTO contact_interactions (contact_id, interaction_type) "
            "VALUES (1, 'call')"
        )
        conn.commit()
        conn.close()

        with pytest.raises(RuntimeError, match="contact_interactions.*contact_uuid"):
            migrate_mod.rewrite_interaction_fks(db, {1: "uuid-1"})


# ---------------------------------------------------------------------------
# TestRewriteSubmittedRoleFKs
# ---------------------------------------------------------------------------


class TestRewriteSubmittedRoleFKs:
    def _make_roles_db(self, tmp_path: Path) -> Path:
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        conn.execute("ALTER TABLE submitted_roles ADD COLUMN contact_uuid TEXT")
        conn.execute(
            "INSERT INTO submitted_roles (contact_id, company, role_title, contact_uuid) "
            "VALUES (1, 'Acme', 'SWE', NULL)"
        )
        conn.commit()
        conn.close()
        return db

    def test_noop_when_column_missing(self, tmp_path):
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        count = migrate_mod.rewrite_submitted_role_fks(db, {1: "uuid-1"})
        assert count == 0

    def test_rewrites_null_contact_uuid(self, tmp_path):
        db = self._make_roles_db(tmp_path)
        count = migrate_mod.rewrite_submitted_role_fks(db, {1: "supabase-uuid-1"})
        assert count == 1

        conn = sqlite3.connect(str(db))
        row = conn.execute("SELECT contact_uuid FROM submitted_roles").fetchone()
        conn.close()
        assert row[0] == "supabase-uuid-1"

    def test_noop_on_empty_table(self, tmp_path):
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        conn.execute("ALTER TABLE submitted_roles ADD COLUMN contact_uuid TEXT")
        conn.commit()
        conn.close()
        count = migrate_mod.rewrite_submitted_role_fks(db, {1: "uuid-1"})
        assert count == 0

    # CAR-178: asymmetric schema guard must raise when rows would be lost.

    def test_raises_when_legacy_rows_without_contact_uuid_column(self, tmp_path):
        """contact_uuid missing + contact_id rows present → raise, not silent 0."""
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        conn.execute(
            "INSERT INTO submitted_roles (contact_id, company, role_title) "
            "VALUES (1, 'Acme', 'SWE')"
        )
        conn.commit()
        conn.close()

        with pytest.raises(RuntimeError, match="submitted_roles.*contact_uuid"):
            migrate_mod.rewrite_submitted_role_fks(db, {1: "uuid-1"})


# ---------------------------------------------------------------------------
# TestFinalize
# ---------------------------------------------------------------------------


class TestFinalize:
    def test_renames_contacts_table(self, tmp_path):
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        new_name = migrate_mod.finalize_sqlite_table(db)
        assert new_name.startswith("contacts_deprecated_")

        conn = sqlite3.connect(str(db))
        try:
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (new_name,),
            )
            assert cur.fetchone() is not None, f"{new_name} should exist"

            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'"
            )
            assert cur.fetchone() is None, "contacts should no longer exist"
        finally:
            conn.close()

    def test_preserves_row_data(self, tmp_path):
        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},
        ])
        new_name = migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        try:
            rows = conn.execute(f'SELECT * FROM "{new_name}"').fetchall()
            assert len(rows) == 1
        finally:
            conn.close()

    def test_raises_when_contacts_table_missing(self, tmp_path):
        db = tmp_path / "empty.db"
        conn = sqlite3.connect(str(db))
        conn.execute("CREATE TABLE other (id INTEGER)")
        conn.commit()
        conn.close()

        with pytest.raises(RuntimeError, match="does not exist"):
            migrate_mod.finalize_sqlite_table(db)

    def test_rebuilds_interaction_table_with_contact_uuid_schema(self, tmp_path):
        """Legacy contact_id schema → rebuilt with contact_uuid schema after finalize."""
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        try:
            cols = {r[1] for r in conn.execute(
                "PRAGMA table_info(contact_interactions)"
            ).fetchall()}
            assert "contact_uuid" in cols
            assert "contact_id" not in cols
        finally:
            conn.close()

    def test_rebuilds_submitted_roles_table_with_contact_uuid_schema(self, tmp_path):
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        try:
            cols = {r[1] for r in conn.execute(
                "PRAGMA table_info(submitted_roles)"
            ).fetchall()}
            assert "contact_uuid" in cols
            assert "contact_id" not in cols
        finally:
            conn.close()

    def test_skips_rebuild_when_tables_already_have_contact_uuid(self, tmp_path):
        """No-op rebuild when tables already have the new schema."""
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        # Drop and recreate with new schema
        conn.execute("DROP TABLE contact_interactions")
        conn.execute("""
            CREATE TABLE contact_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_uuid TEXT NOT NULL,
                interaction_type TEXT NOT NULL
            )
        """)
        conn.execute("INSERT INTO contact_interactions (contact_uuid, interaction_type) VALUES ('uuid-1', 'call')")
        conn.commit()
        conn.close()

        migrate_mod.finalize_sqlite_table(db)

        # Row should survive (rebuild only triggers when contact_id present)
        conn = sqlite3.connect(str(db))
        rows = conn.execute("SELECT * FROM contact_interactions").fetchall()
        conn.close()
        assert len(rows) == 1

    # CAR-174 / CAR-175: finalize must refuse to DROP rows that aren't rewritten.

    def test_raises_when_interactions_have_rows_without_contact_uuid_column(
        self, tmp_path
    ):
        """Legacy interactions schema + existing rows = must not silently drop."""
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        conn.execute(
            "INSERT INTO contact_interactions (contact_id, interaction_type) "
            "VALUES (1, 'call')"
        )
        conn.commit()
        conn.close()

        with pytest.raises(RuntimeError, match="contact_interactions.*contact_uuid"):
            migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        rows = conn.execute("SELECT * FROM contact_interactions").fetchall()
        conn.close()
        assert len(rows) == 1

    def test_raises_when_interactions_partial_rewrite(self, tmp_path):
        """Drifted schema with contact_uuid column but some NULL uuids = refuse DROP."""
        contacts = [{"name": "Alice"}]
        interactions = [
            {"contact_id": 1, "interaction_type": "call", "contact_uuid": None},
        ]
        db = _make_interactions_db(tmp_path, contacts, interactions)

        with pytest.raises(RuntimeError, match="rewrite_interaction_fks"):
            migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        rows = conn.execute("SELECT * FROM contact_interactions").fetchall()
        conn.close()
        assert len(rows) == 1

    def test_raises_when_submitted_roles_have_rows_without_contact_uuid_column(
        self, tmp_path
    ):
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        conn.execute(
            "INSERT INTO submitted_roles (contact_id, company, role_title) "
            "VALUES (1, 'Acme', 'SWE')"
        )
        conn.commit()
        conn.close()

        with pytest.raises(RuntimeError, match="submitted_roles.*contact_uuid"):
            migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        rows = conn.execute("SELECT * FROM submitted_roles").fetchall()
        conn.close()
        assert len(rows) == 1

    def test_raises_when_submitted_roles_partial_rewrite(self, tmp_path):
        db = _make_contacts_db(tmp_path, [{"name": "Alice"}])
        conn = sqlite3.connect(str(db))
        conn.execute("ALTER TABLE submitted_roles ADD COLUMN contact_uuid TEXT")
        conn.execute(
            "INSERT INTO submitted_roles (contact_id, company, role_title, contact_uuid) "
            "VALUES (1, 'Acme', 'SWE', NULL)"
        )
        conn.commit()
        conn.close()

        with pytest.raises(RuntimeError, match="rewrite_submitted_role_fks"):
            migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        rows = conn.execute("SELECT * FROM submitted_roles").fetchall()
        conn.close()
        assert len(rows) == 1

    def test_finalize_succeeds_after_full_rewrite(self, tmp_path):
        """Drifted schema with every row's contact_uuid populated = rebuild proceeds."""
        contacts = [{"name": "Alice"}]
        interactions = [
            {"contact_id": 1, "interaction_type": "call", "contact_uuid": "uuid-1"},
        ]
        db = _make_interactions_db(tmp_path, contacts, interactions)
        conn = sqlite3.connect(str(db))
        conn.execute("ALTER TABLE submitted_roles ADD COLUMN contact_uuid TEXT")
        conn.execute(
            "INSERT INTO submitted_roles (contact_id, company, role_title, contact_uuid) "
            "VALUES (1, 'Acme', 'SWE', 'uuid-1')"
        )
        conn.commit()
        conn.close()

        migrate_mod.finalize_sqlite_table(db)

        conn = sqlite3.connect(str(db))
        try:
            icols = {r[1] for r in conn.execute("PRAGMA table_info(contact_interactions)")}
            assert "contact_uuid" in icols
            assert "contact_id" not in icols
            scols = {r[1] for r in conn.execute("PRAGMA table_info(submitted_roles)")}
            assert "contact_uuid" in scols
            assert "contact_id" not in scols
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# TestMainCli
# ---------------------------------------------------------------------------


class TestMainCli:
    def test_missing_db_returns_2(self, tmp_path):
        nonexistent = tmp_path / "does-not-exist.db"
        rc = migrate_mod.main(["--db-path", str(nonexistent), "--dry-run"])
        assert rc == 2

    def test_finalize_without_yes_returns_2(self, tmp_path):
        db = _make_contacts_db(tmp_path, [])
        rc = migrate_mod.main(["--db-path", str(db), "--finalize"])
        assert rc == 2

    def test_finalize_with_yes_renames(self, tmp_path):
        db = _make_contacts_db(tmp_path, [])
        rc = migrate_mod.main(["--db-path", str(db), "--finalize", "--yes"])
        assert rc == 0

    def test_dry_run_returns_0_no_errors(self, tmp_path, fake_supabase):
        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},
        ])
        rc = migrate_mod.main(["--db-path", str(db), "--dry-run"])
        assert rc == 0

    def test_live_run_returns_0_on_success(self, tmp_path, fake_supabase):
        db = _make_contacts_db(tmp_path, [
            {"name": "Alice", "email": "alice@a.com"},
        ])
        rc = migrate_mod.main(["--db-path", str(db)])
        assert rc == 0
