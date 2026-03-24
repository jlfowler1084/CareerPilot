"""Job search via Indeed and Dice MCP servers through the Anthropic API."""

from __future__ import annotations

import json
import logging
import re
from typing import Dict, List, Optional

import anthropic

from config import settings
from config.search_profiles import SEARCH_PROFILES

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
    '  job_type (string or ""), source ("indeed" or "dice"), easy_apply (boolean)\n\n'
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


class JobSearcher:
    """Search Indeed and Dice via MCP servers through the Anthropic API."""

    def __init__(self, anthropic_api_key: str = None):
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def search_indeed(self, keyword: str, location: str) -> List[Dict]:
        """Search Indeed via MCP server.

        Args:
            keyword: Job title or search keywords.
            location: City/state or "remote".

        Returns:
            List of job result dicts, or empty list on failure.
        """
        loc_display = location if location else "remote"
        user_msg = f'Search for "{keyword}" jobs in {loc_display}. Return up to 15 results.'

        try:
            client = self._get_client()
            response = client.beta.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=SEARCH_SYSTEM_PROMPT,
                mcp_servers=[{
                    "type": "url",
                    "url": INDEED_MCP_URL,
                    "name": "indeed",
                }],
                betas=["mcp-client-2025-04-04"],
                messages=[{"role": "user", "content": user_msg}],
            )

            # Extract text from response content blocks
            text = self._extract_text(response)
            results = _parse_json_response(text)
            if results is None:
                return []

            # Normalize source field
            for r in results:
                r.setdefault("source", "indeed")
                r.setdefault("easy_apply", False)

            logger.info("Indeed search '%s' in %s: %d results", keyword, loc_display, len(results))
            return results

        except Exception:
            logger.error("Indeed MCP search failed for '%s'", keyword, exc_info=True)
            return []

    def search_dice(
        self, keyword: str, location: str, contract_only: bool = False,
    ) -> List[Dict]:
        """Search Dice via MCP server.

        Args:
            keyword: Job title or search keywords.
            location: City/state or "remote".
            contract_only: If True, filter for contract positions only.

        Returns:
            List of job result dicts, or empty list on failure.
        """
        loc_display = location if location else "remote"
        contract_note = " Filter for contract positions only." if contract_only else ""
        user_msg = (
            f'Search for "{keyword}" jobs in {loc_display}.{contract_note} '
            f"Return up to 15 results."
        )

        try:
            client = self._get_client()
            response = client.beta.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=SEARCH_SYSTEM_PROMPT,
                mcp_servers=[{
                    "type": "url",
                    "url": DICE_MCP_URL,
                    "name": "dice",
                }],
                betas=["mcp-client-2025-04-04"],
                messages=[{"role": "user", "content": user_msg}],
            )

            text = self._extract_text(response)
            results = _parse_json_response(text)
            if results is None:
                return []

            for r in results:
                r.setdefault("source", "dice")
                r.setdefault("easy_apply", False)

            logger.info("Dice search '%s' in %s: %d results", keyword, loc_display, len(results))
            return results

        except Exception:
            logger.error("Dice MCP search failed for '%s'", keyword, exc_info=True)
            return []

    def run_profiles(self, profile_ids: List[str] = None) -> List[Dict]:
        """Run selected search profiles and return combined, deduplicated results.

        Args:
            profile_ids: List of profile IDs to run. None = run all.

        Returns:
            List of job result dicts with profile_id and profile_label attached.
        """
        if profile_ids is None:
            profile_ids = list(SEARCH_PROFILES.keys())

        all_results = []

        for pid in profile_ids:
            profile = SEARCH_PROFILES.get(pid)
            if not profile:
                logger.warning("Unknown profile: %s", pid)
                continue

            keyword = profile["keyword"]
            location = profile["location"]
            sources = profile.get("sources", "both")
            contract_only = profile.get("contract_only", False)
            label = profile.get("label", pid)

            logger.info("Running profile '%s': %s in %s (%s)", pid, keyword, location or "remote", sources)

            profile_results = []

            if sources in ("both", "indeed"):
                indeed_results = self.search_indeed(keyword, location)
                profile_results.extend(indeed_results)

            if sources in ("both", "dice"):
                dice_results = self.search_dice(keyword, location, contract_only=contract_only)
                profile_results.extend(dice_results)

            # Attach profile metadata
            for r in profile_results:
                r["profile_id"] = pid
                r["profile_label"] = label

            logger.info("Profile '%s': %d results", pid, len(profile_results))
            all_results.extend(profile_results)

        # Filter irrelevant results
        before_filter = len(all_results)
        all_results = [r for r in all_results if not _is_irrelevant(r.get("title", ""))]
        filtered = before_filter - len(all_results)
        if filtered:
            logger.info("Filtered %d irrelevant results", filtered)

        # Deduplicate by title + company (case-insensitive)
        all_results = self._deduplicate(all_results)

        return all_results

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

    @staticmethod
    def _extract_text(response) -> str:
        """Extract text content from a beta messages response."""
        parts = []
        for block in response.content:
            if hasattr(block, "text"):
                parts.append(block.text)
        return "\n".join(parts)
