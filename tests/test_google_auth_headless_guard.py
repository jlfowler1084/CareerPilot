"""Non-interactive guard for the shared Google OAuth helper (CAR-226).

Regression cover for the 2026-09-20 incident: the daily
``\\CareerPilot\\CareerPilot-JobSearch`` scheduled task runs S4U in Windows
Session 0. When the Gmail refresh token died, ``get_google_service()`` fell
through to ``InstalledAppFlow.run_local_server()``, which called
``webbrowser.open()``. That launched Chrome against the user's *real default
profile*, took the profile singleton lock, and then blocked forever on a
redirect no one could complete -- leaving an orphaned Session 0 Chrome that
made the desktop browser unlaunchable until reboot.

The contract these tests pin down: in a non-interactive context we fail fast
and loudly instead of opening a browser nobody can see.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]


@pytest.fixture
def credentials_file(tmp_path: Path) -> Path:
    """A syntactically valid client-secrets file so the early guard passes."""
    path = tmp_path / "google_credentials.json"
    path.write_text(
        json.dumps(
            {
                "installed": {
                    "client_id": "test-client-id.apps.googleusercontent.com",
                    "client_secret": "test-secret",
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": ["http://localhost"],
                }
            }
        )
    )
    return path


@pytest.fixture
def missing_token(tmp_path: Path) -> Path:
    """Path to a token that does not exist -- the dead-token situation."""
    return tmp_path / "data" / "gmail_token.json"


class TestNonInteractiveGuard:
    """With the non-interactive flag set, never open a browser."""

    def test_raises_instead_of_starting_local_server(
        self, credentials_file: Path, missing_token: Path, monkeypatch
    ):
        from src.google_auth import NonInteractiveAuthRequired, get_google_service

        monkeypatch.setenv("CAREERPILOT_NONINTERACTIVE", "1")

        with patch("src.google_auth.InstalledAppFlow") as mock_flow:
            with pytest.raises(NonInteractiveAuthRequired):
                get_google_service(
                    api_name="gmail",
                    api_version="v1",
                    credentials_file=credentials_file,
                    token_path=missing_token,
                    scopes=SCOPES,
                )

        mock_flow.from_client_secrets_file.assert_not_called()
        mock_flow.return_value.run_local_server.assert_not_called()

    def test_never_opens_a_browser(
        self, credentials_file: Path, missing_token: Path, monkeypatch
    ):
        """The specific failure that hijacked the default Chrome profile."""
        from src.google_auth import NonInteractiveAuthRequired, get_google_service

        monkeypatch.setenv("CAREERPILOT_NONINTERACTIVE", "1")

        with patch("webbrowser.open") as mock_open:
            with patch("src.google_auth.InstalledAppFlow"):
                with pytest.raises(NonInteractiveAuthRequired):
                    get_google_service(
                        api_name="gmail",
                        api_version="v1",
                        credentials_file=credentials_file,
                        token_path=missing_token,
                        scopes=SCOPES,
                    )

        mock_open.assert_not_called()

    def test_error_names_the_token_path_and_how_to_recover(
        self, credentials_file: Path, missing_token: Path, monkeypatch
    ):
        """An operator reading the log must learn what to do next."""
        from src.google_auth import NonInteractiveAuthRequired, get_google_service

        monkeypatch.setenv("CAREERPILOT_NONINTERACTIVE", "1")

        with patch("src.google_auth.InstalledAppFlow"):
            with pytest.raises(NonInteractiveAuthRequired) as excinfo:
                get_google_service(
                    api_name="gmail",
                    api_version="v1",
                    credentials_file=credentials_file,
                    token_path=missing_token,
                    scopes=SCOPES,
                )

        message = str(excinfo.value)
        assert str(missing_token) in message
        assert "CAREERPILOT_NONINTERACTIVE" in message

    def test_dead_refresh_token_is_also_guarded(
        self, credentials_file: Path, tmp_path: Path, monkeypatch
    ):
        """The real incident shape: token file exists but refresh fails."""
        from src.google_auth import NonInteractiveAuthRequired, get_google_service

        token_path = tmp_path / "gmail_token.json"
        token_path.write_text(json.dumps({"refresh_token": "dead", "token": "x"}))
        monkeypatch.setenv("CAREERPILOT_NONINTERACTIVE", "1")

        stale = MagicMock(name="creds")
        stale.expired = True
        stale.refresh_token = "dead"
        stale.valid = False
        stale.refresh.side_effect = Exception("invalid_grant: Bad Request")

        with patch("src.google_auth.Credentials") as mock_creds:
            mock_creds.from_authorized_user_file.return_value = stale
            with patch("src.google_auth.InstalledAppFlow") as mock_flow:
                with pytest.raises(NonInteractiveAuthRequired):
                    get_google_service(
                        api_name="gmail",
                        api_version="v1",
                        credentials_file=credentials_file,
                        token_path=token_path,
                        scopes=SCOPES,
                    )

        mock_flow.from_client_secrets_file.assert_not_called()


class TestInteractiveStillWorks:
    """The guard must not break a human running the CLI at a terminal."""

    def test_flow_runs_when_explicitly_interactive(
        self, credentials_file: Path, missing_token: Path, monkeypatch
    ):
        from src.google_auth import get_google_service

        monkeypatch.setenv("CAREERPILOT_NONINTERACTIVE", "0")

        fresh = MagicMock(name="creds")
        fresh.valid = True
        fresh.to_json.return_value = '{"token": "new"}'

        with patch("src.google_auth.InstalledAppFlow") as mock_flow:
            mock_flow.from_client_secrets_file.return_value.run_local_server.return_value = fresh
            with patch("src.google_auth.build") as mock_build:
                result = get_google_service(
                    api_name="gmail",
                    api_version="v1",
                    credentials_file=credentials_file,
                    token_path=missing_token,
                    scopes=SCOPES,
                )

        mock_flow.from_client_secrets_file.return_value.run_local_server.assert_called_once()
        assert result is mock_build.return_value

    def test_valid_token_never_consults_the_guard(
        self, credentials_file: Path, tmp_path: Path, monkeypatch
    ):
        """A healthy token must work even in a scheduled task."""
        from src.google_auth import get_google_service

        token_path = tmp_path / "gmail_token.json"
        token_path.write_text(json.dumps({"refresh_token": "ok", "token": "x"}))
        monkeypatch.setenv("CAREERPILOT_NONINTERACTIVE", "1")

        good = MagicMock(name="creds")
        good.expired = False
        good.valid = True

        with patch("src.google_auth.Credentials") as mock_creds:
            mock_creds.from_authorized_user_file.return_value = good
            with patch("src.google_auth.build") as mock_build:
                result = get_google_service(
                    api_name="gmail",
                    api_version="v1",
                    credentials_file=credentials_file,
                    token_path=token_path,
                    scopes=SCOPES,
                )

        assert result is mock_build.return_value


class TestAutoDetection:
    """With no explicit flag, absence of a terminal implies non-interactive."""

    def test_no_tty_is_treated_as_non_interactive(
        self, credentials_file: Path, missing_token: Path, monkeypatch
    ):
        from src.google_auth import NonInteractiveAuthRequired, get_google_service

        monkeypatch.delenv("CAREERPILOT_NONINTERACTIVE", raising=False)

        with patch("src.google_auth.sys.stdin") as mock_stdin:
            mock_stdin.isatty.return_value = False
            with patch("src.google_auth.InstalledAppFlow") as mock_flow:
                with pytest.raises(NonInteractiveAuthRequired):
                    get_google_service(
                        api_name="gmail",
                        api_version="v1",
                        credentials_file=credentials_file,
                        token_path=missing_token,
                        scopes=SCOPES,
                    )

        mock_flow.from_client_secrets_file.assert_not_called()
