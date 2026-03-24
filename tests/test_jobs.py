"""Tests for job search via Indeed and Dice MCP servers."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from src.jobs.searcher import JobSearcher, _is_irrelevant, _parse_json_response


def _mock_beta_response(text):
    """Create a mock beta messages response."""
    mock_response = MagicMock()
    mock_block = MagicMock()
    mock_block.text = text
    mock_response.content = [mock_block]
    return mock_response


# --- Search Profile Tests ---


class TestSearchProfiles:
    def test_profiles_load(self):
        """All profiles load from config."""
        from config.search_profiles import SEARCH_PROFILES

        assert len(SEARCH_PROFILES) == 8
        assert "sysadmin_local" in SEARCH_PROFILES
        assert "ad_identity" in SEARCH_PROFILES

    def test_profiles_have_required_fields(self):
        """Each profile has keyword, location, and sources."""
        from config.search_profiles import SEARCH_PROFILES

        for pid, profile in SEARCH_PROFILES.items():
            assert "keyword" in profile, f"{pid} missing keyword"
            assert "location" in profile, f"{pid} missing location"
            assert "sources" in profile, f"{pid} missing sources"
            assert profile["sources"] in ("both", "indeed", "dice"), f"{pid} invalid sources"

    def test_profile_labels(self):
        """Each profile has a human-readable label."""
        from config.search_profiles import SEARCH_PROFILES

        for pid, profile in SEARCH_PROFILES.items():
            assert "label" in profile, f"{pid} missing label"
            assert len(profile["label"]) > 0


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
        results_json = json.dumps([
            {"title": "DevOps Engineer", "company": "Cloud Corp",
             "location": "Indianapolis, IN", "salary": "$120k",
             "url": "https://dice.com/job/1", "posted_date": "3 days ago",
             "job_type": "Full-time", "easy_apply": True},
        ])

        searcher = JobSearcher(anthropic_api_key="fake-key")
        with patch.object(searcher, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.beta.messages.create.return_value = _mock_beta_response(results_json)
            mock_fn.return_value = mock_client

            results = searcher.search_dice("DevOps engineer", "Indianapolis, IN")

        assert len(results) == 1
        assert results[0]["source"] == "dice"
        assert results[0]["easy_apply"] is True

    def test_contract_only_flag(self):
        """Passes contract_only in the prompt."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        with patch.object(searcher, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.beta.messages.create.return_value = _mock_beta_response("[]")
            mock_fn.return_value = mock_client

            searcher.search_dice("infra engineer", "Indianapolis, IN", contract_only=True)

            call_args = mock_client.beta.messages.create.call_args
            user_msg = call_args[1]["messages"][0]["content"]
            assert "contract" in user_msg.lower()

    def test_mcp_failure_returns_empty(self):
        """Returns empty list on MCP failure."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        with patch.object(searcher, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.beta.messages.create.side_effect = Exception("MCP error")
            mock_fn.return_value = mock_client

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


# --- Run Profiles Tests ---


class TestRunProfiles:
    def test_runs_selected_profiles(self):
        """Runs only selected profiles."""
        searcher = JobSearcher(anthropic_api_key="fake-key")

        results_json = json.dumps([
            {"title": "SysAdmin", "company": "Corp", "location": "Indy",
             "salary": "", "url": "", "posted_date": "", "job_type": ""},
        ])

        with patch.object(searcher, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.beta.messages.create.return_value = _mock_beta_response(results_json)
            mock_fn.return_value = mock_client

            results = searcher.run_profiles(["sysadmin_local"])

        assert len(results) >= 1
        assert results[0]["profile_id"] == "sysadmin_local"

    def test_unknown_profile_skipped(self):
        """Unknown profiles are skipped."""
        searcher = JobSearcher(anthropic_api_key="fake-key")
        results = searcher.run_profiles(["nonexistent_profile"])
        assert results == []

    def test_filters_irrelevant_from_profiles(self):
        """Irrelevant results are filtered during run_profiles."""
        searcher = JobSearcher(anthropic_api_key="fake-key")

        results_json = json.dumps([
            {"title": "Systems Admin", "company": "Good Corp", "location": "Indy",
             "salary": "", "url": "", "posted_date": "", "job_type": ""},
            {"title": "HVAC Technician", "company": "Bad Corp", "location": "Indy",
             "salary": "", "url": "", "posted_date": "", "job_type": ""},
        ])

        with patch.object(searcher, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.beta.messages.create.return_value = _mock_beta_response(results_json)
            mock_fn.return_value = mock_client

            results = searcher.run_profiles(["sysadmin_local"])

        titles = [r["title"] for r in results]
        assert "Systems Admin" in titles
        assert "HVAC Technician" not in titles


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
