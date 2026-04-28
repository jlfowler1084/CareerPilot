"""Tests for src/jobs/mcp_client.py — CAR-192."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from mcp.types import CallToolResult, TextContent

from src.jobs.mcp_client import McpToolError, call_mcp_tool, call_mcp_tool_sync


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_session_mock(call_tool_result: CallToolResult) -> MagicMock:
    """Return a mock ClientSession that yields the given result from call_tool."""
    session = MagicMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.initialize = AsyncMock(return_value=None)
    session.call_tool = AsyncMock(return_value=call_tool_result)
    return session


def _make_transport_patch(session_mock: MagicMock):
    """
    Patch `mcp.client.streamable_http.streamable_http_client` with an async
    context manager that yields (read, write, get_session_id) and patches
    ClientSession to use our session_mock.
    """
    read_mock = MagicMock()
    write_mock = MagicMock()
    get_session_id_mock = MagicMock(return_value=None)

    @asynccontextmanager
    async def _fake_transport(url, *, http_client=None, **kwargs):
        yield (read_mock, write_mock, get_session_id_mock)

    return _fake_transport


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------


class TestCallMcpToolAsync:

    @pytest.mark.asyncio
    async def test_happy_path_returns_structured_content(self):
        """structuredContent is non-empty → returned directly."""
        result = CallToolResult(
            content=[],
            structuredContent={"data": [{"title": "SysAdmin", "company": "Acme"}]},
            isError=False,
        )
        session_mock = _make_session_mock(result)
        transport = _make_transport_patch(session_mock)

        with patch("src.jobs.mcp_client.streamable_http_client", transport):
            with patch("src.jobs.mcp_client.ClientSession", return_value=session_mock):
                out = await call_mcp_tool(
                    "https://mcp.dice.com/mcp",
                    "search_jobs",
                    {"keyword": "sysadmin", "location": "Indianapolis"},
                )

        assert out == {"data": [{"title": "SysAdmin", "company": "Acme"}]}

    @pytest.mark.asyncio
    async def test_tool_error_raises_mcp_tool_error(self):
        """isError=True with TextContent → McpToolError raised with message text."""
        result = CallToolResult(
            content=[TextContent(type="text", text="rate limited")],
            structuredContent=None,
            isError=True,
        )
        session_mock = _make_session_mock(result)
        transport = _make_transport_patch(session_mock)

        with patch("src.jobs.mcp_client.streamable_http_client", transport):
            with patch("src.jobs.mcp_client.ClientSession", return_value=session_mock):
                with pytest.raises(McpToolError, match="rate limited"):
                    await call_mcp_tool(
                        "https://mcp.dice.com/mcp",
                        "search_jobs",
                        {"keyword": "sysadmin", "location": "Indianapolis"},
                    )

    @pytest.mark.asyncio
    async def test_transport_error_propagates(self):
        """httpx.ConnectError from streamable_http_client propagates unchanged."""

        @asynccontextmanager
        async def _failing_transport(url, *, http_client=None, **kwargs):
            raise httpx.ConnectError("connection refused")
            yield  # pragma: no cover

        with patch("src.jobs.mcp_client.streamable_http_client", _failing_transport):
            with pytest.raises(httpx.ConnectError, match="connection refused"):
                await call_mcp_tool(
                    "https://mcp.dice.com/mcp",
                    "search_jobs",
                    {"keyword": "sysadmin", "location": "Indianapolis"},
                )

    @pytest.mark.asyncio
    async def test_empty_structured_content_returned_as_is(self):
        """structuredContent={"data": []} (non-None but empty list) → returned directly."""
        result = CallToolResult(
            content=[],
            structuredContent={"data": []},
            isError=False,
        )
        session_mock = _make_session_mock(result)
        transport = _make_transport_patch(session_mock)

        with patch("src.jobs.mcp_client.streamable_http_client", transport):
            with patch("src.jobs.mcp_client.ClientSession", return_value=session_mock):
                out = await call_mcp_tool(
                    "https://mcp.dice.com/mcp",
                    "search_jobs",
                    {"keyword": "sysadmin", "location": "Indianapolis"},
                )

        assert out == {"data": []}


class TestCallMcpToolSync:

    def test_sync_wrapper_returns_structured_content(self):
        """call_mcp_tool_sync is a thin asyncio.run wrapper — verify round-trip."""
        result = CallToolResult(
            content=[],
            structuredContent={"data": [{"title": "DevOps", "company": "Corp"}]},
            isError=False,
        )
        session_mock = _make_session_mock(result)
        transport = _make_transport_patch(session_mock)

        with patch("src.jobs.mcp_client.streamable_http_client", transport):
            with patch("src.jobs.mcp_client.ClientSession", return_value=session_mock):
                out = call_mcp_tool_sync(
                    "https://mcp.dice.com/mcp",
                    "search_jobs",
                    {"keyword": "devops", "location": "remote"},
                )

        assert out == {"data": [{"title": "DevOps", "company": "Corp"}]}
