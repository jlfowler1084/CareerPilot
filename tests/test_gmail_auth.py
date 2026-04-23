"""Tests for src/gmail/auth.py helpers (CAR-158)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


class TestGetDefaultGmailService:
    @patch("src.gmail.auth.get_gmail_service")
    def test_reads_settings_and_delegates(self, mock_get_gmail_service):
        from config import settings
        from src.gmail.auth import get_default_gmail_service

        sentinel_service = MagicMock(name="gmail_service")
        mock_get_gmail_service.return_value = sentinel_service

        result = get_default_gmail_service()

        assert result is sentinel_service
        mock_get_gmail_service.assert_called_once_with(
            credentials_file=settings.GOOGLE_CREDENTIALS_FILE,
            token_path=settings.GMAIL_TOKEN_PATH,
            scopes=settings.GMAIL_SCOPES,
        )
