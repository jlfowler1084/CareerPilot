"""Tests for the `tracker add` CLI command (CAR-157)."""

from __future__ import annotations

from unittest.mock import patch

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


class TestCommandRegistration:
    def test_appears_in_tracker_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "--help"])
        assert result.exit_code == 0
        assert "add" in result.output

    def test_add_help_lists_flags(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add", "--help"])
        assert result.exit_code == 0
        for flag in ("--title", "--company", "--location", "--url",
                     "--description", "--status", "--notes"):
            assert flag in result.output


class TestNonInteractivePath:
    def test_creates_row_with_required_flags_only(self, cli_db):
        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "Platform Engineer",
            "--company", "Acme",
        ])
        assert result.exit_code == 0, result.output
        assert "Created application" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 1
            assert jobs[0]["title"] == "Platform Engineer"
            assert jobs[0]["company"] == "Acme"
            assert jobs[0]["source"] == "manual"
            assert jobs[0]["status"] == "interested"
        finally:
            t.close()

    def test_all_flags_persist_to_db(self, cli_db):
        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "Senior SRE",
            "--company", "Beta Inc",
            "--location", "Indianapolis, IN",
            "--url", "https://beta.com/jobs/42",
            "--description", "Full job description text.",
            "--status", "applied",
            "--notes", "Applied via recruiter email",
        ])
        assert result.exit_code == 0, result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 1
            j = jobs[0]
            assert j["title"] == "Senior SRE"
            assert j["company"] == "Beta Inc"
            assert j["location"] == "Indianapolis, IN"
            assert j["url"] == "https://beta.com/jobs/42"
            assert j["description"] == "Full job description text."
            assert j["status"] == "applied"
            assert j["notes"] == "Applied via recruiter email"
            assert j["source"] == "manual"
        finally:
            t.close()

    def test_source_is_manual(self, cli_db):
        """Regardless of other flags, source is always 'manual' for this command."""
        runner = CliRunner()
        runner.invoke(cli, ["tracker", "add", "--title", "X", "--company", "Y"])

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert t.get_all_jobs()[0]["source"] == "manual"
        finally:
            t.close()

    def test_default_status_is_interested(self, cli_db):
        runner = CliRunner()
        runner.invoke(cli, ["tracker", "add", "--title", "X", "--company", "Y"])

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert t.get_all_jobs()[0]["status"] == "interested"
        finally:
            t.close()

    def test_invalid_status_rejected(self, cli_db):
        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "X", "--company", "Y",
            "--status", "not_a_real_status",
        ])
        assert result.exit_code != 0
        # Click's Choice error lists valid options
        assert "not_a_real_status" in result.output or "Invalid value" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert len(t.get_all_jobs()) == 0
        finally:
            t.close()
