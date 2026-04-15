"""Unit 7 CLI smoke tests — llm-summary, llm-prune, llm-reset-budget, llm-embed-smoke."""

from __future__ import annotations

import sqlite3
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from cli import cli
from src.db.models import SCHEMA_SQL


class _NoCloseConn:
    """Thin proxy around a sqlite3.Connection that silently ignores close()."""

    def __init__(self, conn):
        self._conn = conn

    def close(self):
        pass  # no-op so the in-memory DB survives the CLI's finally block

    def __getattr__(self, name):
        return getattr(self._conn, name)


def _make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_SQL)
    conn.execute("INSERT INTO llm_budget_resets (last_reset_at, fallback_count_since_reset) VALUES (datetime('now'), 3)")
    conn.execute(
        "INSERT INTO llm_calls (task, provider_used, model, prompt, response, latency_ms, tokens_in, tokens_out) "
        "VALUES ('email_classify','local','qwen3','hi','ok',500,100,40)"
    )
    conn.execute(
        "INSERT INTO llm_calls (task, provider_used, model, prompt, response, latency_ms, tokens_in, tokens_out) "
        "VALUES ('roadmap_generate','claude','claude-sonnet-4-6','plan','result',8000,1200,600)"
    )
    conn.commit()
    return conn


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def mock_conn():
    return _NoCloseConn(_make_conn())


class TestLlmSummary:
    def test_shows_provider_rows(self, runner, mock_conn):
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "summary"])
        assert result.exit_code == 0
        assert "local" in result.output
        assert "claude" in result.output

    def test_shows_task_breakdown(self, runner, mock_conn):
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "summary"])
        assert result.exit_code == 0
        assert "email_classify" in result.output
        assert "roadmap_generate" in result.output

    def test_filter_by_task(self, runner, mock_conn):
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "summary", "--task", "email_classify"])
        assert result.exit_code == 0
        assert "email_classify" in result.output
        # task breakdown should be suppressed when filtering
        assert "roadmap_generate" not in result.output

    def test_shows_budget_status(self, runner, mock_conn):
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "summary"])
        assert result.exit_code == 0
        assert "budget" in result.output.lower()


class TestLlmPrune:
    def test_prune_with_yes_flag(self, runner, mock_conn):
        # Insert a row older than 30 days
        mock_conn.execute(
            "INSERT INTO llm_calls (task, provider_used, model, prompt, response, latency_ms, created_at) "
            "VALUES ('email_classify','local','qwen3','hi','ok',500,datetime('now','-31 days'))"
        )
        mock_conn.commit()
        before = mock_conn.execute("SELECT COUNT(*) FROM llm_calls").fetchone()[0]
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "prune", "--yes"])
        assert result.exit_code == 0
        assert "Pruned" in result.output
        after = mock_conn.execute("SELECT COUNT(*) FROM llm_calls").fetchone()[0]
        assert after == before - 1

    def test_prune_nothing_to_delete(self, runner, mock_conn):
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "prune", "--yes"])
        assert result.exit_code == 0
        assert "No rows" in result.output

    def test_prune_prompts_without_yes(self, runner, mock_conn):
        mock_conn.execute(
            "INSERT INTO llm_calls (task, provider_used, model, prompt, response, latency_ms, created_at) "
            "VALUES ('email_classify','local','qwen3','hi','ok',500,datetime('now','-31 days'))"
        )
        mock_conn.commit()
        with patch("src.db.models.get_connection", return_value=mock_conn):
            # Decline the prompt
            result = runner.invoke(cli, ["llm", "prune"], input="n\n")
        assert result.exit_code != 0  # aborted


class TestLlmResetBudget:
    def test_reset_with_yes_flag(self, runner, mock_conn):
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "reset-budget", "--yes"])
        assert result.exit_code == 0
        assert "reset" in result.output.lower()
        row = mock_conn.execute("SELECT fallback_count_since_reset FROM llm_budget_resets ORDER BY id DESC LIMIT 1").fetchone()
        assert row[0] == 0

    def test_reset_prompts_without_yes(self, runner, mock_conn):
        with patch("src.db.models.get_connection", return_value=mock_conn):
            result = runner.invoke(cli, ["llm", "reset-budget"], input="n\n")
        assert result.exit_code != 0  # aborted


class TestLlmEmbedSmoke:
    def test_success_prints_dim(self, runner):
        mock_router = MagicMock()
        mock_router.embed.return_value = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
        with patch("src.llm.router.router", mock_router):
            result = runner.invoke(cli, ["llm", "embed-smoke", "hello world"])
        assert result.exit_code == 0
        assert "dim=6" in result.output
        assert "OK" in result.output

    def test_failure_prints_fail(self, runner):
        mock_router = MagicMock()
        mock_router.embed.side_effect = ConnectionError("port 8001 unreachable")
        with patch("src.llm.router.router", mock_router):
            result = runner.invoke(cli, ["llm", "embed-smoke", "hello"])
        assert result.exit_code != 0
        assert "FAIL" in result.output
