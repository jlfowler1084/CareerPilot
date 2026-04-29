"""Alert-suppression state for the OAuth token monitor (CAR-196).

Persists last-alert timestamp on disk so a multi-day outage doesn't spam
Discord once per scheduled run. State file path is configured via
``settings.OAUTH_MONITOR_STATE_PATH`` (default ``data/oauth_monitor_state.json``).

Schema::

    {
      "last_alert_iso": "2026-04-29T11:23:45+00:00",
      "last_state": "DEAD"
    }

A corrupt or missing state file is treated as "no prior alert" — fail-open so
the next genuine outage isn't silenced by an unreadable scratch file.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def load(state_path: Path) -> dict:
    """Read state from disk; return ``{}`` on any error."""
    if not state_path.exists():
        return {}
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning(
            "oauth_monitor.state: failed to read %s; treating as empty", state_path
        )
        return {}


def save(state_path: Path, state: dict) -> None:
    """Write state to disk, creating parent dirs if needed."""
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def should_alert(state: dict, now: datetime, suppress_hours: int) -> bool:
    """True iff no alert was sent within the last ``suppress_hours``.

    Returns True when:
      - state is empty (never alerted)
      - last_alert_iso is malformed (fail open)
      - elapsed time >= suppress_hours
    """
    last_iso = state.get("last_alert_iso")
    if not last_iso:
        return True
    try:
        last = datetime.fromisoformat(last_iso)
    except ValueError:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (now - last) >= timedelta(hours=suppress_hours)


def mark_alerted(now: datetime, current_state: str) -> dict:
    """Build a new state dict for after a successful alert post."""
    return {
        "last_alert_iso": now.isoformat(),
        "last_state": current_state,
    }
