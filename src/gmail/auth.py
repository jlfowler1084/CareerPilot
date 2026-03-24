"""Google OAuth2 authentication for Gmail API."""

from __future__ import annotations

import logging
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)


def get_gmail_service(
    credentials_file: Path,
    token_path: Path,
    scopes: list[str],
):
    """Authenticate with Gmail API and return an authorized service object.

    Uses InstalledAppFlow for first-time auth, stores token at token_path,
    and auto-refreshes expired tokens on subsequent calls.

    Args:
        credentials_file: Path to Google OAuth credentials JSON from Cloud Console.
        token_path: Path to store/load the OAuth token.
        scopes: List of Gmail API scopes.

    Returns:
        googleapiclient.discovery.Resource: Authorized Gmail API service.

    Raises:
        FileNotFoundError: If credentials_file does not exist.
        Exception: If OAuth flow fails.
    """
    if not credentials_file.exists():
        raise FileNotFoundError(
            f"Google credentials file not found at {credentials_file}. "
            "Download OAuth 2.0 credentials from Google Cloud Console "
            "(APIs & Services > Credentials > Desktop app) and save as "
            f"{credentials_file}"
        )

    creds = None

    # Load existing token if available
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), scopes)
            logger.debug("Loaded existing OAuth token from %s", token_path)
        except Exception:
            logger.warning("Failed to load token from %s, will re-authenticate", token_path)
            creds = None

    # Refresh or run new OAuth flow
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            logger.info("OAuth token refreshed successfully")
        except Exception:
            logger.warning("Token refresh failed, will re-authenticate")
            creds = None

    if not creds or not creds.valid:
        logger.info("Starting OAuth flow — a browser window will open for authorization")
        flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), scopes)
        creds = flow.run_local_server(port=8080)
        logger.info("OAuth authorization completed successfully")

        # Save token for future use
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json())
        logger.info("OAuth token saved to %s", token_path)

    service = build("gmail", "v1", credentials=creds)
    logger.info("Gmail API service created")
    return service
