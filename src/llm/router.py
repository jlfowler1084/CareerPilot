"""LLM router — dispatches to local or Claude provider based on task config and policy."""

from __future__ import annotations

# Unit 2 implementation


class LLMRouter:
    """Routes LLM calls to local or Claude provider.

    Instantiate once per process; use the module-level singleton `router`.
    """

    def complete(self, task: str, prompt: str, schema=None, **overrides):
        """Send a completion request for the given task.

        Args:
            task: Task ID from TASK_MODEL_MAP (e.g. "email_classify").
            prompt: User-side prompt text.
            schema: Optional JSON schema dict. If provided, forces structured output.
            **overrides: Optional per-call overrides (model, max_tokens, temperature).

        Returns:
            Parsed dict (if schema provided) or raw string.
        """
        raise NotImplementedError("Unit 2 not yet implemented")

    def embed(self, task: str, text: str) -> list:
        """Generate an embedding vector for the given text.

        Args:
            task: Task ID (use "embed_default").
            text: Text to embed.

        Returns:
            List of floats.
        """
        raise NotImplementedError("Unit 3 not yet implemented")


# Module-level singleton — import and use this in migrated modules.
router = LLMRouter()
