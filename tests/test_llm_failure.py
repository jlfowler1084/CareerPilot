"""Tests for failure handling — FallbackBudget, PII policy, session detection."""
from __future__ import annotations

import os
import sqlite3
from unittest.mock import MagicMock, patch

import pytest

from src.llm.failure import (
    INFRA_COUNTABLE_REASONS,
    FallbackBudget,
    FallbackBudgetExhausted,
    ProviderInfraError,
    SchemaValidationError,
    is_interactive_session,
    prompt_for_pii_fallback,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_conn():
    """In-memory SQLite with llm_calls + llm_budget_resets tables."""
    from src.db.models import SCHEMA_SQL
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA_SQL)
    conn.execute("INSERT INTO llm_budget_resets (last_reset_at) VALUES (datetime('now', '-1 year'))")
    conn.commit()
    return conn


def _insert_infra_fallback(conn, reason="connection_error", minutes_ago=0):
    """Insert an infra-countable fallback row into llm_calls."""
    conn.execute(
        "INSERT INTO llm_calls (task, provider_used, model, prompt, response, "
        "schema_invalid, pii_bearing, fallback_reason, created_at) "
        f"VALUES ('job_analyze','local','qwen','test','',0,0,?,datetime('now','-{minutes_ago} minutes'))",
        (reason,),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# FallbackBudget
# ---------------------------------------------------------------------------

class TestFallbackBudget:
    def test_fresh_db_has_zero_count(self):
        conn = _make_conn()
        # Should not raise — well under any limit
        FallbackBudget(daily_limit=5).consume_slot(conn)

    def test_raises_when_at_limit(self):
        conn = _make_conn()
        for _ in range(3):
            _insert_infra_fallback(conn)
        with pytest.raises(FallbackBudgetExhausted):
            FallbackBudget(daily_limit=3).consume_slot(conn)

    def test_does_not_raise_when_one_under_limit(self):
        conn = _make_conn()
        for _ in range(2):
            _insert_infra_fallback(conn)
        # 2 rows, limit=3 → should not raise
        FallbackBudget(daily_limit=3).consume_slot(conn)

    def test_budget_exhausted_rows_not_counted(self):
        """Rows with fallback_reason='fallback_budget_exhausted' are NOT counted."""
        conn = _make_conn()
        # Insert 3 real infra fallbacks and 10 bookkeeping rows
        for _ in range(3):
            _insert_infra_fallback(conn, "connection_error")
        for _ in range(10):
            _insert_infra_fallback(conn, "fallback_budget_exhausted")
        # Only 3 real infra rows — budget=5 should not raise
        FallbackBudget(daily_limit=5).consume_slot(conn)

    def test_rows_older_than_24h_not_counted(self):
        """Rows older than 24h do not count toward the budget."""
        conn = _make_conn()
        # Insert old rows (25 hours ago)
        conn.execute(
            "INSERT INTO llm_calls (task, provider_used, model, prompt, response, "
            "schema_invalid, pii_bearing, fallback_reason, created_at) "
            "VALUES ('job_analyze','local','qwen','','',0,0,'connection_error',datetime('now','-25 hours'))"
        )
        conn.commit()
        # Only that old row — should not count
        FallbackBudget(daily_limit=1).consume_slot(conn)

    def test_reset_clears_pre_reset_rows(self):
        """Rows before llm_budget_resets.last_reset_at are excluded."""
        conn = _make_conn()
        # Insert rows "in the past"
        for _ in range(5):
            conn.execute(
                "INSERT INTO llm_calls (task, provider_used, model, prompt, response, "
                "schema_invalid, pii_bearing, fallback_reason, created_at) "
                "VALUES ('job_analyze','local','qwen','','',0,0,'connection_error',datetime('now','-30 minutes'))"
            )
        conn.commit()
        # Now set reset to "now" — all pre-reset rows excluded
        conn.execute("UPDATE llm_budget_resets SET last_reset_at = datetime('now')")
        conn.commit()
        FallbackBudget(daily_limit=1).consume_slot(conn)  # should not raise


# ---------------------------------------------------------------------------
# Router infra fallback path (non-PII task, allow policy)
# ---------------------------------------------------------------------------

class TestRouterInfraFallbackNonPII:
    """test_infra_fallback_non_pii — matches the production error shape from Unit 3 smoke."""

    def _make_router(self):
        from src.llm.router import LLMRouter
        r = LLMRouter.__new__(LLMRouter)
        r._claude = MagicMock()
        r._local = MagicMock()
        return r

    def test_infra_fallback_writes_two_rows(self):
        """ProviderInfraError('connection_error') triggers two-row fallback to Claude."""
        router = self._make_router()
        conn = _make_conn()

        # Local fails with connection_error (exact shape from Unit 3 live smoke)
        router._local.complete.side_effect = ProviderInfraError("connection_error")
        # Claude succeeds
        from src.llm.providers.base import ProviderResponse
        router._claude.complete.return_value = ProviderResponse(
            raw_text='{"match_score": 8}', parsed={"match_score": 8},
            model="claude-sonnet-4-6", latency_ms=200,
        )

        with patch("src.llm.router.get_connection", return_value=conn):
            result = router.complete(task="job_analyze", prompt="Is this a good fit?")

        assert result == {"match_score": 8}
        rows = conn.execute(
            "SELECT provider_used, fallback_reason, schema_invalid FROM llm_calls ORDER BY id"
        ).fetchall()
        assert len(rows) == 2
        # Row 1: local failure
        assert rows[0][0] == "local"
        assert rows[0][1] == "connection_error"
        assert rows[0][2] == 0
        # Row 2: Claude success (fallback_reason=NULL because row 1 already records the cause)
        assert rows[1][0] == "claude"
        assert rows[1][1] is None
        assert rows[1][2] == 0

    def test_infra_fallback_atomic_on_crash_between_rows(self):
        """If an error occurs between row 1 and row 2 writes, neither row lands."""
        router = self._make_router()
        conn = _make_conn()

        router._local.complete.side_effect = ProviderInfraError("connection_error")
        # Claude raises an unexpected error mid-transaction
        router._claude.complete.side_effect = RuntimeError("unexpected crash")

        with patch("src.llm.router.get_connection", return_value=conn):
            with pytest.raises(RuntimeError, match="unexpected crash"):
                router.complete(task="job_analyze", prompt="test")

        # No rows should be committed (transaction rolled back)
        count = conn.execute("SELECT COUNT(*) FROM llm_calls").fetchone()[0]
        assert count == 0

    def test_budget_exhausted_writes_two_rows_and_raises(self):
        """When budget exhausted, row 2 has fallback_budget_exhausted and FallbackBudgetExhausted is raised."""
        router = self._make_router()
        conn = _make_conn()
        # Fill up the budget
        for _ in range(3):
            _insert_infra_fallback(conn)

        router._local.complete.side_effect = ProviderInfraError("connection_error")

        with patch("src.llm.router.get_connection", return_value=conn):
            with patch("src.llm.router.FallbackBudget") as MockBudget:
                mock_budget = MockBudget.return_value
                mock_budget.consume_slot.side_effect = FallbackBudgetExhausted("exhausted")
                with pytest.raises(FallbackBudgetExhausted):
                    router.complete(task="job_analyze", prompt="test")

        rows = conn.execute(
            "SELECT provider_used, fallback_reason FROM llm_calls "
            "WHERE fallback_reason IS NOT NULL OR provider_used='claude' ORDER BY id"
        ).fetchall()
        # Should have row 1 (local/connection_error) and row 2 (claude/fallback_budget_exhausted)
        local_row = [r for r in rows if r[0] == "local"]
        claude_row = [r for r in rows if r[0] == "claude"]
        assert local_row and local_row[0][1] == "connection_error"
        assert claude_row and claude_row[0][1] == "fallback_budget_exhausted"
        # Claude was NOT actually called
        router._claude.complete.assert_not_called()


# ---------------------------------------------------------------------------
# PII task fallback — unattended mode
# ---------------------------------------------------------------------------

class TestRouterPIIFallbackUnattended:
    def _make_router(self):
        from src.llm.router import LLMRouter
        r = LLMRouter.__new__(LLMRouter)
        r._claude = MagicMock()
        r._local = MagicMock()
        return r

    def test_pii_task_unattended_blocks_fallback(self):
        """PII-bearing task (email_classify) with UNATTENDED=1 writes pii_fallback_blocked and re-raises."""
        router = self._make_router()
        conn = _make_conn()
        router._local.complete.side_effect = ProviderInfraError("connection_error")

        with patch("src.llm.router.get_connection", return_value=conn):
            with patch.dict(os.environ, {"CAREERPILOT_UNATTENDED": "1"}):
                with pytest.raises(ProviderInfraError):
                    router.complete(task="email_classify", prompt="Hi candidate...")

        rows = conn.execute(
            "SELECT provider_used, fallback_reason FROM llm_calls ORDER BY id"
        ).fetchall()
        assert len(rows) == 2
        assert rows[0] == ("local", "connection_error")
        assert rows[1] == ("claude", "pii_fallback_blocked")
        # Claude was NOT actually called
        router._claude.complete.assert_not_called()


# ---------------------------------------------------------------------------
# Schema-fail branch
# ---------------------------------------------------------------------------

class TestRouterSchemaFail:
    def _make_router(self):
        from src.llm.router import LLMRouter
        r = LLMRouter.__new__(LLMRouter)
        r._claude = MagicMock()
        r._local = MagicMock()
        return r

    def test_schema_fail_writes_schema_invalid_row_and_claude_row(self):
        """SchemaValidationError: row 1 has schema_invalid=1, row 2 is Claude replacement."""
        router = self._make_router()
        conn = _make_conn()
        router._local.complete.side_effect = SchemaValidationError("missing required field")
        from src.llm.providers.base import ProviderResponse
        router._claude.complete.return_value = ProviderResponse(
            raw_text=str([{"skill": "Python", "category": "scripting", "level": "required"}]),
            parsed=[{"skill": "Python", "category": "scripting", "level": "required"}],
            model="claude-sonnet-4-6", latency_ms=300,
        )

        with patch("src.llm.router.get_connection", return_value=conn):
            result = router.complete(task="skill_extract", prompt="Job desc text")

        assert isinstance(result, list)
        rows = conn.execute(
            "SELECT provider_used, schema_invalid, fallback_reason FROM llm_calls ORDER BY id"
        ).fetchall()
        assert len(rows) == 2
        assert rows[0] == ("local", 1, None)  # schema_invalid=1, fallback_reason=NULL
        assert rows[1] == ("claude", 0, None)  # Claude replacement, fallback_reason=NULL


# ---------------------------------------------------------------------------
# Kill-switch and env override
# ---------------------------------------------------------------------------

class TestRouterKillSwitchAndOverride:
    def _make_router(self):
        from src.llm.router import LLMRouter
        r = LLMRouter.__new__(LLMRouter)
        r._claude = MagicMock()
        r._local = MagicMock()
        return r

    def test_kill_switch_routes_to_claude_one_row(self):
        """With LLM_KILL_SWITCH=True, routes to Claude and logs kill_switch."""
        router = self._make_router()
        conn = _make_conn()
        from src.llm.providers.base import ProviderResponse
        router._claude.complete.return_value = ProviderResponse(
            raw_text="roadmap text", parsed=None, model="claude-sonnet-4-6", latency_ms=100,
        )
        from config import settings as cfg_mod
        original = cfg_mod.LLM_KILL_SWITCH
        try:
            cfg_mod.LLM_KILL_SWITCH = True
            with patch("src.llm.router.get_connection", return_value=conn):
                result = router.complete(task="roadmap_generate", prompt="Give me a plan")
        finally:
            cfg_mod.LLM_KILL_SWITCH = original

        router._local.complete.assert_not_called()
        rows = conn.execute("SELECT provider_used, fallback_reason FROM llm_calls").fetchall()
        assert len(rows) == 1
        assert rows[0] == ("claude", "kill_switch")

    def test_env_override_email_classify_to_claude_one_row(self):
        """CAREERPILOT_LLM_TASK_EMAIL_CLASSIFY=claude: one row, fallback_reason=env_override."""
        router = self._make_router()
        conn = _make_conn()
        from src.llm.providers.base import ProviderResponse
        parsed = {"category": "recruiter_outreach", "company": "Acme", "role": "SRE", "urgency": "low", "summary": "x"}
        router._claude.complete.return_value = ProviderResponse(
            raw_text=str(parsed), parsed=parsed, model="claude-sonnet-4-6", latency_ms=150,
        )

        with patch("src.llm.router.get_connection", return_value=conn):
            with patch.dict(os.environ, {"CAREERPILOT_LLM_TASK_EMAIL_CLASSIFY": "claude-sonnet-4-6"}):
                result = router.complete(task="email_classify", prompt="Hi Joe...")

        router._local.complete.assert_not_called()
        rows = conn.execute("SELECT provider_used, fallback_reason FROM llm_calls").fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "claude"
        assert rows[0][1] == "env_override"
