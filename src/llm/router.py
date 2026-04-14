"""LLM router — dispatches to local or Claude provider based on task config and policy."""

from __future__ import annotations

import os
from typing import Dict, List, Optional, Union

from config import settings
from src.llm.providers.base import ProviderResponse
from src.llm.providers.claude import ClaudeProvider
from src.llm.providers.local import LocalProvider


class LLMRouter:
    """Routes LLM calls to local or Claude provider.

    In Unit 3, R9 tasks route to the local provider (Qwen via vLLM).
    R10 tasks route to Claude. Failure handling and logging are added in Unit 4.

    Instantiate once per process; use the module-level singleton `router`.
    """

    def __init__(self) -> None:
        self._claude = ClaudeProvider(api_key=settings.ANTHROPIC_API_KEY)
        self._local = LocalProvider(
            chat_base_url=settings.LLM_LOCAL_BASE_URL,
            embed_base_url=settings.LLM_LOCAL_EMBED_BASE_URL,
            chat_model=settings.LLM_LOCAL_MODEL_CHAT,
            embed_model=settings.LLM_LOCAL_MODEL_EMBED,
            api_key=settings.LLM_LOCAL_API_KEY,
        )

    def _resolve_provider(self, task: str) -> str:
        """Determine which provider to use for the given task.

        Checks, in order:
        1. LLM_KILL_SWITCH env var — forces Claude for all tasks when set.
        2. Per-task env var CAREERPILOT_LLM_TASK_<TASK_ID_UPPER>.
        3. TASK_MODEL_MAP — "local" maps to local; anything else maps to Claude.

        Returns:
            "local" or "claude".
        """
        if settings.LLM_KILL_SWITCH:
            return "claude"
        env_key = "CAREERPILOT_LLM_TASK_" + task.upper().replace("-", "_")
        override = os.getenv(env_key, "")
        if override == "local":
            return "local"
        if override:  # non-empty, non-"local": treat as a Claude model ID
            return "claude"
        mapped = settings.TASK_MODEL_MAP.get(task, "claude")
        return "local" if mapped == "local" else "claude"

    def _resolve_model(self, task: str) -> str:
        """Resolve the Claude model ID for a task, applying env var overrides.

        Used only when routing to Claude. Checks:
        1. Per-task env var CAREERPILOT_LLM_TASK_<TASK_ID_UPPER> (explicit model ID).
        2. TASK_MODEL_MAP — if not "local", the value is the Claude model ID.
        3. Fallback to MODEL_SONNET.

        Returns:
            Claude model ID string.
        """
        env_key = "CAREERPILOT_LLM_TASK_" + task.upper().replace("-", "_")
        override = os.getenv(env_key, "")
        if override and override not in ("local", "claude"):
            return override  # explicit Claude model ID in env var
        mapped = settings.TASK_MODEL_MAP.get(task, settings.MODEL_SONNET)
        if mapped != "local":
            return mapped  # R10 task: map has the Claude model ID
        return settings.MODEL_SONNET  # R9 task forced to Claude: default to Sonnet

    def complete(
        self, task: str, prompt: str, schema: Optional[Dict] = None, **overrides
    ) -> Union[Dict, List, str]:
        """Send a completion request for the given task.

        Args:
            task: Task ID from TASK_MODEL_MAP / TASK_CONFIG (e.g. "email_classify").
            prompt: User-side prompt text.
            schema: Optional JSON schema override. If None, uses TASK_CONFIG schema.
            **overrides: Per-call overrides — model, max_tokens, temperature.

        Returns:
            Parsed dict or list (for schema tasks) or raw string (for prose tasks).

        Raises:
            KeyError: If task is not in TASK_CONFIG.
        """
        cfg = settings.TASK_CONFIG[task]  # raises KeyError for unknown tasks
        provider_name = self._resolve_provider(task)
        max_tokens = overrides.get("max_tokens") or cfg["max_tokens"]
        temperature = overrides.get("temperature")
        system_prompt = cfg["system_prompt"]
        effective_schema = schema if schema is not None else cfg.get("schema")

        if provider_name == "local":
            response = self._local.complete(
                task=task,
                system_prompt=system_prompt,
                prompt=prompt,
                model=settings.LLM_LOCAL_MODEL_CHAT,
                max_tokens=max_tokens,
                temperature=temperature,
                schema=effective_schema,
            )
        else:
            model = overrides.get("model") or self._resolve_model(task)
            response = self._claude.complete(
                task=task,
                system_prompt=system_prompt,
                prompt=prompt,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                schema=effective_schema,
            )

        return response.parsed if effective_schema is not None else response.raw_text

    def embed(self, task: str, text: str) -> List:
        """Generate an embedding vector using the local provider.

        Args:
            task: Task ID (use "embed_default").
            text: Text to embed.

        Returns:
            List of floats.
        """
        return self._local.embed(task=task, text=text, model=settings.LLM_LOCAL_MODEL_EMBED)


# Module-level singleton — import and use this in migrated modules.
router = LLMRouter()
