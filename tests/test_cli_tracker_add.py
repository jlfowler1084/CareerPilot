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
