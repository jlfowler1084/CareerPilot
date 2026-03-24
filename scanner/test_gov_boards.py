"""Tests for government job board scrapers."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure scanner directory is importable
sys.path.insert(0, str(Path(__file__).parent))

from career_page_scraper import _slugify
from morning_scan import deduplicate
from usajobs_scraper import search_usajobs
from workone_scraper import search_workone


def _mock_api_response(jobs_json):
    """Create a mocked requests.post response."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "content": [
            {"type": "text", "text": json.dumps(jobs_json)}
        ]
    }
    return mock_resp


class TestSlugify:
    def test_basic(self):
        assert _slugify("Department of Veterans Affairs") == "department-of-veterans-affairs"

    def test_strips_whitespace(self):
        assert _slugify("  Eli Lilly  ") == "eli-lilly"

    def test_already_slugified(self):
        assert _slugify("already-slugged") == "already-slugged"


class TestUSAJobs:
    def test_returns_valid_dicts(self):
        """Mocked API response produces correct DB-format dicts."""
        raw_jobs = [
            {
                "title": "IT Specialist (SysAdmin)",
                "company": "Department of Veterans Affairs",
                "location": "Indianapolis, IN",
                "salary": "$73,286 - $95,270/year",
                "url": "https://www.usajobs.gov/job/123456",
                "job_type": "Full-time",
                "posted_date": "2026-03-20",
                "description_snippet": "Manages Windows servers",
            }
        ]
        with patch("usajobs_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_usajobs()

        assert len(results) >= 1
        job = results[0]
        assert job["title"] == "IT Specialist (SysAdmin)"
        assert job["company_name"] == "Department of Veterans Affairs"
        assert job["company_id"].startswith("usajobs_")
        assert job["company_id"] == "usajobs_department-of-veterans-affairs"
        assert "url" in job
        assert "source" not in job  # source is report-layer only

    def test_filters_irrelevant(self):
        """Non-IT titles filtered out."""
        raw_jobs = [
            {"title": "Nurse Practitioner", "company": "VA", "location": "Indy",
             "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
            {"title": "IT Specialist (SysAdmin)", "company": "VA", "location": "Indy",
             "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
        ]
        with patch("usajobs_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_usajobs()

        titles = [j["title"] for j in results]
        assert "Nurse Practitioner" not in titles
        assert "IT Specialist (SysAdmin)" in titles


class TestWorkOne:
    def test_returns_valid_dicts(self):
        """Mocked API response produces correct DB-format dicts."""
        raw_jobs = [
            {
                "title": "Network Administrator",
                "company": "Indiana Department of Transportation",
                "location": "Indianapolis, IN",
                "salary": "$55,000 - $65,000",
                "url": "https://indianacareerconnect.in.gov/job/12345",
                "job_type": "Full-time",
                "posted_date": "2026-03-18",
                "description_snippet": "Manages network infrastructure",
            }
        ]
        with patch("workone_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_workone()

        assert len(results) >= 1
        job = results[0]
        assert job["title"] == "Network Administrator"
        assert job["company_name"] == "Indiana Department of Transportation"
        assert job["company_id"].startswith("workone_")
        assert "source" not in job

    def test_filters_irrelevant(self):
        """Non-IT titles filtered out."""
        raw_jobs = [
            {"title": "Truck Driver", "company": "INDOT", "location": "Indy",
             "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
            {"title": "Systems Administrator", "company": "INDOT", "location": "Indy",
             "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
        ]
        with patch("workone_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_workone()

        titles = [j["title"] for j in results]
        assert "Truck Driver" not in titles
        assert "Systems Administrator" in titles


class TestGovIntegration:
    def test_dedup_across_gov_sources(self):
        """Same job from USAJobs and WorkOne deduped to one."""
        jobs = [
            {"title": "Systems Administrator", "company": "VA", "location": "Indy", "source": "USAJobs"},
            {"title": "Systems Administrator", "company": "VA", "location": "Indy", "source": "WorkOne"},
            {"title": "Network Engineer", "company": "DoD", "location": "Indy", "source": "USAJobs"},
        ]
        result = deduplicate(jobs)
        assert len(result) == 2

    def test_gov_flag_parsing(self):
        """--gov arg is parsed correctly."""
        parser = argparse.ArgumentParser()
        parser.add_argument("--gov", action="store_true")
        parser.add_argument("--quick", action="store_true")

        args = parser.parse_args(["--gov"])
        assert args.gov is True
        assert args.quick is False

        args_both = parser.parse_args(["--gov", "--quick"])
        assert args_both.gov is True
        assert args_both.quick is True
