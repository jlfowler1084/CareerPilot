"""Shared test fixtures — primarily the Supabase fake client (CAR-165).

Tests that invoke the CLI (which internally constructs `ApplicationTracker()`
without args) need `get_supabase_client()` to return a fake. Tests that
verify via a separate `ApplicationTracker` instance need that fake to be
*the same* client so they see the same rows.

The `fake_supabase` fixture below provides that. Any test that requests
`fake_supabase` (directly or transitively through another fixture) will:
- Have `src.db.supabase_client.get_supabase_client()` patched to return the
  fake client, so any `ApplicationTracker()` call hits it.
- Have `config.settings.CAREERPILOT_USER_ID` patched to a fixed test UUID,
  so `ApplicationTracker()` succeeds without env setup.
- Receive the fake client itself, so the test can seed or verify state
  directly via the client or by constructing its own `ApplicationTracker(
  client=fake_supabase, user_id=TEST_USER_ID)`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# Fake Supabase client — minimal in-memory postgrest-py chain emulation
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
        self._negate_next = False
        return self

    def contains(self, field: str, value: Any) -> "_FakeTable":
        self._filters.append((field, "contains", value))
        return self

    def is_(self, field: str, value: Any) -> "_FakeTable":
        op = "is_not" if self._negate_next else "is_"
        self._filters.append((field, op, value))
        self._negate_next = False
        return self

    def lte(self, field: str, value: Any) -> "_FakeTable":
        self._filters.append((field, "lte", value))
        return self

    def delete(self) -> "_FakeTable":
        self._operation = "delete"
        return self

    def order(self, field: str, desc: bool = False) -> "_FakeTable":
        self._order = (field, desc)
        return self

    def limit(self, n: int) -> "_FakeTable":
        self._limit = n
        return self

    def _matches(self, row: Dict) -> bool:
        import re as _re
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
                pattern = "".join(
                    ".*" if c == "%" else _re.escape(c) for c in value
                )
                if not _re.search(pattern, str(actual or ""), _re.IGNORECASE):
                    return False
            if op == "contains":
                actual_list = actual if isinstance(actual, list) else []
                if not all(item in actual_list for item in (value or [])):
                    return False
            if op == "is_" and value == "null" and actual is not None:
                return False
            if op == "is_not" and value == "null" and actual is None:
                return False
            if op == "lte" and (actual is None or actual > value):
                return False
        return True

    def execute(self) -> SimpleNamespace:
        if self._operation == "delete":
            matched = [r for r in self._rows if self._matches(r)]
            for r in matched:
                self._rows.remove(r)
            return SimpleNamespace(data=matched)

        if self._operation == "insert":
            payload = dict(self._payload)
            now_iso = datetime.now().isoformat()
            row = {
                "id": str(uuid.uuid4()),
                "date_found": payload.get("date_found") or now_iso,
                "date_applied": None,
                "date_response": None,
                "external_status": None,
                "external_status_updated": None,
                "portal_id": None,
                "withdraw_date": None,
                "updated_at": now_iso,
                **payload,
            }
            self._rows.append(row)
            return SimpleNamespace(data=[row])

        matched = [r for r in self._rows if self._matches(r)]

        if self._operation == "update":
            for r in matched:
                r.update(self._payload)
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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_supabase(monkeypatch):
    """Per-test FakeSupabaseClient wired into ApplicationTracker's lookup path.

    Patches `src.db.supabase_client.get_supabase_client` and
    `config.settings.CAREERPILOT_USER_ID` so any `ApplicationTracker()`
    constructed during the test (including by CLI invocations) uses this
    client and a fixed test user id. Also clears the lru_cache on the real
    factory before and after so the patched result is actually used.
    """
    from src.db import supabase_client as _sc_mod

    # Clear the real factory's lru_cache so a prior test's fake doesn't leak.
    _sc_mod.get_supabase_client.cache_clear()

    client = FakeSupabaseClient()
    monkeypatch.setattr(
        "src.db.supabase_client.get_supabase_client", lambda: client
    )
    monkeypatch.setattr("config.settings.CAREERPILOT_USER_ID", TEST_USER_ID)
    # ContactManager reads os.environ directly (not the settings attribute), so
    # also patch the env var to ensure ContactManager() works during these tests.
    monkeypatch.setenv("CAREERPILOT_USER_ID", TEST_USER_ID)
    # The tracker imports get_supabase_client lazily inside __init__, so it
    # looks up the attribute on the module at call time — monkeypatch.setattr
    # above covers that path. monkeypatch auto-reverts at teardown; the next
    # test's fixture setup clears the cache again before use.
    yield client
