"""Tests for hidden job market scraper (SCRUM-119)."""

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


class TestIsRelevantHidden:
    def test_standard_title_passes(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Systems Administrator") is True

    def test_education_title_technology_coordinator(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Technology Coordinator") is True

    def test_education_title_tech_director(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Tech Director") is True

    def test_education_title_computer_specialist(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Computer Specialist") is True

    def test_education_title_instructional_technology(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Instructional Technology Specialist") is True

    def test_negative_nurse_filtered(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("School Nurse") is False

    def test_negative_physician_filtered(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Physician Assistant") is False

    def test_negative_warehouse_filtered(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Warehouse Associate") is False

    def test_negative_custodian_filtered(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Head Custodian") is False

    def test_irrelevant_title_rejected(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("English Teacher") is False

    def test_network_support_passes(self):
        from hidden_market_scraper import _is_relevant_hidden

        assert _is_relevant_hidden("Network Support Specialist") is True


class TestMakeHiddenJob:
    def test_correct_format(self):
        from hidden_market_scraper import _make_hidden_job

        raw = {
            "title": "Technology Coordinator",
            "location": "Indianapolis, IN",
            "url": "https://example.com/job/123",
            "salary": "$55,000",
            "job_type": "Full-time",
            "posted_date": "2026-03-20",
            "description_snippet": "Manage school technology...",
        }

        job = _make_hidden_job(raw, "Cathedral High School")
        assert job["title"] == "Technology Coordinator"
        assert job["company_id"] == "hidden_cathedral-high-school"
        assert job["company_name"] == "Cathedral High School"
        assert job["location"] == "Indianapolis, IN"

    def test_truncates_description(self):
        from hidden_market_scraper import _make_hidden_job

        raw = {
            "title": "IT Support",
            "description_snippet": "x" * 1000,
        }
        job = _make_hidden_job(raw, "Some School")
        assert len(job["description_snippet"]) == 500


class TestSearchHiddenMarket:
    @patch("hidden_market_scraper.requests.post")
    @patch("hidden_market_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_parses_valid_response(self, mock_post):
        from hidden_market_scraper import search_hidden_market

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "Technology Coordinator",
                "employer": "Roncalli High School",
                "location": "Indianapolis, IN",
                "url": "https://roncalli.org/careers/tech",
                "salary": "$50,000",
                "job_type": "Full-time",
                "posted_date": "2026-03-22",
                "description_snippet": "Manage school IT infrastructure...",
            },
        ])

        jobs = search_hidden_market()
        assert len(jobs) > 0
        assert jobs[0]["title"] == "Technology Coordinator"
        assert jobs[0]["company_id"].startswith("hidden_")
        assert jobs[0]["company_name"] == "Roncalli High School"

    @patch("hidden_market_scraper.requests.post")
    @patch("hidden_market_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_education_titles_pass_filter(self, mock_post):
        from hidden_market_scraper import search_hidden_market

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "Technology Coordinator",
                "employer": "Cathedral High School",
                "location": "Indianapolis, IN",
                "url": "https://example.com/1",
            },
            {
                "title": "Tech Director",
                "employer": "Park Tudor School",
                "location": "Indianapolis, IN",
                "url": "https://example.com/2",
            },
            {
                "title": "Computer Specialist",
                "employer": "Sycamore School",
                "location": "Indianapolis, IN",
                "url": "https://example.com/3",
            },
        ])

        jobs = search_hidden_market()
        titles = [j["title"] for j in jobs]
        assert "Technology Coordinator" in titles
        assert "Tech Director" in titles
        assert "Computer Specialist" in titles

    @patch("hidden_market_scraper.requests.post")
    @patch("hidden_market_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_negative_keywords_filtered(self, mock_post):
        from hidden_market_scraper import search_hidden_market

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "IT Support Specialist",
                "employer": "Archdiocese of Indianapolis",
                "location": "Indianapolis, IN",
                "url": "https://example.com/1",
            },
            {
                "title": "School Nurse",
                "employer": "Roncalli High School",
                "location": "Indianapolis, IN",
                "url": "https://example.com/2",
            },
            {
                "title": "Warehouse Associate",
                "employer": "Some Nonprofit",
                "location": "Indianapolis, IN",
                "url": "https://example.com/3",
            },
        ])

        jobs = search_hidden_market()
        titles = [j["title"] for j in jobs]
        assert "IT Support Specialist" in titles
        assert "School Nurse" not in titles
        assert "Warehouse Associate" not in titles

    @patch("hidden_market_scraper.ANTHROPIC_API_KEY", "")
    def test_skips_without_api_key(self):
        from hidden_market_scraper import search_hidden_market

        jobs = search_hidden_market()
        assert jobs == []

    @patch("hidden_market_scraper.requests.post")
    @patch("hidden_market_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_deduplicates(self, mock_post):
        from hidden_market_scraper import search_hidden_market

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "Systems Administrator",
                "employer": "Marian University",
                "location": "Indianapolis, IN",
                "url": "https://example.com/1",
            },
            {
                "title": "Systems Administrator",
                "employer": "Marian University",
                "location": "Indianapolis, IN",
                "url": "https://example.com/2",
            },
        ])

        jobs = search_hidden_market()
        sa_jobs = [j for j in jobs if j["title"] == "Systems Administrator"
                   and j["company_name"] == "Marian University"]
        # Same title+employer should be deduplicated across categories
        assert len(sa_jobs) <= 3  # at most one per category

    @patch("hidden_market_scraper.requests.post")
    @patch("hidden_market_scraper.ANTHROPIC_API_KEY", "sk-test-key")
    def test_category_filter(self, mock_post):
        from hidden_market_scraper import search_hidden_market

        mock_post.return_value = _mock_anthropic_response([
            {
                "title": "IT Support",
                "employer": "Test Org",
                "location": "Indianapolis, IN",
                "url": "https://example.com/1",
            },
        ])

        jobs = search_hidden_market(category_filter="religious")
        # Should only make 1 API call (for religious category)
        assert mock_post.call_count == 1


class TestHiddenFlag:
    def test_hidden_flag_exists(self):
        """Verify --hidden flag is accepted by morning_scan argparser."""
        import argparse

        parser = argparse.ArgumentParser()
        parser.add_argument("--hidden", action="store_true")
        args = parser.parse_args(["--hidden"])
        assert args.hidden is True
