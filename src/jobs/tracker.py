"""Job application tracking with SQLite persistence."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

from src.db import models

logger = logging.getLogger(__name__)

VALID_STATUSES = {
    "found", "interested", "applied", "phone_screen",
    "interview", "offer", "rejected", "withdrawn", "ghosted",
}

# Statuses that count as "responded" for response rate calculation
RESPONSE_STATUSES = {"phone_screen", "interview", "offer", "rejected"}


class ApplicationTracker:
    """Manages job applications with SQLite persistence."""

    def __init__(self, db_path: Path = None):
        self._conn = models.get_connection(db_path)

    def save_job(self, job_data: Dict, status: str = "found") -> int:
        """Save a job from search results to the tracker.

        Args:
            job_data: Dict with title, company, location, url, source,
                      salary_range, profile_id, message_id (all optional except title/company).
            status: Initial status (default 'found'). Must be in VALID_STATUSES.

        Returns:
            The row id of the inserted application.

        Raises:
            ValueError: If status is not in VALID_STATUSES.
        """
        if status not in VALID_STATUSES:
            raise ValueError(
                f"Invalid status '{status}'. Must be one of: {sorted(VALID_STATUSES)}"
            )
        now = datetime.now().isoformat()
        cursor = self._conn.execute(
            "INSERT INTO applications "
            "(title, company, location, url, source, salary_range, status, date_found, "
            "notes, profile_id, description, message_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)",
            (
                job_data.get("title", ""),
                job_data.get("company", ""),
                job_data.get("location", ""),
                job_data.get("url", ""),
                job_data.get("source", ""),
                job_data.get("salary", job_data.get("salary_range", "")),
                status,
                now,
                job_data.get("profile_id", ""),
                job_data.get("description"),
                job_data.get("message_id", ""),
            ),
        )
        self._conn.commit()
        logger.info(
            "Saved job: %s at %s (id=%d, status=%s)",
            job_data.get("title"), job_data.get("company"), cursor.lastrowid, status,
        )
        return cursor.lastrowid

    def find_application_by_message_id(self, message_id: str) -> Optional[Dict]:
        """Find an application by its source Gmail message_id. Returns dict or None."""
        if not message_id:
            return None
        row = self._conn.execute(
            "SELECT * FROM applications WHERE message_id = ?", (message_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_status(self, job_id: int, new_status: str, notes: str = None) -> bool:
        """Update a job's status.

        Args:
            job_id: Application row id.
            new_status: New status string (must be in VALID_STATUSES).
            notes: Optional notes to append.

        Returns:
            True if updated, False if job not found or invalid status.
        """
        if new_status not in VALID_STATUSES:
            logger.error("Invalid status '%s'. Must be one of: %s", new_status, VALID_STATUSES)
            return False

        row = self._conn.execute("SELECT * FROM applications WHERE id = ?", (job_id,)).fetchone()
        if not row:
            logger.warning("Application id=%d not found", job_id)
            return False

        now = datetime.now().isoformat()
        updates = ["status = ?"]
        params = [new_status]

        # Track date transitions
        if new_status == "applied" and not row["date_applied"]:
            updates.append("date_applied = ?")
            params.append(now)
        if new_status in RESPONSE_STATUSES and not row["date_response"]:
            updates.append("date_response = ?")
            params.append(now)

        if notes:
            existing_notes = row["notes"] or ""
            separator = "\n" if existing_notes else ""
            updates.append("notes = ?")
            params.append(f"{existing_notes}{separator}[{now[:10]}] {notes}")

        params.append(job_id)
        self._conn.execute(
            f"UPDATE applications SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        self._conn.commit()
        logger.info("Updated application id=%d to status '%s'", job_id, new_status)
        return True

    def get_job(self, job_id: int) -> Optional[Dict]:
        """Get a single application by id."""
        row = self._conn.execute("SELECT * FROM applications WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def get_all_jobs(self) -> List[Dict]:
        """Get all applications, newest first."""
        rows = self._conn.execute(
            "SELECT * FROM applications ORDER BY date_found DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_pipeline(self) -> Dict[str, List[Dict]]:
        """Get jobs grouped by status for kanban display.

        Returns:
            Dict mapping status -> list of job dicts.
        """
        jobs = self.get_all_jobs()
        pipeline = {}
        for status in VALID_STATUSES:
            pipeline[status] = []
        for job in jobs:
            status = job.get("status", "found")
            if status not in pipeline:
                pipeline[status] = []
            pipeline[status].append(job)
        return pipeline

    def get_stats(self) -> Dict:
        """Calculate application statistics.

        Returns:
            Dict with total, by_status counts, response_rate, avg_days_to_response.
        """
        jobs = self.get_all_jobs()
        total = len(jobs)

        by_status = {}
        for status in VALID_STATUSES:
            by_status[status] = 0
        for job in jobs:
            s = job.get("status", "found")
            by_status[s] = by_status.get(s, 0) + 1

        # Response rate: of applied jobs, how many got a response?
        applied_count = sum(
            1 for j in jobs if j.get("date_applied")
        )
        responded_count = sum(
            1 for j in jobs if j.get("date_applied") and j.get("date_response")
        )
        response_rate = (responded_count / applied_count * 100) if applied_count > 0 else 0.0

        # Average days to response
        days_list = []
        for j in jobs:
            if j.get("date_applied") and j.get("date_response"):
                try:
                    applied_dt = datetime.fromisoformat(j["date_applied"])
                    response_dt = datetime.fromisoformat(j["date_response"])
                    days_list.append((response_dt - applied_dt).days)
                except (ValueError, TypeError):
                    pass
        avg_days_to_response = sum(days_list) / len(days_list) if days_list else 0.0

        return {
            "total": total,
            "by_status": by_status,
            "applied_count": applied_count,
            "responded_count": responded_count,
            "response_rate": response_rate,
            "avg_days_to_response": avg_days_to_response,
        }

    def update_external_status(self, job_id: int, status: str,
                               portal_id: int = None) -> bool:
        """Update the external ATS status on an application."""
        row = self._conn.execute(
            "SELECT id FROM applications WHERE id = ?", (job_id,)
        ).fetchone()
        if not row:
            logger.warning("Application id=%d not found", job_id)
            return False

        now = datetime.now().isoformat()
        updates = ["external_status = ?", "external_status_updated = ?"]
        params = [status, now]

        if portal_id is not None:
            updates.append("portal_id = ?")
            params.append(portal_id)

        params.append(job_id)
        self._conn.execute(
            f"UPDATE applications SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        self._conn.commit()
        logger.info("Updated external status for id=%d: '%s'", job_id, status)
        return True

    def withdraw_application(self, job_id: int) -> bool:
        """Withdraw an application — sets status and withdraw_date."""
        row = self._conn.execute(
            "SELECT id FROM applications WHERE id = ?", (job_id,)
        ).fetchone()
        if not row:
            logger.warning("Application id=%d not found", job_id)
            return False

        now = datetime.now().isoformat()
        self._conn.execute(
            "UPDATE applications SET status = 'withdrawn', withdraw_date = ? WHERE id = ?",
            (now, job_id),
        )
        self._conn.commit()
        logger.info("Withdrew application id=%d", job_id)
        return True

    def get_stale_applications(self, days: int = 14) -> List[Dict]:
        """Get applications with no external status update in `days`.

        Excludes withdrawn, rejected, and ghosted applications.
        """
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        rows = self._conn.execute(
            "SELECT * FROM applications "
            "WHERE status NOT IN ('withdrawn', 'rejected', 'ghosted') "
            "  AND (external_status_updated IS NULL OR external_status_updated < ?) "
            "ORDER BY date_found DESC",
            (cutoff,),
        ).fetchall()
        return [dict(r) for r in rows]

    def close(self):
        """Close the database connection."""
        self._conn.close()
