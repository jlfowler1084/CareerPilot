"""Shared Google OAuth2 authentication for Gmail and Calendar APIs."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

NON_INTERACTIVE_ENV_VAR = "CAREERPILOT_NONINTERACTIVE"

_TRUTHY = frozenset({"1", "true", "yes", "on"})
_FALSY = frozenset({"0", "false", "no", "off"})


class NonInteractiveAuthRequired(RuntimeError):
    """Interactive Google consent is needed but no human can complete it.

    Raised instead of calling ``InstalledAppFlow.run_local_server()`` when the
    process has no interactive session. See CAR-226: under a Windows S4U
    scheduled task the flow calls ``webbrowser.open()``, which launches Chrome
    against the user's default profile inside Session 0. That Chrome takes the
    profile singleton lock but can never render a window, so the flow blocks
    forever and the orphaned browser makes Chrome unlaunchable on the desktop
    until reboot.
    """


def _is_non_interactive() -> bool:
    """Decide whether interactive OAuth consent is possible here.

    ``CAREERPILOT_NONINTERACTIVE`` is authoritative in both directions when
    set, so a scheduled task can assert it and a human can override it. With
    the variable unset, fall back to whether stdin is a terminal.
    """
    raw = os.environ.get(NON_INTERACTIVE_ENV_VAR)
    if raw is not None:
        value = raw.strip().lower()
        if value in _TRUTHY:
            return True
        if value in _FALSY:
            return False
        logger.warning(
            "Unrecognized %s=%r; falling back to terminal detection",
            NON_INTERACTIVE_ENV_VAR,
            raw,
        )

    try:
        return not sys.stdin.isatty()
    except (AttributeError, ValueError, OSError):
        # No usable stdin at all (detached service): fail closed.
        return True


def get_google_service(
    api_name: str,
    api_version: str,
    credentials_file: Path,
    token_path: Path,
    scopes: list[str],
):
    """Authenticate with a Google API and return an authorized service object.

    Uses InstalledAppFlow for first-time auth, stores token at token_path,
    and auto-refreshes expired tokens on subsequent calls.

    Args:
        api_name: Google API name (e.g. "gmail", "calendar").
        api_version: API version (e.g. "v1", "v3").
        credentials_file: Path to Google OAuth credentials JSON from Cloud Console.
        token_path: Path to store/load the OAuth token.
        scopes: List of API scopes.

    Returns:
        googleapiclient.discovery.Resource: Authorized API service.

    Raises:
        FileNotFoundError: If credentials_file does not exist.
        NonInteractiveAuthRequired: If consent is required but the process is
            running without an interactive session (CAR-226).
    """
    if not credentials_file.exists():
        raise FileNotFoundError(
            f"Google credentials file not found at {credentials_file}. "
            "Download OAuth 2.0 credentials from Google Cloud Console "
            "(APIs & Services > Credentials > Desktop app) and save as "
            f"{credentials_file}"
        )

    creds = None

    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), scopes)
            logger.debug("Loaded existing OAuth token from %s", token_path)
        except Exception:
            logger.warning("Failed to load token from %s, will re-authenticate", token_path)
            creds = None

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            logger.info("OAuth token refreshed successfully for %s", api_name)
        except Exception:
            logger.warning("Token refresh failed for %s, will re-authenticate", api_name)
            creds = None

    if not creds or not creds.valid:
        if _is_non_interactive():
            raise NonInteractiveAuthRequired(
                f"Google OAuth for '{api_name}' needs interactive consent, but this "
                f"process has no interactive session, so no one can complete it. "
                f"Refusing to open a browser.\n"
                f"  Token:       {token_path}\n"
                f"  Credentials: {credentials_file}\n"
                f"Re-authenticate by running the same command from an interactive "
                f"terminal, where a human can finish Google consent in a browser. "
                f"Set {NON_INTERACTIVE_ENV_VAR}=0 to force the interactive flow "
                f"here, or =1 to assert this context is headless.\n"
                f"Opening a browser from a Windows service session hijacks the "
                f"default Chrome profile and hangs forever (CAR-226)."
            )

        logger.info("Starting OAuth flow for %s — a browser window will open", api_name)
        flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), scopes)
        creds = flow.run_local_server(port=0)
        logger.info("OAuth authorization completed for %s", api_name)

        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json())
        logger.info("OAuth token saved to %s", token_path)

    service = build(api_name, api_version, credentials=creds)
    logger.info("%s API service created (version %s)", api_name, api_version)
    return service
