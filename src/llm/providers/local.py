"""Local provider — wraps OpenAI-compatible API (vLLM, LM Studio, Ollama, llama.cpp)."""

from __future__ import annotations

import ipaddress
import json
import socket
import time
from typing import Dict, List, Optional

import openai

from config import settings
from src.llm.failure import LocalEndpointSecurityError, ProviderInfraError, SchemaValidationError
from src.llm.providers.base import Provider, ProviderResponse
from src.llm.schema import validate_against_schema


def validate_endpoint_url(url: str, allowlist: List[str]) -> None:
    """Validate that a URL resolves only to loopback or allowlisted addresses.

    Args:
        url: The endpoint URL to validate (e.g. "http://localhost:8000/v1").
        allowlist: List of IP address strings that are explicitly permitted.

    Raises:
        LocalEndpointSecurityError: If the URL resolves to a non-loopback,
            non-allowlisted address.
    """
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.hostname or ""

    # Loopback hostnames — skip DNS, no network call needed
    if host in {"127.0.0.1", "::1", "localhost"}:
        return

    # For all other hosts, resolve and verify every address
    prev_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(2.0)
        addr_infos = socket.getaddrinfo(host, None)
    finally:
        socket.setdefaulttimeout(prev_timeout)

    for addr_info in addr_infos:
        ip_str = addr_info[4][0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError:
            raise LocalEndpointSecurityError(
                f"Endpoint URL resolved to unparseable address: {ip_str!r}"
            )
        if ip_obj.is_loopback:
            continue
        if ip_str in allowlist:
            continue
        raise LocalEndpointSecurityError(
            f"Endpoint URL {url!r} resolved to non-loopback address {ip_str!r} "
            f"which is not in the allowlist."
        )


class LocalProvider(Provider):
    """Calls a local OpenAI-compatible inference endpoint.

    Endpoint URL is validated lazily on first call (not at __init__ time)
    so that commands like `careerpilot llm-summary` work without touching the network.
    """

    def __init__(
        self,
        chat_base_url: str,
        embed_base_url: str,
        chat_model: str,
        embed_model: str,
        api_key: str = "",
    ) -> None:
        self._chat_base_url = chat_base_url
        # Fall back to chat_base_url if embed_base_url is empty
        self._embed_base_url = embed_base_url if embed_base_url else chat_base_url
        self._chat_model = chat_model
        self._embed_model = embed_model
        self._api_key = api_key

        # Lazy clients — None until first use
        self._chat_client: Optional[openai.OpenAI] = None
        self._embed_client: Optional[openai.OpenAI] = None

        # Validation state
        self._chat_url_validated = False
        self._embed_url_validated = False

    def _get_chat_client(self) -> openai.OpenAI:
        """Return the chat client, validating the URL and creating the client on first call."""
        if not self._chat_url_validated:
            validate_endpoint_url(self._chat_base_url, allowlist=[])
            self._chat_url_validated = True
        if self._chat_client is None:
            self._chat_client = openai.OpenAI(
                base_url=self._chat_base_url,
                api_key=self._api_key or "no-key",
            )
        return self._chat_client

    def _get_embed_client(self) -> openai.OpenAI:
        """Return the embed client, validating the URL and creating the client on first call."""
        if not self._embed_url_validated:
            validate_endpoint_url(self._embed_base_url, allowlist=[])
            self._embed_url_validated = True
        if self._embed_client is None:
            self._embed_client = openai.OpenAI(
                base_url=self._embed_base_url,
                api_key=self._api_key or "no-key",
            )
        return self._embed_client

    def complete(
        self,
        task: str,
        system_prompt: str,
        prompt: str,
        model: str,
        max_tokens: int,
        temperature: Optional[float],
        schema: Optional[dict],
        claude_extra: Optional[dict] = None,
    ) -> ProviderResponse:
        """Send a chat completion request to the local endpoint.

        Args:
            task: Task ID (used as the json_schema name when schema is provided).
            system_prompt: System prompt; omitted from messages if empty.
            prompt: User prompt text.
            model: Model identifier (passed to the API).
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature, or None for model default.
            schema: JSON schema dict for structured output, or None for prose tasks.

        Returns:
            ProviderResponse with raw_text and parsed (None for prose tasks).

        Raises:
            ProviderInfraError: On connection errors, HTTP 5xx, empty response,
                truncated output, or JSON parse failure.
            SchemaValidationError: When the response JSON fails schema validation.
        """
        client = self._get_chat_client()
        t0 = time.monotonic()

        # Build messages list
        messages: List[Dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Build API kwargs
        kwargs: Dict = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            # Always disable thinking — required for Qwen3 models in non-thinking mode
            "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
        }
        if temperature is not None:
            kwargs["temperature"] = temperature
        if schema is not None:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": task,
                    "schema": schema,
                },
            }

        # Call the API
        try:
            response = client.chat.completions.create(**kwargs)
        except openai.APIConnectionError:
            raise ProviderInfraError("connection_error")
        except openai.APIStatusError as exc:
            if exc.status_code >= 500:
                raise ProviderInfraError("http_5xx")
            raise

        raw = response.choices[0].message.content or ""

        if not raw:
            raise ProviderInfraError("empty_response")

        if response.choices[0].finish_reason == "length":
            raise ProviderInfraError("truncated_finish_reason")

        # Parse JSON if schema is expected
        parsed = None
        if schema is not None:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                raise ProviderInfraError("json_parse_error")
            try:
                validate_against_schema(parsed, schema)
            except Exception as exc:
                raise SchemaValidationError(str(exc)) from exc

        return ProviderResponse(
            raw_text=raw,
            parsed=parsed,
            model=self._chat_model,
            latency_ms=int((time.monotonic() - t0) * 1000),
            tokens_in=response.usage.prompt_tokens if response.usage else 0,
            tokens_out=response.usage.completion_tokens if response.usage else 0,
        )

    def embed(self, task: str, text: str, model: str) -> List[float]:
        """Generate an embedding vector using the local embed endpoint.

        Args:
            task: Task ID (for logging / future routing).
            text: Text to embed.
            model: Embedding model identifier.

        Returns:
            List of floats representing the embedding vector.

        Raises:
            ProviderInfraError: On connection errors.
        """
        client = self._get_embed_client()
        try:
            response = client.embeddings.create(model=model, input=text)
        except openai.APIConnectionError:
            raise ProviderInfraError("connection_error")
        return response.data[0].embedding
