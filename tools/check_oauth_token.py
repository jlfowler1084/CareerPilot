"""CareerPilot OAuth token monitor — daily watchdog entry point (CAR-196).

Scheduled by ``scripts/Register-OAuthMonitorTask.ps1`` to run once a day.

What it does:
  1. Classifies ``data/gmail_token.json`` as FRESH / STALE / DEAD via mtime
     plus a live ``users.getProfile()`` ping (see ``src.oauth_monitor.monitor``).
  2. On STALE or DEAD, posts to the Discord channel configured by
     ``settings.OAUTH_MONITOR_CHANNEL`` via ``src.notify.discord``.
  3. Suppresses duplicate alerts within ``OAUTH_MONITOR_SUPPRESS_HOURS``
     (state in ``data/oauth_monitor_state.json``).

Usage::

    python tools/check_oauth_token.py             # normal scheduled run
    python tools/check_oauth_token.py --dry-run   # log + print without posting
    python tools/check_oauth_token.py --force     # bypass suppression window

Exit codes:
  0  token is FRESH, or alert was suppressed
  1  STALE alert fired (or would have fired in --dry-run)
  2  DEAD alert fired (or would have fired in --dry-run)
"""

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import settings  # noqa: E402
from src.notify import discord  # noqa: E402
from src.oauth_monitor import monitor  # noqa: E402
from src.oauth_monitor import state as state_mod  # noqa: E402

logger = logging.getLogger("careerpilot.oauth_monitor")

RUNBOOK_LOCAL_PATH = "docs/solutions/best-practices/oauth-reauth.md"
RUNBOOK_GITHUB_URL = (
    "https://github.com/jlfowler1084/CareerPilot/blob/feature/dashboard-v2/"
    "docs/solutions/best-practices/oauth-reauth.md"
)

EXIT_FRESH = 0
EXIT_STALE = 1
EXIT_DEAD = 2


def format_alert(
    health: monitor.TokenHealth,
    *,
    token_path: Path,
    threshold_days: int,
) -> str:
    """Build the Discord alert body with the runbook link (AC6)."""
    if health.state == "DEAD":
        icon = "\U0001f534"  # red circle
        headline = f"{icon} CareerPilot OAuth Token DEAD"
        body = [
            f"Live API ping failed for `{token_path.as_posix()}`.",
            f"Detail: {health.detail}",
            "Re-auth needed to restore Gmail/Calendar pipelines.",
        ]
    else:  # STALE
        icon = "⚠️"  # warning
        headline = f"{icon} CareerPilot OAuth Token STALE"
        body = [
            f"`{token_path.as_posix()}` hasn't been refreshed in "
            f"{health.age_days:.1f} days (threshold: {threshold_days}).",
            "Token may still authenticate, but no auto-refresh has occurred — investigate.",
        ]

    lines = [headline, ""]
    lines.extend(body)
    lines += [
        "",
        f"Runbook: {RUNBOOK_GITHUB_URL}",
        f"Local path: `{RUNBOOK_LOCAL_PATH}`",
        "",
        "[CAR-196 monitor]",
    ]
    return "\n".join(lines)


def _exit_code(state: str) -> int:
    if state == "DEAD":
        return EXIT_DEAD
    if state == "STALE":
        return EXIT_STALE
    return EXIT_FRESH


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="CareerPilot OAuth token monitor (CAR-196)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the alert instead of posting; do not write suppression state.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Bypass the alert-suppression window.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    token_path = settings.GMAIL_TOKEN_PATH
    state_path = settings.OAUTH_MONITOR_STATE_PATH
    stale_days = settings.OAUTH_MONITOR_STALE_DAYS
    suppress_hours = settings.OAUTH_MONITOR_SUPPRESS_HOURS
    channel = settings.OAUTH_MONITOR_CHANNEL

    now = datetime.now(timezone.utc)
    health = monitor.check_token_health(
        token_path=token_path,
        stale_days=stale_days,
        scopes=settings.GMAIL_SCOPES,
        now=now,
    )
    logger.info(
        "token health: state=%s age_days=%.2f mtime=%s detail=%s",
        health.state,
        health.age_days,
        health.mtime_iso,
        health.detail,
    )

    if health.state == "FRESH":
        return EXIT_FRESH

    persisted = state_mod.load(state_path)
    if not args.force and not state_mod.should_alert(persisted, now, suppress_hours):
        logger.info(
            "oauth_monitor: alert suppressed (within %dh window since %s)",
            suppress_hours,
            persisted.get("last_alert_iso", "<unknown>"),
        )
        return _exit_code(health.state)

    message = format_alert(
        health, token_path=token_path, threshold_days=stale_days
    )

    if args.dry_run:
        print(message)
        logger.info("oauth_monitor: dry-run; not posting to Discord")
        return _exit_code(health.state)

    posted = discord.post(channel, message)
    if posted:
        state_mod.save(state_path, state_mod.mark_alerted(now, health.state))
        logger.info("oauth_monitor: alert posted; suppression timestamp written")
    else:
        # Don't write suppression state on a failed post — we want the next
        # scheduled run to retry rather than silently swallow the alert.
        logger.warning(
            "oauth_monitor: discord post failed; suppression NOT written, "
            "next scheduled run will retry"
        )

    return _exit_code(health.state)


if __name__ == "__main__":
    sys.exit(main())
