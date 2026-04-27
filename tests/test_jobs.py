"""Tests for job search via Indeed and Dice MCP servers."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from src.jobs.searcher import JobSearcher, _is_irrelevant, _parse_json_response


def _mock_dice_mcp_result(jobs):
    """Create a mock Dice MCP result dict matching the direct HTTP response shape."""
    return {
        "structuredContent": {
            "data": jobs,
            "meta": {"currentPage": 1, "pageCount": 1, "pageSize": 10, "totalResults": len(jobs)},
        },
        "content": [{"type": "text", "text": json.dumps({"data": jobs})}],
        "isError": False,
    }


# NOTE: TestSearchProfiles removed in CAR-188 — SEARCH_PROFILES dict was deleted
# from config/search_profiles.py.  Profiles are now stored in the Supabase
# search_profiles table; see tests/test_search_engine.py for engine-level coverage.

# --- Indeed Search Tests ---


class TestSearchIndeed:
    def test_skipped_returns_empty(self):
        """Indeed is disabled — returns empty list with a warning."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        results = searcher.search_indeed("systems administrator", "Indianapolis, IN")
        assert results == []

    def test_logs_warning(self):
        """Logs a warning explaining Indeed is not yet supported."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        with patch("src.jobs.searcher.logger") as mock_logger:
            searcher.search_indeed("test", "test")
            mock_logger.warning.assert_called_once()
            assert "Indeed" in mock_logger.warning.call_args[0][0]


# --- Dice Search Tests ---


class TestSearchDice:
    def test_returns_parsed_results(self):
        """Parses Dice MCP response into structured results."""
        dice_jobs = [
            {"title": "DevOps Engineer", "companyName": "Cloud Corp",
             "jobLocation": {"displayName": "Indianapolis, IN"}, "salary": "$120k",
             "detailsPageUrl": "https://dice.com/job/1", "postedDate": "2026-03-20T00:00:00Z",
             "employmentType": "Full-time", "easyApply": True, "isRemote": False},
        ]

        searcher = JobSearcher(anthropic_api_key="fake-key")
        with patch("src.jobs.searcher._search_dice_direct", return_value=_mock_dice_mcp_result(dice_jobs)):
            results = searcher.search_dice("DevOps engineer", "Indianapolis, IN")

        assert len(results) == 1
        assert results[0]["source"] == "dice"
        assert results[0]["easy_apply"] is True
        assert results[0]["company"] == "Cloud Corp"

    def test_contract_only_flag(self):
        """Passes contract_only to the direct MCP call."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        with patch("src.jobs.searcher._search_dice_direct", return_value=_mock_dice_mcp_result([])) as mock_fn:
            searcher.search_dice("infra engineer", "Indianapolis, IN", contract_only=True)

            mock_fn.assert_called_once()
            call_kwargs = mock_fn.call_args
            assert call_kwargs[1]["contract_only"] is True

    def test_mcp_failure_returns_empty(self):
        """Returns empty list on MCP failure."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        with patch("src.jobs.searcher._search_dice_direct", side_effect=Exception("MCP error")):
            results = searcher.search_dice("test", "test")

        assert results == []


# --- Deduplication Tests ---


class TestDeduplication:
    def test_removes_duplicates(self):
        """Removes duplicate jobs by title + company (case-insensitive)."""
        results = [
            {"title": "Systems Admin", "company": "Acme Corp", "source": "indeed"},
            {"title": "systems admin", "company": "acme corp", "source": "dice"},
            {"title": "DevOps Engineer", "company": "Beta Inc", "source": "indeed"},
        ]
        unique = JobSearcher._deduplicate(results)
        assert len(unique) == 2

    def test_keeps_first_occurrence(self):
        """Keeps the first occurrence when deduplicating."""
        results = [
            {"title": "Admin", "company": "Corp", "source": "indeed"},
            {"title": "Admin", "company": "Corp", "source": "dice"},
        ]
        unique = JobSearcher._deduplicate(results)
        assert unique[0]["source"] == "indeed"

    def test_no_duplicates_unchanged(self):
        """Returns all results when no duplicates exist."""
        results = [
            {"title": "Job A", "company": "Corp A"},
            {"title": "Job B", "company": "Corp B"},
        ]
        unique = JobSearcher._deduplicate(results)
        assert len(unique) == 2


# --- Irrelevant Filtering Tests ---


class TestIrrelevantFilter:
    def test_filters_pest_control(self):
        assert _is_irrelevant("Pest Control Technician") is True

    def test_filters_hvac(self):
        assert _is_irrelevant("HVAC Systems Engineer") is True

    def test_filters_civil_engineer(self):
        assert _is_irrelevant("Civil Engineer III") is True

    def test_keeps_systems_admin(self):
        assert _is_irrelevant("Systems Administrator") is False

    def test_keeps_devops(self):
        assert _is_irrelevant("DevOps Engineer") is False

    def test_filters_construction(self):
        assert _is_irrelevant("Construction Project Manager") is True


# --- Run Profiles Tests (deprecated path) ---


class TestRunProfiles:
    def test_deprecated_run_profiles_raises_not_implemented(self):
        """JobSearcher.run_profiles() is deprecated in CAR-188 — raises NotImplementedError."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        with pytest.raises(NotImplementedError, match="CAR-188"):
            searcher.run_profiles(["sysadmin_local"])

    def test_deprecated_run_profiles_all_raises_not_implemented(self):
        """Calling run_profiles() without args also raises NotImplementedError."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        with pytest.raises(NotImplementedError):
            searcher.run_profiles()


# --- JSON Parsing Tests ---


class TestParseJsonResponse:
    def test_parses_array(self):
        result = _parse_json_response('[{"title": "Job"}]')
        assert len(result) == 1

    def test_strips_fences(self):
        result = _parse_json_response('```json\n[{"title": "Job"}]\n```')
        assert len(result) == 1

    def test_handles_wrapped_results(self):
        """Handles JSON with a 'results' key."""
        result = _parse_json_response('{"results": [{"title": "Job"}]}')
        assert len(result) == 1

    def test_bad_json_returns_none(self):
        result = _parse_json_response("not json")
        assert result is None

    def test_empty_array(self):
        result = _parse_json_response("[]")
        assert result == []
