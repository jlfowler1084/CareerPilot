"""Tests for the Dice MCP response parser.

Covers both MCP response shapes (structuredContent.data and content[].text),
edge cases in field extraction, irrelevant-keyword filtering, source_id
derivation, and malformed-input tolerance.
"""

from __future__ import annotations

import hashlib
import json

import pytest

from src.jobs.parsers.dice import parse_dice_listings


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_job(
    title="Systems Administrator",
    company="Acme Corp",
    location_display="Indianapolis, IN",
    is_remote=False,
    salary="$90k-$110k",
    employment_type="Full-time",
    easy_apply=True,
    posted_date="2026-04-20T00:00:00Z",
    url="https://www.dice.com/job-detail/abc-123",
    summary="Great sysadmin role.",
    **kwargs,
):
    """Build a minimal Dice job dict as returned by the MCP server."""
    job = {
        "title": title,
        "companyName": company,
        "salary": salary,
        "employmentType": employment_type,
        "easyApply": easy_apply,
        "postedDate": posted_date,
        "detailsPageUrl": url,
        "isRemote": is_remote,
        "summary": summary,
    }
    if location_display is not None:
        job["jobLocation"] = {"displayName": location_display}
    job.update(kwargs)
    return job


def _structured_content_shape(jobs):
    """Wrap jobs in the structuredContent.data MCP shape."""
    return {
        "structuredContent": {
            "data": jobs,
            "meta": {"currentPage": 1, "pageCount": 1, "pageSize": 20, "totalResults": len(jobs)},
        },
        "isError": False,
    }


def _text_content_shape(jobs):
    """Wrap jobs in the content[].text MCP shape (alternative response format)."""
    return {
        "content": [
            {"type": "text", "text": json.dumps(jobs)},
        ],
        "isError": False,
    }


# ---------------------------------------------------------------------------
# Happy path — structuredContent.data shape
# ---------------------------------------------------------------------------


class TestHappyPathStructuredContent:
    def test_returns_list_of_normalized_dicts(self):
        """4 listings in structuredContent.data → 4 normalized dicts."""
        jobs = [_make_job(title=f"Job {i}", url=f"https://www.dice.com/job-detail/id-{i}")
                for i in range(4)]
        result = parse_dice_listings(_structured_content_shape(jobs))
        assert len(result) == 4

    def test_all_expected_fields_present(self):
        """Each result dict has all required schema fields."""
        jobs = [_make_job()]
        result = parse_dice_listings(_structured_content_shape(jobs))
        required_fields = {
            "source", "source_id", "url", "title", "company",
            "location", "salary", "job_type", "posted_date", "easy_apply", "summary",
        }
        assert required_fields.issubset(set(result[0].keys()))

    def test_source_is_dice(self):
        result = parse_dice_listings(_structured_content_shape([_make_job()]))
        assert result[0]["source"] == "dice"

    def test_company_mapped(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(company="Cloud Corp")]))
        assert result[0]["company"] == "Cloud Corp"

    def test_location_from_job_location(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(location_display="Chicago, IL")]))
        assert result[0]["location"] == "Chicago, IL"

    def test_salary_mapped(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(salary="$120k")]))
        assert result[0]["salary"] == "$120k"

    def test_job_type_mapped(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(employment_type="Contract")]))
        assert result[0]["job_type"] == "Contract"

    def test_posted_date_mapped(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(posted_date="2026-04-01T00:00:00Z")]))
        assert result[0]["posted_date"] == "2026-04-01T00:00:00Z"

    def test_easy_apply_true(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(easy_apply=True)]))
        assert result[0]["easy_apply"] is True

    def test_easy_apply_false(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(easy_apply=False)]))
        assert result[0]["easy_apply"] is False

    def test_summary_mapped(self):
        result = parse_dice_listings(_structured_content_shape([_make_job(summary="Strong Python skills required.")]))
        assert result[0]["summary"] == "Strong Python skills required."

    def test_six_listings(self):
        """6 listings all return."""
        jobs = [_make_job(title=f"Job {i}", url=f"https://www.dice.com/job-detail/slug-{i}")
                for i in range(6)]
        result = parse_dice_listings(_structured_content_shape(jobs))
        assert len(result) == 6


# ---------------------------------------------------------------------------
# Happy path — content[].text shape
# ---------------------------------------------------------------------------


class TestHappyPathTextContent:
    def test_text_content_shape_returns_same_results(self):
        """Same listings wrapped in content[].text shape → same normalized output."""
        jobs = [_make_job()]
        structured = parse_dice_listings(_structured_content_shape(jobs))
        text = parse_dice_listings(_text_content_shape(jobs))
        # Strip source_id (may vary by shape if derived from position) — compare key fields
        for key in ("title", "company", "location", "salary", "url"):
            assert structured[0][key] == text[0][key]

    def test_text_content_multiple_listings(self):
        jobs = [_make_job(title=f"T{i}", url=f"https://www.dice.com/job-detail/t-{i}")
                for i in range(4)]
        result = parse_dice_listings(_text_content_shape(jobs))
        assert len(result) == 4

    def test_text_content_source_is_dice(self):
        result = parse_dice_listings(_text_content_shape([_make_job()]))
        assert result[0]["source"] == "dice"


# ---------------------------------------------------------------------------
# Edge cases — empty / missing data
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_empty_structured_data_returns_empty_list(self):
        """Empty structuredContent.data → []."""
        result = parse_dice_listings(_structured_content_shape([]))
        assert result == []

    def test_missing_company_name_defaults_to_unknown(self):
        """Job without companyName → company='Unknown'."""
        job = _make_job()
        del job["companyName"]
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["company"] == "Unknown"

    def test_is_remote_true_no_job_location(self):
        """isRemote=True and no jobLocation → location='Remote'."""
        job = _make_job(is_remote=True, location_display=None)
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["location"] == "Remote"

    def test_missing_salary_defaults_empty_string(self):
        job = _make_job()
        del job["salary"]
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["salary"] == ""

    def test_missing_job_type_defaults_empty_string(self):
        job = _make_job()
        del job["employmentType"]
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["job_type"] == ""

    def test_missing_posted_date_defaults_empty_string(self):
        job = _make_job()
        del job["postedDate"]
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["posted_date"] == ""

    def test_easy_apply_missing_defaults_false(self):
        job = _make_job()
        del job["easyApply"]
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["easy_apply"] is False

    def test_missing_summary_defaults_empty_string(self):
        job = _make_job()
        del job["summary"]
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["summary"] == ""


# ---------------------------------------------------------------------------
# Malformed input tolerance
# ---------------------------------------------------------------------------


class TestMalformedInput:
    def test_string_input_returns_empty_list(self):
        """Non-dict input → [] without raising."""
        result = parse_dice_listings("not a dict")
        assert result == []

    def test_none_input_returns_empty_list(self):
        result = parse_dice_listings(None)
        assert result == []

    def test_empty_dict_returns_empty_list(self):
        result = parse_dice_listings({})
        assert result == []

    def test_structured_content_not_list_returns_empty(self):
        """structuredContent.data is a string (malformed) → []."""
        result = parse_dice_listings({"structuredContent": {"data": "bad"}})
        assert result == []

    def test_individual_job_malformed_skipped(self):
        """A non-dict in the jobs list is skipped, valid jobs still returned."""
        jobs = [_make_job(), "bad-entry", _make_job(title="Good Job", url="https://www.dice.com/job-detail/good-1")]
        result = parse_dice_listings(_structured_content_shape(jobs))
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Irrelevant keyword filtering
# ---------------------------------------------------------------------------


class TestIrrelevantFiltering:
    def test_pest_control_filtered_out(self):
        """'Pest Control Technician' title → filtered by IRRELEVANT_KEYWORDS."""
        jobs = [
            _make_job(title="Systems Administrator", url="https://www.dice.com/job-detail/good-1"),
            _make_job(title="Pest Control Technician", url="https://www.dice.com/job-detail/bad-1"),
        ]
        result = parse_dice_listings(_structured_content_shape(jobs))
        titles = [r["title"] for r in result]
        assert "Systems Administrator" in titles
        assert "Pest Control Technician" not in titles

    def test_hvac_filtered_out(self):
        jobs = [_make_job(title="HVAC Technician", url="https://www.dice.com/job-detail/hvac-1")]
        result = parse_dice_listings(_structured_content_shape(jobs))
        assert result == []

    def test_devops_not_filtered(self):
        jobs = [_make_job(title="DevOps Engineer", url="https://www.dice.com/job-detail/devops-1")]
        result = parse_dice_listings(_structured_content_shape(jobs))
        assert len(result) == 1


# ---------------------------------------------------------------------------
# source_id derivation
# ---------------------------------------------------------------------------


class TestSourceIdDerivation:
    def test_standard_dice_url_extracts_slug(self):
        """URL https://www.dice.com/job-detail/abc-123 → source_id='abc-123'."""
        job = _make_job(url="https://www.dice.com/job-detail/abc-123")
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["source_id"] == "abc-123"

    def test_uuid_style_id_extracted(self):
        """UUID-style slug is extracted correctly."""
        job = _make_job(url="https://www.dice.com/job-detail/550e8400-e29b-41d4-a716-446655440000")
        result = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["source_id"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_no_extractable_id_falls_back_to_hash(self):
        """URL that doesn't match /job-detail/<id> → deterministic hash fallback."""
        url = "https://www.dice.com/some-other-path"
        job = _make_job(url=url)
        result = parse_dice_listings(_structured_content_shape([job]))
        # Fallback should be deterministic (same URL → same source_id)
        result2 = parse_dice_listings(_structured_content_shape([job]))
        assert result[0]["source_id"] == result2[0]["source_id"]
        assert len(result[0]["source_id"]) > 0

    def test_empty_url_fallback_is_deterministic(self):
        """Empty URL → non-empty deterministic source_id (no crash)."""
        job = _make_job(url="")
        result = parse_dice_listings(_structured_content_shape([job]))
        assert isinstance(result[0]["source_id"], str)
        assert len(result[0]["source_id"]) > 0
