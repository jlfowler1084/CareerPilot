"""Abstract base class for LLM providers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class ProviderResponse:
    """Unified response from any provider."""

    raw_text: str
    parsed: Optional[dict]  # None for prose tasks; parsed dict/list for schema tasks
    model: str
    latency_ms: int
    tokens_in: int = 0
    tokens_out: int = 0


class Provider:
    """Abstract base for LLM providers (Claude, Local)."""

    def complete(
        self,
        task: str,
        system_prompt: str,
        prompt: str,
        model: str,
        max_tokens: int,
        temperature: Optional[float],
        schema: Optional[dict],
    ) -> ProviderResponse:
        """Send a completion request.

        Args:
            task: Task ID (for logging).
            system_prompt: System prompt string.
            prompt: User prompt text.
            model: Model identifier.
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature, or None for model default.
            schema: JSON schema dict, or None for prose tasks.

        Returns:
            ProviderResponse with raw_text and parsed.
        """
        raise NotImplementedError

    def embed(self, task: str, text: str, model: str) -> list:
        """Generate an embedding vector.

        Args:
            task: Task ID (for logging).
            text: Text to embed.
            model: Embedding model identifier.

        Returns:
            List of floats.
        """
        raise NotImplementedError
