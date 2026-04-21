"""Tests for ContactManager — Supabase-backed CLI contact store (CAR-171)."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from src.db.contacts import (
    ContactManager,
    ContactManagerNotConfiguredError,
)


# ---------------------------------------------------------------------------
# Fake Supabase client — minimal in-memory emulation. Mirrors the
# FakeSupabaseClient in tests/test_tracker.py; adapted for contacts table.
# Supports: select, insert, update, delete, eq, not_.eq, in_, not_.in_,
#           ilike, lte, or_, contains, order, limit, execute.
# ---------------------------------------------------------------------------


class _FakeTable:
    def __init__(self, rows: List[Dict]):
        self._rows = rows
        self._filters: List[tuple] = []
        self._order: Optional[tuple] = None
        self._limit: Optional[int] = None
        self._operation: Optional[str] = None
        self._payload: Any = None
        self._negate_next = False

    def select(self, _cols: str = "*") -> "_FakeTable":
        self._operation = "select"
        return self

    def insert(self, data: Dict) -> "_FakeTable":
        self._operation = "insert"
        self._payload = data
        return self

    def update(self, data: Dict) -> "_FakeTable":
        self._operation = "update"
        self._payload = data
        return self

    def delete(self) -> "_FakeTable":
        self._operation = "delete"
        return self

    @property
    def not_(self) -> "_FakeTable":
        self._negate_next = True
        return self

    def eq(self, field: str, value: Any) -> "_FakeTable":
        op = "neq" if self._negate_next else "eq"
        self._filters.append((field, op, value))
        self._negate_next = False
        return self

    def in_(self, field: str, values) -> "_FakeTable":
        op = "not_in" if self._negate_next else "in"
        self._filters.append((field, op, list(values)))
        self._negate_next = False
        return self

    def ilike(self, field: str, pattern: str) -> "_FakeTable":
        self._filters.append((field, "ilike", pattern))
        return self

    def lte(self, field: str, value: Any) -> "_FakeTable":
        self._filters.append((field, "lte", value))
        return self

    def is_(self, field: str, value: Any) -> "_FakeTable":
        op = "is_not" if self._negate_next else "is"
        self._filters.append((field, op, value))
        self._negate_next = False
        return self

    def contains(self, field: str, value: Any) -> "_FakeTable":
        self._filters.append((field, "contains", value))
        return self

    def or_(self, filter_str: str) -> "_FakeTable":
        self._filters.append(("__or__", "or", filter_str))
        return self

    def order(self, field: str, desc: bool = False) -> "_FakeTable":
        self._order = (field, desc)
        return self

    def limit(self, n: int) -> "_FakeTable":
        self._limit = n
        return self

    def _matches(self, row: Dict) -> bool:
        for field, op, value in self._filters:
            actual = row.get(field)
            if op == "eq" and actual != value:
                return False
            if op == "neq" and actual == value:
                return False
            if op == "in" and actual not in value:
                return False
            if op == "not_in" and actual in value:
                return False
            if op == "ilike":
                pattern = value.replace("%", "")
                if actual is None or pattern.lower() not in str(actual).lower():
                    return False
            if op == "lte" and actual is not None and str(actual) > str(value):
                return False
            if op == "is" and value == "null" and actual is not None:
                return False
            if op == "is_not" and value == "null" and actual is None:
                return False
            if op == "contains":
                tags = actual or []
                if isinstance(value, list):
                    if not all(t in tags for t in value):
                        return False
                elif value not in tags:
                    return False
            if op == "or":
                # For test purposes: match if any ilike-style sub-filter matches
                # The or_ filter_str format from ContactManager.search_contacts is:
                # "name.ilike.%query%,company.ilike.%query%,..."
                parts = value.split(",")
                match = False
                for part in parts:
                    pieces = part.strip().split(".")
                    if len(pieces) >= 3 and pieces[1] == "ilike":
                        col = pieces[0]
                        pat = ".".join(pieces[2:]).replace("%", "")
                        if row.get(col) and pat.lower() in str(row[col]).lower():
                            match = True
                            break
                if not match:
                    return False
        return True

    def execute(self) -> SimpleNamespace:
        if self._operation == "insert":
            payload = dict(self._payload)
            now_iso = datetime.now().isoformat()
            row = {
                "id": str(uuid.uuid4()),
                "created_at": now_iso,
                "updated_at": now_iso,
                "last_contact_date": None,
                "next_followup": None,
                "relationship_status": "new",
                "contact_type": "recruiter",
                "tags": [],
                **payload,
            }
            self._rows.append(row)
            return SimpleNamespace(data=[row])

        matched = [r for r in self._rows if self._matches(r)]

        if self._operation == "update":
            for r in matched:
                r.update(self._payload)
            return SimpleNamespace(data=matched)

        if self._operation == "delete":
            to_remove = {id(r) for r in matched}
            self._rows[:] = [r for r in self._rows if id(r) not in to_remove]
            return SimpleNamespace(data=matched)

        # select
        if self._order is not None:
            field, desc = self._order
            matched = sorted(
                matched,
                key=lambda r: r.get(field) or "",
                reverse=desc,
            )
        if self._limit is not None:
            matched = matched[: self._limit]
        return SimpleNamespace(data=matched)


class FakeSupabaseClient:
    def __init__(self) -> None:
        self._tables: Dict[str, List[Dict]] = {}

    def table(self, name: str) -> _FakeTable:
        self._tables.setdefault(name, [])
        return _FakeTable(self._tables[name])


_TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def client():
    return FakeSupabaseClient()


@pytest.fixture
def mgr(client):
    return ContactManager(client=client, user_id=_TEST_USER_ID)


def _sample_contact(**overrides):
    c = {
        "name": "Sarah Kim",
        "contact_type": "recruiter",
        "company": "TEKsystems",
        "email": "sarah@teksystems.com",
        "specialization": "Infrastructure",
    }
    c.update(overrides)
    return c


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestConstruction:
    def test_requires_user_id_from_env(self, monkeypatch):
        monkeypatch.delenv("CAREERPILOT_USER_ID", raising=False)
        with pytest.raises(ContactManagerNotConfiguredError):
            ContactManager(client=FakeSupabaseClient())

    def test_reads_user_id_from_env(self, monkeypatch):
        monkeypatch.setenv("CAREERPILOT_USER_ID", _TEST_USER_ID)
        m = ContactManager(client=FakeSupabaseClient())
        assert m._user_id == _TEST_USER_ID

    def test_accepts_injected_user_id(self):
        m = ContactManager(client=FakeSupabaseClient(), user_id=_TEST_USER_ID)
        assert m._user_id == _TEST_USER_ID

    def test_error_message_is_informative(self, monkeypatch):
        monkeypatch.delenv("CAREERPILOT_USER_ID", raising=False)
        with pytest.raises(ContactManagerNotConfiguredError) as exc:
            ContactManager(client=FakeSupabaseClient())
        assert "user_id" in str(exc.value).lower() or "CAREERPILOT_USER_ID" in str(exc.value)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


class TestCRUD:
    def test_add_contact_returns_uuid(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        assert isinstance(cid, str)
        assert len(cid) > 0

    def test_add_contact_sets_user_id(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        c = mgr.get_contact(cid)
        assert c["user_id"] == _TEST_USER_ID

    def test_add_contact_default_type_is_recruiter(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        c = mgr.get_contact(cid)
        assert c["contact_type"] == "recruiter"

    def test_add_contact_custom_type(self, mgr):
        cid = mgr.add_contact("Mike Chen", contact_type="hiring_manager")
        c = mgr.get_contact(cid)
        assert c["contact_type"] == "hiring_manager"

    def test_add_contact_all_fields(self, mgr):
        cid = mgr.add_contact(
            "Mike Chen",
            contact_type="hiring_manager",
            company="Eli Lilly",
            title="Eng Manager",
            email="mike@lilly.com",
            phone="317-555-1234",
            linkedin_url="https://linkedin.com/in/mikechen",
            specialization="Infrastructure",
            source="job_application",
            tags=["pharma", "priority"],
            notes="Met at career fair",
        )
        c = mgr.get_contact(cid)
        assert c["company"] == "Eli Lilly"
        assert c["email"] == "mike@lilly.com"
        assert c["tags"] == ["pharma", "priority"]
        assert c["notes"] == "Met at career fair"

    def test_add_contact_tags_as_list(self, mgr):
        cid = mgr.add_contact("Alice", tags=["indy", "contract"])
        c = mgr.get_contact(cid)
        assert isinstance(c["tags"], list)
        assert "indy" in c["tags"]
        assert "contract" in c["tags"]

    def test_get_contact_returns_dict(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        c = mgr.get_contact(cid)
        assert isinstance(c, dict)
        assert c["name"] == "Sarah Kim"

    def test_get_contact_returns_none_for_missing(self, mgr):
        assert mgr.get_contact("00000000-0000-0000-0000-000000000999") is None

    def test_get_contact_returns_none_for_empty(self, mgr):
        assert mgr.get_contact("") is None
        assert mgr.get_contact(None) is None

    def test_list_contacts_returns_all(self, mgr):
        mgr.add_contact("Alice")
        mgr.add_contact("Bob")
        mgr.add_contact("Carol")
        assert len(mgr.list_contacts()) == 3

    def test_list_contacts_filter_by_type(self, mgr):
        mgr.add_contact("Alice", contact_type="recruiter")
        mgr.add_contact("Bob", contact_type="hiring_manager")
        result = mgr.list_contacts(contact_type="recruiter")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

    def test_list_contacts_filter_by_status(self, mgr):
        c1 = mgr.add_contact("Alice")
        mgr.update_contact(c1, relationship_status="active")
        mgr.add_contact("Bob")
        result = mgr.list_contacts(relationship_status="active")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

    def test_list_contacts_filter_by_tag(self, mgr):
        mgr.add_contact("Alice", tags=["indy", "priority"])
        mgr.add_contact("Bob", tags=["remote"])
        result = mgr.list_contacts(tag="indy")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

    def test_update_contact_returns_true(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        result = mgr.update_contact(cid, relationship_status="active")
        assert result is True

    def test_update_contact_persists(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        mgr.update_contact(cid, company="TEKsystems", relationship_status="warm")
        c = mgr.get_contact(cid)
        assert c["company"] == "TEKsystems"
        assert c["relationship_status"] == "warm"

    def test_update_contact_returns_false_for_missing(self, mgr):
        result = mgr.update_contact(
            "00000000-0000-0000-0000-000000000999", relationship_status="active"
        )
        assert result is False

    def test_delete_contact_soft(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        result = mgr.delete_contact(cid)
        assert result is True
        c = mgr.get_contact(cid)
        assert c["relationship_status"] == "do_not_contact"

    def test_delete_contact_hard(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        result = mgr.delete_contact(cid, force=True)
        assert result is True
        assert mgr.get_contact(cid) is None

    def test_delete_contact_returns_false_for_missing(self, mgr):
        result = mgr.delete_contact("00000000-0000-0000-0000-000000000999")
        assert result is False


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------


class TestQueries:
    def test_find_by_email_returns_contact(self, mgr):
        cid = mgr.add_contact("Sarah Kim", email="sarah@tek.com")
        result = mgr.find_by_email("sarah@tek.com")
        assert result is not None
        assert result["id"] == cid

    def test_find_by_email_case_insensitive(self, mgr):
        mgr.add_contact("Sarah Kim", email="sarah@tek.com")
        result = mgr.find_by_email("SARAH@TEK.COM")
        assert result is not None

    def test_find_by_email_returns_none_for_missing(self, mgr):
        assert mgr.find_by_email("nobody@test.com") is None

    def test_find_by_email_returns_none_for_empty(self, mgr):
        assert mgr.find_by_email("") is None
        assert mgr.find_by_email(None) is None

    def test_search_contacts_by_name(self, mgr):
        mgr.add_contact("Sarah Kim")
        mgr.add_contact("Mike Chen")
        result = mgr.search_contacts("Sarah")
        assert len(result) == 1
        assert result[0]["name"] == "Sarah Kim"

    def test_search_contacts_by_company(self, mgr):
        mgr.add_contact("Alice", company="TEKsystems")
        mgr.add_contact("Bob", company="Kforce")
        result = mgr.search_contacts("TEK")
        assert len(result) == 1

    def test_search_contacts_no_results(self, mgr):
        mgr.add_contact("Alice")
        assert mgr.search_contacts("zzzzz") == []

    def test_get_stale_contacts(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        old_date = (datetime.now() - timedelta(days=20)).isoformat()
        mgr.update_contact(cid, relationship_status="active", last_contact_date=old_date)
        stale = mgr.get_stale_contacts()
        assert len(stale) == 1
        assert stale[0]["name"] == "Sarah Kim"

    def test_get_stale_contacts_ignores_recent(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        recent = (datetime.now() - timedelta(days=3)).isoformat()
        mgr.update_contact(cid, relationship_status="active", last_contact_date=recent)
        assert len(mgr.get_stale_contacts()) == 0

    def test_get_stale_contacts_ignores_non_active(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        old_date = (datetime.now() - timedelta(days=30)).isoformat()
        mgr.update_contact(cid, relationship_status="cold", last_contact_date=old_date)
        assert len(mgr.get_stale_contacts()) == 0

    def test_get_followup_due(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        mgr.update_contact(cid, next_followup=yesterday)
        due = mgr.get_followup_due()
        assert len(due) >= 1

    def test_get_followup_ignores_future(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        future = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        mgr.update_contact(cid, next_followup=future)
        assert len(mgr.get_followup_due()) == 0

    def test_add_tag(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        mgr.add_tag(cid, "indy")
        c = mgr.get_contact(cid)
        assert "indy" in c["tags"]

    def test_add_tag_deduplicates(self, mgr):
        cid = mgr.add_contact("Sarah Kim", tags=["indy"])
        mgr.add_tag(cid, "indy")
        c = mgr.get_contact(cid)
        assert c["tags"].count("indy") == 1

    def test_add_tag_multiple(self, mgr):
        cid = mgr.add_contact("Sarah Kim")
        mgr.add_tag(cid, "indy")
        mgr.add_tag(cid, "priority")
        c = mgr.get_contact(cid)
        assert "indy" in c["tags"]
        assert "priority" in c["tags"]

    def test_remove_tag(self, mgr):
        cid = mgr.add_contact("Sarah Kim", tags=["indy", "priority"])
        mgr.remove_tag(cid, "indy")
        c = mgr.get_contact(cid)
        assert "indy" not in c["tags"]
        assert "priority" in c["tags"]

    def test_remove_nonexistent_tag_is_noop(self, mgr):
        cid = mgr.add_contact("Sarah Kim", tags=["indy"])
        mgr.remove_tag(cid, "bogus")
        c = mgr.get_contact(cid)
        assert c["tags"] == ["indy"]


# ---------------------------------------------------------------------------
# User-id scoping
# ---------------------------------------------------------------------------


class TestUserIdScoping:
    def test_list_contacts_scoped_by_user(self):
        client = FakeSupabaseClient()
        alice = ContactManager(client=client, user_id="alice-uuid")
        bob = ContactManager(client=client, user_id="bob-uuid")

        alice.add_contact("Alice's Contact")
        bob.add_contact("Bob's Contact")

        assert len(alice.list_contacts()) == 1
        assert alice.list_contacts()[0]["name"] == "Alice's Contact"
        assert len(bob.list_contacts()) == 1

    def test_update_cannot_touch_other_users_row(self):
        client = FakeSupabaseClient()
        alice = ContactManager(client=client, user_id="alice-uuid")
        bob = ContactManager(client=client, user_id="bob-uuid")

        alice_id = alice.add_contact("Alice's Contact")
        result = bob.update_contact(alice_id, relationship_status="active")
        assert result is False
        assert alice.get_contact(alice_id)["relationship_status"] != "active"
