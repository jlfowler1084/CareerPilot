"""Job search orchestrator — CAR-188 Unit 4c / Unit 5.

Top-level ``run_profiles`` function that:
1. Reads search profiles from Supabase (``search_profiles`` table).
2. For each profile calls the appropriate search backend (Dice only in v1).
3. Passes results through the Dice parser.
4. Checks the sentinel for degraded runs.
5. Upserts each parsed listing via ``JobSearchResultsManager``.
6. Enriches each successfully upserted listing via ``enrichment.enrich_row``.
7. Flips stale rows for healthy profiles.
8. Returns a ``RunSummary`` dataclass with per-profile and aggregate stats.

Usage
-----
    from src.jobs.search_engine import run_profiles

    summary = run_profiles()                          # all profiles
    summary = run_profiles(["sysadmin_local"])        # by name
    summary = run_profiles(dry_run=True)              # no Supabase writes
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from src.jobs import enrichment
from src.jobs.job_search_results import JobSearchResultsManager
from src.jobs.parsers.dice import parse_dice_listings
from src.jobs.parsers.sentinel import is_degraded
from src.jobs.searcher import _search_dice_direct

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ProfileResult:
    """Per-profile run result attached to a ``RunSummary``."""

    profile_id: str
    label: str
    count: int = 0        # Total listings parsed (before dedup / upsert)
    new: int = 0          # Listings that were inserted (not already in DB)
    updated: int = 0      # Listings that already existed (last_seen_at bumped)
    enriched: int = 0     # Listings whose description was populated (Unit 5)
    degraded: bool = False
    error: Optional[str] = None


@dataclass
class RunSummary:
    """Aggregate result of a ``run_profiles`` invocation."""

    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    profiles: Dict[str, ProfileResult] = field(default_factory=dict)
    total_new: int = 0
    total_updated: int = 0
    total_enriched: int = 0
    total_degraded_profiles: int = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_supabase_client() -> Any:
    """Return the cached Supabase service-role client."""
    from src.db.supabase_client import get_supabase_client
    return get_supabase_client()


def _fetch_profiles(client: Any, profile_ids: Optional[List[str]]) -> List[Dict]:
    """Read all or selected profiles from Supabase ``search_profiles`` table.

    Filters happen in Python to avoid complex URL encoding for name/UUID lookup.

    Parameters
    ----------
    client:
        Supabase client (real or fake).
    profile_ids:
        Optional list of UUIDs or profile names to restrict the run.
        ``None`` means "run all active profiles".

    Returns
    -------
    list[dict]
        Raw rows from ``search_profiles``.

    Raises
    ------
    RuntimeError
        If Supabase cannot be reached (propagates to caller — whole-run failure).
    """
    response = client.table("search_profiles").select("*").execute()
    rows: List[Dict] = response.data or []

    if not profile_ids:
        return rows

    # Filter by UUID id OR by name (case-insensitive)
    lower_ids = {pid.lower() for pid in profile_ids}
    filtered = [
        r for r in rows
        if str(r.get("id", "")).lower() in lower_ids
        or str(r.get("name", "")).lower() in lower_ids
    ]
    return filtered


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def run_profiles(
    profile_ids: Optional[List[str]] = None,
    *,
    dry_run: bool = False,
    skip_stale_flip: bool = False,
    manager: Optional[JobSearchResultsManager] = None,
    dice_search_fn: Optional[Callable] = None,
) -> RunSummary:
    """Run job search profiles and persist results to Supabase.

    Parameters
    ----------
    profile_ids:
        Optional list of profile UUIDs or names to run.  ``None`` runs all
        profiles returned by ``search_profiles`` in Supabase.
    dry_run:
        If ``True``, parse and count but do **not** write to Supabase.
        ``RunSummary`` still reflects the would-be counts.
    skip_stale_flip:
        If ``True``, skip the ``mark_stale_for_profile`` call for all
        profiles regardless of degradation status.  Useful for manual
        one-off runs that should not disturb the stale-flip cadence.
    manager:
        ``JobSearchResultsManager`` instance.  Injected in tests; defaults
        to a fresh instance bound to the real Supabase client.
    dice_search_fn:
        Callable matching ``_search_dice_direct(keyword, location, ...) -> dict``.
        Injected in tests to avoid live Dice MCP calls.

    Returns
    -------
    RunSummary
        Aggregate stats for the run.

    Raises
    ------
    RuntimeError / Exception
        Whole-run failures (e.g. Supabase unreachable when reading profiles)
        propagate to the caller so the Task Scheduler surfaces a non-zero
        exit code.  Per-profile failures are isolated and recorded in
        ``ProfileResult.error``.
    """
    summary = RunSummary()

    # Build manager if not injected.
    if manager is None:
        manager = JobSearchResultsManager()

    # Resolve Dice search function.
    _dice_fn = dice_search_fn if dice_search_fn is not None else _search_dice_direct

    # Read profiles from Supabase — whole-run failure if this raises.
    client = _get_supabase_client()
    profiles = _fetch_profiles(client, profile_ids)

    if profile_ids and not profiles:
        logger.warning(
            "run_profiles: none of the requested profile_ids matched: %s",
            profile_ids,
        )

    logger.info(
        "run_profiles: starting run — %d profile(s)%s",
        len(profiles),
        " [dry_run]" if dry_run else "",
    )

    for profile_row in profiles:
        profile_id = str(profile_row.get("id", ""))
        profile_name = profile_row.get("name", profile_id)
        keyword = profile_row.get("keyword", "")
        location = profile_row.get("location", "")
        source = profile_row.get("source", "dice")
        contract_only = bool(profile_row.get("contract_only", False))

        prof_result = ProfileResult(profile_id=profile_id, label=profile_name)
        summary.profiles[profile_id] = prof_result

        try:
            # --- Source routing ---
            if source == "indeed":
                logger.info(
                    "run_profiles: profile %r — Indeed deferred to v2 (CAR-189), skipping.",
                    profile_name,
                )
                # No Dice call; counts stay at 0.
                continue

            if source == "both":
                logger.info(
                    "run_profiles: profile %r — source='both'; Indeed deferred to v2 "
                    "(CAR-189); running Dice only.",
                    profile_name,
                )

            # --- Dice search ---
            logger.info(
                "run_profiles: searching Dice for profile %r (keyword=%r, location=%r, "
                "contract_only=%s)",
                profile_name, keyword, location, contract_only,
            )
            raw_result = _dice_fn(keyword, location, contract_only=contract_only)

            # --- Parse ---
            parsed_listings = parse_dice_listings(raw_result)
            prof_result.count = len(parsed_listings)
            logger.info(
                "run_profiles: profile %r — parsed %d listing(s) from Dice",
                profile_name, prof_result.count,
            )

            # --- Sentinel check ---
            degraded = is_degraded(profile_id, prof_result.count, manager)
            if degraded:
                logger.warning(
                    "run_profiles: profile %r is DEGRADED (count=%d below rolling median). "
                    "Skipping stale-flip for this profile.",
                    profile_name, prof_result.count,
                )
                prof_result.degraded = True
                summary.total_degraded_profiles += 1

            # --- Upsert listings (unless dry_run) ---
            if not dry_run:
                for listing in parsed_listings:
                    listing_with_profile: Dict[str, Any] = dict(listing)
                    if profile_id:
                        listing_with_profile["profile_id"] = profile_id
                    listing_with_profile["profile_label"] = profile_name

                    try:
                        _row_id, is_new = manager.upsert(listing_with_profile)
                        if is_new:
                            prof_result.new += 1
                        else:
                            prof_result.updated += 1
                    except Exception:
                        logger.warning(
                            "run_profiles: profile %r — upsert failed for source_id=%r",
                            profile_name, listing.get("source_id"), exc_info=True,
                        )
                        # Continue to next listing rather than aborting the profile.
                        continue

                    # --- Enrich (Unit 5): inject _row_id then call enrich_row ---
                    try:
                        listing_for_enrich: Dict[str, Any] = dict(listing_with_profile)
                        listing_for_enrich["_row_id"] = _row_id
                        if enrichment.enrich_row(listing_for_enrich, manager):
                            prof_result.enriched += 1
                    except Exception:
                        logger.warning(
                            "run_profiles: profile %r — enrichment failed for source_id=%r",
                            profile_name, listing.get("source_id"), exc_info=True,
                        )
                        # Enrichment errors never fail the row or the profile.
            else:
                # dry_run: treat all parsed as would-be new (conservative estimate)
                prof_result.new = prof_result.count

            # --- Stale flip (only for healthy, non-dry-run runs) ---
            if not degraded and not skip_stale_flip and not dry_run:
                staled = manager.mark_stale_for_profile(
                    profile_id, threshold_days=14
                )
                if staled:
                    logger.info(
                        "run_profiles: profile %r — marked %d row(s) stale",
                        profile_name, staled,
                    )

        except Exception as exc:
            logger.error(
                "run_profiles: profile %r failed with unexpected error: %s",
                profile_name, exc, exc_info=True,
            )
            prof_result.error = str(exc)
            continue

    # --- Aggregate totals ---
    for pr in summary.profiles.values():
        summary.total_new += pr.new
        summary.total_updated += pr.updated
        summary.total_enriched += pr.enriched

    summary.completed_at = datetime.utcnow()

    logger.info(
        "run_profiles: completed — %d profile(s), %d new, %d updated, %d enriched, %d degraded",
        len(summary.profiles),
        summary.total_new,
        summary.total_updated,
        summary.total_enriched,
        summary.total_degraded_profiles,
    )
    return summary
