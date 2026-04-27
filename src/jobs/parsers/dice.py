"""Dice MCP response parser.

Converts the raw dict returned by ``_search_dice_direct()`` into a list of
normalised job dicts that match the ``job_search_results`` table schema.

This module is pure — no Supabase calls, no API calls, no class state.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional

from src.jobs.searcher import IRRELEVANT_KEYWORDS

logger = logging.getLogger(__name__)

# Pre-compile the Dice job-detail URL pattern once.
# Typical shape: https://www.dice.com/job-detail/<id-or-slug>
# The ID is everything after the final path segment.
_DICE_ID_RE = re.compile(r"/job-detail/([^/?#]+)", re.IGNORECASE)


def _extract_source_id(url: str) -> str:
    """Derive a stable, unique key from a Dice job URL.

    Primary: parse the slug after ``/job-detail/`` in the URL.
    Fallback: SHA-256 hex digest of the full URL (first 16 chars) so dedup
              at the manager level still works when the URL is atypical.

    Examples
    --------
    >>> _extract_source_id("https://www.dice.com/job-detail/abc-123")
    'abc-123'
    >>> _extract_source_id("https://www.dice.com/some-other-path")  # fallback
    'sha256:<hex16>'
    """
    if url:
        match = _DICE_ID_RE.search(url)
        if match:
            return match.group(1)
    # Fallback: deterministic hash of whatever URL we have (including empty string)
    digest = hashlib.sha256(url.encode("utf-8", errors="replace")).hexdigest()[:16]
    return f"sha256:{digest}"


def _is_irrelevant(title: str) -> bool:
    """Return True if the job title contains an irrelevant industry keyword."""
    title_lower = title.lower()
    return any(kw in title_lower for kw in IRRELEVANT_KEYWORDS)


def _parse_jobs_data(mcp_result: dict) -> List[Dict]:
    """Extract the raw jobs list from either MCP response shape.

    Dice MCP returns one of two shapes:

    Shape A — ``structuredContent.data`` (preferred):
        ``{"structuredContent": {"data": [...jobs]}, ...}``

    Shape B — ``content[].text`` (fallback):
        ``{"content": [{"type": "text", "text": "<JSON array or object>"}]}``

    Returns the raw jobs list, or ``[]`` if neither shape matches.
    """
    # Shape A
    structured = mcp_result.get("structuredContent")
    if structured and isinstance(structured, dict):
        data = structured.get("data")
        if isinstance(data, list):
            return data

    # Shape B
    content_blocks = mcp_result.get("content")
    if content_blocks and isinstance(content_blocks, list):
        for block in content_blocks:
            if not (isinstance(block, dict) and block.get("type") == "text"):
                continue
            text = block.get("text", "")
            try:
                parsed = json.loads(text)
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict):
                # Some responses wrap the list: {"data": [...]}
                for key in ("data", "results", "jobs"):
                    val = parsed.get(key)
                    if isinstance(val, list):
                        return val

    return []


def parse_dice_listings(mcp_result: Any) -> List[Dict[str, Any]]:
    """Parse a raw Dice MCP result into normalised job dicts.

    Accepts either the ``structuredContent.data`` or the ``content[].text``
    MCP response shape (see ``_parse_jobs_data``).

    ``source_id`` derivation:
        1. Parse the slug after ``/job-detail/`` in ``detailsPageUrl``.
        2. Fallback: SHA-256 hex digest (first 16 chars) of the URL, prefixed
           ``sha256:``.  This ensures dedup at the manager level still works
           for atypical URLs.  The fallback is documented on ``_extract_source_id``.

    Behaviour guarantees:
        - Never raises on malformed input.  Returns ``[]`` on any parse error.
        - Filters listings whose title matches ``IRRELEVANT_KEYWORDS`` (same
          list used by ``JobSearcher._is_irrelevant``).
        - Missing optional fields default to ``""`` / ``False`` as appropriate.

    Parameters
    ----------
    mcp_result:
        The dict returned by ``_search_dice_direct()``.

    Returns
    -------
    List[Dict[str, Any]]
        Normalised job dicts ready for upsert into ``job_search_results``.
    """
    if not isinstance(mcp_result, dict):
        logger.debug("parse_dice_listings: non-dict input (%s), returning []", type(mcp_result))
        return []

    try:
        raw_jobs = _parse_jobs_data(mcp_result)
    except Exception:
        logger.warning("parse_dice_listings: failed to extract jobs data", exc_info=True)
        return []

    results: List[Dict[str, Any]] = []

    for job in raw_jobs:
        if not isinstance(job, dict):
            logger.debug("parse_dice_listings: skipping non-dict job entry: %r", job)
            continue

        try:
            title = job.get("title", "")
            if _is_irrelevant(title):
                continue

            # Location resolution: prefer jobLocation.displayName, then isRemote, then ""
            location = ""
            job_location = job.get("jobLocation")
            if isinstance(job_location, dict):
                location = job_location.get("displayName", "") or ""
            elif job.get("isRemote"):
                location = "Remote"

            url = job.get("detailsPageUrl", "")

            results.append({
                "source": "dice",
                "source_id": _extract_source_id(url),
                "url": url,
                "title": title,
                "company": job.get("companyName") or "Unknown",
                "location": location,
                "salary": job.get("salary") or "",
                "job_type": job.get("employmentType") or "",
                "posted_date": job.get("postedDate") or "",
                "easy_apply": bool(job.get("easyApply", False)),
                "summary": job.get("summary") or "",
            })
        except Exception:
            logger.warning(
                "parse_dice_listings: error normalising job entry, skipping", exc_info=True,
            )
            continue

    return results
