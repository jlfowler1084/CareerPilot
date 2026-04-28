"""Tests for LinkedIn email parser — validated against real inbox data."""

import base64
from unittest.mock import MagicMock, patch

import pytest

from src.jobs.linkedin_parser import (
    parse_job_alert_email,
    parse_career_insights_email,
    parse_linkedin_email,
    extract_linkedin_job_id,
    clean_linkedin_url,
    deduplicate_jobs,
    scan_emails,
    build_linkedin_search_url,
    LINKEDIN_SEARCH_PROFILES,
)

# ── Real email data from Joseph's inbox ──────────────────────────────

JOB_ALERT_BODY = """Your job alert has been created: Information Technology Specialist in Indianapolis, Indiana, United States.
You'll receive notifications when new jobs are posted that match your search preferences.

IT Specialist
Gregory & Appel
Indianapolis, Indiana, United States
View job: https://www.linkedin.com/comm/jobs/view/4343466437?alertAction=markasviewed&savedSearchId=123

---------------------------------------------------------


SharePoint Administrator
Designs for Health
United States

This company is actively hiring
View job: https://www.linkedin.com/comm/jobs/view/4336553755?alertAction=markasviewed&savedSearchId=123

---------------------------------------------------------


IT Specialist
Brightstar Lottery
Indianapolis, Indiana, United States
View job: https://www.linkedin.com/comm/jobs/view/4323655619?alertAction=markasviewed&savedSearchId=123

---------------------------------------------------------
"""

CAREER_INSIGHTS_BODY = """System Engineer roles with over $150K/yr salary
12K
New job openings offering over $150K/yr for System Engineer in the United States
View job openingshttps://www.linkedin.com/comm/jobs/search/?keywords=System+Engineer

People with similar roles applied to these jobs

Systems Engineering & Verification Engineer
Rolls-Royce · Indianapolis, IN
$94K-$153K / year

View jobhttps://www.linkedin.com/comm/jobs/view/4374764248?lipi=something
Senior Systems Engineer II - Verification Lead (WSI)
V2X Inc · Indianapolis, IN


View jobhttps://www.linkedin.com/comm/jobs/view/4371718835?lipi=something
Companies with the most job openings in your role
"""


def test_extract_job_id():
    url = "https://www.linkedin.com/comm/jobs/view/4343466437?alertAction=markasviewed"
    assert extract_linkedin_job_id(url) == "4343466437"


def test_extract_job_id_no_match():
    assert extract_linkedin_job_id("https://www.linkedin.com/feed") is None


def test_clean_url():
    raw = "https://www.linkedin.com/comm/jobs/view/4343466437?alertAction=markasviewed&savedSearchId=123"
    assert clean_linkedin_url(raw) == "https://www.linkedin.com/jobs/view/4343466437/"


def test_parse_job_alert():
    jobs = parse_job_alert_email(JOB_ALERT_BODY, "2025-12-14")
    assert len(jobs) == 3

    assert jobs[0]["title"] == "IT Specialist"
    assert jobs[0]["company"] == "Gregory & Appel"
    assert jobs[0]["location"] == "Indianapolis, Indiana, United States"
    assert jobs[0]["linkedin_job_id"] == "4343466437"
    assert jobs[0]["source"] == "LinkedIn"
    assert "linkedin.com/jobs/view/4343466437" in jobs[0]["url"]

    assert jobs[1]["title"] == "SharePoint Administrator"
    assert jobs[1]["company"] == "Designs for Health"

    assert jobs[2]["title"] == "IT Specialist"
    assert jobs[2]["company"] == "Brightstar Lottery"


def test_parse_career_insights():
    jobs = parse_career_insights_email(CAREER_INSIGHTS_BODY, "2026-03-17")
    assert len(jobs) >= 2

    # First job should be Rolls-Royce
    rr = next((j for j in jobs if "Rolls-Royce" in j["company"]), None)
    assert rr is not None
    assert rr["title"] == "Systems Engineering & Verification Engineer"
    assert "Indianapolis" in rr["location"]
    assert "$94K" in rr["salary"]
    assert rr["linkedin_job_id"] == "4374764248"

    # V2X job
    v2x = next((j for j in jobs if "V2X" in j["company"]), None)
    assert v2x is not None
    assert v2x["linkedin_job_id"] == "4371718835"


def test_auto_detect_job_alert():
    jobs = parse_linkedin_email(
        JOB_ALERT_BODY,
        from_address="jobalerts-noreply@linkedin.com",
        email_date="2025-12-14"
    )
    assert len(jobs) == 3


def test_auto_detect_career_insights():
    jobs = parse_linkedin_email(
        CAREER_INSIGHTS_BODY,
        from_address="messages-noreply@linkedin.com",
        email_date="2026-03-17"
    )
    assert len(jobs) >= 2


def test_deduplicate_by_job_id():
    jobs = [
        {"title": "IT Specialist", "company": "Acme", "linkedin_job_id": "123"},
        {"title": "IT Specialist", "company": "Acme", "linkedin_job_id": "123"},
        {"title": "Dev Ops", "company": "Beta", "linkedin_job_id": "456"},
    ]
    unique = deduplicate_jobs(jobs)
    assert len(unique) == 2


def test_deduplicate_by_title_company():
    jobs = [
        {"title": "IT Specialist", "company": "Acme", "linkedin_job_id": "123"},
        {"title": "it specialist", "company": "acme", "linkedin_job_id": "789"},
    ]
    unique = deduplicate_jobs(jobs)
    assert len(unique) == 1


def test_cross_source_dedup():
    existing = [
        {"title": "Systems Engineer", "company": "Rolls-Royce", "source": "Indeed"},
    ]
    new = [
        {"title": "Systems Engineer", "company": "Rolls-Royce", "linkedin_job_id": "999", "source": "LinkedIn"},
        {"title": "DevOps Eng", "company": "NewCorp", "linkedin_job_id": "888", "source": "LinkedIn"},
    ]
    unique = deduplicate_jobs(new, existing_jobs=existing)
    assert len(unique) == 1
    assert unique[0]["company"] == "NewCorp"


def test_search_url_builder():
    profile = LINKEDIN_SEARCH_PROFILES["syseng_indy"]
    url = build_linkedin_search_url(profile)
    assert "linkedin.com/jobs/search" in url
    assert "Systems+Engineer" in url or "Systems%20Engineer" in url
    assert "100871315" in url


def test_remote_search_url():
    profile = LINKEDIN_SEARCH_PROFILES["infra_remote"]
    url = build_linkedin_search_url(profile)
    assert "f_WT=2" in url  # remote filter


# ── scan_emails helper tests ──────────────────────────────────────────

def _make_gmail_message(subject: str, from_addr: str, date: str, body_text: str) -> dict:
    """Build a minimal Gmail API message dict with a base64-encoded text/plain body."""
    encoded = base64.urlsafe_b64encode(body_text.encode("utf-8")).decode("ascii")
    return {
        "id": "msg001",
        "payload": {
            "headers": [
                {"name": "From", "value": from_addr},
                {"name": "Date", "value": date},
                {"name": "Subject", "value": subject},
            ],
            "mimeType": "text/plain",
            "body": {"data": encoded},
            "parts": [],
        },
    }


def _make_fake_gmail_service(messages: list[dict]) -> MagicMock:
    """Return a mock Gmail service that yields *messages* on list+get."""
    svc = MagicMock()
    msg_list_resp = MagicMock()
    msg_list_resp.execute.return_value = {"messages": [{"id": m["id"]} for m in messages]}

    def _get_message(userId, id, format):  # noqa: A002
        mock_get = MagicMock()
        match = next((m for m in messages if m["id"] == id), messages[0])
        mock_get.execute.return_value = match
        return mock_get

    svc.users.return_value.messages.return_value.list.return_value = msg_list_resp
    svc.users.return_value.messages.return_value.get.side_effect = _get_message
    return svc


def test_scan_emails_raises_when_service_is_none():
    """scan_emails must raise RuntimeError when gmail_service is None."""
    with pytest.raises(RuntimeError, match="gmail_service"):
        scan_emails(None, days=7)


def test_scan_emails_empty_gmail_result():
    """scan_emails returns [] when Gmail returns no messages."""
    svc = MagicMock()
    svc.users.return_value.messages.return_value.list.return_value.execute.return_value = {
        "messages": []
    }
    result = scan_emails(svc, days=7)
    assert result == []


def test_scan_emails_returns_normalised_job_dicts():
    """scan_emails with a single job-alert email returns expected shape."""
    msg = _make_gmail_message(
        subject="Job alert: IT Specialist",
        from_addr="jobalerts-noreply@linkedin.com",
        date="Mon, 14 Dec 2025 10:00:00 +0000",
        body_text=JOB_ALERT_BODY,
    )
    svc = _make_fake_gmail_service([msg])
    result = scan_emails(svc, days=7)

    assert len(result) == 3

    job = result[0]
    assert job["title"] == "IT Specialist"
    assert job["company"] == "Gregory & Appel"
    assert job["source"] == "LinkedIn"
    assert job["linkedin_job_id"] == "4343466437"
    assert "linkedin.com/jobs/view/4343466437" in job["url"]


def test_scan_emails_deduplicates_across_pages():
    """Identical jobs from two 'pages' are deduplicated."""
    msg = _make_gmail_message(
        subject="Job alert: IT Specialist",
        from_addr="jobalerts-noreply@linkedin.com",
        date="Mon, 14 Dec 2025 10:00:00 +0000",
        body_text=JOB_ALERT_BODY,
    )
    # Simulate two list calls — first returns a nextPageToken, second returns the
    # same messages (triggering deduplication).
    svc = MagicMock()
    page1 = MagicMock()
    page1.execute.return_value = {
        "messages": [{"id": msg["id"]}],
        "nextPageToken": "tok123",
    }
    page2 = MagicMock()
    page2.execute.return_value = {"messages": [{"id": msg["id"]}]}

    svc.users.return_value.messages.return_value.list.side_effect = [page1, page2]

    get_mock = MagicMock()
    get_mock.execute.return_value = msg
    svc.users.return_value.messages.return_value.get.return_value = get_mock

    result = scan_emails(svc, days=7)
    # Same 3 jobs from both pages but deduplicated — still 3
    assert len(result) == 3
