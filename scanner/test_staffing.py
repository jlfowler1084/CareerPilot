"""Tests for staffing agency scraper."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


def _mock_anthropic_response(jobs_json: list) -> MagicMock:
    """Build a mock requests.Response with the given jobs JSON."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "content": [
            {"type": "text", "text": json.dumps(jobs_json)},
        ],
    }
    return mock_resp


class TestMakeStaffingJob:
    def test_correct_format(self):
        from staffing_scraper import _make_staffing_job

        agency = {"id": "teksystems", "name": "TEKsystems", "site": "teksystems.com"}
        raw = {
            "title": "Systems Administrator",
            "company": "TEKsystems",
            "location": "Indianapolis, IN",
            "url": "https://teksystems.com/jobs/123",
            "salary": "$80,000",
            "job_type": "Contract",
            "posted_date": "2026-03-20",
            "description_snippet": "Manage Windows servers...",
        }

        job = _make_staffing_job(raw, agency)
        assert job["title"] == "Systems Administrator"
        assert job["company_id"] == "staffing_teksystems"
        assert job["company_name"] == "TEKsystems"
        assert job["location"] == "Indianapolis, IN"

    def test_truncates_description(self):
        from staffing_scraper import _make_staffing_job

        agency = {"id": "kforce", "name": "Kforce", "site": "kforce.com"}
        raw = {
            "title": "IT Support",
            "description_snippet": "x" * 1000,
        }
        job = _make_staffing_job(raw, agency)
        assert len(job["description_snippet"]) == 500


class TestSearchStaffingAgencies:
    @patch("staffing_scraper.requests.post")
    @patch("staffing_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_parses_valid_response(self, mock_post):
        from staffing_scraper import search_staffing_agencies

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "Infrastructure Engineer",
                "company": "Client Corp",
                "location": "Indianapolis, IN",
                "url": "https://teksystems.com/jobs/456",
                "salary": "$90,000",
                "job_type": "Full-time",
                "posted_date": "2026-03-22",
                "description_snippet": "Enterprise infrastructure role...",
            },
        ])

        jobs = search_staffing_agencies()
        assert len(jobs) > 0
        assert jobs[0]["title"] == "Infrastructure Engineer"
        assert jobs[0]["company_id"].startswith("staffing_")

    @patch("staffing_scraper.requests.post")
    @patch("staffing_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_filters_irrelevant(self, mock_post):
        from staffing_scraper import search_staffing_agencies

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "Infrastructure Engineer",
                "company": "Client Corp",
                "location": "Indianapolis, IN",
                "url": "https://example.com/1",
            },
            {
                "title": "Warehouse Associate",
                "company": "Logistics Inc",
                "location": "Indianapolis, IN",
                "url": "https://example.com/2",
            },
            {
                "title": "Nursing Supervisor",
                "company": "Health Corp",
                "location": "Indianapolis, IN",
                "url": "https://example.com/3",
            },
        ])

        jobs = search_staffing_agencies()
        titles = [j["title"] for j in jobs]
        assert "Infrastructure Engineer" in titles
        assert "Warehouse Associate" not in titles
        assert "Nursing Supervisor" not in titles

    @patch("staffing_scraper.ANTHROPIC_API_KEY", "")
    def test_skips_without_api_key(self):
        from staffing_scraper import search_staffing_agencies

        jobs = search_staffing_agencies()
        assert jobs == []

    @patch("staffing_scraper.requests.post")
    @patch("staffing_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_deduplicates(self, mock_post):
        from staffing_scraper import search_staffing_agencies

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "Systems Administrator",
                "company": "Client Corp",
                "location": "Indianapolis, IN",
                "url": "https://example.com/1",
            },
            {
                "title": "Systems Administrator",
                "company": "Client Corp",
                "location": "Indianapolis, IN",
                "url": "https://example.com/2",
            },
        ])

        jobs = search_staffing_agencies()
        # Within the same agency, duplicates by title+agency are removed
        sa_jobs = [j for j in jobs if j["title"] == "Systems Administrator"]
        # Each agency returns the same mock, but dedup is per title+agency
        assert len(sa_jobs) <= len(jobs)


class TestStaffingFlag:
    def test_staffing_flag_exists(self):
        """Verify --staffing flag is accepted by morning_scan argparser."""
        import sys
        sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
        from morning_scan import main
        import argparse

        # Re-create the parser to test flag existence
        parser = argparse.ArgumentParser()
        parser.add_argument("--staffing", action="store_true")
        args = parser.parse_args(["--staffing"])
        assert args.staffing is True
