"""Google OAuth2 authentication for Gmail API."""

from __future__ import annotations

from pathlib import Path

from src.google_auth import get_google_service


def get_gmail_service(
    credentials_file: Path,
    token_path: Path,
    scopes: list[str],
):
    """Authenticate with Gmail API and return an authorized service object.

    Delegates to the shared Google auth helper.

    Args:
        credentials_file: Path to Google OAuth credentials JSON from Cloud Console.
        token_path: Path to store/load the OAuth token.
        scopes: List of Gmail API scopes.

    Returns:
        googleapiclient.discovery.Resource: Authorized Gmail API service.

    Raises:
        FileNotFoundError: If credentials_file does not exist.
    """
    return get_google_service(
        api_name="gmail",
        api_version="v1",
        credentials_file=credentials_file,
        token_path=token_path,
        scopes=scopes,
    )


def get_default_gmail_service():
    """Build a Gmail service using project defaults from ``config.settings``.

    Thin wrapper around :func:`get_gmail_service` that reads
    ``GOOGLE_CREDENTIALS_FILE``, ``GMAIL_TOKEN_PATH``, and ``GMAIL_SCOPES`` from
    the shared settings module so CLI call sites don't each repeat the same
    three-arg plumbing.
    """
    from config import settings

    return get_gmail_service(
        credentials_file=settings.GOOGLE_CREDENTIALS_FILE,
        token_path=settings.GMAIL_TOKEN_PATH,
        scopes=settings.GMAIL_SCOPES,
    )
