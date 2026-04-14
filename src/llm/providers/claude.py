"""Claude provider — wraps Anthropic Messages API with tool-use forced JSON."""

from __future__ import annotations

# Unit 2 implementation

from src.llm.providers.base import Provider, ProviderResponse


class ClaudeProvider(Provider):
    """Calls Anthropic Messages API.

    For tasks with a schema, uses tool-use forced calls (JSON schema as tool input_schema).
    For prose tasks, uses standard messages.create.
    """

    def __init__(self, api_key: str = None):
        self._api_key = api_key
        self._client = None

    def _get_client(self):
        raise NotImplementedError("Unit 2 not yet implemented")

    def complete(self, task, system_prompt, prompt, model, max_tokens, temperature, schema):
        raise NotImplementedError("Unit 2 not yet implemented")

    def embed(self, task, text, model):
        raise NotImplementedError("Claude provider does not support embeddings")
