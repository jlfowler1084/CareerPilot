"""Job search results manager with Supabase persistence — CAR-188.

Writes CLI-discovered job listings into the `job_search_results` table, which
is read-only from the dashboard's perspective. Architecture mirrors
`src/jobs/tracker.py` (ApplicationTracker): service-role client + explicit
`user_id` stamping + RLS bypass at the CLI layer.

Usage
-----
    from src.jobs.job_search_results import JobSearchResultsManager

    mgr = JobSearchResultsManager()
    row_id, is_new = mgr.upsert({
        "source": "dice",
        "source_id": "abc123",
        "url": "https://dice.com/job/abc123",
        "title": "Senior SysAdmin",
        "company": "Acme Corp",
    })
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from config import settings

logger = logging.getLogger(__name__)

# Keys that are allowed in upsert payloads (enrichment-only and dashboard-only
# keys are excluded here to prevent accidental writes at search time).
_UPSERT_ALLOWED_KEYS = {
    "source",
    "source_id",
    "url",
    "title",
    "company",
    "location",
    "salary",
    "job_type",
    "posted_date",
    "easy_apply",
    "profile_id",
    "profile_label",
}

# Keys required in every upsert payload.
_UPSERT_REQUIRED_KEYS = {"source", "source_id", "url"}

# Statuses that represent user actions — stale-flip must never touch these.
_STALE_GUARDED_STATUSES = ["tracked", "dismissed"]


class JobSearchResultsManagerNotConfiguredError(RuntimeError):
    """Raised when CAREERPILOT_USER_ID is not set at construction time.

    The service-role key bypasses Row-Level Security, so any row written
    without an owner `user_id` would be invisible to the dashboard and
    unrecoverable through the UI. Set CAREERPILOT_USER_ID in .env — paste
    your Supabase user UUID (Authentication → Users panel).
    """


class JobSearchResultsManager:
    """Manages job search result rows in Supabase.

    Parameters
    ----------
    client : supabase.Client, optional
        Inject a client for testing. Defaults to the cached client from
        `src.db.supabase_client.get_supabase_client()`.
    user_id : str, optional
        UUID of the Supabase user that owns CLI-created rows. Defaults to
        `settings.CAREERPILOT_USER_ID`. Required — raises
        `JobSearchResultsManagerNotConfiguredError` if neither is set.
    """

    def __init__(self, client: Any = None, user_id: Optional[str] = None):
        if client is None:
            # Import lazily so tests that mock the client module don't pay
            # for the real client import.
            from src.db.supabase_client import get_supabase_client

            client = get_supabase_client()
        self._client = client

        resolved_user_id = user_id if user_id is not None else settings.CAREERPILOT_USER_ID
        if not resolved_user_id:
            raise JobSearchResultsManagerNotConfiguredError(
                "CAREERPILOT_USER_ID env var is not set. Paste your Supabase "
                "user UUID into .env — rows need an owner because the "
                "service-role key bypasses RLS. Find it at: Supabase "
                "dashboard → Authentication → Users."
            )
        self._user_id = resolved_user_id

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    def upsert(self, listing: Dict) -> "Tuple[str, bool]":
        """Insert-or-update a job listing on (user_id, source, source_id).

        Sets `user_id` to the manager's owner. Stamps `discovered_at` to
        NOW() on insert (via the column default); bumps `last_seen_at` on
        every call. Returns a tuple of ``(row_id, is_new)`` where
        ``is_new`` is ``True`` if the row was inserted (not updated).

        Parameters
        ----------
        listing : dict
            Must contain ``source``, ``source_id``, and ``url``.
            Optional keys: ``title``, ``company``, ``location``, ``salary``,
            ``job_type``, ``posted_date``, ``easy_apply``, ``profile_id``,
            ``profile_label``.
            Do NOT include ``description``, ``requirements``,
            ``nice_to_haves``, ``last_enriched_at``, ``status``, or
            ``application_id`` — those are enrichment-only or
            dashboard-side fields.

        Returns
        -------
        Tuple[str, bool]
            ``(row_id, is_new)`` — the Supabase UUID of the upserted row,
            and a flag indicating whether it was a fresh insert (``True``)
            or an update to an existing row (``False``).

        Raises
        ------
        ValueError
            If a required key is missing from ``listing``.
        RuntimeError
            If Supabase returns no data.
        """
        for key in _UPSERT_REQUIRED_KEYS:
            if not listing.get(key):
                raise ValueError(
                    f"upsert() requires '{key}' in listing dict, but it is "
                    f"missing or empty."
                )

        now_iso = datetime.utcnow().isoformat()
        payload: Dict[str, Any] = {
            "user_id": self._user_id,
            "last_seen_at": now_iso,
        }
        for key in _UPSERT_ALLOWED_KEYS:
            if key in listing:
                payload[key] = listing[key]

        response = (
            self._client.table("job_search_results")
            .upsert(payload, on_conflict="user_id,source,source_id")
            .execute()
        )
        if not response.data:
            raise RuntimeError(
                f"Supabase upsert returned no data for source={listing.get('source')!r}, "
                f"source_id={listing.get('source_id')!r}: {response}"
            )
        # Supabase upsert returns a single-item list; extract the row.
        row = response.data if isinstance(response.data, dict) else response.data[0]
        # Detect new-vs-updated:
        # - FakeSupabaseClient sets _fake_is_new sentinel for test accuracy.
        # - Real Supabase: new rows have discovered_at >= now_iso (column default
        #   is NOW() on insert, which equals or slightly exceeds the Python now_iso
        #   since the DB timestamp is set after the Python timestamp); existing rows
        #   retain their original earlier discovered_at.
        if "_fake_is_new" in row:
            is_new: bool = bool(row["_fake_is_new"])
        else:
            is_new = row.get("discovered_at", "") >= now_iso
        logger.info(
            "%s job_search_result: %s at %s (id=%s, source=%s)",
            "Inserted" if is_new else "Updated",
            row.get("title"),
            row.get("company"),
            row.get("id"),
            row.get("source"),
        )
        return row["id"], is_new

    def bump_last_seen(self, source: str, source_id: str) -> None:
        """Bump last_seen_at for an existing row without changing other fields.

        Use when a listing is re-encountered but no metadata has changed
        (saves a full upsert round-trip when the engine knows nothing changed).

        Parameters
        ----------
        source : str
            Source system identifier (e.g. ``'dice'``).
        source_id : str
            The source-system's unique listing ID.
        """
        now_iso = datetime.utcnow().isoformat()
        self._client.table("job_search_results").update(
            {"last_seen_at": now_iso}
        ).eq("user_id", self._user_id).eq("source", source).eq(
            "source_id", source_id
        ).execute()
        logger.debug(
            "Bumped last_seen_at for source=%r source_id=%r", source, source_id
        )

    def update_enrichment(
        self,
        row_id: str,
        description: Optional[str],
        requirements: Optional[List[str]],
        nice_to_haves: Optional[List[str]],
    ) -> None:
        """Write the three enrichment fields + last_enriched_at.

        Called by Unit 5 (enrichment) after a successful Firecrawl scrape +
        Qwen extraction. This is the ONLY method that writes description,
        requirements, nice_to_haves, and last_enriched_at — the upsert method
        intentionally excludes them.

        Parameters
        ----------
        row_id : str
            UUID of the row to update.
        description : str or None
            Full job description text from the detail page.
        requirements : list[str] or None
            Structured list of requirements extracted by Qwen.
        nice_to_haves : list[str] or None
            Structured list of nice-to-haves extracted by Qwen.
        """
        now_iso = datetime.utcnow().isoformat()
        updates: Dict[str, Any] = {
            "last_enriched_at": now_iso,
        }
        if description is not None:
            updates["description"] = description
        if requirements is not None:
            updates["requirements"] = requirements
        if nice_to_haves is not None:
            updates["nice_to_haves"] = nice_to_haves

        self._client.table("job_search_results").update(updates).eq(
            "id", row_id
        ).eq("user_id", self._user_id).execute()
        logger.debug("Updated enrichment for row id=%s", row_id)

    def mark_stale_for_profile(
        self, profile_id: str, threshold_days: int = 14
    ) -> int:
        """Flip rows to status='stale' for listings not seen recently.

        Only flips rows where:
        - ``profile_id`` matches
        - ``last_seen_at`` is older than ``threshold_days`` ago
        - ``status`` is NOT in (``'tracked'``, ``'dismissed'``) — rows the
          user has actioned are never auto-staled.

        Parameters
        ----------
        profile_id : str
            UUID of the search profile to stale.
        threshold_days : int
            Days since last_seen_at before a row is considered stale.
            Defaults to 14.

        Returns
        -------
        int
            Number of rows flipped to ``'stale'``.
        """
        cutoff = (datetime.utcnow() - timedelta(days=threshold_days)).isoformat()

        # Fetch candidate rows: user + profile + not-yet-terminal
        response = (
            self._client.table("job_search_results")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("profile_id", profile_id)
            .not_.in_("status", _STALE_GUARDED_STATUSES)
            .execute()
        )
        rows = response.data or []

        # Filter in Python for last_seen_at < cutoff (mirrors get_stale_applications
        # in tracker.py — avoids a complex Postgrest expression for a single-user scale)
        stale_ids = [
            r["id"]
            for r in rows
            if r.get("last_seen_at") and r["last_seen_at"] < cutoff
        ]
        if not stale_ids:
            return 0

        self._client.table("job_search_results").update(
            {"status": "stale"}
        ).eq("user_id", self._user_id).in_("id", stale_ids).execute()

        logger.info(
            "Marked %d rows stale for profile_id=%s (threshold=%d days)",
            len(stale_ids),
            profile_id,
            threshold_days,
        )
        return len(stale_ids)

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def count_new(self) -> int:
        """Count rows with status='new' for this user.

        Used by the Discord daily summary (Unit 6) and the dashboard badge
        hook (Unit 7).

        Returns
        -------
        int
            Number of rows in ``'new'`` status.
        """
        response = (
            self._client.table("job_search_results")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("status", "new")
            .execute()
        )
        return len(response.data or [])

    def list_recent_new(self, limit: int = 3) -> List[Dict]:
        """Return the N most recent rows with status='new'.

        Ordered by discovered_at DESC. Used by the Discord daily summary.

        Parameters
        ----------
        limit : int
            Maximum number of rows to return. Defaults to 3.

        Returns
        -------
        list[dict]
            Up to ``limit`` rows, most recently discovered first.
        """
        response = (
            self._client.table("job_search_results")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("status", "new")
            .order("discovered_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []

    def list_recent_for_profile(
        self, profile_id: str, lookback_days: int = 7
    ) -> List[Dict]:
        """Return rows for a profile within the lookback window.

        Used by the sentinel rolling-median calculation (Unit 3/6). Returns
        all rows for the profile discovered within the last ``lookback_days``
        days regardless of status.

        Parameters
        ----------
        profile_id : str
            UUID of the search profile.
        lookback_days : int
            How far back to look, in days. Defaults to 7.

        Returns
        -------
        list[dict]
            Rows for the profile within the window.
        """
        cutoff = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()
        response = (
            self._client.table("job_search_results")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("profile_id", profile_id)
            .order("discovered_at", desc=True)
            .execute()
        )
        rows = response.data or []
        # Filter in Python to keep the query simple (single-user scale).
        return [r for r in rows if r.get("discovered_at", "") >= cutoff]
