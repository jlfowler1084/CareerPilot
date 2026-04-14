"""Tests for LLMRouter — model resolution, provider dispatch, return-type contracts."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from src.llm.providers.base import ProviderResponse


def _make_prose_response(text: str = "result text") -> ProviderResponse:
    return ProviderResponse(raw_text=text, parsed=None, model="claude-sonnet-4-6", latency_ms=100)


def _make_schema_response(parsed: dict, model: str = "claude-haiku-4-5-20251001") -> ProviderResponse:
    return ProviderResponse(raw_text=str(parsed), parsed=parsed, model=model, latency_ms=100)


@pytest.fixture
def mock_claude():
    """Mocked ClaudeProvider instance."""
    m = MagicMock()
    return m


@pytest.fixture
def router(mock_claude):
    """LLMRouter with injected mock Claude provider."""
    from src.llm.router import LLMRouter
    r = LLMRouter.__new__(LLMRouter)
    r._claude = mock_claude
    return r


class TestRouterReturnTypes:
    def test_prose_task_returns_string(self, router, mock_claude):
        """complete() returns a raw string for prose tasks (schema=None in TASK_CONFIG)."""
        mock_claude.complete.return_value = _make_prose_response("Here is your roadmap.")
        result = router.complete(task="roadmap_generate", prompt="Terraform gaps")
        assert isinstance(result, str)
        assert result == "Here is your roadmap."

    def test_schema_task_returns_dict(self, router, mock_claude):
        """complete() returns parsed dict for tasks with a schema."""
        parsed = {
            "category": "recruiter_outreach",
            "company": "Acme",
            "role": "SRE",
            "urgency": "low",
            "summary": "SRE role inquiry",
        }
        mock_claude.complete.return_value = _make_schema_response(parsed)
        result = router.complete(task="email_classify", prompt="Dear candidate...")
        assert isinstance(result, dict)
        assert result["category"] == "recruiter_outreach"

    def test_array_schema_task_returns_list(self, router, mock_claude):
        """complete() returns a list for tasks whose schema is type=array."""
        tags = ["python", "debugging", "api"]
        resp = ProviderResponse(raw_text=str(tags), parsed=tags, model="claude-haiku-4-5-20251001", latency_ms=50)
        mock_claude.complete.return_value = resp
        result = router.complete(task="journal_entry", prompt="Fixed a bug today.")
        assert isinstance(result, list)
        assert "python" in result


class TestRouterModelResolution:
    def test_default_model_from_task_model_map(self, router, mock_claude):
        """Router uses TASK_MODEL_MAP[task] as default Claude model."""
        from config import settings
        mock_claude.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        router.complete(task="email_classify", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["model"] == settings.MODEL_HAIKU

    def test_env_override_replaces_default_model(self, router, mock_claude):
        """CAREERPILOT_LLM_TASK_EMAIL_CLASSIFY env var overrides TASK_MODEL_MAP."""
        mock_claude.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        }, model="claude-opus-4-6")
        with patch.dict(os.environ, {"CAREERPILOT_LLM_TASK_EMAIL_CLASSIFY": "claude-opus-4-6"}):
            router.complete(task="email_classify", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["model"] == "claude-opus-4-6"

    def test_model_override_kwarg_takes_precedence(self, router, mock_claude):
        """Explicit model= kwarg overrides both TASK_MODEL_MAP and env var."""
        mock_claude.complete.return_value = _make_prose_response()
        router.complete(task="roadmap_generate", prompt="test", model="claude-opus-4-6")
        kw = mock_claude.complete.call_args[1]
        assert kw["model"] == "claude-opus-4-6"

    def test_max_tokens_override_kwarg(self, router, mock_claude):
        """max_tokens kwarg overrides TASK_CONFIG default."""
        mock_claude.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        router.complete(task="email_classify", prompt="test", max_tokens=64)
        kw = mock_claude.complete.call_args[1]
        assert kw["max_tokens"] == 64


class TestRouterProviderCallShape:
    def test_system_prompt_from_task_config(self, router, mock_claude):
        """Router passes system_prompt from TASK_CONFIG to the provider."""
        from config import settings
        mock_claude.complete.return_value = _make_prose_response()
        router.complete(task="roadmap_generate", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["system_prompt"] == settings.TASK_CONFIG["roadmap_generate"]["system_prompt"]

    def test_schema_from_task_config_passed_through(self, router, mock_claude):
        """Router passes schema from TASK_CONFIG for schema tasks."""
        from config import settings
        mock_claude.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        router.complete(task="email_classify", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["schema"] == settings.TASK_CONFIG["email_classify"]["schema"]

    def test_prose_task_schema_is_none(self, router, mock_claude):
        """Router passes schema=None for prose tasks."""
        mock_claude.complete.return_value = _make_prose_response()
        router.complete(task="roadmap_generate", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["schema"] is None

    def test_task_name_passed_to_provider(self, router, mock_claude):
        """Router passes the task ID to the provider for logging."""
        mock_claude.complete.return_value = _make_prose_response()
        router.complete(task="roadmap_generate", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["task"] == "roadmap_generate"


class TestRouterEdgeCases:
    def test_unknown_task_raises_key_error(self, router):
        """complete() raises KeyError for unknown task IDs (caught early from TASK_CONFIG)."""
        with pytest.raises(KeyError):
            router.complete(task="no_such_task_id", prompt="test")

    def test_embed_not_yet_implemented(self, router):
        """embed() raises NotImplementedError until Unit 3."""
        with pytest.raises(NotImplementedError):
            router.embed(task="embed_default", text="hello")
