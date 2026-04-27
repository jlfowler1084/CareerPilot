"""Eager enrichment for job search listings — CAR-188 Unit 5.

v1 Simplification
-----------------
The original Unit 5 design called for Firecrawl + local Qwen R9-task extraction of
``description``/``requirements``/``nice_to_haves`` from each Dice/Indeed detail page.

After the Indeed validation failure (Indeed punted to v2), and given the Key Decision
that Dice uses the existing MCP ``summary`` field for ``description`` in v1, Unit 5
collapses to a simple plumbing change:

    dice listing.summary  →  job_search_results.description

No Firecrawl, no Qwen, no R9-task config in v1.

v2 Expansion Path (CAR-189)
---------------------------
When CAR-189 activates Indeed enrichment (Firecrawl scrape → Qwen R9 extraction):
1. Add a ``"indeed"`` branch in ``enrich_row`` that calls Firecrawl and then
   a new Qwen task function, populating description/requirements/nice_to_haves.
2. For Dice: optionally replace the summary shortcut with a real Firecrawl scrape
   if richer content is desired.

The ``enrich_row`` signature is intentionally stable so the caller in
``search_engine.run_profiles`` does not need to change when v2 arrives.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def enrich_row(listing: Dict[str, Any], manager: Any) -> bool:
    """Enrich a job listing row with description and related fields.

    v1 behaviour:
    - Dice listings: copies ``listing['summary']`` → ``description`` via
      ``manager.update_enrichment``.  Returns ``True`` on success.
    - Indeed listings: logs deferred message, returns ``False``.
    - Any other source: logs a warning, returns ``False``.

    The caller is responsible for injecting the Supabase row UUID as
    ``listing['_row_id']`` before calling this function.  If ``_row_id``
    is absent a warning is logged and ``False`` is returned — no enrichment
    is attempted.

    Parameters
    ----------
    listing:
        Dict representing a parsed job listing.  Must contain ``'source'``
        and ``'_row_id'`` (injected by the search-engine loop after upsert).
        For Dice listings, ``'summary'`` is the field mapped to
        ``description``.
    manager:
        A ``JobSearchResultsManager`` (or compatible) instance that exposes
        ``update_enrichment(row_id, description, requirements, nice_to_haves)``.

    Returns
    -------
    bool
        ``True`` if enrichment was written to the database, ``False``
        otherwise (skipped, deferred, or error).
    """
    source = listing.get("source", "")
    row_id = listing.get("_row_id")

    # Guard: _row_id must be present.
    if not row_id:
        logger.warning(
            "enrich_row: '_row_id' missing from listing (source=%r, source_id=%r) — "
            "skipping enrichment.",
            source,
            listing.get("source_id"),
        )
        return False

    if source == "indeed":
        logger.info(
            "enrich_row: Indeed enrichment deferred to v2 (CAR-189) for source_id=%r.",
            listing.get("source_id"),
        )
        return False

    if source == "dice":
        summary = listing.get("summary", "") or ""
        if not summary:
            logger.debug(
                "enrich_row: Dice listing source_id=%r has empty summary — skipping.",
                listing.get("source_id"),
            )
            return False

        try:
            manager.update_enrichment(
                row_id=row_id,
                description=summary,
                requirements=None,
                nice_to_haves=None,
            )
        except Exception:
            logger.warning(
                "enrich_row: update_enrichment failed for row_id=%r (source_id=%r).",
                row_id,
                listing.get("source_id"),
                exc_info=True,
            )
            return False

        logger.debug(
            "enrich_row: enriched row_id=%r from Dice summary (%d chars).",
            row_id,
            len(summary),
        )
        return True

    # Unknown / unsupported source.
    logger.warning(
        "enrich_row: unknown source %r for source_id=%r — no enrichment performed.",
        source,
        listing.get("source_id"),
    )
    return False
