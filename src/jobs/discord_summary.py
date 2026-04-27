"""Discord daily summary for job search runs — CAR-188 Unit 6.

Posts a formatted summary of each ``run_profiles`` invocation to the
#careerpilot-updates Discord channel via the ClaudeInfra pwsh webhook wrapper.

Architecture note
-----------------
The pwsh wrapper path is hardcoded to the workstation-local ClaudeInfra checkout:
  F:\\Projects\\ClaudeInfra\\tools\\Send-DiscordWebhook.ps1

This is a workstation-specific dependency in v1.  If Discord integration moves to
another machine or environment, extract the path to an env var
(e.g. DISCORD_WEBHOOK_SCRIPT) as part of that migration ticket (CAR-189+).

The wrapper wraps in try/catch and never throws — webhook failures are logged
but do not fail the run, consistent with v1 R22.

Usage
-----
    from src.jobs.discord_summary import post_summary

    ok = post_summary(run_summary, manager)
"""

from __future__ import annotations

import logging
import subprocess
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Workstation-local path to the ClaudeInfra pwsh webhook wrapper.
_WEBHOOK_SCRIPT = r"F:\Projects\ClaudeInfra\tools\Send-DiscordWebhook.ps1"


def format_summary(
    run_summary: Any,
    recent_new_rows: List[Dict[str, Any]],
) -> str:
    """Format a ``RunSummary`` into a Discord-ready plain-text message.

    Parameters
    ----------
    run_summary:
        A ``RunSummary`` dataclass instance from ``src.jobs.search_engine``.
    recent_new_rows:
        List of job-search-result dicts (from ``list_recent_new``).  Used
        to render the "Top 3 new" section.

    Returns
    -------
    str
        Multi-line message suitable for a Discord post.
    """
    profiles = run_summary.profiles  # Dict[str, ProfileResult]
    profile_count = len(profiles)
    total_new: int = run_summary.total_new
    total_updated: int = run_summary.total_updated

    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    # -----------------------------------------------------------------------
    # Detect all-degraded condition
    # -----------------------------------------------------------------------
    all_degraded = (
        profile_count > 0
        and all(pr.degraded for pr in profiles.values())
    )

    # -----------------------------------------------------------------------
    # Header line
    # -----------------------------------------------------------------------
    if total_new == 0:
        header = f"No new results today ({today_str})"
    elif all_degraded:
        header = (
            f"⚠️ ALL PROFILES DEGRADED — "
            f"CareerPilot Job Search {today_str}: +{total_new} new "
            f"across {profile_count} profile(s)"
        )
    else:
        header = (
            f"\U0001f50d CareerPilot Job Search — {today_str}: "
            f"+{total_new} new across {profile_count} profile(s)"
        )

    lines: List[str] = [header, ""]

    # -----------------------------------------------------------------------
    # Per-profile section
    # -----------------------------------------------------------------------
    lines.append("Profiles:")
    for pr in profiles.values():
        parts: List[str] = [f"  • {pr.label}: +{pr.new} new, {pr.updated} updated"]
        if pr.degraded:
            parts.append(" — DEGRADED (parser sentinel)")
        if pr.error:
            parts.append(f" — ERROR: {pr.error}")
        lines.append("".join(parts))

    # -----------------------------------------------------------------------
    # Top 3 new jobs section (only if there are new rows to show)
    # -----------------------------------------------------------------------
    if recent_new_rows and total_new > 0:
        lines.append("")
        lines.append("Top 3 new:")
        for row in recent_new_rows[:3]:
            title = row.get("title") or "Unknown Title"
            company = row.get("company") or "Unknown Company"
            location = row.get("location") or "Unknown Location"
            lines.append(f"  • {title} @ {company} — {location}")

    # -----------------------------------------------------------------------
    # Footer: runtime + Indeed-deferred note
    # -----------------------------------------------------------------------
    lines.append("")
    elapsed: float = 0.0
    if run_summary.completed_at and run_summary.started_at:
        elapsed = (run_summary.completed_at - run_summary.started_at).total_seconds()
    footer_parts: List[str] = [f"Runtime: {elapsed:.1f}s"]

    # In v1, Indeed is always deferred (CAR-189).  Always include the note so
    # users see the Dice-only scope clearly in the daily feed.
    footer_parts.append("Indeed deferred to v2 (CAR-189)")

    lines.append(" | ".join(footer_parts))

    return "\n".join(lines)


def post_summary(
    run_summary: Any,
    manager: Any,
    *,
    project_name: str = "CareerPilot",
    dry_run: bool = False,
) -> bool:
    """Post the run summary to Discord via the pwsh webhook wrapper.

    Parameters
    ----------
    run_summary:
        A ``RunSummary`` dataclass instance.
    manager:
        A ``JobSearchResultsManager`` instance — used to fetch the top 3
        most-recent new rows for the summary body.
    project_name:
        Passed to ``-ProjectName`` in the pwsh wrapper.  Routes to the
        correct Discord channel.  Default ``"CareerPilot"``.
    dry_run:
        If ``True``, log and print the formatted message instead of invoking
        pwsh.  Returns ``True``.  Useful for ``--no-discord`` and tests.

    Returns
    -------
    bool
        ``True`` on success (or dry run), ``False`` on failure.  Never
        raises — webhook failures are logged and swallowed per v1 R22.
    """
    try:
        recent_rows: List[Dict[str, Any]] = manager.list_recent_new(limit=3)
    except Exception:
        logger.warning("discord_summary.post_summary: list_recent_new failed", exc_info=True)
        recent_rows = []

    message = format_summary(run_summary, recent_rows)

    if dry_run:
        logger.info("discord_summary: dry_run — skipping pwsh webhook call")
        print(message)
        return True

    try:
        result = subprocess.run(
            [
                "pwsh",
                "-NoProfile",
                "-File",
                _WEBHOOK_SCRIPT,
                "-ProjectName",
                project_name,
                "-EventType",
                "Info",
                "-Summary",
                message,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            logger.warning(
                "discord_summary: pwsh webhook returned non-zero exit code %d. stderr: %s",
                result.returncode,
                result.stderr.strip() if result.stderr else "(empty)",
            )
            return False
        logger.info("discord_summary: webhook posted successfully.")
        return True

    except subprocess.TimeoutExpired:
        logger.warning(
            "discord_summary: pwsh webhook timed out after 15 seconds."
        )
        return False

    except FileNotFoundError:
        logger.warning(
            "discord_summary: pwsh not found — is PowerShell 7 installed? "
            "Webhook not sent."
        )
        return False

    except Exception:
        logger.warning("discord_summary: unexpected error invoking pwsh webhook", exc_info=True)
        return False
