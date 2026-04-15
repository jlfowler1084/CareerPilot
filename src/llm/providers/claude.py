"""Claude provider — wraps Anthropic Messages API with tool-use forced JSON."""

from __future__ import annotations

import time
from typing import Dict, List, Optional

import anthropic

from config import settings
from src.llm.failure import ProviderInfraError
from src.llm.providers.base import Provider, ProviderResponse

_TOOL_NAME = "structured_output"


class ClaudeProvider(Provider):
    """Calls Anthropic Messages API.

    For tasks with a schema, uses tool-use forced calls (JSON schema as tool input_schema).
    Arrays are wrapped in {"result": <array>} since Claude tool input_schema requires an
    object at the top level; the result is unwrapped before returning.

    For prose tasks, uses standard messages.create and returns the text block.
    """

    def __init__(self, api_key: str = None):
        self._api_key = api_key or settings.ANTHROPIC_API_KEY
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def complete(
        self,
        task: str,
        system_prompt: str,
        prompt: str,
        model: str,
        max_tokens: int,
        temperature: Optional[float],
        schema: Optional[Dict],
        claude_extra: Optional[Dict] = None,
    ) -> ProviderResponse:
        """Send a completion request to the Anthropic Messages API.

        For schema tasks: uses forced tool-use to guarantee structured JSON output.
        For prose tasks: uses standard message completion.
        """
        client = self._get_client()

        if schema is not None:
            return self._complete_schema(
                client, task, system_prompt, prompt, model, max_tokens, temperature, schema, claude_extra
            )
        return self._complete_prose(
            client, task, system_prompt, prompt, model, max_tokens, temperature, claude_extra
        )

    def _complete_schema(
        self, client, task, system_prompt, prompt, model, max_tokens, temperature, schema, claude_extra=None
    ) -> ProviderResponse:
        # Wrap array schemas: Claude tool input_schema must have object at top level.
        wrapped = schema.get("type") == "array"
        if wrapped:
            input_schema = {
                "type": "object",
                "properties": {"result": schema},
                "required": ["result"],
            }
        else:
            input_schema = schema

        kwargs = {
            "model": model,
            "max_tokens": max_tokens,
            "tools": [
                {
                    "name": _TOOL_NAME,
                    "description": "Return structured output for task: " + task,
                    "input_schema": input_schema,
                }
            ],
            "tool_choice": {"type": "tool", "name": _TOOL_NAME},
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        if temperature is not None:
            kwargs["temperature"] = temperature

        t0 = time.monotonic()
        response = client.messages.create(**kwargs)
        latency_ms = int((time.monotonic() - t0) * 1000)

        # Iterate content blocks — do NOT hard-code content[0].
        tool_block = None
        for block in response.content:
            if getattr(block, "type", None) == "tool_use":
                tool_block = block
                break
        if tool_block is None:
            raise ProviderInfraError("no tool_use block in response")

        parsed = tool_block.input["result"] if wrapped else tool_block.input
        return ProviderResponse(
            raw_text=str(parsed),
            parsed=parsed,
            model=model,
            latency_ms=latency_ms,
            tokens_in=response.usage.input_tokens,
            tokens_out=response.usage.output_tokens,
        )

    def _complete_prose(
        self, client, task, system_prompt, prompt, model, max_tokens, temperature, claude_extra=None
    ) -> ProviderResponse:
        kwargs = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        if temperature is not None:
            kwargs["temperature"] = temperature
        if claude_extra:
            kwargs.update(claude_extra)

        t0 = time.monotonic()
        response = client.messages.create(**kwargs)
        latency_ms = int((time.monotonic() - t0) * 1000)

        # Collect all text blocks — may be multiple when tools are used
        text_parts = [
            block.text
            for block in response.content
            if getattr(block, "type", None) == "text"
        ]
        raw_text = "\n".join(text_parts) if text_parts else ""
        if not raw_text:
            raise ProviderInfraError("no text block in response")

        return ProviderResponse(
            raw_text=raw_text,
            parsed=None,
            model=model,
            latency_ms=latency_ms,
            tokens_in=response.usage.input_tokens,
            tokens_out=response.usage.output_tokens,
        )

    def embed(self, task: str, text: str, model: str) -> List:
        raise NotImplementedError("Claude provider does not support embeddings")
