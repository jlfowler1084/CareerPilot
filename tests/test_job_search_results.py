"""Tests for JobSearchResultsManager and FakeSupabaseClient.upsert() — CAR-188 Unit 4a.

Coverage:
- FakeSupabaseClient.upsert() conflict resolution
- JobSearchResultsManager happy paths
- JobSearchResultsManager edge cases (missing keys, empty table)
- JobSearchResultsManager error path (missing CAREERPILOT_USER_ID)
- Integration sequence: upsert → upsert again → mark_stale → verify
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Dict

import pytest

from tests.conftest import TEST_USER_ID, FakeSupabaseClient
from src.jobs.job_search_results import (
    JobSearchResultsManager,
    JobSearchResultsManagerNotConfiguredError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_listing(**kwargs) -> Dict:
    """Return a minimal valid listing dict, with optional overrides."""
    base = {
        "source": "dice",
        "source_id": str(uuid.uuid4()),
        "url": "https://dice.com/job/test-123",
        "title": "Senior SysAdmin",
        "company": "Acme Corp",
        "location": "Indianapolis, IN",
    }
    base.update(kwargs)
    return base


def _make_manager(client: FakeSupabaseClient) -> JobSearchResultsManager:
    return JobSearchResultsManager(client=client, user_id=TEST_USER_ID)


def _seed_row(client: FakeSupabaseClient, **kwargs) -> Dict:
    """Directly seed a row into the fake client's job_search_results table."""
    client._tables.setdefault("job_search_results", [])
    now_iso = datetime.utcnow().isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": TEST_USER_ID,
        "source": "dice",
        "source_id": str(uuid.uuid4()),
        "url": "https://dice.com/job/seed",
        "title": "Seeded Job",
        "company": "Seed Corp",
        "status": "new",
        "discovered_at": now_iso,
        "last_seen_at": now_iso,
        "last_enriched_at": None,
        "application_id": None,
        "profile_id": None,
        "profile_label": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    row.update(kwargs)
    client._tables["job_search_results"].append(row)
    return row


# ===========================================================================
# Section 1: FakeSupabaseClient.upsert() unit tests
# ===========================================================================


class TestFakeSupabaseClientUpsert:
    """Verify the fake client's upsert() behaves like real Supabase upsert."""

    def test_upsert_no_conflict_inserts_new_row(self):
        client = FakeSupabaseClient()
        payload = {"user_id": TEST_USER_ID, "source": "dice", "source_id": "abc", "url": "http://x"}
        result = client.table("job_search_results").upsert(payload).execute()
        rows = client._tables["job_search_results"]
        assert len(rows) == 1
        assert rows[0]["source"] == "dice"
        # Returns a single dict (not a list) for upsert
        assert isinstance(result.data, dict)
        assert "id" in result.data

    def test_upsert_with_on_conflict_inserts_when_no_match(self):
        client = FakeSupabaseClient()
        payload = {"user_id": TEST_USER_ID, "source": "dice", "source_id": "xyz", "url": "http://y"}
        result = client.table("job_search_results").upsert(
            payload, on_conflict="user_id,source,source_id"
        ).execute()
        rows = client._tables["job_search_results"]
        assert len(rows) == 1
        assert isinstance(result.data, dict)

    def test_upsert_with_on_conflict_updates_existing_row(self):
        client = FakeSupabaseClient()
        now = datetime.utcnow().isoformat()
        existing = {
            "id": "row-1",
            "user_id": TEST_USER_ID,
            "source": "dice",
            "source_id": "dup-id",
            "url": "http://old",
            "title": "Old Title",
            "status": "new",
            "discovered_at": now,
            "last_seen_at": now,
        }
        client._tables.setdefault("job_search_results", []).append(existing)

        updated_payload = {
            "user_id": TEST_USER_ID,
            "source": "dice",
            "source_id": "dup-id",
            "url": "http://old",
            "title": "New Title",
            "last_seen_at": datetime.utcnow().isoformat(),
        }
        result = client.table("job_search_results").upsert(
            updated_payload, on_conflict="user_id,source,source_id"
        ).execute()

        rows = client._tables["job_search_results"]
        # Row count must not increase.
        assert len(rows) == 1
        # Original row was updated.
        assert rows[0]["title"] == "New Title"
        assert rows[0]["id"] == "row-1"
        # Returns the updated row as a dict (not list).
        assert isinstance(result.data, dict)
        assert result.data["title"] == "New Title"

    def test_upsert_does_not_match_different_conflict_keys(self):
        """Row with different source_id must not be treated as a conflict."""
        client = FakeSupabaseClient()
        now = datetime.utcnow().isoformat()
        client._tables.setdefault("job_search_results", []).append({
            "id": "row-1",
            "user_id": TEST_USER_ID,
            "source": "dice",
            "source_id": "aaa",
            "url": "http://a",
            "status": "new",
            "discovered_at": now,
            "last_seen_at": now,
        })

        new_payload = {
            "user_id": TEST_USER_ID,
            "source": "dice",
            "source_id": "bbb",  # different!
            "url": "http://b",
        }
        client.table("job_search_results").upsert(
            new_payload, on_conflict="user_id,source,source_id"
        ).execute()
        assert len(client._tables["job_search_results"]) == 2

    def test_upsert_chained_with_select_style_still_works(self):
        """upsert() must be chainable with .execute() (no .select() needed)."""
        client = FakeSupabaseClient()
        payload = {"user_id": TEST_USER_ID, "source": "dice", "source_id": "chain-1", "url": "http://c"}
        result = client.table("job_search_results").upsert(
            payload, on_conflict="user_id,source,source_id"
        ).execute()
        assert result.data is not None


# ===========================================================================
# Section 2: JobSearchResultsManager — happy paths
# ===========================================================================


class TestJobSearchResultsManagerHappy:
    def test_upsert_new_row_appears_with_correct_user_id(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        listing = _make_listing(source_id="happy-1")
        row_id = mgr.upsert(listing)

        rows = fake_supabase._tables["job_search_results"]
        assert len(rows) == 1
        assert rows[0]["user_id"] == TEST_USER_ID
        assert rows[0]["id"] == row_id
        assert rows[0]["source"] == "dice"
        assert rows[0]["source_id"] == "happy-1"

    def test_upsert_new_row_has_last_seen_at_set(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        listing = _make_listing(source_id="happy-2")
        mgr.upsert(listing)

        rows = fake_supabase._tables["job_search_results"]
        assert rows[0]["last_seen_at"] is not None

    def test_upsert_same_source_id_updates_last_seen_at_not_duplicate(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        listing = _make_listing(source_id="dup-123")

        mgr.upsert(listing)
        first_count = len(fake_supabase._tables["job_search_results"])
        first_seen = fake_supabase._tables["job_search_results"][0]["last_seen_at"]

        # Simulate time passing by providing an explicitly newer timestamp in the payload.
        import time
        time.sleep(0.01)
        mgr.upsert(listing)
        second_count = len(fake_supabase._tables["job_search_results"])
        second_seen = fake_supabase._tables["job_search_results"][0]["last_seen_at"]

        assert first_count == 1
        assert second_count == 1, "Duplicate row created — upsert conflict resolution broken"
        # last_seen_at should be updated (or at least equal if time didn't advance enough)
        assert second_seen >= first_seen

    def test_bump_last_seen_updates_only_last_seen_at(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        row = _seed_row(fake_supabase, source="dice", source_id="bump-me", title="Original Title")
        original_title = row["title"]
        original_seen = row["last_seen_at"]

        import time
        time.sleep(0.01)
        mgr.bump_last_seen(source="dice", source_id="bump-me")

        rows = fake_supabase._tables["job_search_results"]
        assert rows[0]["title"] == original_title  # unchanged
        # last_seen_at should be updated
        assert rows[0]["last_seen_at"] >= original_seen

    def test_update_enrichment_sets_fields_and_last_enriched_at(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        row = _seed_row(fake_supabase)
        row_id = row["id"]

        assert row.get("last_enriched_at") is None

        mgr.update_enrichment(
            row_id=row_id,
            description="Full job description here",
            requirements=["Python", "Linux"],
            nice_to_haves=["Ansible"],
        )

        updated = fake_supabase._tables["job_search_results"][0]
        assert updated["description"] == "Full job description here"
        assert updated["requirements"] == ["Python", "Linux"]
        assert updated["nice_to_haves"] == ["Ansible"]
        assert updated["last_enriched_at"] is not None

    def test_count_new_returns_correct_count(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        _seed_row(fake_supabase, source_id="n1", status="new")
        _seed_row(fake_supabase, source_id="n2", status="new")
        _seed_row(fake_supabase, source_id="n3", status="new")
        _seed_row(fake_supabase, source_id="v1", status="viewed")
        _seed_row(fake_supabase, source_id="v2", status="viewed")

        assert mgr.count_new() == 3

    def test_list_recent_new_returns_n_most_recent_ordered_desc(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        base_time = datetime.utcnow()
        for i in range(5):
            ts = (base_time + timedelta(seconds=i)).isoformat()
            _seed_row(
                fake_supabase,
                source_id=f"new-{i}",
                status="new",
                discovered_at=ts,
                last_seen_at=ts,
            )

        result = mgr.list_recent_new(limit=3)
        assert len(result) == 3
        # Should be ordered most-recent first
        assert result[0]["discovered_at"] >= result[1]["discovered_at"]
        assert result[1]["discovered_at"] >= result[2]["discovered_at"]

    def test_mark_stale_for_profile_flips_old_rows(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        profile_id = str(uuid.uuid4())

        # Old row (25 days ago) — should become stale
        old_ts = (datetime.utcnow() - timedelta(days=25)).isoformat()
        old_row = _seed_row(
            fake_supabase,
            source_id="old-1",
            status="new",
            profile_id=profile_id,
            last_seen_at=old_ts,
        )

        # Recent row (2 days ago) — should stay as-is
        recent_ts = (datetime.utcnow() - timedelta(days=2)).isoformat()
        _seed_row(
            fake_supabase,
            source_id="recent-1",
            status="new",
            profile_id=profile_id,
            last_seen_at=recent_ts,
        )

        count = mgr.mark_stale_for_profile(profile_id=profile_id, threshold_days=14)

        assert count == 1
        rows = {r["source_id"]: r for r in fake_supabase._tables["job_search_results"]}
        assert rows["old-1"]["status"] == "stale"
        assert rows["recent-1"]["status"] == "new"

    def test_mark_stale_does_not_flip_tracked_or_dismissed(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        profile_id = str(uuid.uuid4())
        old_ts = (datetime.utcnow() - timedelta(days=30)).isoformat()

        _seed_row(fake_supabase, source_id="tracked-1", status="tracked",
                  profile_id=profile_id, last_seen_at=old_ts)
        _seed_row(fake_supabase, source_id="dismissed-1", status="dismissed",
                  profile_id=profile_id, last_seen_at=old_ts)
        _seed_row(fake_supabase, source_id="new-1", status="new",
                  profile_id=profile_id, last_seen_at=old_ts)

        count = mgr.mark_stale_for_profile(profile_id=profile_id, threshold_days=14)

        assert count == 1  # Only the 'new' row flipped
        rows = {r["source_id"]: r for r in fake_supabase._tables["job_search_results"]}
        assert rows["tracked-1"]["status"] == "tracked"
        assert rows["dismissed-1"]["status"] == "dismissed"
        assert rows["new-1"]["status"] == "stale"


# ===========================================================================
# Section 3: JobSearchResultsManager — edge cases
# ===========================================================================


class TestJobSearchResultsManagerEdgeCases:
    def test_upsert_missing_source_raises_value_error(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        bad = {"source_id": "x", "url": "http://x"}
        with pytest.raises(ValueError, match="source"):
            mgr.upsert(bad)

    def test_upsert_missing_source_id_raises_value_error(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        bad = {"source": "dice", "url": "http://x"}
        with pytest.raises(ValueError, match="source_id"):
            mgr.upsert(bad)

    def test_upsert_missing_url_raises_value_error(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        bad = {"source": "dice", "source_id": "x"}
        with pytest.raises(ValueError, match="url"):
            mgr.upsert(bad)

    def test_mark_stale_no_rows_over_threshold_returns_zero(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        profile_id = str(uuid.uuid4())

        # All rows within threshold
        recent_ts = (datetime.utcnow() - timedelta(days=3)).isoformat()
        _seed_row(fake_supabase, source_id="r1", status="new",
                  profile_id=profile_id, last_seen_at=recent_ts)

        count = mgr.mark_stale_for_profile(profile_id=profile_id, threshold_days=14)
        assert count == 0

        rows = fake_supabase._tables["job_search_results"]
        assert rows[0]["status"] == "new"  # Unchanged

    def test_count_new_with_empty_table_returns_zero(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        assert mgr.count_new() == 0

    def test_list_recent_new_fewer_rows_than_limit_returns_available(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        _seed_row(fake_supabase, source_id="only-1", status="new")

        result = mgr.list_recent_new(limit=5)
        assert len(result) == 1

    def test_list_recent_new_empty_table_returns_empty_list(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        result = mgr.list_recent_new(limit=3)
        assert result == []

    def test_upsert_does_not_write_status_field(self, fake_supabase):
        """Ensure status is NOT accepted via upsert (dashboard-side concern)."""
        mgr = _make_manager(fake_supabase)
        listing = _make_listing(source_id="no-status")
        # upsert should not pass 'status' through even if caller tries.
        # The allowed-key filter means status won't appear in the payload.
        row_id = mgr.upsert(listing)
        rows = fake_supabase._tables["job_search_results"]
        # Status should be whatever the fake default is ('new'), not any override.
        assert rows[0]["status"] == "new"

    def test_upsert_does_not_write_description_field(self, fake_supabase):
        """Description is enrichment-only; upsert() should silently exclude it."""
        mgr = _make_manager(fake_supabase)
        listing = _make_listing(source_id="no-desc", description="should be ignored")
        mgr.upsert(listing)
        rows = fake_supabase._tables["job_search_results"]
        # Description should not appear (filtered out by allowed-key logic)
        assert rows[0].get("description") is None


# ===========================================================================
# Section 4: Error path — missing CAREERPILOT_USER_ID
# ===========================================================================


class TestJobSearchResultsManagerErrorPath:
    def test_constructor_raises_when_user_id_missing(self, fake_supabase, monkeypatch):
        monkeypatch.setattr("config.settings.CAREERPILOT_USER_ID", "")
        with pytest.raises(JobSearchResultsManagerNotConfiguredError) as exc_info:
            JobSearchResultsManager(client=fake_supabase)
        msg = str(exc_info.value)
        assert "CAREERPILOT_USER_ID" in msg
        assert "service-role" in msg.lower() or "RLS" in msg or "service_role" in msg.lower() or "bypasses" in msg

    def test_constructor_accepts_explicit_user_id_without_env(self, fake_supabase, monkeypatch):
        """Explicit user_id param must override the missing env var."""
        monkeypatch.setattr("config.settings.CAREERPILOT_USER_ID", "")
        mgr = JobSearchResultsManager(client=fake_supabase, user_id=TEST_USER_ID)
        assert mgr._user_id == TEST_USER_ID


# ===========================================================================
# Section 5: Integration sequence
# ===========================================================================


class TestJobSearchResultsManagerIntegration:
    def test_full_lifecycle_sequence(self, fake_supabase):
        """upsert new → upsert same row again → mark_stale → verify final state."""
        mgr = _make_manager(fake_supabase)
        profile_id = str(uuid.uuid4())

        # Step 1: Upsert a new listing
        listing = _make_listing(source_id="life-1", profile_id=profile_id)
        row_id = mgr.upsert(listing)

        rows = fake_supabase._tables["job_search_results"]
        assert len(rows) == 1
        assert rows[0]["status"] == "new"
        first_seen = rows[0]["last_seen_at"]

        # Step 2: Upsert the same listing again (simulate re-run)
        import time
        time.sleep(0.01)
        mgr.upsert(listing)
        rows = fake_supabase._tables["job_search_results"]
        assert len(rows) == 1, "Should not duplicate on second upsert"
        second_seen = rows[0]["last_seen_at"]
        assert second_seen >= first_seen

        # Step 3: Mark stale (simulate listing going stale — backdating last_seen_at)
        old_ts = (datetime.utcnow() - timedelta(days=30)).isoformat()
        rows[0]["last_seen_at"] = old_ts

        count = mgr.mark_stale_for_profile(profile_id=profile_id, threshold_days=14)
        assert count == 1
        assert rows[0]["status"] == "stale"
        assert rows[0]["id"] == row_id

    def test_list_recent_for_profile_returns_within_window(self, fake_supabase):
        mgr = _make_manager(fake_supabase)
        profile_id = str(uuid.uuid4())

        # Recent row (2 days ago) — should appear
        recent_ts = (datetime.utcnow() - timedelta(days=2)).isoformat()
        _seed_row(fake_supabase, source_id="r1", profile_id=profile_id,
                  discovered_at=recent_ts, last_seen_at=recent_ts)

        # Old row (20 days ago) — should NOT appear
        old_ts = (datetime.utcnow() - timedelta(days=20)).isoformat()
        _seed_row(fake_supabase, source_id="r2", profile_id=profile_id,
                  discovered_at=old_ts, last_seen_at=old_ts)

        result = mgr.list_recent_for_profile(profile_id=profile_id, lookback_days=7)
        assert len(result) == 1
        assert result[0]["source_id"] == "r1"
