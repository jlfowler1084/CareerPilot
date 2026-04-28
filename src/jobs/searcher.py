"""Job search via Indeed and Dice MCP servers.

Dice: called directly via Streamable HTTP (no Claude API cost).
Indeed: requires Claude connector auth, currently disabled.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Dict, List, Optional

import requests

from config import settings
# SEARCH_PROFILES import removed in CAR-188 — profiles now live in Supabase.
# The legacy JobSearcher.run_profiles() below is deprecated; use
# src.jobs.search_engine.run_profiles() instead.

logger = logging.getLogger(__name__)

INDEED_MCP_URL = "https://mcp.indeed.com/claude/mcp"
DICE_MCP_URL = "https://mcp.dice.com/mcp"

# Keywords indicating irrelevant job postings
IRRELEVANT_KEYWORDS = [
    "pest control", "hvac", "construction", "mechanical engineer",
    "civil engineer", "plumber", "electrician", "roofing",
    "landscaping", "janitorial", "custodian",
]

SEARCH_SYSTEM_PROMPT = (
    "You are a job search assistant. Search for the requested jobs and return results "
    "as a JSON array. Each result must have these fields:\n"
    '  title, company, location, salary (string or ""), url, posted_date (string or ""), '
    '  job_type (string or ""), source ("indeed", "dice", or "linkedin"), easy_apply (boolean)\n\n'
    "Return ONLY valid JSON array, no markdown fences, no commentary. "
    "If no results found, return []."
)


def _parse_json_response(text: str) -> Optional[List]:
    """Parse a JSON array response, stripping markdown fences if present."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        return [result] if result else []
    except json.JSONDecodeError:
        logger.error("Failed to parse search JSON: %s...", text[:200])
        return None


def _is_irrelevant(title: str) -> bool:
    """Check if a job title contains irrelevant industry keywords."""
    title_lower = title.lower()
    return any(kw in title_lower for kw in IRRELEVANT_KEYWORDS)


def _search_dice_direct(keyword: str, location: str, contract_only: bool = False,
                         jobs_per_page: int = 15) -> dict:
    """Call Dice MCP directly via Streamable HTTP — no Claude API cost.

    Args:
        keyword: Job title or search keywords.
        location: City/state or "remote".
        contract_only: If True, filter for contract positions only.
        jobs_per_page: Number of results to return.

    Returns:
        Raw JSON-RPC result dict from Dice MCP, or empty dict on failure.
    """
    headers_init = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }

    # Step 1: Initialize the MCP session
    try:
        init_resp = requests.post(
            DICE_MCP_URL,
            headers=headers_init,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "careerpilot-cli", "version": "1.0.0"},
                },
            },
            timeout=15,
        )
        init_resp.raise_for_status()
    except Exception:
        logger.error("Dice MCP initialize failed", exc_info=True)
        return {}

    # Session IDs are optional per the MCP Streamable HTTP spec. As of
    # 2026-04-27, mcp.dice.com no longer assigns one — the initialize
    # response is a stateless SSE event with the result inline, and
    # subsequent tools/call requests work without a session header.
    # Set the header only when the server did assign an ID (forward-compat
    # if Dice re-enables stateful sessions later).
    session_id = init_resp.headers.get("mcp-session-id", "")
    session_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session_id:
        session_headers["mcp-session-id"] = session_id

    # Step 2: Send initialized notification
    try:
        requests.post(
            DICE_MCP_URL,
            headers=session_headers,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            timeout=5,
        )
    except Exception:
        logger.warning("Dice MCP initialized notification failed", exc_info=True)

    # Step 3: Call search_jobs tool
    tool_args = {"keyword": keyword, "location": location, "jobs_per_page": jobs_per_page}
    if contract_only:
        tool_args["employment_types"] = ["CONTRACTS"]

    try:
        result_resp = requests.post(
            DICE_MCP_URL,
            headers=session_headers,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "search_jobs",
                    "arguments": tool_args,
                },
            },
            timeout=30,
        )
        result_resp.raise_for_status()

        # Handle SSE response format
        content_type = result_resp.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            # Parse SSE events to extract the JSON-RPC result
            for line in result_resp.text.splitlines():
                if line.startswith("data: "):
                    try:
                        event_data = json.loads(line[6:])
                        if "result" in event_data:
                            return event_data["result"]
                    except json.JSONDecodeError:
                        continue
            return {}
        else:
            data = result_resp.json()
            return data.get("result", data)

    except Exception:
        logger.error("Dice MCP tools/call failed", exc_info=True)
        return {}


class JobSearcher:
    """Search Indeed and Dice via MCP servers."""

    def __init__(self, anthropic_api_key: str = None):
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY

    def search_indeed(self, keyword: str, location: str) -> List[Dict]:
        """Search Indeed via MCP server.

        Indeed MCP requires Claude.ai connector auth and is not yet supported
        via direct API calls. This method currently logs a warning and returns
        an empty list. Once Indeed auth is resolved, re-enable the MCP call below.

        Args:
            keyword: Job title or search keywords.
            location: City/state or "remote".

        Returns:
            List of job result dicts, or empty list on failure.
        """
        logger.warning(
            "Indeed search skipped — Indeed MCP requires Claude.ai connector auth "
            "(not yet supported via direct API). Query: '%s' in %s",
            keyword, location if location else "remote",
        )
        return []

    def search_dice(
        self, keyword: str, location: str, contract_only: bool = False,
    ) -> List[Dict]:
        """Search Dice directly via MCP Streamable HTTP — no Claude API cost.

        Args:
            keyword: Job title or search keywords.
            location: City/state or "remote".
            contract_only: If True, filter for contract positions only.

        Returns:
            List of job result dicts, or empty list on failure.
        """
        loc_display = location if location else "remote"

        try:
            raw = _search_dice_direct(
                keyword, location, contract_only=contract_only, jobs_per_page=15,
            )

            # Extract job data from MCP result
            # The result contains content[].text with JSON, or structuredContent
            jobs_data = []
            if "structuredContent" in raw and raw["structuredContent"]:
                jobs_data = raw["structuredContent"].get("data", []) or []
            elif "content" in raw:
                # Parse text content blocks
                for block in (raw.get("content") or []):
                    if isinstance(block, dict) and block.get("type") == "text":
                        parsed = _parse_json_response(block.get("text", ""))
                        if parsed:
                            jobs_data = parsed
                            break

            # Normalize to standard result format
            results = []
            for job in jobs_data:
                loc = ""
                if isinstance(job.get("jobLocation"), dict):
                    loc = job["jobLocation"].get("displayName", "")
                elif job.get("isRemote"):
                    loc = "Remote"

                results.append({
                    "title": job.get("title", ""),
                    "company": job.get("companyName", "Unknown"),
                    "location": loc,
                    "salary": job.get("salary", ""),
                    "url": job.get("detailsPageUrl", ""),
                    "posted_date": job.get("postedDate", ""),
                    "job_type": job.get("employmentType", ""),
                    "source": "dice",
                    "easy_apply": job.get("easyApply", False),
                })

            logger.info(
                "Dice search '%s' in %s: %d results", keyword, loc_display, len(results),
            )
            return results

        except Exception:
            logger.error("Dice MCP search failed for '%s'", keyword, exc_info=True)
            return []

    def run_profiles(self, profile_ids: List[str] = None) -> List[Dict]:
        """DEPRECATED — use ``src.jobs.search_engine.run_profiles()`` instead.

        Profiles are now stored in Supabase ``search_profiles`` table (CAR-188).
        This method retained for backwards-compatibility only; calling it will
        raise ``NotImplementedError``.

        Args:
            profile_ids: Ignored.

        Raises:
            NotImplementedError: Always.
        """
        raise NotImplementedError(
            "JobSearcher.run_profiles() is deprecated as of CAR-188.  "
            "Use src.jobs.search_engine.run_profiles() instead — profiles "
            "are now sourced from Supabase, not from config/search_profiles.py."
        )

    @staticmethod
    def _deduplicate(results: List[Dict]) -> List[Dict]:
        """Remove duplicate jobs by title + company (case-insensitive)."""
        seen = set()
        unique = []
        for r in results:
            key = (r.get("title", "").lower().strip(), r.get("company", "").lower().strip())
            if key not in seen:
                seen.add(key)
                unique.append(r)
        return unique

