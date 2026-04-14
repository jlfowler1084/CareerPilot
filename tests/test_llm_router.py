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
def mock_local():
    """Mocked LocalProvider instance."""
    m = MagicMock()
    return m


@pytest.fixture
def router(mock_claude, mock_local):
    """LLMRouter with injected mock Claude and Local providers."""
    from src.llm.router import LLMRouter
    r = LLMRouter.__new__(LLMRouter)
    r._claude = mock_claude
    r._local = mock_local
    return r


class TestRouterReturnTypes:
    def test_prose_task_returns_string(self, router, mock_claude):
        """complete() returns a raw string for prose tasks (schema=None in TASK_CONFIG)."""
        mock_claude.complete.return_value = _make_prose_response("Here is your roadmap.")
        result = router.complete(task="roadmap_generate", prompt="Terraform gaps")
        assert isinstance(result, str)
        assert result == "Here is your roadmap."

    def test_schema_task_local_returns_dict(self, router, mock_local):
        """complete() returns parsed dict for R9 tasks routed to local provider."""
        parsed = {
            "category": "recruiter_outreach",
            "company": "Acme",
            "role": "SRE",
            "urgency": "low",
            "summary": "SRE role inquiry",
        }
        mock_local.complete.return_value = _make_schema_response(parsed, model="qwen3.5-35b-a3b-fp8")
        result = router.complete(task="email_classify", prompt="Dear candidate...")
        assert isinstance(result, dict)
        assert result["category"] == "recruiter_outreach"

    def test_array_schema_task_returns_list(self, router, mock_claude):
        """complete() returns a list for tasks whose schema is type=array (R10 — claude)."""
        tags = ["python", "debugging", "api"]
        resp = ProviderResponse(raw_text=str(tags), parsed=tags, model="claude-haiku-4-5-20251001", latency_ms=50)
        mock_claude.complete.return_value = resp
        result = router.complete(task="journal_entry", prompt="Fixed a bug today.")
        assert isinstance(result, list)
        assert "python" in result


class TestRouterModelResolution:
    def test_r9_task_routes_to_local_provider(self, router, mock_local):
        """R9 tasks (email_classify) route to the local provider by default."""
        mock_local.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        }, model="qwen3.5-35b-a3b-fp8")
        router.complete(task="email_classify", prompt="test")
        assert mock_local.complete.called

    def test_r10_task_routes_to_claude_with_correct_model(self, router, mock_claude):
        """R10 tasks (journal_entry) route to Claude with TASK_MODEL_MAP model."""
        from config import settings
        mock_claude.complete.return_value = _make_schema_response(
            ["python", "debugging"], model=settings.MODEL_HAIKU
        )
        router.complete(task="journal_entry", prompt="Fixed a bug today.")
        kw = mock_claude.complete.call_args[1]
        assert kw["model"] == settings.MODEL_HAIKU

    def test_env_override_with_explicit_model_id_routes_to_claude(self, router, mock_claude):
        """CAREERPILOT_LLM_TASK_EMAIL_CLASSIFY with explicit model ID routes to Claude."""
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

    def test_max_tokens_override_kwarg_local_task(self, router, mock_local):
        """max_tokens kwarg overrides TASK_CONFIG default for local-routed tasks."""
        mock_local.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        router.complete(task="email_classify", prompt="test", max_tokens=64)
        kw = mock_local.complete.call_args[1]
        assert kw["max_tokens"] == 64

    def test_kill_switch_forces_claude_for_r9_task(self, router, mock_claude):
        """LLM_KILL_SWITCH=1 forces R9 tasks to Claude."""
        from config import settings as cfg_mod
        mock_claude.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        original = cfg_mod.LLM_KILL_SWITCH
        try:
            cfg_mod.LLM_KILL_SWITCH = True
            router.complete(task="email_classify", prompt="test")
        finally:
            cfg_mod.LLM_KILL_SWITCH = original
        assert mock_claude.complete.called


class TestRouterProviderCallShape:
    def test_system_prompt_from_task_config_claude(self, router, mock_claude):
        """Router passes system_prompt from TASK_CONFIG to Claude for R10 tasks."""
        from config import settings
        mock_claude.complete.return_value = _make_prose_response()
        router.complete(task="roadmap_generate", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["system_prompt"] == settings.TASK_CONFIG["roadmap_generate"]["system_prompt"]

    def test_system_prompt_from_task_config_local(self, router, mock_local):
        """Router passes system_prompt from TASK_CONFIG to local for R9 tasks."""
        from config import settings
        mock_local.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        router.complete(task="email_classify", prompt="test")
        kw = mock_local.complete.call_args[1]
        assert kw["system_prompt"] == settings.TASK_CONFIG["email_classify"]["system_prompt"]

    def test_schema_from_task_config_passed_to_local(self, router, mock_local):
        """Router passes schema from TASK_CONFIG to local for R9 schema tasks."""
        from config import settings
        mock_local.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        router.complete(task="email_classify", prompt="test")
        kw = mock_local.complete.call_args[1]
        assert kw["schema"] == settings.TASK_CONFIG["email_classify"]["schema"]

    def test_prose_task_schema_is_none(self, router, mock_claude):
        """Router passes schema=None for Claude prose tasks."""
        mock_claude.complete.return_value = _make_prose_response()
        router.complete(task="roadmap_generate", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["schema"] is None

    def test_task_name_passed_to_claude_provider(self, router, mock_claude):
        """Router passes the task ID to the Claude provider for logging."""
        mock_claude.complete.return_value = _make_prose_response()
        router.complete(task="roadmap_generate", prompt="test")
        kw = mock_claude.complete.call_args[1]
        assert kw["task"] == "roadmap_generate"

    def test_task_name_passed_to_local_provider(self, router, mock_local):
        """Router passes the task ID to the local provider for logging."""
        mock_local.complete.return_value = _make_schema_response({
            "category": "irrelevant", "company": "", "role": "", "urgency": "low", "summary": "",
        })
        router.complete(task="email_classify", prompt="test")
        kw = mock_local.complete.call_args[1]
        assert kw["task"] == "email_classify"


class TestRouterEdgeCases:
    def test_unknown_task_raises_key_error(self, router):
        """complete() raises KeyError for unknown task IDs (caught early from TASK_CONFIG)."""
        with pytest.raises(KeyError):
            router.complete(task="no_such_task_id", prompt="test")

    def test_embed_delegates_to_local_provider(self, router, mock_local):
        """embed() delegates to local provider and returns the vector."""
        mock_local.embed.return_value = [0.1, 0.2, 0.3]
        result = router.embed(task="embed_default", text="hello")
        assert result == [0.1, 0.2, 0.3]
        mock_local.embed.assert_called_once()
