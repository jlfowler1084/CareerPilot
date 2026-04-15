"""Tests for company intelligence brief generation and caching."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.intel.company_intel import (
    CompanyIntelEngine,
    _ensure_brief_defaults,
)


# --- Fixtures ---


def _make_brief(**overrides):
    """Build a sample brief dict with sensible defaults."""
    brief = {
        "company_overview": {
            "description": "A major pharmaceutical company",
            "headquarters": "Indianapolis, IN",
            "size": "~39,000 employees",
            "revenue_or_funding": "$34.1B (2025)",
            "key_products": ["Mounjaro", "Verzenio"],
            "recent_news": [
                {"headline": "Expanding campus", "date": "2026-03", "summary": "New building"},
            ],
        },
        "culture": {
            "glassdoor_rating": "4.1/5",
            "sentiment_summary": "Generally positive",
            "work_life_balance": "Good",
            "remote_policy": "Hybrid — 3 days in office",
            "pros": ["Great benefits", "Job stability"],
            "cons": ["Bureaucratic"],
        },
        "it_intelligence": {
            "tech_stack": ["Azure", "ServiceNow", "Splunk"],
            "cloud_provider": "Azure",
            "infrastructure_scale": "Large enterprise",
            "recent_it_postings": [
                {"title": "Cloud Engineer", "signal": "Growing team"},
            ],
            "it_challenges": ["Legacy system migration"],
        },
        "generated_at": datetime.now().isoformat(),
        "sources": ["https://example.com"],
    }
    brief.update(overrides)
    return brief


@pytest.fixture
def conn(tmp_path):
    """Create a temp SQLite DB with the full schema."""
    from src.db import models
    db_path = tmp_path / "test_intel.db"
    c = models.get_connection(db_path)
    yield c
    c.close()


# --- _ensure_brief_defaults ---


class TestEnsureBriefDefaults:
    def test_fills_missing_sections(self):
        brief = _ensure_brief_defaults({})
        assert "company_overview" in brief
        assert "culture" in brief
        assert "it_intelligence" in brief
        assert "generated_at" in brief
        assert "sources" in brief

    def test_preserves_existing_data(self):
        original = {"company_overview": {"description": "Test co"}, "sources": ["url1"]}
        result = _ensure_brief_defaults(original)
        assert result["company_overview"]["description"] == "Test co"
        assert result["sources"] == ["url1"]


# --- CompanyIntelEngine.generate_brief ---


class TestGenerateBrief:
    def test_returns_structured_brief(self):
        """Full brief generation with mocked router response."""
        brief_data = _make_brief()
        engine = CompanyIntelEngine()

        with patch("src.llm.router.router.complete", return_value=brief_data) as mock_call:
            result = engine.generate_brief("Eli Lilly")

        assert result is not None
        assert result["company_overview"]["headquarters"] == "Indianapolis, IN"
        assert "Azure" in result["it_intelligence"]["tech_stack"]
        assert "company_intel" in str(mock_call.call_args)

    def test_includes_role_title_in_prompt(self):
        """role_title is included in the user prompt when provided."""
        brief_data = _make_brief()
        engine = CompanyIntelEngine()

        with patch("src.llm.router.router.complete", return_value=brief_data) as mock_call:
            result = engine.generate_brief("Eli Lilly", role_title="Systems Engineer")

        assert result is not None
        prompt_arg = mock_call.call_args[1]["prompt"]
        assert "Systems Engineer" in prompt_arg

    def test_includes_contact_name_in_prompt(self):
        """contact_name is included in the user prompt when provided."""
        brief_data = _make_brief()
        engine = CompanyIntelEngine()

        with patch("src.llm.router.router.complete", return_value=brief_data) as mock_call:
            result = engine.generate_brief("Eli Lilly", contact_name="Jane Smith")

        assert result is not None
        prompt_arg = mock_call.call_args[1]["prompt"]
        assert "Jane Smith" in prompt_arg

    def test_handles_api_failure(self):
        """Returns None when router call fails."""
        engine = CompanyIntelEngine()

        with patch("src.llm.router.router.complete", side_effect=Exception("API error")):
            result = engine.generate_brief("Eli Lilly")

        assert result is None

    def test_handles_none_response(self):
        """Returns None when router returns None."""
        engine = CompanyIntelEngine()

        with patch("src.llm.router.router.complete", return_value=None):
            result = engine.generate_brief("UnknownCorp")

        assert result is None


# --- Database caching ---


class TestBriefCaching:
    def test_cache_and_retrieve(self, conn):
        """Cache a brief and retrieve it."""
        from src.db import models

        brief = _make_brief()

        brief_id = models.cache_brief(conn, "Eli Lilly", "Systems Engineer", brief)
        assert brief_id is not None

        cached, row = models.get_cached_brief(conn, "Eli Lilly")
        assert cached is not None
        assert cached["company_overview"]["headquarters"] == "Indianapolis, IN"
        assert row["id"] == brief_id

    def test_cache_miss_returns_none(self, conn):
        """Returns None when no cached brief exists."""
        from src.db import models

        cached, row = models.get_cached_brief(conn, "NonExistentCorp")
        assert cached is None
        assert row is None

    def test_expired_cache_returns_none(self, conn):
        """Returns None when cached brief has expired."""
        from src.db import models

        brief = _make_brief()

        # Insert with already-expired timestamp
        expired = (datetime.now() - timedelta(days=31)).isoformat()
        conn.execute(
            "INSERT INTO company_intel (company, role_title, brief, generated_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("OldCorp", None, json.dumps(brief), expired, expired),
        )
        conn.commit()

        cached, row = models.get_cached_brief(conn, "OldCorp")
        assert cached is None

    def test_case_insensitive_lookup(self, conn):
        """Cache lookup is case-insensitive on company name."""
        from src.db import models

        brief = _make_brief()
        models.cache_brief(conn, "Eli Lilly", None, brief)

        cached, _ = models.get_cached_brief(conn, "eli lilly")
        assert cached is not None

        cached2, _ = models.get_cached_brief(conn, "ELI LILLY")
        assert cached2 is not None

    def test_link_brief_to_application(self, conn):
        """Link a brief to an application and retrieve it."""
        from src.db import models

        conn.execute(
            "INSERT INTO applications (id, title, company) VALUES (?, ?, ?)",
            (99, "Systems Engineer", "TestCorp"),
        )
        conn.commit()

        brief = _make_brief()
        brief_id = models.cache_brief(conn, "TestCorp", "Systems Engineer", brief)

        models.link_brief_to_application(conn, brief_id, 99)

        result = models.get_brief_for_application(conn, 99)
        assert result is not None
        assert result["company_overview"]["headquarters"] == "Indianapolis, IN"

    def test_get_brief_for_application_no_match(self, conn):
        """Returns None when no brief is linked to the application."""
        from src.db import models

        result = models.get_brief_for_application(conn, 999)
        assert result is None

    def test_cache_with_application_id(self, conn):
        """Cache brief with application_id set directly."""
        from src.db import models

        conn.execute(
            "INSERT INTO applications (id, title, company) VALUES (?, ?, ?)",
            (50, "DevOps Engineer", "SomeCorp"),
        )
        conn.commit()

        brief = _make_brief()
        models.cache_brief(conn, "SomeCorp", "DevOps Engineer", brief, application_id=50)

        result = models.get_brief_for_application(conn, 50)
        assert result is not None
