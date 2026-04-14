"""Local provider — wraps OpenAI-compatible API (vLLM, LM Studio, Ollama, llama.cpp)."""

from __future__ import annotations

# Unit 3 implementation

from src.llm.providers.base import Provider, ProviderResponse


class LocalProvider(Provider):
    """Calls a local OpenAI-compatible inference endpoint.

    Endpoint URL is validated lazily on first call (not at __init__ time)
    so that commands like `careerpilot llm-summary` work without touching the network.
    """

    def __init__(self, base_url: str, chat_model: str, embed_model: str, api_key: str = ""):
        self._base_url = base_url
        self._chat_model = chat_model
        self._embed_model = embed_model
        self._api_key = api_key
        self._client = None
        self._url_validated = False

    def _validate_url(self) -> None:
        raise NotImplementedError("Unit 3 not yet implemented")

    def complete(self, task, system_prompt, prompt, model, max_tokens, temperature, schema):
        raise NotImplementedError("Unit 3 not yet implemented")

    def embed(self, task, text, model):
        raise NotImplementedError("Unit 3 not yet implemented")
