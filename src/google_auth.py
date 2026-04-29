"""Shared Google OAuth2 authentication for Gmail and Calendar APIs."""

from __future__ import annotations

import logging
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)


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
