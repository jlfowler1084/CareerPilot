"""Tests for router.embed() and LocalProvider.embed() — smoke-test tier."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.llm.failure import ProviderInfraError
from src.llm.providers.local import LocalProvider


# ---------------------------------------------------------------------------
# LocalProvider embed
# ---------------------------------------------------------------------------

class TestLocalProviderEmbed:
    def _make_provider(self):
        return LocalProvider(
            chat_base_url="http://localhost:8000/v1",
            embed_base_url="http://localhost:8001/v1",
            chat_model="qwen3.5-35b-a3b-fp8",
            embed_model="qwen3-embed",
            api_key="",
        )

    def test_embed_returns_list_of_floats(self):
        """embed() returns the embedding vector as a list of floats."""
        provider = self._make_provider()
        mock_client = MagicMock()
        mock_embedding = MagicMock()
        mock_embedding.embedding = [0.021, 0.010, -0.020]
        mock_client.embeddings.create.return_value = MagicMock(data=[mock_embedding])
        with patch.object(provider, "_get_embed_client", return_value=mock_client):
            result = provider.embed(task="embed_default", text="hello world", model="qwen3-embed")
        assert result == [0.021, 0.010, -0.020]
        mock_client.embeddings.create.assert_called_once_with(
            model="qwen3-embed", input="hello world"
        )

    def test_embed_connection_error_raises_infra_error(self):
        """APIConnectionError in embed() surfaces as ProviderInfraError."""
        import openai as openai_mod
        provider = self._make_provider()
        mock_client = MagicMock()
        mock_client.embeddings.create.side_effect = openai_mod.APIConnectionError(
            request=MagicMock()
        )
        with patch.object(provider, "_get_embed_client", return_value=mock_client):
            with pytest.raises(ProviderInfraError, match="connection_error"):
                provider.embed(task="embed_default", text="hello", model="qwen3-embed")


# ---------------------------------------------------------------------------
# Router embed delegation
# ---------------------------------------------------------------------------

class TestRouterEmbed:
    def test_router_embed_delegates_to_local_provider(self):
        """router.embed() calls LocalProvider.embed() and returns the vector."""
        from src.llm.router import LLMRouter
        router = LLMRouter()
        with patch.object(router._local, "embed", return_value=[0.1, 0.2, 0.3]) as mock_embed:
            result = router.embed(task="embed_default", text="test text")
        assert result == [0.1, 0.2, 0.3]
        mock_embed.assert_called_once()
