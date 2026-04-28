"""
MCP Streamable HTTP client helpers.

First async pattern in this codebase. `call_mcp_tool_sync` is the bridge
for synchronous callers — it wraps `asyncio.run` so callers don't need to
manage an event loop. Future async callers can use `call_mcp_tool` directly.
"""
import asyncio
import httpx
from mcp.client.streamable_http import streamable_http_client
from mcp import ClientSession


class McpToolError(Exception):
    """Raised when the MCP server returns isError=True on a tool call."""


async def call_mcp_tool(
    url: str,
    tool_name: str,
    arguments: dict,
    *,
    auth: httpx.Auth | None = None,
) -> dict:
    http_client = httpx.AsyncClient(
        auth=auth,
        follow_redirects=True,
        timeout=httpx.Timeout(30.0, read=300.0),
    )
    async with streamable_http_client(url, http_client=http_client) as (read, write, _):  # TODO: drop _ after mcp v2
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)

    if result.isError:
        msg = next(
            (c.text for c in result.content if hasattr(c, "text")),
            "unknown tool error",
        )
        raise McpToolError(msg)

    if result.structuredContent:
        return result.structuredContent
    return {"content": [c.model_dump() for c in result.content]}


def call_mcp_tool_sync(
    url: str,
    tool_name: str,
    arguments: dict,
    *,
    auth: httpx.Auth | None = None,
) -> dict:
    return asyncio.run(call_mcp_tool(url, tool_name, arguments, auth=auth))
