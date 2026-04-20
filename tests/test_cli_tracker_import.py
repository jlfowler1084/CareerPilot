"""Tests for the `tracker import-from-email` CLI command (CAR-156)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from cli import cli
from src.db import models
from src.jobs.tracker import ApplicationTracker


@pytest.fixture
def cli_db(tmp_path, monkeypatch):
    """Point settings.DB_PATH at a temp DB so CLI commands write there."""
    db_path = tmp_path / "cli_test.db"
    monkeypatch.setattr(models.settings, "DB_PATH", db_path)
    # Pre-create schema so direct assertions can open the DB
    c = models.get_connection(db_path)
    c.close()
    return db_path


def _fake_extract_result(**overrides):
    result = {
        "title": "Senior Infrastructure Engineer",
        "company": "Acme Corp",
        "description": "Full job description text goes here.\nResponsibilities...",
        "filename": "jd.docx",
        "mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "sender": "sarah@acme.com",
    }
    result.update(overrides)
    return result


# --- Help registration --------------------------------------------------------


class TestCommandRegistration:
    def test_appears_in_tracker_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "--help"])
        assert result.exit_code == 0
        assert "import-from-email" in result.output


# --- Happy path ---------------------------------------------------------------


class TestImportFromEmailHappyPath:
    @patch("src.gmail.attachments.extract_job_description_from_email")
    @patch("src.gmail.auth.get_gmail_service")
    def test_creates_application(self, mock_auth, mock_extract, cli_db):
        mock_auth.return_value = MagicMock()
        mock_extract.return_value = _fake_extract_result()

        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "import-from-email", "msg_abc123"])
        assert result.exit_code == 0, result.output
        assert "Created application" in result.output

        # Verify DB
        tracker = ApplicationTracker(db_path=cli_db)
        try:
            row = tracker.find_application_by_message_id("msg_abc123")
            assert row is not None
            assert row["title"] == "Senior Infrastructure Engineer"
            assert row["company"] == "Acme Corp"
            assert row["source"] == "email_import"
            assert row["status"] == "found"
            assert "Full job description" in row["description"]
        finally:
            tracker.close()

    @patch("src.gmail.attachments.extract_job_description_from_email")
    @patch("src.gmail.auth.get_gmail_service")
    def test_status_flag_persists(self, mock_auth, mock_extract, cli_db):
        mock_auth.return_value = MagicMock()
        mock_extract.return_value = _fake_extract_result()

        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["tracker", "import-from-email", "msg_1", "--status", "interested"],
        )
        assert result.exit_code == 0, result.output

        tracker = ApplicationTracker(db_path=cli_db)
        try:
            row = tracker.find_application_by_message_id("msg_1")
            assert row["status"] == "interested"
        finally:
            tracker.close()

    @patch("src.gmail.attachments.extract_job_description_from_email")
    @patch("src.gmail.auth.get_gmail_service")
    def test_fallback_placeholders_for_missing_title_company(
        self, mock_auth, mock_extract, cli_db
    ):
        """Low-confidence parsing yields None fields — command uses placeholders."""
        mock_auth.return_value = MagicMock()
        mock_extract.return_value = _fake_extract_result(title=None, company=None)

        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "import-from-email", "msg_2"])
        assert result.exit_code == 0, result.output

        tracker = ApplicationTracker(db_path=cli_db)
        try:
            row = tracker.find_application_by_message_id("msg_2")
            assert row["title"] == "(untitled)"
            assert row["company"] == "(unknown)"
        finally:
            tracker.close()


# --- Dry run ------------------------------------------------------------------


class TestDryRun:
    @patch("src.gmail.attachments.extract_job_description_from_email")
    @patch("src.gmail.auth.get_gmail_service")
    def test_dry_run_does_not_save(self, mock_auth, mock_extract, cli_db):
        mock_auth.return_value = MagicMock()
        mock_extract.return_value = _fake_extract_result()

        runner = CliRunner()
        result = runner.invoke(
            cli, ["tracker", "import-from-email", "msg_dry", "--dry-run"],
        )
        assert result.exit_code == 0, result.output
        assert "not saving" in result.output.lower()

        tracker = ApplicationTracker(db_path=cli_db)
        try:
            assert tracker.find_application_by_message_id("msg_dry") is None
        finally:
            tracker.close()


# --- Dedupe -------------------------------------------------------------------


class TestDedupe:
    @patch("src.gmail.attachments.extract_job_description_from_email")
    @patch("src.gmail.auth.get_gmail_service")
    def test_second_invocation_shows_existing_no_duplicate(
        self, mock_auth, mock_extract, cli_db
    ):
        mock_auth.return_value = MagicMock()
        mock_extract.return_value = _fake_extract_result()

        runner = CliRunner()
        # First call creates
        r1 = runner.invoke(cli, ["tracker", "import-from-email", "msg_dup"])
        assert r1.exit_code == 0, r1.output

        # Second call hits dedupe branch
        r2 = runner.invoke(cli, ["tracker", "import-from-email", "msg_dup"])
        assert r2.exit_code == 0, r2.output
        assert "already imported" in r2.output

        # Exactly one row
        tracker = ApplicationTracker(db_path=cli_db)
        try:
            stats = tracker.get_stats()
            assert stats["total"] == 1
        finally:
            tracker.close()


# --- Error paths --------------------------------------------------------------


class TestErrorPaths:
    @patch("src.gmail.attachments.extract_job_description_from_email")
    @patch("src.gmail.auth.get_gmail_service")
    def test_no_attachment_exits_nonzero(self, mock_auth, mock_extract, cli_db):
        mock_auth.return_value = MagicMock()
        mock_extract.return_value = None  # Simulates no supported attachment

        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "import-from-email", "msg_noatt"])
        assert result.exit_code != 0
        assert "No supported attachment" in result.output

    def test_invalid_status_rejected_by_click(self, cli_db):
        """click.Choice on --status rejects unknown values before the command body runs."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["tracker", "import-from-email", "msg_x", "--status", "garbage_status"],
        )
        assert result.exit_code != 0
        assert "garbage_status" in result.output or "Invalid value" in result.output

    @patch("src.gmail.auth.get_gmail_service")
    def test_missing_credentials_file_exits_nonzero(self, mock_auth, cli_db):
        """FileNotFoundError from auth surfaces as Abort with the message printed."""
        mock_auth.side_effect = FileNotFoundError("credentials.json not found")

        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "import-from-email", "msg_noauth"])
        assert result.exit_code != 0
        assert "credentials.json not found" in result.output
