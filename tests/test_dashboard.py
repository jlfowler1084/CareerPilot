"""Tests for Phase 6: dashboard, morning scan, daily summary, status, quick entry."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.db import models


# --- KV Store Tests ---


class TestKVStore:
    def test_set_and_get(self, tmp_path):
        """Sets and retrieves a key-value pair."""
        conn = models.get_connection(tmp_path / "test.db")
        models.set_kv(conn, "test_key", "test_value")
        assert models.get_kv(conn, "test_key") == "test_value"
        conn.close()

    def test_get_missing_returns_none(self, tmp_path):
        """Returns None for missing key."""
        conn = models.get_connection(tmp_path / "test.db")
        assert models.get_kv(conn, "nonexistent") is None
        conn.close()

    def test_upsert(self, tmp_path):
        """Overwrites existing value on second set."""
        conn = models.get_connection(tmp_path / "test.db")
        models.set_kv(conn, "key", "first")
        models.set_kv(conn, "key", "second")
        assert models.get_kv(conn, "key") == "second"
        conn.close()


# --- Helpers ---


def _mock_claude_response(text):
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = text
    mock_response.content = [mock_content]
    return mock_response


def _run_cli(args, input_text=None):
    """Run a CLI command with Click's test runner."""
    from click.testing import CliRunner
    from cli import cli

    runner = CliRunner()
    return runner.invoke(cli, args, input=input_text, catch_exceptions=False)


# --- Morning Scan Tests ---


class TestMorningScan:
    def test_morning_handles_gmail_failure(self):
        """Morning scan continues when Gmail auth fails."""
        with patch("src.gmail.scanner.GmailScanner.authenticate", side_effect=Exception("no auth")):
            with patch("src.gmail.auth.get_default_gmail_service", side_effect=Exception("no auth")):
                with patch("src.jobs.searcher.JobSearcher.run_profiles", side_effect=Exception("no MCP")):
                    with patch("src.db.models.get_connection") as mock_conn_fn:
                        mock_conn = MagicMock()
                        mock_conn_fn.return_value = mock_conn
                        result = _run_cli(["morning"])

        assert result.exit_code == 0
        assert "Gmail scan skipped" in result.output

    def test_morning_handles_mcp_failure(self):
        """Morning scan continues when MCP search fails."""
        with patch("src.gmail.scanner.GmailScanner.authenticate", side_effect=Exception("no auth")):
            with patch("src.gmail.auth.get_default_gmail_service", side_effect=Exception("no auth")):
                with patch("src.jobs.searcher.JobSearcher.run_profiles", side_effect=Exception("no MCP")):
                    with patch("src.db.models.get_connection") as mock_conn_fn:
                        mock_conn = MagicMock()
                        mock_conn_fn.return_value = mock_conn
                        result = _run_cli(["morning"])

        assert result.exit_code == 0
        assert "Job search skipped" in result.output


# --- Daily Summary Tests ---


class TestDailySummary:
    def test_daily_with_activity(self):
        """Daily summary works with journal entries present."""
        today = datetime.now().strftime("%Y-%m-%d")
        mock_response = _mock_claude_response(
            "You made progress today. 3 priorities:\n"
            "1. Follow up on applications\n"
            "2. Study Docker basics\n"
            "3. Practice STAR format"
        )

        with patch("src.journal.entries.JournalManager.list_entries") as mock_list:
            mock_list.return_value = [
                {"date": today, "type": "daily", "filename": "test.md",
                 "tags": [], "mood": "", "time_spent_minutes": ""}
            ]
            with patch("anthropic.Anthropic") as MockCls:
                mock_client = MagicMock()
                mock_client.messages.create.return_value = mock_response
                MockCls.return_value = mock_client

                with patch("src.db.models.get_connection") as mock_conn_fn:
                    mock_conn = MagicMock()
                    mock_conn_fn.return_value = mock_conn
                    with patch("src.db.models.get_skill_log", return_value=[]):
                        result = _run_cli(["daily"])

        assert result.exit_code == 0
        assert "Daily Summary" in result.output

    def test_daily_with_no_activity(self):
        """Daily summary handles no activity gracefully."""
        mock_response = _mock_claude_response(
            "No activity today. Focus on submitting applications."
        )

        with patch("src.journal.entries.JournalManager.list_entries") as mock_list:
            mock_list.return_value = []
            with patch("anthropic.Anthropic") as MockCls:
                mock_client = MagicMock()
                mock_client.messages.create.return_value = mock_response
                MockCls.return_value = mock_client

                with patch("src.db.models.get_connection") as mock_conn_fn:
                    mock_conn = MagicMock()
                    mock_conn_fn.return_value = mock_conn
                    with patch("src.db.models.get_skill_log", return_value=[]):
                        result = _run_cli(["daily"])

        assert result.exit_code == 0
        assert "Daily Summary" in result.output


# --- Status Command Tests ---


class TestStatusCommand:
    def test_status_empty_state(self):
        """Status command works with empty database."""
        with patch("src.journal.entries.JournalManager.list_entries", return_value=[]):
            with patch("src.jobs.tracker.ApplicationTracker.get_stats") as mock_stats:
                mock_stats.return_value = {
                    "total": 0, "by_status": {},
                    "applied_count": 0, "responded_count": 0,
                    "response_rate": 0.0, "avg_days_to_response": 0.0,
                }
                with patch("src.jobs.tracker.ApplicationTracker.close"):
                    with patch("src.db.models.get_connection") as mock_conn_fn:
                        mock_conn = MagicMock()
                        mock_conn_fn.return_value = mock_conn
                        with patch("src.db.models.get_gaps", return_value=[]):
                            with patch("src.calendar.scheduler.CalendarScheduler.authenticate",
                                       side_effect=Exception("no auth")):
                                result = _run_cli(["status"])

        assert result.exit_code == 0
        assert "CareerPilot Status" in result.output

    def test_status_with_data(self):
        """Status command shows populated data."""
        today = datetime.now().strftime("%Y-%m-%d")

        with patch("src.journal.entries.JournalManager.list_entries") as mock_list:
            mock_list.return_value = [
                {"date": today, "type": "daily", "filename": "a.md",
                 "tags": [], "mood": "", "time_spent_minutes": ""},
                {"date": today, "type": "study", "filename": "b.md",
                 "tags": [], "mood": "", "time_spent_minutes": ""},
            ]
            with patch("src.jobs.tracker.ApplicationTracker.get_stats") as mock_stats:
                mock_stats.return_value = {
                    "total": 10,
                    "by_status": {"applied": 3, "interview": 1, "phone_screen": 1, "offer": 0},
                    "applied_count": 3, "responded_count": 2,
                    "response_rate": 66.7, "avg_days_to_response": 5.0,
                }
                with patch("src.jobs.tracker.ApplicationTracker.close"):
                    with patch("src.db.models.get_connection") as mock_conn_fn:
                        mock_conn = MagicMock()
                        mock_conn_fn.return_value = mock_conn
                        with patch("src.db.models.get_gaps", return_value=[{"name": "Docker"}, {"name": "K8s"}]):
                            with patch("src.calendar.scheduler.CalendarScheduler.authenticate",
                                       side_effect=Exception("no auth")):
                                result = _run_cli(["status"])

        assert result.exit_code == 0
        assert "CareerPilot Status" in result.output
        assert "2" in result.output  # 2 journal entries or 2 skill gaps


# --- Quick Entry Tests ---


class TestQuickEntry:
    def _mock_console_input(self, lines):
        """Return a side_effect function that feeds lines to console.input()."""
        iterator = iter(lines)
        def fake_input(prompt=""):
            return next(iterator)
        return fake_input

    def test_quick_creates_entry(self):
        """Quick command creates a journal entry."""
        with patch("src.journal.entries.JournalManager.create_entry") as mock_create:
            mock_create.return_value = "2026-03-24_daily_001.md"
            with patch("cli.console.input", side_effect=self._mock_console_input(
                ["Today I studied Docker.", "", ""]
            )):
                result = _run_cli(["quick"])

        assert result.exit_code == 0
        assert "Saved" in result.output
        mock_create.assert_called_once()

    def test_quick_empty_cancels(self):
        """Quick command cancels on empty input."""
        with patch("cli.console.input", side_effect=self._mock_console_input(["", ""])):
            result = _run_cli(["quick"])

        assert result.exit_code == 0
        assert "cancelled" in result.output.lower() or "Empty" in result.output

    def test_quick_custom_type(self):
        """Quick command accepts custom entry type."""
        with patch("src.journal.entries.JournalManager.create_entry") as mock_create:
            mock_create.return_value = "2026-03-24_study_001.md"
            with patch("cli.console.input", side_effect=self._mock_console_input(
                ["Studied Kubernetes.", "", ""]
            )):
                result = _run_cli(["quick", "--type", "study"])

        assert result.exit_code == 0
        assert "Saved" in result.output
        mock_create.assert_called_once()
        call_args = mock_create.call_args
        assert call_args[0][0] == "study"
