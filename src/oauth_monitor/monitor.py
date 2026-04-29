"""Token-health classification for the CareerPilot OAuth monitor (CAR-196).

Two-stage check:

1. **mtime** — ``data/gmail_token.json`` not touched in > stale_days  -> ``STALE``.
2. **live API ping** — attempt ``creds.refresh()`` if expired, then call
   ``users.getProfile()``. On ``RefreshError`` / ``InvalidGrantError`` /
   ``HttpError 401`` -> ``DEAD``.

Precedence: ``DEAD`` > ``STALE`` > ``FRESH``. A token that fails live ping is
``DEAD`` even if mtime is recent (e.g. user just clicked Revoke at
myaccount.google.com/permissions — token is on disk but refresh chain is gone).

Critically, this module **does not** call ``flow.run_local_server`` — a monitor
that auto-recovers is unfit for monitoring; it would paper over the failure it's
supposed to detect. Compare ``src/google_auth.get_google_service`` which *does*
auto-recover and is appropriate for interactive CLI use.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


@dataclass
class TokenHealth:
    state: str  # "FRESH" | "STALE" | "DEAD"
    age_days: float
    mtime_iso: str
    detail: str


def classify_mtime(
    token_path: Path, stale_days: int, now: datetime
) -> tuple[str, float, str]:
    """Returns (state, age_days, mtime_iso) where state is FRESH/STALE/DEAD.

    DEAD here only means "token file missing"; live-ping deadness is detected
    separately by ``live_api_ping``.
    """
    if not token_path.exists():
        return "DEAD", 0.0, ""
    mtime_dt = datetime.fromtimestamp(token_path.stat().st_mtime, tz=timezone.utc)
    age_days = (now - mtime_dt).total_seconds() / 86400.0
    state = "STALE" if age_days > stale_days else "FRESH"
    return state, age_days, mtime_dt.isoformat()


def live_api_ping(token_path: Path, scopes: list[str]) -> tuple[bool, str]:
    """Confirm the token can actually authenticate without triggering re-auth.

    Returns (alive, detail).

    Loads creds directly from disk and (if needed) attempts a refresh. Never
    invokes the interactive ``InstalledAppFlow`` — see module docstring.
    """
    if not token_path.exists():
        return False, "Token file does not exist"

    try:
        creds = Credentials.from_authorized_user_file(str(token_path), scopes)
    except Exception as exc:
        return False, f"Failed to load token: {type(exc).__name__}: {exc}"

    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except RefreshError as exc:
            return False, f"RefreshError: {exc}"
        except Exception as exc:
            # oauthlib InvalidGrantError lives at
            # oauthlib.oauth2.rfc6749.errors.InvalidGrantError but google-auth
            # normally wraps it in RefreshError. Match by name for safety
            # against either lib's version drift.
            if "InvalidGrant" in type(exc).__name__:
                return False, f"InvalidGrantError: {exc}"
            return False, f"refresh failed: {type(exc).__name__}: {exc}"

    if not creds.valid:
        return False, "Credentials invalid after refresh attempt"

    try:
        svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
        profile = svc.users().getProfile(userId="me").execute()
        return True, profile.get("emailAddress", "")
    except HttpError as exc:
        if getattr(exc.resp, "status", None) == 401:
            return False, f"HttpError 401: {exc}"
        # Non-401 HttpError: probably transient (network, quota). Don't
        # classify the token as DEAD on that — surface the detail and keep
        # alive=True so we don't fire a false DEAD alert.
        logger.warning("oauth_monitor: non-401 HttpError on live ping: %s", exc)
        return True, f"non-401 HttpError (treated as live): {exc}"


def check_token_health(
    token_path: Path,
    stale_days: int,
    scopes: list[str],
    now: datetime | None = None,
) -> TokenHealth:
    """Full classification: mtime first, then live ping if mtime is FRESH/STALE."""
    if now is None:
        now = datetime.now(timezone.utc)

    mtime_state, age_days, mtime_iso = classify_mtime(token_path, stale_days, now)

    if mtime_state == "DEAD":
        return TokenHealth(
            state="DEAD",
            age_days=age_days,
            mtime_iso=mtime_iso,
            detail="Token file missing on disk",
        )

    alive, detail = live_api_ping(token_path, scopes)
    if not alive:
        return TokenHealth(
            state="DEAD",
            age_days=age_days,
            mtime_iso=mtime_iso,
            detail=detail,
        )

    return TokenHealth(
        state=mtime_state,
        age_days=age_days,
        mtime_iso=mtime_iso,
        detail=detail,
    )
