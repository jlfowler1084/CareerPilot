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
    _parse_brief_json,
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


def _mock_claude_response(text):
    """Create a mock Claude API response with text content."""
    mock_block = MagicMock()
    mock_block.text = text
    mock_response = MagicMock()
    mock_response.content = [mock_block]
    return mock_response


def _mock_claude_response_with_tool_use(text):
    """Create a mock response that includes tool_use blocks (no .text attr) plus a text block."""
    tool_block = MagicMock(spec=[])  # no .text attribute
    text_block = MagicMock()
    text_block.text = text
    mock_response = MagicMock()
    mock_response.content = [tool_block, text_block]
    return mock_response


@pytest.fixture
def conn(tmp_path):
    """Create a temp SQLite DB with the full schema."""
    from src.db import models
    db_path = tmp_path / "test_intel.db"
    c = models.get_connection(db_path)
    yield c
    c.close()


# --- _parse_brief_json ---


class TestParseBriefJson:
    def test_valid_json(self):
        result = _parse_brief_json('{"foo": "bar"}')
        assert result == {"foo": "bar"}

    def test_strips_markdown_fences(self):
        result = _parse_brief_json('```json\n{"foo": "bar"}\n```')
        assert result == {"foo": "bar"}

    def test_returns_none_for_bad_json(self):
        assert _parse_brief_json("not json at all") is None

    def test_strips_whitespace(self):
        result = _parse_brief_json('  \n{"key": 1}\n  ')
        assert result == {"key": 1}


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
        """Full brief generation with mocked API response."""
        brief_data = _make_brief()
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                json.dumps(brief_data)
            )
            mock_fn.return_value = mock_client

            result = engine.generate_brief("Eli Lilly")

        assert result is not None
        assert result["company_overview"]["headquarters"] == "Indianapolis, IN"
        assert "Azure" in result["it_intelligence"]["tech_stack"]

    def test_includes_role_analysis_when_role_provided(self):
        """role_analysis section present when role_title is given."""
        brief_data = _make_brief(role_analysis={
            "org_fit": "IT Operations",
            "day_to_day": "Supporting systems",
            "growth_potential": "Senior in 2 years",
            "red_flags": [],
            "questions_to_ask": ["What's the on-call rotation?"],
        })
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                json.dumps(brief_data)
            )
            mock_fn.return_value = mock_client

            result = engine.generate_brief("Eli Lilly", role_title="Systems Engineer")

        assert result.get("role_analysis") is not None
        assert result["role_analysis"]["org_fit"] == "IT Operations"

        # Verify role was included in the prompt
        call_args = mock_client.messages.create.call_args
        system_prompt = call_args[1]["system"]
        assert "role_analysis" in system_prompt

    def test_no_role_analysis_without_role_title(self):
        """role_analysis section not requested when role_title is None."""
        brief_data = _make_brief()  # no role_analysis key
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                json.dumps(brief_data)
            )
            mock_fn.return_value = mock_client

            result = engine.generate_brief("Eli Lilly")

        assert result.get("role_analysis") is None

        call_args = mock_client.messages.create.call_args
        system_prompt = call_args[1]["system"]
        assert "role_analysis" not in system_prompt

    def test_includes_interviewer_prep_when_contact_provided(self):
        """interviewer_prep section present when contact_name is given."""
        brief_data = _make_brief(interviewer_prep={
            "linkedin_summary": "VP of IT at Lilly",
            "likely_interview_style": "Behavioral",
            "rapport_topics": ["Manufacturing IT"],
        })
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                json.dumps(brief_data)
            )
            mock_fn.return_value = mock_client

            result = engine.generate_brief("Eli Lilly", contact_name="Jane Smith")

        assert result.get("interviewer_prep") is not None
        assert "Behavioral" in result["interviewer_prep"]["likely_interview_style"]

        call_args = mock_client.messages.create.call_args
        system_prompt = call_args[1]["system"]
        assert "interviewer_prep" in system_prompt

    def test_no_interviewer_prep_without_contact(self):
        """interviewer_prep not requested when contact_name is None."""
        brief_data = _make_brief()
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                json.dumps(brief_data)
            )
            mock_fn.return_value = mock_client

            result = engine.generate_brief("Eli Lilly")

        call_args = mock_client.messages.create.call_args
        system_prompt = call_args[1]["system"]
        assert "interviewer_prep" not in system_prompt

    def test_handles_api_failure(self):
        """Returns None when Claude API call fails."""
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.side_effect = Exception("API error")
            mock_fn.return_value = mock_client

            result = engine.generate_brief("Eli Lilly")

        assert result is None

    def test_handles_bad_json_response(self):
        """Returns None when Claude returns unparseable response."""
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                "I couldn't find much about this company."
            )
            mock_fn.return_value = mock_client

            result = engine.generate_brief("UnknownCorp")

        assert result is None

    def test_handles_tool_use_blocks_in_response(self):
        """Correctly extracts text from responses with mixed tool_use and text blocks."""
        brief_data = _make_brief()
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response_with_tool_use(
                json.dumps(brief_data)
            )
            mock_fn.return_value = mock_client

            result = engine.generate_brief("Eli Lilly")

        assert result is not None
        assert result["company_overview"]["headquarters"] == "Indianapolis, IN"

    def test_web_search_tool_in_api_call(self):
        """Verifies web_search tool is passed to the API call."""
        brief_data = _make_brief()
        engine = CompanyIntelEngine(anthropic_api_key="fake-key")

        with patch.object(engine, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                json.dumps(brief_data)
            )
            mock_fn.return_value = mock_client

            engine.generate_brief("Eli Lilly")

        call_args = mock_client.messages.create.call_args
        tools = call_args[1]["tools"]
        assert len(tools) == 1
        assert tools[0]["type"] == "web_search_20250305"
        assert tools[0]["name"] == "web_search"


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
