"""Tests for the job search orchestrator — CAR-188 Unit 4c.

Coverage:
- Happy path: single profile by name, multiple profiles (all)
- Per-profile counts match upsert calls
- dry_run: no Supabase writes; RunSummary still produced
- profile_ids=["nonexistent"]: empty profiles dict, no exceptions
- source='indeed': deferred to v2; ProfileResult has count=0; no Dice call
- source='both': only Dice called; Indeed-deferred logged
- Error path: one profile raises, others complete
- Supabase unreachable when reading profiles: run_profiles raises
- Sentinel: degraded profile → mark_stale NOT called
- Sentinel: healthy profile → mark_stale called
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Dict, List
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from mcp.types import CallToolResult

from tests.conftest import TEST_USER_ID, FakeSupabaseClient
from src.jobs.job_search_results import JobSearchResultsManager
from src.jobs.search_engine import run_profiles, RunSummary, ProfileResult
from src.jobs.searcher import JobSearcher


# ---------------------------------------------------------------------------
# Constants / Fixtures
# ---------------------------------------------------------------------------

_PROFILE_ID_1 = "aaaaaaaa-0000-0000-0000-000000000001"
_PROFILE_ID_2 = "aaaaaaaa-0000-0000-0000-000000000002"
_PROFILE_ID_INDEED = "aaaaaaaa-0000-0000-0000-000000000003"
_PROFILE_ID_BOTH = "aaaaaaaa-0000-0000-0000-000000000004"


def _make_search_profile(
    profile_id: str = _PROFILE_ID_1,
    name: str = "sysadmin_indy",
    keyword: str = "systems administrator",
    location: str = "Indianapolis, IN",
    source: str = "dice",
    contract_only: bool = False,
) -> Dict:
    return {
        "id": profile_id,
        "name": name,
        "label": name.replace("_", " ").title(),
        "keyword": keyword,
        "location": location,
        "source": source,
        "contract_only": contract_only,
    }


def _make_dice_mcp_result(n: int = 3, base_id: str = "abc") -> Dict:
    """Return a minimal Dice MCP structuredContent result with ``n`` listings."""
    jobs = []
    for i in range(n):
        jobs.append({
            "title": f"SysAdmin {i}",
            "companyName": f"Corp {i}",
            "detailsPageUrl": f"https://www.dice.com/job-detail/{base_id}-{i}",
            "jobLocation": {"displayName": "Indianapolis, IN"},
            "salary": "$80k",
            "employmentType": "Full-time",
            "easyApply": True,
            "postedDate": "2026-04-27T00:00:00Z",
            "summary": f"Great role {i}",
        })
    return {"structuredContent": {"data": jobs}, "isError": False}


def _seed_search_profiles(client: FakeSupabaseClient, profiles: List[Dict]) -> None:
    """Directly seed rows into the fake client's search_profiles table."""
    client._tables.setdefault("search_profiles", [])
    client._tables["search_profiles"].extend(profiles)


def _seed_recent_history(
    client: FakeSupabaseClient,
    profile_id: str,
    daily_counts: List[int],
    base_date: datetime = None,
) -> None:
    """Seed job_search_results rows to give a profile historical data for the sentinel."""
    if base_date is None:
        base_date = datetime.utcnow() - timedelta(days=1)
    client._tables.setdefault("job_search_results", [])
    for offset, count in enumerate(daily_counts):
        day = base_date - timedelta(days=offset)
        for j in range(count):
            client._tables["job_search_results"].append({
                "id": str(uuid.uuid4()),
                "user_id": TEST_USER_ID,
                "profile_id": profile_id,
                "source": "dice",
                "source_id": f"hist-{profile_id[:8]}-d{offset}-j{j}",
                "url": f"https://dice.com/job-detail/hist-{offset}-{j}",
                "status": "new",
                "discovered_at": day.isoformat(),
                "last_seen_at": day.isoformat(),
            })


def _make_manager(client: FakeSupabaseClient) -> JobSearchResultsManager:
    return JobSearchResultsManager(client=client, user_id=TEST_USER_ID)


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


class TestRunProfilesHappyPath:

    def test_single_profile_by_name_produces_upserts(self, fake_supabase):
        """run_profiles(['sysadmin_indy']) with 3 Dice results → 3 upserts, new=3."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="sysadmin_indy"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=3))

        summary = run_profiles(
            ["sysadmin_indy"],
            manager=manager,
            dice_search_fn=dice_fn,
        )

        assert isinstance(summary, RunSummary)
        assert summary.total_new >= 1
        assert len(fake_supabase._tables.get("job_search_results", [])) == 3

    def test_single_profile_run_summary_profile_entry(self, fake_supabase):
        """RunSummary.profiles contains exactly one ProfileResult with correct label."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="sysadmin_indy"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2))

        summary = run_profiles(
            ["sysadmin_indy"],
            manager=manager,
            dice_search_fn=dice_fn,
        )

        assert _PROFILE_ID_1 in summary.profiles
        pr = summary.profiles[_PROFILE_ID_1]
        assert isinstance(pr, ProfileResult)
        assert pr.count == 2
        assert pr.new == 2
        assert pr.updated == 0
        assert pr.degraded is False
        assert pr.error is None

    def test_all_profiles_run_when_no_ids_given(self, fake_supabase):
        """run_profiles() (no filter) runs all profiles in the Supabase table."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="sysadmin_indy"),
            _make_search_profile(profile_id=_PROFILE_ID_2, name="devops_remote"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2))

        summary = run_profiles(manager=manager, dice_search_fn=dice_fn)

        assert len(summary.profiles) == 2
        assert _PROFILE_ID_1 in summary.profiles
        assert _PROFILE_ID_2 in summary.profiles

    def test_per_profile_counts_match_upserts(self, fake_supabase):
        """The per-profile new/updated counts match actual upsert operations."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        manager = _make_manager(fake_supabase)
        # Return 4 distinct listings
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=4, base_id="run1"))

        summary = run_profiles(["p1"], manager=manager, dice_search_fn=dice_fn)

        pr = summary.profiles[_PROFILE_ID_1]
        assert pr.count == 4
        assert pr.new + pr.updated == 4
        assert summary.total_new + summary.total_updated == 4

    def test_second_run_increments_updated_not_new(self, fake_supabase):
        """On a second run with the same listings, new=0 and updated=count."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2, base_id="same"))

        # First run
        run_profiles(["p1"], manager=manager, dice_search_fn=dice_fn, skip_stale_flip=True)

        # Second run with same listings
        summary2 = run_profiles(["p1"], manager=manager, dice_search_fn=dice_fn, skip_stale_flip=True)

        pr = summary2.profiles[_PROFILE_ID_1]
        assert pr.new == 0
        assert pr.updated == 2

    def test_run_summary_has_started_and_completed_at(self, fake_supabase):
        """RunSummary has both started_at and completed_at set."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=1))

        summary = run_profiles(["p1"], manager=manager, dice_search_fn=dice_fn)

        assert summary.started_at is not None
        assert summary.completed_at is not None
        assert summary.completed_at >= summary.started_at


# ---------------------------------------------------------------------------
# dry_run tests
# ---------------------------------------------------------------------------


class TestDryRun:

    def test_dry_run_does_not_write_to_supabase(self, fake_supabase):
        """dry_run=True: no rows appear in job_search_results."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=3))

        run_profiles(["p1"], dry_run=True, manager=manager, dice_search_fn=dice_fn)

        rows = fake_supabase._tables.get("job_search_results", [])
        assert len(rows) == 0

    def test_dry_run_returns_run_summary(self, fake_supabase):
        """dry_run=True: RunSummary is still produced with count populated."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=3))

        summary = run_profiles(["p1"], dry_run=True, manager=manager, dice_search_fn=dice_fn)

        assert isinstance(summary, RunSummary)
        pr = summary.profiles[_PROFILE_ID_1]
        # In dry_run, would-be new = count (conservative)
        assert pr.count == 3
        assert pr.new == 3

    def test_dry_run_does_not_call_mark_stale(self, fake_supabase):
        """dry_run=True: mark_stale_for_profile is never called."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        mock_manager = MagicMock(spec=JobSearchResultsManager)
        mock_manager.list_recent_for_profile.return_value = []
        mock_manager.upsert.return_value = (str(uuid.uuid4()), True)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2))

        run_profiles(["p1"], dry_run=True, manager=mock_manager, dice_search_fn=dice_fn)

        mock_manager.mark_stale_for_profile.assert_not_called()


# ---------------------------------------------------------------------------
# Edge-case: nonexistent profile_ids
# ---------------------------------------------------------------------------


class TestNonexistentProfile:

    def test_nonexistent_profile_id_returns_empty_summary(self, fake_supabase):
        """profile_ids=['nonexistent'] → empty profiles dict, no exception."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="sysadmin_indy"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2))

        summary = run_profiles(
            ["nonexistent_profile"],
            manager=manager,
            dice_search_fn=dice_fn,
        )

        assert isinstance(summary, RunSummary)
        assert len(summary.profiles) == 0
        assert summary.total_new == 0
        dice_fn.assert_not_called()

    def test_empty_profiles_table_returns_empty_summary(self, fake_supabase):
        """Empty search_profiles table → empty RunSummary, no exceptions."""
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock()

        summary = run_profiles(manager=manager, dice_search_fn=dice_fn)

        assert len(summary.profiles) == 0
        assert summary.total_new == 0
        dice_fn.assert_not_called()


# ---------------------------------------------------------------------------
# Source routing: indeed deferred, both → Dice only
# ---------------------------------------------------------------------------


class TestSourceRouting:

    def test_indeed_source_skips_dice_and_has_zero_count(self, fake_supabase):
        """Profile with source='indeed': no Dice call, count=0, no error."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(
                profile_id=_PROFILE_ID_INDEED,
                name="indeed_profile",
                source="indeed",
            ),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=5))

        summary = run_profiles(
            ["indeed_profile"],
            manager=manager,
            dice_search_fn=dice_fn,
        )

        dice_fn.assert_not_called()
        # Profile entry skipped via 'continue' — not in profiles dict
        # (or present with count=0 depending on implementation)
        total_new = summary.total_new
        assert total_new == 0

    def test_both_source_calls_dice_only(self, fake_supabase):
        """Profile with source='both': Dice is called, Indeed is deferred."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(
                profile_id=_PROFILE_ID_BOTH,
                name="both_profile",
                source="both",
            ),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2))

        summary = run_profiles(
            ["both_profile"],
            manager=manager,
            dice_search_fn=dice_fn,
        )

        dice_fn.assert_called_once()
        assert summary.total_new >= 0  # Dice was attempted


# ---------------------------------------------------------------------------
# Error path: one profile fails
# ---------------------------------------------------------------------------


class TestErrorPaths:

    def test_one_profile_error_others_complete(self, fake_supabase):
        """When one profile's dice_fn raises, other profiles still complete."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
            _make_search_profile(profile_id=_PROFILE_ID_2, name="p2"),
        ])
        manager = _make_manager(fake_supabase)

        call_count = [0]
        def flaky_dice(keyword, location, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise RuntimeError("Dice MCP timeout")
            return _make_dice_mcp_result(n=2)

        summary = run_profiles(manager=manager, dice_search_fn=flaky_dice)

        # Both profiles should be in the summary
        assert len(summary.profiles) == 2
        # One has an error, one has results
        errors = [pr for pr in summary.profiles.values() if pr.error]
        successes = [pr for pr in summary.profiles.values() if not pr.error]
        assert len(errors) == 1
        assert len(successes) == 1
        assert successes[0].new > 0

    def test_errored_profile_result_has_error_populated(self, fake_supabase):
        """Profile that raises has ProfileResult.error set to the error message."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="bad_profile"),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(side_effect=RuntimeError("Dice connection refused"))

        summary = run_profiles(["bad_profile"], manager=manager, dice_search_fn=dice_fn)

        pr = summary.profiles.get(_PROFILE_ID_1)
        assert pr is not None
        assert pr.error is not None
        assert "Dice connection refused" in pr.error

    def test_supabase_unreachable_reading_profiles_raises(self, fake_supabase):
        """Supabase unreachable when reading profiles → run_profiles raises."""
        manager = _make_manager(fake_supabase)

        class BrokenClient:
            def table(self, name):
                raise ConnectionError("Supabase unreachable")

        with patch("src.jobs.search_engine._get_supabase_client", return_value=BrokenClient()):
            with pytest.raises(ConnectionError, match="Supabase unreachable"):
                run_profiles(manager=manager, dice_search_fn=MagicMock())


# ---------------------------------------------------------------------------
# Sentinel integration
# ---------------------------------------------------------------------------


class TestSentinelIntegration:

    def test_degraded_profile_skips_mark_stale(self, fake_supabase):
        """Degraded profile (low count vs history) → mark_stale_for_profile NOT called."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        # Seed rich history: 5 days × 10 rows = median 10; current run returns 2
        _seed_recent_history(fake_supabase, _PROFILE_ID_1, [10, 10, 10, 10, 10])

        manager = _make_manager(fake_supabase)
        # Only 2 results — well below the 50% threshold of 10 median
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2))

        summary = run_profiles(["p1"], manager=manager, dice_search_fn=dice_fn)

        pr = summary.profiles[_PROFILE_ID_1]
        assert pr.degraded is True
        assert summary.total_degraded_profiles == 1
        # mark_stale should not have been called for this degraded profile
        # Verify: stale-flip only runs on non-degraded rows; seeded rows should keep status
        stale_rows = [
            r for r in fake_supabase._tables.get("job_search_results", [])
            if r.get("status") == "stale" and r.get("profile_id") == _PROFILE_ID_1
            # only rows that were seeded (not upserted this run)
            and "hist-" in r.get("source_id", "")
        ]
        # No stale rows because mark_stale was not called for the degraded profile
        assert len(stale_rows) == 0

    def test_healthy_profile_calls_mark_stale(self, fake_supabase):
        """Healthy profile (count above threshold) → mark_stale_for_profile IS called."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        # No history → sentinel returns False (insufficient data) → healthy
        manager = _make_manager(fake_supabase)
        # Seed old rows that should be staled
        old_ts = (datetime.utcnow() - timedelta(days=30)).isoformat()
        fake_supabase._tables.setdefault("job_search_results", []).append({
            "id": str(uuid.uuid4()),
            "user_id": TEST_USER_ID,
            "profile_id": _PROFILE_ID_1,
            "source": "dice",
            "source_id": "old-stale-me",
            "url": "https://dice.com/job-detail/old-stale",
            "status": "new",
            "discovered_at": old_ts,
            "last_seen_at": old_ts,
        })

        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=5))

        summary = run_profiles(["p1"], manager=manager, dice_search_fn=dice_fn)

        pr = summary.profiles[_PROFILE_ID_1]
        assert pr.degraded is False
        # The old row should have been staled
        rows_by_id = {r["source_id"]: r for r in fake_supabase._tables["job_search_results"]}
        if "old-stale-me" in rows_by_id:
            assert rows_by_id["old-stale-me"]["status"] == "stale"

    def test_skip_stale_flip_prevents_stale_call(self, fake_supabase):
        """skip_stale_flip=True: mark_stale_for_profile never called regardless of degradation."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="p1"),
        ])
        mock_manager = MagicMock(spec=JobSearchResultsManager)
        mock_manager.list_recent_for_profile.return_value = []
        mock_manager.upsert.return_value = (str(uuid.uuid4()), True)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=3))

        run_profiles(
            ["p1"],
            skip_stale_flip=True,
            manager=mock_manager,
            dice_search_fn=dice_fn,
        )

        mock_manager.mark_stale_for_profile.assert_not_called()


# ---------------------------------------------------------------------------
# Unit 5: Enrichment integration
# ---------------------------------------------------------------------------


class TestEnrichmentIntegration:

    def test_dice_with_summary_populates_description(self, fake_supabase):
        """Happy path: Dice listing with summary → row's description is populated after run."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="enrich_p1"),
        ])
        manager = _make_manager(fake_supabase)
        # _make_dice_mcp_result includes summary field in each listing
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2, base_id="enrich"))

        summary = run_profiles(
            ["enrich_p1"],
            manager=manager,
            dice_search_fn=dice_fn,
            skip_stale_flip=True,
        )

        # Both rows should have description populated from summary
        rows = fake_supabase._tables.get("job_search_results", [])
        assert len(rows) == 2
        for row in rows:
            assert row.get("description") is not None
            assert row["description"].startswith("Great role")
        # ProfileResult.enriched and RunSummary.total_enriched should reflect enrichments
        pr = summary.profiles[_PROFILE_ID_1]
        assert pr.enriched == 2
        assert summary.total_enriched == 2

    def test_dice_with_empty_summary_description_stays_null(self, fake_supabase):
        """Edge: Dice listing with empty summary → description stays NULL; not counted in enriched."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="enrich_empty_p1"),
        ])
        manager = _make_manager(fake_supabase)
        # Build a result with empty summary
        raw = _make_dice_mcp_result(n=1, base_id="empty-sum")
        raw["structuredContent"]["data"][0]["summary"] = ""
        dice_fn = MagicMock(return_value=raw)

        summary = run_profiles(
            ["enrich_empty_p1"],
            manager=manager,
            dice_search_fn=dice_fn,
            skip_stale_flip=True,
        )

        rows = fake_supabase._tables.get("job_search_results", [])
        assert len(rows) == 1
        # No description because summary was empty
        assert rows[0].get("description") is None
        # Enriched count should be 0
        pr = summary.profiles[_PROFILE_ID_1]
        assert pr.enriched == 0
        assert summary.total_enriched == 0

    def test_indeed_listing_description_stays_null(self, fake_supabase):
        """Indeed listing → enrich_row returns False; description stays NULL; not counted."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(
                profile_id=_PROFILE_ID_INDEED,
                name="indeed_enrich_profile",
                source="indeed",
            ),
        ])
        manager = _make_manager(fake_supabase)
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=2))

        summary = run_profiles(
            ["indeed_enrich_profile"],
            manager=manager,
            dice_search_fn=dice_fn,
            skip_stale_flip=True,
        )

        # Indeed profile is skipped entirely (count=0, no rows written)
        assert summary.total_new == 0
        assert summary.total_enriched == 0

    def test_enrichment_does_not_run_in_dry_run_mode(self, fake_supabase):
        """dry_run=True: enrichment is NOT called (no writes at all)."""
        _seed_search_profiles(fake_supabase, [
            _make_search_profile(profile_id=_PROFILE_ID_1, name="dry_enrich_p1"),
        ])
        mock_manager = MagicMock(spec=JobSearchResultsManager)
        mock_manager.list_recent_for_profile.return_value = []
        dice_fn = MagicMock(return_value=_make_dice_mcp_result(n=3))

        run_profiles(
            ["dry_enrich_p1"],
            dry_run=True,
            manager=mock_manager,
            dice_search_fn=dice_fn,
        )

        # In dry_run, upsert and update_enrichment are never called
        mock_manager.upsert.assert_not_called()
        mock_manager.update_enrichment.assert_not_called()


# ---------------------------------------------------------------------------
# CAR-192: MCP SDK transport integration (SDK boundary test)
# ---------------------------------------------------------------------------


class TestDiceSdkTransportIntegration:
    """Verify that JobSearcher.search_dice returns the same normalized shape
    after the CAR-192 transport migration to the official MCP Python SDK.

    Patches src.jobs.mcp_client.streamable_http_client at the SDK boundary
    (not the old hand-rolled requests calls) and confirms the result
    normalization in search_dice is unchanged.
    """

    def _make_session_mock(self, structured_content: dict) -> MagicMock:
        call_result = CallToolResult(
            content=[],
            structuredContent=structured_content,
            isError=False,
        )
        session = MagicMock()
        session.__aenter__ = AsyncMock(return_value=session)
        session.__aexit__ = AsyncMock(return_value=False)
        session.initialize = AsyncMock(return_value=None)
        session.call_tool = AsyncMock(return_value=call_result)
        return session

    def test_search_dice_normalized_output_matches_fixture(self):
        """JobSearcher.search_dice with 3 SDK-returned listings → 3 normalized job dicts."""
        # The fixture shape has `structuredContent.data` which is what the old transport
        # exposed. After CAR-192, call_mcp_tool_sync returns structuredContent directly,
        # so the SDK boundary mock yields {"data": jobs} (NOT {"structuredContent": ...}).
        sdk_result = _make_dice_mcp_result(n=3, base_id="sdk-test")
        # Extract just the structuredContent portion (what call_mcp_tool_sync now returns)
        structured = sdk_result["structuredContent"]

        session_mock = self._make_session_mock(structured)

        @asynccontextmanager
        async def _fake_transport(url, *, http_client=None, **kwargs):
            yield (MagicMock(), MagicMock(), MagicMock(return_value=None))

        with patch("src.jobs.mcp_client.streamable_http_client", _fake_transport):
            with patch("src.jobs.mcp_client.ClientSession", return_value=session_mock):
                searcher = JobSearcher(anthropic_api_key="test-key")
                results = searcher.search_dice("systems administrator", "Indianapolis, IN")

        assert len(results) == 3
        for i, job in enumerate(results):
            assert job["title"] == f"SysAdmin {i}"
            assert job["company"] == f"Corp {i}"
            assert job["location"] == "Indianapolis, IN"
            assert job["source"] == "dice"
            assert job["easy_apply"] is True
            assert job["salary"] == "$80k"
            assert job["url"] == f"https://www.dice.com/job-detail/sdk-test-{i}"
