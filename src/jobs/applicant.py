"""Dice Easy Apply automation — browser launch, clipboard profile, batch apply."""

from __future__ import annotations

import logging
import webbrowser
from datetime import datetime
from typing import Dict, List, Optional

from src.jobs.tracker import ApplicationTracker
from src.profile.manager import ProfileManager

logger = logging.getLogger(__name__)


def _try_copy_to_clipboard(text: str) -> bool:
    """Copy text to clipboard via pyperclip. Returns True on success."""
    try:
        import pyperclip
        pyperclip.copy(text)
        return True
    except Exception:
        logger.warning("Clipboard copy failed — pyperclip not installed or no clipboard available")
        return False


class JobApplicant:
    """Handles job application workflows: browser launch, clipboard, tracking."""

    def __init__(self, db_path=None, profile_db_path=None):
        self._tracker = ApplicationTracker(db_path)
        self._profile_mgr = ProfileManager(profile_db_path)

    def close(self):
        self._tracker.close()
        self._profile_mgr.close()

    # --- Profile clipboard helpers ---

    def copy_profile_for_ats(self) -> str:
        """Format profile data as a text block and copy to clipboard.

        Returns the formatted text (also copied to clipboard if available).
        """
        text = self._profile_mgr.export_text()
        _try_copy_to_clipboard(text)
        return text

    def copy_field(self, field: str) -> Optional[str]:
        """Copy a single profile field to clipboard.

        Args:
            field: One of 'name', 'email', 'phone', 'address', 'linkedin', 'summary'.

        Returns:
            The field value, or None if not found.
        """
        personal = self._profile_mgr.get_personal() or {}
        field_map = {
            "name": personal.get("full_name", ""),
            "email": personal.get("email", ""),
            "phone": personal.get("phone", ""),
            "address": ", ".join(
                p for p in [
                    personal.get("street", ""),
                    personal.get("city", ""),
                    personal.get("state", ""),
                    personal.get("zip", ""),
                ] if p
            ),
            "linkedin": personal.get("linkedin_url", ""),
            "summary": self._build_resume_summary(),
        }

        value = field_map.get(field)
        if value is not None:
            _try_copy_to_clipboard(value)
        return value

    def _build_resume_summary(self) -> str:
        """Build a short resume summary from the most recent work history."""
        work = self._profile_mgr.get_all_work_history()
        if not work:
            return ""
        latest = work[0]
        return f"{latest.get('title', '')} at {latest.get('company', '')} — {latest.get('description', '')}"

    # --- Apply flows ---

    def apply_dice_easy(self, job_data: Dict) -> Dict:
        """Open Dice Easy Apply job in browser and copy profile to clipboard.

        Args:
            job_data: Dict with at least 'url', 'title', 'company'. May also have
                      'id' (tracker row id) if already saved.

        Returns:
            Dict with 'opened' (bool), 'clipboard' (bool), 'tracker_id' (int or None).
        """
        result = {"opened": False, "clipboard": False, "tracker_id": None}

        url = job_data.get("url", "")
        if url:
            webbrowser.open(url)
            result["opened"] = True
            logger.info("Opened in browser: %s", url)

        result["clipboard"] = _try_copy_to_clipboard(self._profile_mgr.export_text())

        # Ensure job is in tracker
        tracker_id = job_data.get("id")
        if not tracker_id:
            tracker_id = self._tracker.save_job(job_data)
        result["tracker_id"] = tracker_id

        return result

    def apply_with_resume(self, job_data: Dict, resume_path: str = None) -> Dict:
        """Open job URL in browser for manual application with resume.

        Args:
            job_data: Dict with job details.
            resume_path: Optional path to resume file.

        Returns:
            Dict with 'opened' (bool), 'tracker_id' (int or None), 'resume_path' (str or None).
        """
        result = {"opened": False, "tracker_id": None, "resume_path": resume_path}

        url = job_data.get("url", "")
        if url:
            webbrowser.open(url)
            result["opened"] = True

        tracker_id = job_data.get("id")
        if not tracker_id:
            tracker_id = self._tracker.save_job(job_data)
        result["tracker_id"] = tracker_id

        return result

    def mark_applied(self, job_id: int, method: str = "browser") -> bool:
        """Mark a tracked job as applied with application method in notes.

        Args:
            job_id: Application tracker row id.
            method: Application method — 'easy_apply', 'manual', 'browser'.

        Returns:
            True if status updated successfully.
        """
        note = f"Applied via {method}"
        return self._tracker.update_status(job_id, "applied", notes=note)

    def batch_select(self, job_list: List[Dict], selection: str) -> List[Dict]:
        """Parse user selection and return the selected jobs.

        Args:
            job_list: List of job dicts (1-indexed display assumed).
            selection: User input — comma-separated numbers, ranges (e.g. '1-3'),
                       or 'all'.

        Returns:
            List of selected job dicts.
        """
        if selection.strip().lower() == "all":
            return list(job_list)

        indices = set()
        for part in selection.split(","):
            part = part.strip()
            if "-" in part:
                try:
                    start, end = part.split("-", 1)
                    for i in range(int(start), int(end) + 1):
                        indices.add(i)
                except (ValueError, TypeError):
                    continue
            else:
                try:
                    indices.add(int(part))
                except ValueError:
                    continue

        selected = []
        for idx in sorted(indices):
            if 1 <= idx <= len(job_list):
                selected.append(job_list[idx - 1])
        return selected

    def get_actionable_jobs(self) -> List[Dict]:
        """Get jobs from tracker with status 'found' or 'interested'."""
        all_jobs = self._tracker.get_all_jobs()
        return [j for j in all_jobs if j.get("status") in ("found", "interested")]

    def get_applied_today(self) -> List[Dict]:
        """Get jobs that were applied to today."""
        today = datetime.now().strftime("%Y-%m-%d")
        all_jobs = self._tracker.get_all_jobs()
        return [
            j for j in all_jobs
            if j.get("status") == "applied"
            and j.get("date_applied", "").startswith(today)
        ]

    # --- Document generation ---

    def generate_application_docs(self, job_data: Dict) -> Dict:
        """Generate tailored resume and cover letter for a job.

        Args:
            job_data: Dict with 'description' (or 'snippet'), 'company', 'title'.

        Returns:
            Dict with 'resume_path' and 'cover_letter_path' (each may be None on failure).
        """
        from src.documents.resume_generator import ResumeGenerator
        from src.documents.cover_letter_generator import CoverLetterGenerator

        result = {"resume_path": None, "cover_letter_path": None}

        resume_gen = ResumeGenerator()
        resume_path = resume_gen.generate_for_application(job_data)
        result["resume_path"] = resume_path

        profile = self._profile_mgr.get_profile()
        cl_gen = CoverLetterGenerator(profile=profile)
        cl_path = cl_gen.generate_for_application(job_data)
        result["cover_letter_path"] = cl_path

        return result
