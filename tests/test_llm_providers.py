"""Tests for ClaudeProvider — tool-use shape, array wrapping, prose, error handling."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.llm.failure import ProviderInfraError
from src.llm.providers.claude import ClaudeProvider


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tool_use_msg(input_dict: dict) -> MagicMock:
    """Mock anthropic Message with a single tool_use content block."""
    block = MagicMock()
    block.type = "tool_use"
    block.input = input_dict
    msg = MagicMock()
    msg.content = [block]
    return msg


def _text_msg(text: str) -> MagicMock:
    """Mock anthropic Message with a single text content block."""
    block = MagicMock()
    block.type = "text"
    block.text = text
    msg = MagicMock()
    msg.content = [block]
    return msg


def _preamble_then_tool_msg(preamble_text: str, input_dict: dict) -> MagicMock:
    """Mock message with a text preamble block BEFORE the tool_use block."""
    text_block = MagicMock()
    text_block.type = "text"
    text_block.text = preamble_text
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.input = input_dict
    msg = MagicMock()
    msg.content = [text_block, tool_block]
    return msg


@pytest.fixture
def provider():
    return ClaudeProvider(api_key="test-key")


# ---------------------------------------------------------------------------
# Schema tasks — object schema
# ---------------------------------------------------------------------------

class TestClaudeProviderObjectSchema:
    def test_forced_tool_use_called(self, provider):
        """Object schema tasks call messages.create with tools= and tool_choice=."""
        schema = {
            "type": "object",
            "required": ["category"],
            "properties": {"category": {"type": "string"}},
        }
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_msg({"category": "recruiter_outreach"})
        with patch.object(provider, "_get_client", return_value=mock_client):
            provider.complete(
                task="email_classify",
                system_prompt="Classify this email.",
                prompt="Hi candidate",
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                temperature=None,
                schema=schema,
            )
        kw = mock_client.messages.create.call_args[1]
        assert "tools" in kw
        assert kw["tool_choice"]["type"] == "tool"
        assert kw["tools"][0]["input_schema"] == schema

    def test_parsed_result_is_block_input(self, provider):
        """For object schema, parsed = tool_block.input (no unwrapping needed)."""
        schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_msg({"x": "hello"})
        with patch.object(provider, "_get_client", return_value=mock_client):
            result = provider.complete(
                task="email_classify",
                system_prompt="",
                prompt="test",
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                temperature=None,
                schema=schema,
            )
        assert result.parsed == {"x": "hello"}

    def test_system_prompt_included_when_nonempty(self, provider):
        """system= kwarg passed to messages.create when system_prompt is non-empty."""
        schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_msg({"x": "v"})
        with patch.object(provider, "_get_client", return_value=mock_client):
            provider.complete(
                task="email_classify",
                system_prompt="You are helpful.",
                prompt="test",
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                temperature=None,
                schema=schema,
            )
        kw = mock_client.messages.create.call_args[1]
        assert kw.get("system") == "You are helpful."

    def test_empty_system_prompt_omitted_from_call(self, provider):
        """system= kwarg is NOT passed when system_prompt is empty string."""
        schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_msg({"x": "v"})
        with patch.object(provider, "_get_client", return_value=mock_client):
            provider.complete(
                task="daily_summary",
                system_prompt="",
                prompt="test",
                model="claude-sonnet-4-6",
                max_tokens=512,
                temperature=None,
                schema=schema,
            )
        kw = mock_client.messages.create.call_args[1]
        assert "system" not in kw


# ---------------------------------------------------------------------------
# Schema tasks — array schema (wrapping behaviour)
# ---------------------------------------------------------------------------

class TestClaudeProviderArraySchema:
    def test_array_schema_input_schema_is_wrapped_object(self, provider):
        """Array schema is wrapped in {"result": <schema>} for Claude tool input_schema."""
        schema = {"type": "array", "items": {"type": "string"}}
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_msg({"result": ["a", "b"]})
        with patch.object(provider, "_get_client", return_value=mock_client):
            provider.complete(
                task="journal_entry",
                system_prompt="Tag this.",
                prompt="Today I debugged a race condition.",
                model="claude-haiku-4-5-20251001",
                max_tokens=128,
                temperature=None,
                schema=schema,
            )
        kw = mock_client.messages.create.call_args[1]
        input_schema = kw["tools"][0]["input_schema"]
        assert input_schema["type"] == "object"
        assert "result" in input_schema["properties"]
        assert input_schema["properties"]["result"] == schema
        assert input_schema["required"] == ["result"]

    def test_array_schema_parsed_is_unwrapped_list(self, provider):
        """Router unwraps block.input['result'] so caller receives the array directly."""
        schema = {"type": "array", "items": {"type": "string"}}
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_msg(
            {"result": ["python", "debugging", "api"]}
        )
        with patch.object(provider, "_get_client", return_value=mock_client):
            result = provider.complete(
                task="journal_entry",
                system_prompt="Tag this.",
                prompt="test",
                model="claude-haiku-4-5-20251001",
                max_tokens=128,
                temperature=None,
                schema=schema,
            )
        assert result.parsed == ["python", "debugging", "api"]


# ---------------------------------------------------------------------------
# Content block iteration — CRITICAL: must not hard-code content[0]
# ---------------------------------------------------------------------------

class TestContentBlockIteration:
    def test_tool_use_found_after_preamble_text_block(self, provider):
        """Provider correctly finds tool_use block when a text preamble precedes it."""
        schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _preamble_then_tool_msg(
            "Here is the result:", {"x": "correct"}
        )
        with patch.object(provider, "_get_client", return_value=mock_client):
            result = provider.complete(
                task="email_classify",
                system_prompt="",
                prompt="test",
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                temperature=None,
                schema=schema,
            )
        assert result.parsed == {"x": "correct"}

    def test_missing_tool_use_block_raises_infra_error(self, provider):
        """If no tool_use block is in content, raises ProviderInfraError."""
        schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _text_msg("I cannot do that.")
        with patch.object(provider, "_get_client", return_value=mock_client):
            with pytest.raises(ProviderInfraError, match="no tool_use block"):
                provider.complete(
                    task="email_classify",
                    system_prompt="",
                    prompt="test",
                    model="claude-haiku-4-5-20251001",
                    max_tokens=256,
                    temperature=None,
                    schema=schema,
                )

    def test_missing_text_block_raises_infra_error(self, provider):
        """Empty content list for prose task raises ProviderInfraError."""
        msg = MagicMock()
        msg.content = []
        mock_client = MagicMock()
        mock_client.messages.create.return_value = msg
        with patch.object(provider, "_get_client", return_value=mock_client):
            with pytest.raises(ProviderInfraError, match="no text block"):
                provider.complete(
                    task="roadmap_generate",
                    system_prompt="",
                    prompt="test",
                    model="claude-sonnet-4-6",
                    max_tokens=4096,
                    temperature=None,
                    schema=None,
                )


# ---------------------------------------------------------------------------
# Prose tasks
# ---------------------------------------------------------------------------

class TestClaudeProviderProse:
    def test_prose_returns_text_and_none_parsed(self, provider):
        """Prose tasks return raw_text with parsed=None."""
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _text_msg("Your roadmap is ready.")
        with patch.object(provider, "_get_client", return_value=mock_client):
            result = provider.complete(
                task="roadmap_generate",
                system_prompt="You are a career advisor.",
                prompt="Create roadmap for Terraform",
                model="claude-sonnet-4-6",
                max_tokens=4096,
                temperature=None,
                schema=None,
            )
        assert result.raw_text == "Your roadmap is ready."
        assert result.parsed is None

    def test_prose_does_not_include_tools_param(self, provider):
        """Prose tasks do NOT pass tools= or tool_choice= to messages.create."""
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _text_msg("done")
        with patch.object(provider, "_get_client", return_value=mock_client):
            provider.complete(
                task="roadmap_generate",
                system_prompt="",
                prompt="test",
                model="claude-sonnet-4-6",
                max_tokens=4096,
                temperature=None,
                schema=None,
            )
        kw = mock_client.messages.create.call_args[1]
        assert "tools" not in kw
        assert "tool_choice" not in kw

    def test_temperature_passed_when_not_none(self, provider):
        """temperature= is included in messages.create when explicitly set."""
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _text_msg("done")
        with patch.object(provider, "_get_client", return_value=mock_client):
            provider.complete(
                task="roadmap_generate",
                system_prompt="",
                prompt="test",
                model="claude-sonnet-4-6",
                max_tokens=4096,
                temperature=0.7,
                schema=None,
            )
        kw = mock_client.messages.create.call_args[1]
        assert kw.get("temperature") == 0.7

    def test_temperature_omitted_when_none(self, provider):
        """temperature= is NOT passed when None (lets model use its own default)."""
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _text_msg("done")
        with patch.object(provider, "_get_client", return_value=mock_client):
            provider.complete(
                task="roadmap_generate",
                system_prompt="",
                prompt="test",
                model="claude-sonnet-4-6",
                max_tokens=4096,
                temperature=None,
                schema=None,
            )
        kw = mock_client.messages.create.call_args[1]
        assert "temperature" not in kw


# ---------------------------------------------------------------------------
# Embeddings — not supported by ClaudeProvider
# ---------------------------------------------------------------------------

class TestClaudeProviderEmbed:
    def test_embed_raises_not_implemented(self, provider):
        """ClaudeProvider.embed() always raises NotImplementedError."""
        with pytest.raises(NotImplementedError):
            provider.embed(task="embed_default", text="hello", model="embed-model")


# ---------------------------------------------------------------------------
# LocalProvider — schema tasks (response_format=json_schema + disable thinking)
# ---------------------------------------------------------------------------

from src.llm.providers.local import LocalProvider
from src.llm.failure import SchemaValidationError


class TestLocalProviderSchemaTask:
    def _make_provider(self):
        return LocalProvider(
            chat_base_url="http://localhost:8000/v1",
            embed_base_url="http://localhost:8001/v1",
            chat_model="qwen3.5-35b-a3b-fp8",
            embed_model="qwen3-embed",
            api_key="",
        )

    def test_response_format_json_schema_passed(self):
        """Schema tasks use response_format={"type":"json_schema",...}."""
        schema = {"type": "object", "properties": {"category": {"type": "string"}}}
        provider = self._make_provider()
        mock_client = MagicMock()
        choice = MagicMock()
        choice.message.content = '{"category": "recruiter_outreach"}'
        choice.finish_reason = "stop"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[choice])
        with patch.object(provider, "_get_chat_client", return_value=mock_client):
            result = provider.complete(
                task="email_classify",
                system_prompt="Classify.",
                prompt="Hi candidate",
                model="qwen3.5-35b-a3b-fp8",
                max_tokens=256,
                temperature=None,
                schema=schema,
            )
        kw = mock_client.chat.completions.create.call_args[1]
        assert kw["response_format"]["type"] == "json_schema"
        assert kw["response_format"]["json_schema"]["name"] == "email_classify"
        assert kw["response_format"]["json_schema"]["schema"] == schema
        assert result.parsed == {"category": "recruiter_outreach"}

    def test_thinking_disabled_via_extra_body(self):
        """All local complete() calls include enable_thinking=False."""
        provider = self._make_provider()
        mock_client = MagicMock()
        choice = MagicMock()
        choice.message.content = "plain text response"
        choice.finish_reason = "stop"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[choice])
        with patch.object(provider, "_get_chat_client", return_value=mock_client):
            provider.complete(
                task="roadmap_generate",
                system_prompt="",
                prompt="test",
                model="qwen3.5-35b-a3b-fp8",
                max_tokens=512,
                temperature=None,
                schema=None,
            )
        kw = mock_client.chat.completions.create.call_args[1]
        assert kw.get("extra_body", {}).get("chat_template_kwargs", {}).get("enable_thinking") is False

    def test_schema_invalid_json_raises_infra_error(self):
        """Non-JSON response when schema expected raises ProviderInfraError(json_parse_error)."""
        schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        provider = self._make_provider()
        mock_client = MagicMock()
        choice = MagicMock()
        choice.message.content = "not json at all"
        choice.finish_reason = "stop"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[choice])
        with patch.object(provider, "_get_chat_client", return_value=mock_client):
            with pytest.raises(ProviderInfraError, match="json_parse_error"):
                provider.complete(
                    task="email_classify",
                    system_prompt="",
                    prompt="test",
                    model="q",
                    max_tokens=256,
                    temperature=None,
                    schema=schema,
                )

    def test_schema_invalid_structure_raises_schema_validation_error(self):
        """Valid JSON that fails schema raises SchemaValidationError."""
        schema = {
            "type": "object",
            "required": ["category"],
            "properties": {"category": {"type": "string"}},
        }
        provider = self._make_provider()
        mock_client = MagicMock()
        choice = MagicMock()
        choice.message.content = '{"wrong_key": "value"}'  # missing required "category"
        choice.finish_reason = "stop"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[choice])
        with patch.object(provider, "_get_chat_client", return_value=mock_client):
            with pytest.raises(SchemaValidationError):
                provider.complete(
                    task="email_classify",
                    system_prompt="",
                    prompt="test",
                    model="q",
                    max_tokens=256,
                    temperature=None,
                    schema=schema,
                )

    def test_empty_response_raises_infra_error(self):
        """Empty content string raises ProviderInfraError(empty_response)."""
        provider = self._make_provider()
        mock_client = MagicMock()
        choice = MagicMock()
        choice.message.content = ""
        choice.finish_reason = "stop"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[choice])
        with patch.object(provider, "_get_chat_client", return_value=mock_client):
            with pytest.raises(ProviderInfraError, match="empty_response"):
                provider.complete(
                    task="email_classify",
                    system_prompt="",
                    prompt="test",
                    model="q",
                    max_tokens=256,
                    temperature=None,
                    schema=None,
                )

    def test_truncated_finish_reason_raises_infra_error(self):
        """finish_reason='length' raises ProviderInfraError(truncated_finish_reason)."""
        provider = self._make_provider()
        mock_client = MagicMock()
        choice = MagicMock()
        choice.message.content = "partial"
        choice.finish_reason = "length"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[choice])
        with patch.object(provider, "_get_chat_client", return_value=mock_client):
            with pytest.raises(ProviderInfraError, match="truncated_finish_reason"):
                provider.complete(
                    task="email_classify",
                    system_prompt="",
                    prompt="test",
                    model="q",
                    max_tokens=256,
                    temperature=None,
                    schema=None,
                )

    def test_connection_error_raises_provider_infra_error(self):
        """openai.APIConnectionError maps to ProviderInfraError(connection_error)."""
        import openai as openai_mod
        provider = self._make_provider()
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = openai_mod.APIConnectionError(
            request=MagicMock()
        )
        with patch.object(provider, "_get_chat_client", return_value=mock_client):
            with pytest.raises(ProviderInfraError, match="connection_error"):
                provider.complete(
                    task="email_classify",
                    system_prompt="",
                    prompt="test",
                    model="q",
                    max_tokens=256,
                    temperature=None,
                    schema=None,
                )


# ---------------------------------------------------------------------------
# LocalProvider — URL validation
# ---------------------------------------------------------------------------

class TestLocalProviderURLValidation:
    def test_non_loopback_url_raises_security_error(self):
        """Non-loopback, non-allowlisted URL raises LocalEndpointSecurityError."""
        from src.llm.providers.local import validate_endpoint_url
        from src.llm.failure import LocalEndpointSecurityError
        with pytest.raises(LocalEndpointSecurityError):
            validate_endpoint_url("http://192.168.1.5:8000/v1", allowlist=[])

    def test_loopback_url_passes(self):
        """localhost URL passes without DNS lookup."""
        from src.llm.providers.local import validate_endpoint_url
        # Should not raise
        validate_endpoint_url("http://localhost:8000/v1", allowlist=[])

    def test_allowlisted_ip_passes(self):
        """Non-loopback IP in allowlist passes."""
        from src.llm.providers.local import validate_endpoint_url
        validate_endpoint_url("http://192.168.1.5:8000/v1", allowlist=["192.168.1.5"])
