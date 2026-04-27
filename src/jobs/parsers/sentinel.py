"""Parser sentinel — rolling-median degradation detector.

Detects silent failures (e.g. Dice MCP returning far fewer results than
normal) by comparing the current run's result count against the median of
recent historical daily counts.

This module is pure math — it never makes Supabase calls directly.  All
history fetching is delegated to the ``manager`` argument.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from statistics import median
from typing import Any, List

logger = logging.getLogger(__name__)


def is_degraded(
    profile_id: str,
    current_count: int,
    manager: Any,
    lookback_days: int = 7,
    threshold_ratio: float = 0.5,
    min_history: int = 4,
) -> bool:
    """Return True iff the current run looks like a silent failure.

    Uses a rolling median of per-active-day row counts over the last
    ``lookback_days`` days to establish a baseline, then checks whether
    ``current_count`` is suspiciously low.

    Algorithm
    ---------
    1. Fetch historical rows via ``manager.list_recent_for_profile(profile_id,
       lookback_days)`` — returns dicts with at least a ``discovered_at`` field.
    2. Group rows by ``date(discovered_at)`` and sum rows per calendar day.
    3. Discard days with zero rows (days the schedule didn't run are noise,
       not signal — they would drag the median down and cause false positives).
    4. If the number of active days < ``min_history``: return ``False``
       (insufficient data — don't gate a brand-new profile).
    5. Compute the median of active-day counts.
    6. Return ``current_count < threshold_ratio * median``.

    Boundary policy (strict less-than)
    ------------------------------------
    ``current_count == ceil(threshold_ratio * median)`` is **NOT** degraded.
    Example: median=10, threshold_ratio=0.5 → gate=5.0.
    current=5  → 5 < 5.0 is False → **not degraded**.
    current=4  → 4 < 5.0 is True  → **degraded**.

    Parameters
    ----------
    profile_id:
        Identifier for the search profile being checked.
    current_count:
        Number of results returned by the current run.
    manager:
        Object with a ``list_recent_for_profile(profile_id, lookback_days)``
        method that returns a list of dicts each containing ``discovered_at``
        (ISO-8601 string or datetime).
    lookback_days:
        Number of calendar days of history to consider.
    threshold_ratio:
        Fraction of the median below which a run is considered degraded.
    min_history:
        Minimum number of *active* days required before the sentinel will gate.
        Guards against false-positives on new profiles.

    Returns
    -------
    bool
        ``True`` if the current run is likely degraded; ``False`` otherwise
        (including when there is insufficient history).
    """
    try:
        rows = manager.list_recent_for_profile(profile_id, lookback_days)
    except Exception:
        logger.warning("sentinel: failed to fetch history for profile %s", profile_id, exc_info=True)
        return False

    if not rows:
        logger.debug("sentinel: no history for profile %s — skipping gate", profile_id)
        return False

    # Group by calendar date (handle both ISO strings and datetime objects)
    day_counts: defaultdict = defaultdict(int)
    for row in rows:
        discovered_at = row.get("discovered_at")
        if discovered_at is None:
            continue
        try:
            # Convert to a date string for grouping — handle both str and datetime
            if hasattr(discovered_at, "date"):
                # datetime object
                date_key = discovered_at.date().isoformat()
            else:
                # ISO-8601 string: take the date portion before 'T' or space
                date_key = str(discovered_at).split("T")[0].split(" ")[0]
        except Exception:
            logger.debug("sentinel: could not parse discovered_at=%r, skipping row", discovered_at)
            continue
        day_counts[date_key] += 1

    # Only count active days (days with at least one row)
    active_counts: List[int] = [c for c in day_counts.values() if c > 0]

    if len(active_counts) < min_history:
        logger.debug(
            "sentinel: profile %s has %d active days (need %d) — insufficient history",
            profile_id, len(active_counts), min_history,
        )
        return False

    med = median(active_counts)
    gate = threshold_ratio * med
    degraded = current_count < gate

    logger.debug(
        "sentinel: profile=%s current=%d median=%.1f gate=%.2f degraded=%s",
        profile_id, current_count, med, gate, degraded,
    )
    return degraded
