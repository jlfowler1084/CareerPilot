"""Job search via Indeed and Dice MCP servers.

Dice: called directly via Streamable HTTP (no Claude API cost).
Indeed: requires Claude connector auth, currently disabled.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Dict, List, Optional

from config import settings
from src.jobs.mcp_client import McpToolError, call_mcp_tool_sync
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
    """Call Dice MCP via the official MCP Python SDK — no Claude API cost.

    Replaces the hand-rolled SSE transport (CAR-192). The SDK handles
    Streamable HTTP session negotiation, SSE parsing, and protocol framing.
    McpToolError is re-raised so the caller's try/except can handle it
    uniformly alongside httpx transport errors.

    Args:
        keyword: Job title or search keywords.
        location: City/state or "remote".
        contract_only: If True, filter for contract positions only.
        jobs_per_page: Number of results to return.

    Returns:
        Raw result dict from the MCP SDK (structuredContent or content list),
        or empty dict on failure.
    """
    tool_args: dict = {"keyword": keyword, "location": location, "jobs_per_page": jobs_per_page}
    if contract_only:
        tool_args["employment_types"] = ["CONTRACTS"]

    return call_mcp_tool_sync(DICE_MCP_URL, "search_jobs", tool_args)


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

            # Extract job data from SDK result.
            # call_mcp_tool_sync returns structuredContent directly (e.g. {"data": [...]})
            # or {"content": [{"type": "text", "text": "..."}]} for text-only responses.
            jobs_data = []
            if "data" in raw:
                jobs_data = raw.get("data", []) or []
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

