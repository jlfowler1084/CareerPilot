"""Job application tracking with Supabase persistence — CAR-165 (M2).

Ported from SQLite to Supabase per the CAR-163 consolidation audit
(`docs/brainstorms/CAR-163-application-entry-paths-consolidation-audit.md`).
The class interface is stable — callers at 25+ sites in `cli.py` don't need
to change. What did change:

* Row IDs are now Supabase UUIDs (str), not SQLite autoincrement ints.
  Callers that store the return of `save_job()` in a variable and pass it
  forward work as-is. Callers that did `id + 1` or similar integer math
  would need updating — there are none today.
* Every INSERT sets `user_id` from `settings.CAREERPILOT_USER_ID`. Without
  that env var, `ApplicationTracker()` raises on construction — the
  service-role key bypasses RLS, so orphaned rows (no user_id) would be
  invisible to the dashboard and impossible to recover through the UI.
* CLI field `description` is written to Supabase column `job_description`
  to match the dashboard's naming (dashboard already uses `job_description`
  for URL-extract flow). Callers keep passing `description` in job_data;
  the mapping happens inside `save_job`.
* Supabase returns ISO 8601 timestamps with timezone (`+00:00`). The old
  SQLite code wrote naive `datetime.now().isoformat()`. The new code still
  passes naive ISO strings to Supabase (Supabase interprets them as UTC);
  reads may return either naive or aware strings depending on column
  defaults. `_parse_iso` normalizes both shapes to naive datetimes for
  comparison.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from config import settings

logger = logging.getLogger(__name__)

VALID_STATUSES = {
    "found", "interested", "applied", "phone_screen",
    "interview", "offer", "rejected", "withdrawn", "ghosted",
}

# Statuses that count as "responded" for response rate calculation
RESPONSE_STATUSES = {"phone_screen", "interview", "offer", "rejected"}

# Statuses excluded from the "stale applications" check
_STALE_EXCLUDED_STATUSES = ["withdrawn", "rejected", "ghosted"]


class ApplicationTrackerNotConfiguredError(RuntimeError):
    """Raised when CAREERPILOT_USER_ID is not set at construction time."""


class ApplicationTracker:
    """Manages job applications with Supabase persistence.

    Parameters
    ----------
    client : supabase.Client, optional
        Inject a client for testing. Defaults to the cached client from
        `src.db.supabase_client.get_supabase_client()`.
    user_id : str, optional
        UUID of the Supabase user that owns CLI-created rows. Defaults to
        `settings.CAREERPILOT_USER_ID`. Required — raises
        `ApplicationTrackerNotConfiguredError` if neither is set.
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
            raise ApplicationTrackerNotConfiguredError(
                "CAREERPILOT_USER_ID env var is not set. Paste your Supabase "
                "user UUID into .env — rows need an owner because the "
                "service-role key bypasses RLS. Find it at: Supabase "
                "dashboard → Authentication → Users."
            )
        self._user_id = resolved_user_id

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    def save_job(self, job_data: Dict, status: str = "found") -> str:
        """Save a job from search results to the tracker.

        Args:
            job_data: Dict with title, company, location, url, source,
                      salary/salary_range, profile_id, message_id, description,
                      notes (all optional except title/company).
            status: Initial status (default 'found'). Must be in VALID_STATUSES.

        Returns:
            The Supabase UUID (str) of the inserted application.

        Raises:
            ValueError: If status is not in VALID_STATUSES.
        """
        if status not in VALID_STATUSES:
            raise ValueError(
                f"Invalid status '{status}'. Must be one of: {sorted(VALID_STATUSES)}"
            )

        payload: Dict[str, Any] = {
            "user_id": self._user_id,
            "title": job_data.get("title", ""),
            "company": job_data.get("company", ""),
            "location": job_data.get("location", ""),
            "url": job_data.get("url", ""),
            "source": job_data.get("source", ""),
            "salary_range": job_data.get("salary", job_data.get("salary_range", "")),
            "status": status,
            "notes": job_data.get("notes", ""),
            "profile_id": job_data.get("profile_id", ""),
            # CLI writes `description`; Supabase column is `job_description`
            "job_description": job_data.get("description"),
            "message_id": job_data.get("message_id", ""),
        }
        # Only set date_found if caller provided one; otherwise let the
        # Supabase column default (`now()`) populate it.
        if job_data.get("date_found"):
            payload["date_found"] = job_data["date_found"]

        response = self._client.table("applications").insert(payload).execute()
        if not response.data:
            raise RuntimeError(f"Supabase insert returned no data: {response}")
        row = response.data[0]
        logger.info(
            "Saved job: %s at %s (id=%s, status=%s)",
            row.get("title"), row.get("company"), row.get("id"), status,
        )
        return row["id"]

    def update_status(
        self, job_id: str, new_status: str, notes: Optional[str] = None
    ) -> bool:
        """Update a job's status, with automatic date-transition tracking.

        Args:
            job_id: Application UUID (str).
            new_status: New status string (must be in VALID_STATUSES).
            notes: Optional notes to append.

        Returns:
            True if updated, False if job not found or invalid status.
        """
        if new_status not in VALID_STATUSES:
            logger.error(
                "Invalid status '%s'. Must be one of: %s", new_status, VALID_STATUSES
            )
            return False

        current = self.get_job(job_id)
        if not current:
            logger.warning("Application id=%s not found", job_id)
            return False

        now_iso = datetime.now().isoformat()
        updates: Dict[str, Any] = {"status": new_status}

        if new_status == "applied" and not current.get("date_applied"):
            updates["date_applied"] = now_iso
        if new_status in RESPONSE_STATUSES and not current.get("date_response"):
            updates["date_response"] = now_iso

        if notes:
            existing_notes = current.get("notes") or ""
            separator = "\n" if existing_notes else ""
            updates["notes"] = f"{existing_notes}{separator}[{now_iso[:10]}] {notes}"

        response = (
            self._client.table("applications")
            .update(updates)
            .eq("id", job_id)
            .eq("user_id", self._user_id)
            .execute()
        )
        if not response.data:
            logger.warning("Update returned no rows for id=%s", job_id)
            return False

        logger.info("Updated application id=%s to status '%s'", job_id, new_status)
        return True

    def update_external_status(
        self, job_id: str, status: str, portal_id: Optional[str] = None
    ) -> bool:
        """Update the external ATS status on an application."""
        current = self.get_job(job_id)
        if not current:
            logger.warning("Application id=%s not found", job_id)
            return False

        now_iso = datetime.now().isoformat()
        updates: Dict[str, Any] = {
            "external_status": status,
            "external_status_updated": now_iso,
        }
        if portal_id is not None:
            updates["portal_id"] = str(portal_id)

        response = (
            self._client.table("applications")
            .update(updates)
            .eq("id", job_id)
            .eq("user_id", self._user_id)
            .execute()
        )
        if not response.data:
            return False
        logger.info("Updated external status for id=%s: '%s'", job_id, status)
        return True

    def withdraw_application(self, job_id: str) -> bool:
        """Withdraw an application — sets status='withdrawn' and withdraw_date."""
        current = self.get_job(job_id)
        if not current:
            logger.warning("Application id=%s not found", job_id)
            return False

        now_iso = datetime.now().isoformat()
        response = (
            self._client.table("applications")
            .update({"status": "withdrawn", "withdraw_date": now_iso})
            .eq("id", job_id)
            .eq("user_id", self._user_id)
            .execute()
        )
        if not response.data:
            return False
        logger.info("Withdrew application id=%s", job_id)
        return True

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def get_job(self, job_id: str) -> Optional[Dict]:
        """Get a single application by UUID."""
        if not job_id:
            return None
        response = (
            self._client.table("applications")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    def find_application_by_message_id(self, message_id: str) -> Optional[Dict]:
        """Find an application by its source Gmail message_id. Returns dict or None."""
        if not message_id:
            return None
        response = (
            self._client.table("applications")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("message_id", message_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    def find_by_url(self, url: str) -> Optional[Dict]:
        """Find an application by URL. Returns the first match or None.

        Used for duplicate detection in manual-entry flows. Empty or
        whitespace-only URLs return None without querying.
        """
        if not url or not str(url).strip():
            return None
        response = (
            self._client.table("applications")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("url", str(url).strip())
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    def get_all_jobs(self) -> List[Dict]:
        """Get all applications for this user, newest first."""
        response = (
            self._client.table("applications")
            .select("*")
            .eq("user_id", self._user_id)
            .order("date_found", desc=True)
            .execute()
        )
        return response.data or []

    def get_pipeline(self) -> Dict[str, List[Dict]]:
        """Get jobs grouped by status for kanban display.

        Returns:
            Dict mapping status -> list of job dicts.
        """
        jobs = self.get_all_jobs()
        pipeline: Dict[str, List[Dict]] = {status: [] for status in VALID_STATUSES}
        for job in jobs:
            status = job.get("status", "found")
            pipeline.setdefault(status, []).append(job)
        return pipeline

    def get_stats(self) -> Dict:
        """Calculate application statistics.

        Returns:
            Dict with total, by_status counts, response_rate, avg_days_to_response.
        """
        jobs = self.get_all_jobs()
        total = len(jobs)

        by_status = {status: 0 for status in VALID_STATUSES}
        for job in jobs:
            s = job.get("status", "found")
            by_status[s] = by_status.get(s, 0) + 1

        applied_count = sum(1 for j in jobs if j.get("date_applied"))
        responded_count = sum(
            1 for j in jobs if j.get("date_applied") and j.get("date_response")
        )
        response_rate = (
            (responded_count / applied_count * 100) if applied_count > 0 else 0.0
        )

        days_list = []
        for j in jobs:
            if j.get("date_applied") and j.get("date_response"):
                applied_dt = _parse_iso(j["date_applied"])
                response_dt = _parse_iso(j["date_response"])
                if applied_dt and response_dt:
                    days_list.append((response_dt - applied_dt).days)
        avg_days_to_response = (
            sum(days_list) / len(days_list) if days_list else 0.0
        )

        return {
            "total": total,
            "by_status": by_status,
            "applied_count": applied_count,
            "responded_count": responded_count,
            "response_rate": response_rate,
            "avg_days_to_response": avg_days_to_response,
        }

    def get_stale_applications(self, days: int = 14) -> List[Dict]:
        """Get applications with no external status update in `days`.

        Excludes withdrawn, rejected, and ghosted applications.

        Postgrest doesn't cleanly express "IS NULL OR < cutoff" as a single
        filter expression, so we fetch non-terminal rows and filter in
        Python. At single-user scale this is fine.
        """
        cutoff = datetime.now() - timedelta(days=days)
        response = (
            self._client.table("applications")
            .select("*")
            .eq("user_id", self._user_id)
            .not_.in_("status", _STALE_EXCLUDED_STATUSES)
            .order("date_found", desc=True)
            .execute()
        )
        stale = []
        for row in (response.data or []):
            ext_updated = row.get("external_status_updated")
            if not ext_updated:
                stale.append(row)
                continue
            ext_dt = _parse_iso(ext_updated)
            if ext_dt is None or ext_dt < cutoff:
                stale.append(row)
        return stale

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self):
        """No-op for Supabase (the client is a process-wide singleton).

        Kept for call-site compatibility with the former SQLite tracker,
        which needed to close its connection.
        """
        return None


def _parse_iso(value: Any) -> Optional[datetime]:
    """Parse an ISO 8601 string (with or without timezone) to a naive datetime.

    Supabase returns timestamps like `2026-04-21T10:30:00.123456+00:00`.
    SQLite-era rows wrote naive `datetime.now().isoformat()`. Both must
    round-trip into comparable naive datetimes.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    try:
        s = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    except (ValueError, TypeError):
        return None
