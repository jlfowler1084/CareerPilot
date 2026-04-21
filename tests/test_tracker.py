"""Tests for ApplicationTracker (Supabase-backed as of CAR-165)."""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from src.jobs.tracker import (
    ApplicationTracker,
    ApplicationTrackerNotConfiguredError,
    VALID_STATUSES,
)


# ---------------------------------------------------------------------------
# Fake Supabase client — minimal in-memory emulation of the postgrest-py chain
# API surface that ApplicationTracker actually uses. Not a general-purpose
# client; it implements the specific operations exercised by the tracker:
#   .table(name).insert({...}).execute()
#   .table(name).select("*").eq(field, value)...limit(n).execute()
#   .table(name).select("*").eq(...).not_.in_(field, [values]).order(...).execute()
#   .table(name).update({...}).eq(...).eq(...).execute()
# Shared state lives on FakeSupabaseClient so multiple table-builder calls
# see the same rows — critical for behavioral tests that save then read.
# ---------------------------------------------------------------------------


class _FakeTable:
    def __init__(self, rows: List[Dict]):
        self._rows = rows  # shared mutable ref
        self._filters: List[tuple] = []  # (field, op, value)
        self._order: Optional[tuple] = None  # (field, desc)
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
        return True

    def execute(self) -> SimpleNamespace:
        if self._operation == "insert":
            payload = dict(self._payload)
            now_iso = datetime.now().isoformat()
            row = {
                "id": str(uuid.uuid4()),
                # Emulate Supabase's DEFAULT now() on date_found if not provided
                "date_found": payload.get("date_found") or now_iso,
                # Nullable columns default to None unless the caller provided them
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


_TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def tracker():
    """Create an ApplicationTracker backed by an in-memory fake client."""
    client = FakeSupabaseClient()
    t = ApplicationTracker(client=client, user_id=_TEST_USER_ID)
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
        "profile_id": "sysadmin_local",
    }
    job.update(overrides)
    return job


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestConstruction:
    def test_raises_when_user_id_missing_everywhere(self, monkeypatch):
        """Without CAREERPILOT_USER_ID env and no explicit arg, __init__ raises."""
        monkeypatch.setattr("config.settings.CAREERPILOT_USER_ID", "")
        with pytest.raises(ApplicationTrackerNotConfiguredError) as exc:
            ApplicationTracker(client=FakeSupabaseClient())
        assert "CAREERPILOT_USER_ID" in str(exc.value)

    def test_reads_user_id_from_settings_when_not_passed(self, monkeypatch):
        monkeypatch.setattr(
            "config.settings.CAREERPILOT_USER_ID", _TEST_USER_ID
        )
        t = ApplicationTracker(client=FakeSupabaseClient())
        assert t._user_id == _TEST_USER_ID


# ---------------------------------------------------------------------------
# save_job
# ---------------------------------------------------------------------------


class TestSaveJob:
    def test_saves_and_returns_uuid(self, tracker):
        job_id = tracker.save_job(_sample_job())
        assert isinstance(job_id, str)
        assert len(job_id) > 0

    def test_default_status_is_found(self, tracker):
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)
        assert job["status"] == "found"

    def test_saves_all_fields(self, tracker):
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)

        assert job["title"] == "Systems Administrator"
        assert job["company"] == "Acme Corp"
        assert job["location"] == "Indianapolis, IN"
        assert job["url"] == "https://example.com/job/1"
        assert job["source"] == "indeed"
        assert job["salary_range"] == "$80k-$100k"
        assert job["profile_id"] == "sysadmin_local"

    def test_date_found_set(self, tracker):
        """date_found is populated (either by caller or by the default)."""
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)
        assert job["date_found"] is not None
        assert job["date_found"].startswith(datetime.now().strftime("%Y-%m-%d"))

    def test_user_id_populated_on_insert(self, tracker):
        """Every insert must set user_id — orphan rows are invisible to dashboard."""
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)
        assert job["user_id"] == _TEST_USER_ID

    def test_description_maps_to_job_description(self, tracker):
        """CLI's `description` input lands in Supabase's `job_description` column."""
        job_id = tracker.save_job(_sample_job(description="Long JD text"))
        job = tracker.get_job(job_id)
        assert job["job_description"] == "Long JD text"


# ---------------------------------------------------------------------------
# update_status
# ---------------------------------------------------------------------------


class TestUpdateStatus:
    def test_updates_status(self, tracker):
        job_id = tracker.save_job(_sample_job())
        result = tracker.update_status(job_id, "applied")
        assert result is True

        job = tracker.get_job(job_id)
        assert job["status"] == "applied"

    def test_sets_date_applied(self, tracker):
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied")

        job = tracker.get_job(job_id)
        assert job["date_applied"] is not None

    def test_sets_date_response(self, tracker):
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied")
        tracker.update_status(job_id, "phone_screen")

        job = tracker.get_job(job_id)
        assert job["date_response"] is not None

    def test_appends_notes(self, tracker):
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied", notes="Submitted via website")

        job = tracker.get_job(job_id)
        assert "Submitted via website" in job["notes"]

    def test_multiple_notes(self, tracker):
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied", notes="First note")
        tracker.update_status(job_id, "phone_screen", notes="Second note")

        job = tracker.get_job(job_id)
        assert "First note" in job["notes"]
        assert "Second note" in job["notes"]

    def test_invalid_status_rejected(self, tracker):
        job_id = tracker.save_job(_sample_job())
        result = tracker.update_status(job_id, "invalid_status")
        assert result is False

    def test_nonexistent_job_returns_false(self, tracker):
        """Passing a UUID that isn't in the store returns False, doesn't raise."""
        result = tracker.update_status(
            "00000000-0000-0000-0000-000000000999", "applied"
        )
        assert result is False

    def test_all_valid_statuses_accepted(self, tracker):
        for status in VALID_STATUSES:
            job_id = tracker.save_job(_sample_job(title=f"Job for {status}"))
            result = tracker.update_status(job_id, status)
            assert result is True


# ---------------------------------------------------------------------------
# Pipeline / stats / reads
# ---------------------------------------------------------------------------


class TestGetPipeline:
    def test_groups_by_status(self, tracker):
        id1 = tracker.save_job(_sample_job(title="Job A"))
        tracker.save_job(_sample_job(title="Job B"))
        tracker.update_status(id1, "applied")

        pipeline = tracker.get_pipeline()
        assert len(pipeline["applied"]) == 1
        assert len(pipeline["found"]) == 1

    def test_empty_pipeline(self, tracker):
        pipeline = tracker.get_pipeline()
        for status in VALID_STATUSES:
            assert pipeline[status] == []

    def test_all_statuses_present(self, tracker):
        pipeline = tracker.get_pipeline()
        for status in VALID_STATUSES:
            assert status in pipeline


class TestGetStats:
    def test_total_count(self, tracker):
        tracker.save_job(_sample_job(title="A"))
        tracker.save_job(_sample_job(title="B"))
        tracker.save_job(_sample_job(title="C"))

        stats = tracker.get_stats()
        assert stats["total"] == 3

    def test_status_breakdown(self, tracker):
        id1 = tracker.save_job(_sample_job(title="A"))
        id2 = tracker.save_job(_sample_job(title="B"))
        tracker.update_status(id1, "applied")
        tracker.update_status(id2, "applied")

        stats = tracker.get_stats()
        assert stats["by_status"]["applied"] == 2
        assert stats["by_status"]["found"] == 0

    def test_response_rate(self, tracker):
        id1 = tracker.save_job(_sample_job(title="A"))
        id2 = tracker.save_job(_sample_job(title="B"))
        tracker.update_status(id1, "applied")
        tracker.update_status(id2, "applied")
        tracker.update_status(id1, "phone_screen")

        stats = tracker.get_stats()
        assert stats["applied_count"] == 2
        assert stats["responded_count"] == 1
        assert stats["response_rate"] == 50.0

    def test_response_rate_no_applications(self, tracker):
        tracker.save_job(_sample_job())
        stats = tracker.get_stats()
        assert stats["response_rate"] == 0.0

    def test_empty_stats(self, tracker):
        stats = tracker.get_stats()
        assert stats["total"] == 0
        assert stats["response_rate"] == 0.0
        assert stats["avg_days_to_response"] == 0.0


class TestGetJob:
    def test_returns_job(self, tracker):
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)
        assert job is not None
        assert job["id"] == job_id

    def test_nonexistent_returns_none(self, tracker):
        assert tracker.get_job("00000000-0000-0000-0000-000000000999") is None

    def test_empty_id_returns_none(self, tracker):
        assert tracker.get_job("") is None
        assert tracker.get_job(None) is None


# ---------------------------------------------------------------------------
# CAR-156 / CAR-165 carry-over tests
# ---------------------------------------------------------------------------


class TestSaveJobWithStatus:
    def test_default_status_still_found(self, tracker):
        job_id = tracker.save_job(_sample_job())
        assert tracker.get_job(job_id)["status"] == "found"

    def test_custom_status_persists(self, tracker):
        job_id = tracker.save_job(_sample_job(), status="interested")
        assert tracker.get_job(job_id)["status"] == "interested"

    def test_invalid_status_raises(self, tracker):
        with pytest.raises(ValueError):
            tracker.save_job(_sample_job(), status="garbage")

    def test_message_id_persists(self, tracker):
        job = _sample_job()
        job["message_id"] = "gmail_msg_abc123"
        job_id = tracker.save_job(job)
        row = tracker.get_job(job_id)
        assert row["message_id"] == "gmail_msg_abc123"

    def test_message_id_defaults_to_empty(self, tracker):
        job_id = tracker.save_job(_sample_job())
        assert tracker.get_job(job_id)["message_id"] == ""


class TestFindApplicationByMessageId:
    def test_finds_existing(self, tracker):
        job = _sample_job()
        job["message_id"] = "gmail_msg_xyz"
        job_id = tracker.save_job(job)

        result = tracker.find_application_by_message_id("gmail_msg_xyz")
        assert result is not None
        assert result["id"] == job_id

    def test_returns_none_for_missing(self, tracker):
        tracker.save_job(_sample_job())  # No message_id
        assert tracker.find_application_by_message_id("nonexistent") is None

    def test_returns_none_for_empty(self, tracker):
        assert tracker.find_application_by_message_id("") is None
        assert tracker.find_application_by_message_id(None) is None


class TestFindByUrl:
    def test_returns_row_when_url_matches(self, tracker):
        app_id = tracker.save_job(_sample_job(url="https://acme.com/job/123"))
        result = tracker.find_by_url("https://acme.com/job/123")
        assert result is not None
        assert result["id"] == app_id
        assert result["url"] == "https://acme.com/job/123"

    def test_returns_none_when_empty_url(self, tracker):
        tracker.save_job(_sample_job(url=""))
        assert tracker.find_by_url("") is None
        assert tracker.find_by_url("   ") is None
        assert tracker.find_by_url(None) is None

    def test_returns_none_when_no_match(self, tracker):
        tracker.save_job(_sample_job(url="https://example.com/a"))
        assert tracker.find_by_url("https://example.com/b") is None

    def test_trims_whitespace_on_lookup(self, tracker):
        tracker.save_job(_sample_job(url="https://acme.com/job/1"))
        result = tracker.find_by_url("  https://acme.com/job/1  ")
        assert result is not None


class TestSaveJobNotes:
    def test_notes_from_job_data_persisted(self, tracker):
        app_id = tracker.save_job(_sample_job(notes="Referred by Jane"))
        row = tracker.get_job(app_id)
        assert row["notes"] == "Referred by Jane"

    def test_notes_default_empty_when_not_provided(self, tracker):
        app_id = tracker.save_job(_sample_job())
        row = tracker.get_job(app_id)
        assert row["notes"] == ""


# ---------------------------------------------------------------------------
# user_id scoping — CAR-165 new behavior
# ---------------------------------------------------------------------------


class TestUserIdScoping:
    def test_get_all_jobs_filters_by_user_id(self):
        """Rows owned by other users are invisible to get_all_jobs."""
        client = FakeSupabaseClient()
        alice = ApplicationTracker(client=client, user_id="alice-uuid")
        bob = ApplicationTracker(client=client, user_id="bob-uuid")

        alice.save_job(_sample_job(title="Alice's job"))
        bob.save_job(_sample_job(title="Bob's job"))

        alice_jobs = alice.get_all_jobs()
        bob_jobs = bob.get_all_jobs()
        assert len(alice_jobs) == 1
        assert alice_jobs[0]["title"] == "Alice's job"
        assert len(bob_jobs) == 1
        assert bob_jobs[0]["title"] == "Bob's job"

    def test_update_status_cannot_touch_other_users_rows(self):
        client = FakeSupabaseClient()
        alice = ApplicationTracker(client=client, user_id="alice-uuid")
        bob = ApplicationTracker(client=client, user_id="bob-uuid")

        alice_job_id = alice.save_job(_sample_job())
        # Bob tries to update Alice's row — silently fails because the
        # user_id filter returns no rows.
        result = bob.update_status(alice_job_id, "applied")
        assert result is False
        assert alice.get_job(alice_job_id)["status"] == "found"


# ---------------------------------------------------------------------------
# Integration smoke test — skipped unless real Supabase creds and user_id
# are configured. Proves the full save → read round-trip works against
# actual Supabase, per CAR-165 acceptance criteria.
# ---------------------------------------------------------------------------

_REAL_URL = os.getenv("SUPABASE_URL", "")
_REAL_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
_REAL_USER_ID = os.getenv("CAREERPILOT_USER_ID", "")


@pytest.mark.skipif(
    not (
        _REAL_URL
        and _REAL_KEY
        and _REAL_USER_ID
        and "your-project" not in _REAL_URL
        and _REAL_USER_ID != "00000000-0000-0000-0000-000000000000"
    ),
    reason=(
        "Real SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CAREERPILOT_USER_ID "
        "not set — skipping live smoke test"
    ),
)
def test_smoke_round_trip_against_live_supabase():
    """Insert → find by URL → update status → verify on real Supabase.

    Uses a URL that shouldn't collide with real job data. Row is left
    behind (status='withdrawn') for manual cleanup — this smoke test is
    explicitly not idempotent; re-runs will insert duplicate rows.
    """
    tracker = ApplicationTracker()
    unique_url = f"https://test.careerpilot.invalid/smoke/{uuid.uuid4()}"
    job_id = tracker.save_job({
        "title": "[CAR-165 smoke test]",
        "company": "Smoke Test Co",
        "url": unique_url,
        "source": "pytest",
    })
    assert job_id, "save_job must return a UUID"

    found = tracker.find_by_url(unique_url)
    assert found is not None
    assert found["id"] == job_id

    updated = tracker.update_status(job_id, "withdrawn")
    assert updated is True

    final = tracker.get_job(job_id)
    assert final["status"] == "withdrawn"
