"""LLM router — dispatches to local or Claude provider based on task config and policy."""

from __future__ import annotations

import os
from typing import Dict, List, Optional, Union

from config import settings
from src.llm.providers.base import ProviderResponse
from src.llm.providers.claude import ClaudeProvider


class LLMRouter:
    """Routes LLM calls to local or Claude provider.

    In Unit 2, all calls route to Claude. Local routing is added in Unit 3.
    Failure handling and logging are added in Unit 4.

    Instantiate once per process; use the module-level singleton `router`.
    """

    def __init__(self) -> None:
        self._claude = ClaudeProvider(api_key=settings.ANTHROPIC_API_KEY)

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

        model = overrides.get("model") or self._resolve_model(task)
        max_tokens = overrides.get("max_tokens") or cfg["max_tokens"]
        temperature = overrides.get("temperature")  # None = let model use its default
        system_prompt = cfg["system_prompt"]
        effective_schema = schema if schema is not None else cfg.get("schema")

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
        """Generate an embedding vector for the given text.

        Args:
            task: Task ID (use "embed_default").
            text: Text to embed.

        Returns:
            List of floats.
        """
        raise NotImplementedError("Unit 3 not yet implemented")

    def _resolve_model(self, task: str) -> str:
        """Resolve the Claude model for a task, applying env var overrides.

        Checks CAREERPILOT_LLM_TASK_<TASK_ID_UPPER> env var first.
        Falls back to TASK_MODEL_MAP, then MODEL_SONNET.
        """
        env_key = "CAREERPILOT_LLM_TASK_" + task.upper().replace("-", "_")
        override = os.getenv(env_key, "")
        if override and override != "local":
            return override
        return settings.TASK_MODEL_MAP.get(task, settings.MODEL_SONNET)


# Module-level singleton — import and use this in migrated modules.
router = LLMRouter()
