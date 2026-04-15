"""Tests for log_llm_call — PII truncation, SHA-256 hashing, column mapping."""
from __future__ import annotations

import hashlib
import sqlite3

import pytest

from src.llm.logging import log_llm_call


def _make_conn():
    from src.db.models import SCHEMA_SQL
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_SQL)
    conn.execute("INSERT INTO llm_budget_resets (last_reset_at) VALUES (datetime('now', '-1 year'))")
    conn.commit()
    return conn


class TestLogLlmCall:
    def test_non_pii_task_stores_full_prompt_up_to_16kb(self):
        conn = _make_conn()
        prompt = "x" * 20_000  # 20 KB
        row_id = log_llm_call(
            conn, task="job_analyze", provider_used="local", model="qwen",
            prompt=prompt, response_text="response",
        )
        conn.commit()
        row = conn.execute("SELECT * FROM llm_calls WHERE id=?", (row_id,)).fetchone()
        assert len(row["prompt"]) == 16384
        assert row["prompt_sha256"] is None
        assert row["pii_bearing"] == 0

    def test_pii_task_truncates_to_512_and_hashes(self):
        conn = _make_conn()
        prompt = "recruiter email content " * 100  # well over 512 chars
        sha = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        row_id = log_llm_call(
            conn, task="email_classify", provider_used="local", model="qwen",
            prompt=prompt, response_text="{}",
        )
        conn.commit()
        row = conn.execute("SELECT * FROM llm_calls WHERE id=?", (row_id,)).fetchone()
        assert len(row["prompt"]) == 512
        assert row["prompt_sha256"] == sha
        assert row["pii_bearing"] == 1

    def test_schema_invalid_flag_stored(self):
        conn = _make_conn()
        row_id = log_llm_call(
            conn, task="job_analyze", provider_used="local", model="qwen",
            prompt="test", response_text="bad json",
            schema_invalid=True,
        )
        conn.commit()
        row = conn.execute("SELECT schema_invalid FROM llm_calls WHERE id=?", (row_id,)).fetchone()
        assert row["schema_invalid"] == 1

    def test_fallback_reason_stored(self):
        conn = _make_conn()
        row_id = log_llm_call(
            conn, task="job_analyze", provider_used="local", model="qwen",
            prompt="test", response_text="",
            fallback_reason="connection_error",
        )
        conn.commit()
        row = conn.execute("SELECT fallback_reason FROM llm_calls WHERE id=?", (row_id,)).fetchone()
        assert row["fallback_reason"] == "connection_error"

    def test_does_not_commit(self):
        """log_llm_call must NOT commit — the caller manages the transaction.

        sqlite3.Connection.commit is a read-only C extension attribute and cannot
        be patched via setattr. We use a MagicMock connection instead, which lets
        us verify commit is never called while the INSERT succeeds on the mock.
        """
        from unittest.mock import MagicMock
        mock_conn = MagicMock()
        # execute() must return something with a lastrowid attribute
        mock_conn.execute.return_value.lastrowid = 99
        log_llm_call(
            mock_conn, task="job_analyze", provider_used="local", model="qwen",
            prompt="test", response_text="result",
        )
        mock_conn.commit.assert_not_called()

    def test_returns_row_id(self):
        conn = _make_conn()
        row_id = log_llm_call(
            conn, task="job_analyze", provider_used="claude", model="claude-sonnet-4-6",
            prompt="p", response_text="r",
        )
        conn.commit()
        assert isinstance(row_id, int)
        assert row_id > 0
