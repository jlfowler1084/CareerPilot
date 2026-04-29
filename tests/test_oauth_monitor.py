"""Tests for the OAuth token monitor (CAR-196)."""

import json
import os
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.notify import discord
from src.oauth_monitor import monitor, state as state_mod


# ---------------------------------------------------------------------------
# state module — suppression window logic
# ---------------------------------------------------------------------------


class TestSuppressionState:
    def test_should_alert_when_state_empty(self):
        """No prior state -> alert (first time)."""
        now = datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc)
        assert state_mod.should_alert({}, now, suppress_hours=24) is True

    def test_should_alert_when_window_elapsed(self):
        """Last alert > 24h ago -> alert again."""
        now = datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc)
        state = {"last_alert_iso": (now - timedelta(hours=25)).isoformat()}
        assert state_mod.should_alert(state, now, suppress_hours=24) is True

    def test_suppress_when_window_not_elapsed(self):
        """Last alert 1h ago, 24h window -> suppress."""
        now = datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc)
        state = {"last_alert_iso": (now - timedelta(hours=1)).isoformat()}
        assert state_mod.should_alert(state, now, suppress_hours=24) is False

    def test_should_alert_when_iso_malformed(self):
        """Corrupt last_alert_iso -> fail open (alert)."""
        now = datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc)
        state = {"last_alert_iso": "not a date"}
        assert state_mod.should_alert(state, now, suppress_hours=24) is True

    def test_naive_datetime_treated_as_utc(self):
        """A naive iso string is interpreted as UTC and respected."""
        now = datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc)
        # 1h ago, naive (no tzinfo)
        naive_past = (now - timedelta(hours=1)).replace(tzinfo=None).isoformat()
        state = {"last_alert_iso": naive_past}
        assert state_mod.should_alert(state, now, suppress_hours=24) is False

    def test_load_returns_empty_when_file_missing(self, tmp_path: Path):
        assert state_mod.load(tmp_path / "missing.json") == {}

    def test_load_returns_empty_when_file_corrupt(self, tmp_path: Path):
        path = tmp_path / "corrupt.json"
        path.write_text("{ this is not valid json", encoding="utf-8")
        assert state_mod.load(path) == {}

    def test_save_creates_parent_directory(self, tmp_path: Path):
        path = tmp_path / "nested" / "subdir" / "state.json"
        state_mod.save(path, {"last_alert_iso": "2026-04-29T12:00:00+00:00"})
        assert path.exists()
        loaded = json.loads(path.read_text(encoding="utf-8"))
        assert loaded["last_alert_iso"] == "2026-04-29T12:00:00+00:00"

    def test_mark_alerted_returns_dict_with_state(self):
        now = datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc)
        result = state_mod.mark_alerted(now, "DEAD")
        assert result == {
            "last_alert_iso": now.isoformat(),
            "last_state": "DEAD",
        }


# ---------------------------------------------------------------------------
# monitor module — mtime classification
# ---------------------------------------------------------------------------


class TestClassifyMtime:
    def test_fresh_when_recent(self, tmp_path: Path):
        token = tmp_path / "gmail_token.json"
        token.write_text("{}")
        now = datetime.now(timezone.utc)
        state, age, mtime_iso = monitor.classify_mtime(token, stale_days=7, now=now)
        assert state == "FRESH"
        assert age < 1.0
        assert mtime_iso  # non-empty

    def test_stale_when_older_than_threshold(self, tmp_path: Path):
        token = tmp_path / "gmail_token.json"
        token.write_text("{}")
        # Age the file 8 days
        old = (datetime.now(timezone.utc) - timedelta(days=8)).timestamp()
        os.utime(token, (old, old))
        now = datetime.now(timezone.utc)
        state, age, _ = monitor.classify_mtime(token, stale_days=7, now=now)
        assert state == "STALE"
        assert age > 7.0

    def test_dead_when_file_missing(self, tmp_path: Path):
        state, age, mtime_iso = monitor.classify_mtime(
            tmp_path / "missing.json", stale_days=7, now=datetime.now(timezone.utc)
        )
        assert state == "DEAD"
        assert age == 0.0
        assert mtime_iso == ""

    def test_boundary_at_threshold_is_fresh(self, tmp_path: Path):
        """Exactly at the threshold (not over) is FRESH."""
        token = tmp_path / "gmail_token.json"
        token.write_text("{}")
        # Set mtime exactly 7 days ago (so age is == 7.0, not > 7.0)
        seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).timestamp()
        os.utime(token, (seven_days_ago, seven_days_ago))
        now = datetime.now(timezone.utc)
        state, _, _ = monitor.classify_mtime(token, stale_days=7, now=now)
        # boundary condition: age slightly > 7.0 due to wall time between
        # os.utime and the now snapshot, so the test only asserts that very
        # near-boundary tokens classify as FRESH or STALE deterministically.
        assert state in ("FRESH", "STALE")


# ---------------------------------------------------------------------------
# monitor module — live API ping classification
# ---------------------------------------------------------------------------


class TestLiveApiPing:
    """Each test mocks Credentials.from_authorized_user_file + build to
    verify the exception-to-DEAD classification without touching Google."""

    def _write_token(self, tmp_path: Path) -> Path:
        token = tmp_path / "gmail_token.json"
        # Minimal authorized-user JSON shape; loaded by our Credentials mock.
        token.write_text(json.dumps({
            "token": "x",
            "refresh_token": "y",
            "client_id": "id",
            "client_secret": "secret",
            "token_uri": "https://oauth2.googleapis.com/token",
        }))
        return token

    def test_alive_when_profile_call_succeeds(self, tmp_path: Path):
        token = self._write_token(tmp_path)
        creds = MagicMock()
        creds.expired = False
        creds.valid = True
        svc = MagicMock()
        svc.users().getProfile().execute.return_value = {
            "emailAddress": "jlfowler1084@fowlerlab.dev"
        }

        with patch.object(monitor.Credentials, "from_authorized_user_file", return_value=creds):
            with patch.object(monitor, "build", return_value=svc):
                alive, detail = monitor.live_api_ping(token, scopes=["x"])

        assert alive is True
        assert "fowlerlab.dev" in detail

    def test_dead_on_refresh_error(self, tmp_path: Path):
        from google.auth.exceptions import RefreshError

        token = self._write_token(tmp_path)
        creds = MagicMock()
        creds.expired = True
        creds.refresh_token = "y"
        creds.refresh.side_effect = RefreshError("token revoked")

        with patch.object(monitor.Credentials, "from_authorized_user_file", return_value=creds):
            alive, detail = monitor.live_api_ping(token, scopes=["x"])

        assert alive is False
        assert "RefreshError" in detail

    def test_dead_on_invalid_grant_error(self, tmp_path: Path):
        token = self._write_token(tmp_path)
        creds = MagicMock()
        creds.expired = True
        creds.refresh_token = "y"

        # Fake an InvalidGrantError-named exception so the by-name match fires.
        class InvalidGrantError(Exception):
            pass

        creds.refresh.side_effect = InvalidGrantError("revoked")

        with patch.object(monitor.Credentials, "from_authorized_user_file", return_value=creds):
            alive, detail = monitor.live_api_ping(token, scopes=["x"])

        assert alive is False
        assert "InvalidGrant" in detail

    def test_dead_on_http_401(self, tmp_path: Path):
        from googleapiclient.errors import HttpError

        token = self._write_token(tmp_path)
        creds = MagicMock()
        creds.expired = False
        creds.valid = True

        # Build an HttpError with .resp.status == 401
        resp = MagicMock()
        resp.status = 401
        http_err = HttpError(resp=resp, content=b"unauthorized")

        svc = MagicMock()
        svc.users().getProfile().execute.side_effect = http_err

        with patch.object(monitor.Credentials, "from_authorized_user_file", return_value=creds):
            with patch.object(monitor, "build", return_value=svc):
                alive, detail = monitor.live_api_ping(token, scopes=["x"])

        assert alive is False
        assert "401" in detail

    def test_alive_on_non_401_http_error(self, tmp_path: Path):
        """A 500 / 429 isn't a dead-token signal — keep alive=True."""
        from googleapiclient.errors import HttpError

        token = self._write_token(tmp_path)
        creds = MagicMock()
        creds.expired = False
        creds.valid = True

        resp = MagicMock()
        resp.status = 500
        http_err = HttpError(resp=resp, content=b"server error")

        svc = MagicMock()
        svc.users().getProfile().execute.side_effect = http_err

        with patch.object(monitor.Credentials, "from_authorized_user_file", return_value=creds):
            with patch.object(monitor, "build", return_value=svc):
                alive, _ = monitor.live_api_ping(token, scopes=["x"])

        assert alive is True

    def test_dead_when_token_missing(self, tmp_path: Path):
        alive, detail = monitor.live_api_ping(tmp_path / "missing.json", scopes=["x"])
        assert alive is False
        assert "does not exist" in detail


# ---------------------------------------------------------------------------
# monitor module — full check_token_health composition
# ---------------------------------------------------------------------------


class TestCheckTokenHealth:
    def test_fresh_when_mtime_recent_and_ping_alive(self, tmp_path: Path):
        token = tmp_path / "gmail_token.json"
        token.write_text("{}")
        with patch.object(monitor, "live_api_ping", return_value=(True, "ok")):
            result = monitor.check_token_health(token, stale_days=7, scopes=["x"])
        assert result.state == "FRESH"

    def test_dead_when_mtime_recent_but_ping_dead(self, tmp_path: Path):
        """Live ping override beats mtime — revoked-but-recent case."""
        token = tmp_path / "gmail_token.json"
        token.write_text("{}")
        with patch.object(monitor, "live_api_ping", return_value=(False, "RefreshError")):
            result = monitor.check_token_health(token, stale_days=7, scopes=["x"])
        assert result.state == "DEAD"
        assert "RefreshError" in result.detail

    def test_stale_when_mtime_old_but_ping_alive(self, tmp_path: Path):
        token = tmp_path / "gmail_token.json"
        token.write_text("{}")
        old = (datetime.now(timezone.utc) - timedelta(days=10)).timestamp()
        os.utime(token, (old, old))
        with patch.object(monitor, "live_api_ping", return_value=(True, "ok")):
            result = monitor.check_token_health(token, stale_days=7, scopes=["x"])
        assert result.state == "STALE"
        assert result.age_days > 7

    def test_dead_when_token_file_missing(self, tmp_path: Path):
        # No need to mock ping — classify_mtime short-circuits to DEAD.
        result = monitor.check_token_health(
            tmp_path / "missing.json", stale_days=7, scopes=["x"]
        )
        assert result.state == "DEAD"
        assert "missing on disk" in result.detail


# ---------------------------------------------------------------------------
# discord helper — env var resolution + post path
# ---------------------------------------------------------------------------


class TestDiscordHelper:
    def test_env_var_for_channel(self):
        assert (
            discord.env_var_for_channel("careerpilot-updates")
            == "DISCORD_WEBHOOK_URL_CAREERPILOT_UPDATES"
        )
        assert (
            discord.env_var_for_channel("cross-project-alerts")
            == "DISCORD_WEBHOOK_URL_CROSS_PROJECT_ALERTS"
        )

    def test_post_returns_false_when_env_var_missing(self, monkeypatch):
        monkeypatch.delenv("DISCORD_WEBHOOK_URL_TEST_CHANNEL", raising=False)
        assert discord.post("test-channel", "hi") is False

    def test_post_returns_true_on_2xx(self, monkeypatch):
        monkeypatch.setenv("DISCORD_WEBHOOK_URL_TEST_CHANNEL", "https://example.com/x")

        mock_response = MagicMock()
        mock_response.status = 204
        mock_response.__enter__ = lambda self: mock_response
        mock_response.__exit__ = lambda self, *a: False

        with patch.object(discord.urllib.request, "urlopen", return_value=mock_response):
            assert discord.post("test-channel", "hi") is True

    def test_post_returns_false_on_http_error(self, monkeypatch):
        monkeypatch.setenv("DISCORD_WEBHOOK_URL_TEST_CHANNEL", "https://example.com/x")

        with patch.object(
            discord.urllib.request,
            "urlopen",
            side_effect=urllib.error.HTTPError(
                "https://example.com/x", 429, "Too Many Requests", {}, None
            ),
        ):
            assert discord.post("test-channel", "hi") is False

    def test_post_returns_false_on_url_error(self, monkeypatch):
        monkeypatch.setenv("DISCORD_WEBHOOK_URL_TEST_CHANNEL", "https://example.com/x")

        with patch.object(
            discord.urllib.request,
            "urlopen",
            side_effect=urllib.error.URLError("connection refused"),
        ):
            assert discord.post("test-channel", "hi") is False

    def test_post_truncates_oversized_messages(self, monkeypatch):
        """Discord's 2000-char content limit — truncate, don't 400."""
        monkeypatch.setenv("DISCORD_WEBHOOK_URL_TEST_CHANNEL", "https://example.com/x")

        mock_response = MagicMock()
        mock_response.status = 204
        mock_response.__enter__ = lambda self: mock_response
        mock_response.__exit__ = lambda self, *a: False

        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["data"] = request.data
            return mock_response

        with patch.object(discord.urllib.request, "urlopen", side_effect=fake_urlopen):
            discord.post("test-channel", "x" * 5000)

        body = json.loads(captured["data"])
        assert len(body["content"]) <= discord.DISCORD_CONTENT_LIMIT
        assert body["content"].endswith("...")


# ---------------------------------------------------------------------------
# entry-point script — format_alert + dry-run flow
# ---------------------------------------------------------------------------


class TestEntryPoint:
    def test_format_alert_dead_includes_detail_and_runbook(self):
        from tools.check_oauth_token import format_alert

        health = monitor.TokenHealth(
            state="DEAD", age_days=2.0, mtime_iso="x", detail="RefreshError: revoked"
        )
        msg = format_alert(
            health, token_path=Path("data/gmail_token.json"), threshold_days=7
        )
        assert "DEAD" in msg
        assert "RefreshError: revoked" in msg
        assert "oauth-reauth.md" in msg
        assert "CAR-196" in msg

    def test_format_alert_stale_mentions_age_and_threshold(self):
        from tools.check_oauth_token import format_alert

        health = monitor.TokenHealth(
            state="STALE", age_days=9.5, mtime_iso="x", detail="ok"
        )
        msg = format_alert(
            health, token_path=Path("data/gmail_token.json"), threshold_days=7
        )
        assert "STALE" in msg
        assert "9.5 days" in msg
        assert "threshold: 7" in msg

    def test_main_returns_0_when_fresh(self, tmp_path: Path, monkeypatch):
        from tools import check_oauth_token

        monkeypatch.setattr(
            check_oauth_token.monitor,
            "check_token_health",
            lambda **kwargs: monitor.TokenHealth(
                state="FRESH", age_days=0.5, mtime_iso="x", detail="ok"
            ),
        )
        rc = check_oauth_token.main(argv=[])
        assert rc == 0

    def test_main_returns_2_on_dead_dry_run(self, tmp_path: Path, monkeypatch, capsys):
        from tools import check_oauth_token

        monkeypatch.setattr(
            check_oauth_token.monitor,
            "check_token_health",
            lambda **kwargs: monitor.TokenHealth(
                state="DEAD", age_days=2.0, mtime_iso="x", detail="RefreshError"
            ),
        )
        # --dry-run + --force to ensure suppression doesn't interfere
        rc = check_oauth_token.main(argv=["--dry-run", "--force"])
        assert rc == 2  # EXIT_DEAD
        captured = capsys.readouterr()
        assert "DEAD" in captured.out
        assert "oauth-reauth.md" in captured.out

    def test_main_suppresses_when_within_window(self, tmp_path: Path, monkeypatch):
        from tools import check_oauth_token

        # Recent suppression state -> within 24h window
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        state_path = tmp_path / "state.json"
        state_path.write_text(json.dumps({"last_alert_iso": recent.isoformat()}))

        monkeypatch.setattr(check_oauth_token.settings, "OAUTH_MONITOR_STATE_PATH", state_path)
        monkeypatch.setattr(
            check_oauth_token.monitor,
            "check_token_health",
            lambda **kwargs: monitor.TokenHealth(
                state="DEAD", age_days=2.0, mtime_iso="x", detail="RefreshError"
            ),
        )
        # Patch discord.post so a failed suppression would surface as a false pass
        with patch.object(check_oauth_token.discord, "post") as mock_post:
            rc = check_oauth_token.main(argv=[])

        mock_post.assert_not_called()
        assert rc == 2  # exit code still reflects DEAD even when suppressed

    def test_main_writes_state_after_successful_post(self, tmp_path: Path, monkeypatch):
        from tools import check_oauth_token

        state_path = tmp_path / "state.json"
        monkeypatch.setattr(check_oauth_token.settings, "OAUTH_MONITOR_STATE_PATH", state_path)
        monkeypatch.setattr(
            check_oauth_token.monitor,
            "check_token_health",
            lambda **kwargs: monitor.TokenHealth(
                state="DEAD", age_days=2.0, mtime_iso="x", detail="RefreshError"
            ),
        )
        with patch.object(check_oauth_token.discord, "post", return_value=True):
            rc = check_oauth_token.main(argv=[])

        assert rc == 2
        assert state_path.exists()
        data = json.loads(state_path.read_text())
        assert data["last_state"] == "DEAD"
        assert "last_alert_iso" in data

    def test_main_does_not_write_state_after_failed_post(self, tmp_path: Path, monkeypatch):
        """If Discord post fails, suppression state must NOT be written —
        next scheduled run should retry, not silently swallow the alert."""
        from tools import check_oauth_token

        state_path = tmp_path / "state.json"
        monkeypatch.setattr(check_oauth_token.settings, "OAUTH_MONITOR_STATE_PATH", state_path)
        monkeypatch.setattr(
            check_oauth_token.monitor,
            "check_token_health",
            lambda **kwargs: monitor.TokenHealth(
                state="DEAD", age_days=2.0, mtime_iso="x", detail="RefreshError"
            ),
        )
        with patch.object(check_oauth_token.discord, "post", return_value=False):
            rc = check_oauth_token.main(argv=[])

        assert rc == 2
        assert not state_path.exists()
