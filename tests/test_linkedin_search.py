"""Tests for the LinkedIn search adapter (CAR-189 Unit 3).

Coverage:
- search_linkedin with a mocked scan_emails -> returns normalised dicts
- search_linkedin with None gmail_service -> returns [] (graceful, no raise)
- search_linkedin field-shape contract matches search_dice output shape
- run_profiles integration: mock _linkedin_fn called for source='linkedin'
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.jobs.linkedin_search import search_linkedin


# ---------------------------------------------------------------------------
# Raw parser output fixture (as returned by scan_emails)
# ---------------------------------------------------------------------------

_RAW_JOBS = [
    {
        "title": "Systems Engineer",
        "company": "Acme Corp",
        "location": "Indianapolis, IN",
        "salary": "$90K-$120K / year",
        "url": "https://www.linkedin.com/jobs/view/1111111111/",
        "posted": "Mon, 28 Apr 2026 08:00:00 +0000",
        "source": "LinkedIn",
        "linkedin_job_id": "1111111111",
        "type": "",
    },
    {
        "title": "DevOps Engineer",
        "company": "Beta LLC",
        "location": "United States",
        "salary": "Not listed",
        "url": "https://www.linkedin.com/jobs/view/2222222222/",
        "posted": "Mon, 28 Apr 2026 09:00:00 +0000",
        "source": "LinkedIn",
        "linkedin_job_id": "2222222222",
        "type": "",
    },
]

_EXPECTED_FIELDS = {"title", "company", "location", "salary", "url", "source", "job_type", "posted_date", "easy_apply", "source_id"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_search_linkedin_returns_normalised_dicts():
    """search_linkedin returns dicts with the correct field shape."""
    fake_service = MagicMock()

    with patch("src.jobs.linkedin_search.scan_emails", return_value=_RAW_JOBS) as mock_scan:
        result = search_linkedin(fake_service, days=2)

    mock_scan.assert_called_once_with(fake_service, days=2)
    assert len(result) == 2

    for job in result:
        assert set(job.keys()) >= _EXPECTED_FIELDS, f"Missing keys: {_EXPECTED_FIELDS - job.keys()}"
        assert job["source"] == "linkedin"
        assert isinstance(job["easy_apply"], bool)

    assert result[0]["title"] == "Systems Engineer"
    assert result[0]["source_id"] == "1111111111"
    assert result[1]["title"] == "DevOps Engineer"
    assert result[1]["source_id"] == "2222222222"


def test_search_linkedin_none_service_returns_empty():
    """search_linkedin with None gmail_service returns [] without raising."""
    result = search_linkedin(None, days=2)
    assert result == []


def test_search_linkedin_maps_source_to_lowercase():
    """source field is always 'linkedin' (lowercase) regardless of parser output."""
    fake_service = MagicMock()
    with patch("src.jobs.linkedin_search.scan_emails", return_value=_RAW_JOBS):
        result = search_linkedin(fake_service, days=2)

    for job in result:
        assert job["source"] == "linkedin", "source must be lowercase 'linkedin' for DB constraint"


def test_search_linkedin_uses_url_as_source_id_when_no_job_id():
    """When linkedin_job_id is absent, source_id falls back to the URL."""
    raw = [
        {
            "title": "IT Specialist",
            "company": "Corp X",
            "location": "Indianapolis, IN",
            "salary": "Not listed",
            "url": "https://www.linkedin.com/jobs/view/3333333333/",
            "posted": "",
            "source": "LinkedIn",
            "linkedin_job_id": None,  # explicit None
            "type": "",
        }
    ]
    fake_service = MagicMock()
    with patch("src.jobs.linkedin_search.scan_emails", return_value=raw):
        result = search_linkedin(fake_service, days=2)

    assert result[0]["source_id"] == "https://www.linkedin.com/jobs/view/3333333333/"


def test_search_linkedin_graceful_on_scan_error():
    """search_linkedin returns [] if scan_emails raises unexpectedly."""
    fake_service = MagicMock()
    with patch("src.jobs.linkedin_search.scan_emails", side_effect=Exception("network error")):
        result = search_linkedin(fake_service, days=2)

    assert result == []


# ---------------------------------------------------------------------------
# Integration with run_profiles: _linkedin_fn injection
# ---------------------------------------------------------------------------


def test_run_profiles_calls_linkedin_fn_for_linkedin_source(monkeypatch):
    """run_profiles dispatches to _linkedin_fn when profile source='linkedin'."""
    from tests.conftest import TEST_USER_ID, FakeSupabaseClient
    from src.jobs.job_search_results import JobSearchResultsManager
    from src.jobs.search_engine import run_profiles

    client = FakeSupabaseClient()
    # Seed a single linkedin profile
    client._tables["search_profiles"] = [
        {
            "id": "bbbbbbbb-0000-0000-0000-000000000001",
            "name": "li_syseng",
            "keyword": "Systems Engineer",
            "location": "Indianapolis, IN",
            "source": "linkedin",
            "contract_only": False,
        }
    ]
    client._tables["job_search_results"] = []

    monkeypatch.setattr("src.db.supabase_client.get_supabase_client", lambda: client)
    monkeypatch.setattr("config.settings.CAREERPILOT_USER_ID", TEST_USER_ID)

    called_with: list = []

    def fake_linkedin_fn(gmail_service, days=2):
        called_with.append((gmail_service, days))
        return []

    manager = JobSearchResultsManager(client=client, user_id=TEST_USER_ID)
    summary = run_profiles(manager=manager, _linkedin_fn=fake_linkedin_fn)

    assert len(called_with) == 1, "LinkedIn function should have been called exactly once"
    assert called_with[0][1] == 2, "days parameter should be 2"


def test_run_profiles_skips_dice_for_linkedin_source(monkeypatch):
    """run_profiles does NOT call dice_search_fn when source='linkedin'."""
    from tests.conftest import TEST_USER_ID, FakeSupabaseClient
    from src.jobs.job_search_results import JobSearchResultsManager
    from src.jobs.search_engine import run_profiles

    client = FakeSupabaseClient()
    client._tables["search_profiles"] = [
        {
            "id": "bbbbbbbb-0000-0000-0000-000000000002",
            "name": "li_devops",
            "keyword": "DevOps Engineer",
            "location": "Remote",
            "source": "linkedin",
            "contract_only": False,
        }
    ]
    client._tables["job_search_results"] = []

    monkeypatch.setattr("src.db.supabase_client.get_supabase_client", lambda: client)
    monkeypatch.setattr("config.settings.CAREERPILOT_USER_ID", TEST_USER_ID)

    dice_called: list = []

    def fake_dice_fn(keyword, location, **_kwargs):
        dice_called.append((keyword, location))
        return {"structuredContent": {"data": []}, "isError": False}

    manager = JobSearchResultsManager(client=client, user_id=TEST_USER_ID)
    run_profiles(manager=manager, dice_search_fn=fake_dice_fn, _linkedin_fn=lambda svc, days=2: [])

    assert dice_called == [], "Dice should NOT be called for a linkedin-source profile"
