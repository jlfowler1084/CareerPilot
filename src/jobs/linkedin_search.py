"""
CareerPilot — LinkedIn search adapter for the search engine pipeline.

Provides ``search_linkedin``, which wraps the ``scan_emails`` Gmail helper
and normalises each result to the same field shape as ``search_dice`` so
the generic ``run_profiles`` upsert path can handle LinkedIn rows without
modification.
"""

from __future__ import annotations

import logging

from src.jobs.linkedin_parser import scan_emails

logger = logging.getLogger(__name__)


def search_linkedin(gmail_service, days: int = 2) -> list[dict]:
    """Return a list of job dicts normalised to the ``search_dice`` output shape.

    Calls ``scan_emails`` internally.  If ``gmail_service`` is ``None`` the
    function returns ``[]`` gracefully — the search engine treats an empty
    list as a zero-result run (no upserts, no stale-flip).

    Parameters
    ----------
    gmail_service:
        Authenticated Gmail API service object, or ``None``.
    days:
        Number of days back to scan.

    Returns
    -------
    list[dict]
        Each dict has keys: ``title``, ``company``, ``location``, ``salary``,
        ``url``, ``source``, ``job_type``, ``posted_date``, ``easy_apply``,
        ``source_id``.
    """
    if gmail_service is None:
        logger.debug("search_linkedin: gmail_service is None — returning []")
        return []

    try:
        raw_jobs = scan_emails(gmail_service, days=days)
    except Exception:
        logger.warning("search_linkedin: scan_emails raised, returning []", exc_info=True)
        return []

    results: list[dict] = []
    for job in raw_jobs:
        results.append({
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "salary": job.get("salary", "Not listed"),
            "url": job.get("url", ""),
            "source": "linkedin",
            "job_type": job.get("type", ""),
            "posted_date": job.get("posted", ""),
            "easy_apply": False,
            "source_id": job.get("linkedin_job_id") or job.get("url", ""),
        })

    return results
