"""Conformance test adapter — runs INFRA-187 contract scenarios against the CareerPilot router."""

from __future__ import annotations

import glob
import os
import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import yaml

# ---------------------------------------------------------------------------
# Scenario catalog location
# ---------------------------------------------------------------------------

CLAUDEINFRA_ROOT = Path(os.getenv("CLAUDEINFRA_ROOT", "F:/Projects/ClaudeInfra"))
SCENARIO_DIR = (
    CLAUDEINFRA_ROOT
    / ".worktrees/INFRA-187-llm-routing-contract/configs/llm-routing/conformance/scenarios"
)


def load_runtime_scenarios():
    scenarios = []
    for path in sorted(glob.glob(str(SCENARIO_DIR / "*.yaml"))):
        with open(path) as f:
            scenario = yaml.safe_load(f)
        if scenario.get("test_type") == "runtime":
            scenarios.append(scenario)
    return scenarios


SCENARIOS = load_runtime_scenarios()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_conn():
    from src.db.models import SCHEMA_SQL

    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA_SQL)
    conn.execute(
        "INSERT INTO llm_budget_resets (last_reset_at) VALUES (datetime('now', '-1 year'))"
    )
    conn.commit()
    return conn


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_kill_switch():
    """Belt-and-suspenders: reset LLM_KILL_SWITCH after every conformance test.

    monkeypatch.setattr reverts module attributes within a test session, but
    cross-module attribute mutations can persist when test files share the
    same interpreter process (e.g., pytest test_llm_conformance.py followed
    by test_llm_router.py). This explicit teardown ensures the module-level
    constant is always restored regardless of monkeypatch cleanup order.
    """
    from config import settings as cfg_mod

    original = cfg_mod.LLM_KILL_SWITCH
    yield
    cfg_mod.LLM_KILL_SWITCH = original


# ---------------------------------------------------------------------------
# Parametrized conformance test
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["id"])
def test_conformance_scenario(scenario, monkeypatch):
    # 1. Apply env vars from scenario inputs
    for k, v in (scenario.get("inputs", {}).get("env") or {}).items():
        monkeypatch.setenv(k, str(v))

    # 2. Clear kill-switch vars not set by this scenario to prevent env leakage
    env_keys = set((scenario.get("inputs", {}).get("env") or {}).keys())
    for var in ["LLM_ROUTING_KILL_SWITCH", "CAREERPILOT_LLM_KILL_SWITCH"]:
        if var not in env_keys:
            monkeypatch.delenv(var, raising=False)

    # 3. Re-evaluate LLM_KILL_SWITCH after env changes
    import importlib

    from config import settings as cfg_mod

    kill_switch_val = (
        os.environ.get(
            "LLM_ROUTING_KILL_SWITCH",
            os.environ.get("CAREERPILOT_LLM_KILL_SWITCH", "0"),
        )
        == "1"
    )
    monkeypatch.setattr(cfg_mod, "LLM_KILL_SWITCH", kill_switch_val)

    # 4. Create fresh in-memory DB
    conn = make_conn()

    # 5. Pre-populate budget failures if scenario specifies infra_fail_count
    mock_behavior = scenario.get("inputs", {}).get("mock_behavior", {})
    infra_fail_count = mock_behavior.get("infra_fail_count", 0) or 0
    if infra_fail_count > 0:
        from src.llm.logging import log_llm_call

        for _ in range(infra_fail_count):
            log_llm_call(
                conn,
                task=scenario["inputs"]["task"],
                provider_used="local",
                model="test-model",
                prompt="x",
                response_text="",
                fallback_reason="timeout",
            )
        conn.commit()

    # 6. Create router with mock providers
    from src.llm.providers.base import ProviderResponse
    from src.llm.router import LLMRouter

    mock_claude = MagicMock()
    mock_local = MagicMock()

    router = LLMRouter.__new__(LLMRouter)
    router._claude = mock_claude
    router._local = mock_local

    # 7. Configure mock behavior
    local_behavior = mock_behavior.get("local", "success")
    task = scenario["inputs"]["task"]

    from config import settings

    task_cfg = settings.TASK_CONFIG[task]

    def _make_local_response():
        if task_cfg.get("schema"):
            if task == "job_analyze":
                parsed = {
                    "match_score": 7,
                    "matching_skills": [],
                    "gap_skills": [],
                    "resume_tweaks": [],
                    "red_flags": [],
                }
            else:
                parsed = {}
            return ProviderResponse(
                raw_text=str(parsed),
                parsed=parsed,
                model="qwen3.5-35b-a3b-fp8",
                latency_ms=100,
            )
        else:
            return ProviderResponse(
                raw_text="ok",
                parsed=None,
                model="qwen3.5-35b-a3b-fp8",
                latency_ms=100,
            )

    def _make_claude_response():
        if task_cfg.get("schema"):
            if task == "job_analyze":
                parsed = {
                    "match_score": 7,
                    "matching_skills": [],
                    "gap_skills": [],
                    "resume_tweaks": [],
                    "red_flags": [],
                }
            else:
                parsed = {}
            return ProviderResponse(
                raw_text=str(parsed),
                parsed=parsed,
                model="claude-sonnet-4-6",
                latency_ms=200,
            )
        else:
            return ProviderResponse(
                raw_text="claude result",
                parsed=None,
                model="claude-sonnet-4-6",
                latency_ms=200,
            )

    if local_behavior == "success":
        mock_local.complete.return_value = _make_local_response()
    elif local_behavior == "schema_fail":
        from src.llm.failure import SchemaValidationError

        mock_local.complete.side_effect = SchemaValidationError("schema mismatch")
    elif local_behavior.startswith("infra_fail:"):
        reason = local_behavior.split(":", 1)[1]
        from src.llm.failure import ProviderInfraError

        exc = ProviderInfraError(reason)
        exc.reason = reason
        mock_local.complete.side_effect = exc

    # Claude mock always succeeds
    mock_claude.complete.return_value = _make_claude_response()

    # 8. Run the scenario
    expected = scenario["expected"]
    prompt = scenario["inputs"]["prompt"]
    exception_expected = expected.get("exception")

    raised_exc = None
    with patch("src.llm.router.get_connection", return_value=conn):
        try:
            router.complete(task=task, prompt=prompt)
        except Exception as e:
            raised_exc = e

    # 9. Assert outcomes

    # Exception check
    if exception_expected:
        assert raised_exc is not None, (
            f"Expected {exception_expected} but no exception raised"
        )
        assert type(raised_exc).__name__ == exception_expected, (
            f"Expected {exception_expected}, got {type(raised_exc).__name__}: {raised_exc}"
        )
    else:
        assert raised_exc is None, (
            f"Unexpected exception: {type(raised_exc).__name__}: {raised_exc}"
        )

    # Fetch log rows
    rows = conn.execute("SELECT * FROM llm_calls ORDER BY id").fetchall()
    col_names = [d[1] for d in conn.execute("PRAGMA table_info(llm_calls)").fetchall()]

    def row_as_dict(row):
        return dict(zip(col_names, row))

    if "provider_used" in expected:
        assert rows, "Expected at least one log row but none found"
        last_row = row_as_dict(rows[-1])
        assert last_row["provider_used"] == expected["provider_used"], (
            f"provider_used: expected {expected['provider_used']}, "
            f"got {last_row['provider_used']}"
        )

    if "fallback_reason" in expected and "provider_used" in expected:
        last_row = row_as_dict(rows[-1])
        assert last_row["fallback_reason"] == expected["fallback_reason"], (
            f"fallback_reason: expected {expected['fallback_reason']}, "
            f"got {last_row['fallback_reason']}"
        )

    if "schema_invalid" in expected and "provider_used" in expected:
        last_row = row_as_dict(rows[-1])
        assert last_row["schema_invalid"] == expected["schema_invalid"], (
            f"schema_invalid: expected {expected['schema_invalid']}, "
            f"got {last_row['schema_invalid']}"
        )

    if "pii_bearing" in expected and "provider_used" in expected:
        last_row = row_as_dict(rows[-1])
        assert last_row["pii_bearing"] == expected["pii_bearing"], (
            f"pii_bearing: expected {expected['pii_bearing']}, "
            f"got {last_row['pii_bearing']}"
        )

    # PII field checks
    if expected.get("prompt_sha256_present") is True and rows:
        last_row = row_as_dict(rows[-1])
        assert last_row["prompt_sha256"] is not None, "Expected prompt_sha256 to be populated"
        assert last_row["response_sha256"] is not None, "Expected response_sha256 to be populated"

    if expected.get("prompt_sha256_present") is False and rows:
        last_row = row_as_dict(rows[-1])
        assert last_row["prompt_sha256"] is None, (
            f"Expected prompt_sha256 NULL, got {last_row['prompt_sha256']}"
        )

    if expected.get("prompt_truncated") is True and rows:
        last_row = row_as_dict(rows[-1])
        max_len = expected.get("prompt_max_length", 512)
        assert len(last_row["prompt"] or "") <= max_len, (
            f"Expected prompt truncated to {max_len}, got {len(last_row['prompt'] or '')}"
        )

    # Multi-row scenarios (schema_fail, infra_fail with budget)
    if "local_row" in expected:
        local_rows = [row_as_dict(r) for r in rows if row_as_dict(r)["provider_used"] == "local"]
        assert local_rows, "Expected local row but none found"
        lr = local_rows[-1]
        for field, val in (expected.get("local_row") or {}).items():
            assert lr[field] == val, (
                f"local_row.{field}: expected {val}, got {lr[field]}"
            )

    if "claude_row" in expected:
        claude_rows = [
            row_as_dict(r) for r in rows if row_as_dict(r)["provider_used"] == "claude"
        ]
        assert claude_rows, "Expected claude row but none found"
        cr = claude_rows[-1]
        for field, val in (expected.get("claude_row") or {}).items():
            assert cr[field] == val, (
                f"claude_row.{field}: expected {val}, got {cr[field]}"
            )

    # Budget consumed check
    if "budget_consumed" in expected:
        from src.llm.failure import INFRA_COUNTABLE_REASONS

        local_fail_count = conn.execute(
            "SELECT COUNT(*) FROM llm_calls WHERE provider_used='local' AND fallback_reason IN ({})".format(
                ",".join("?" * len(INFRA_COUNTABLE_REASONS))
            ),
            tuple(INFRA_COUNTABLE_REASONS),
        ).fetchone()[0]

        if expected["budget_consumed"]:
            assert local_fail_count > infra_fail_count, (
                f"Expected budget slot consumed but count didn't increase from {infra_fail_count}"
            )
        else:
            assert local_fail_count == infra_fail_count, (
                f"Expected budget NOT consumed but count changed: "
                f"{local_fail_count} vs {infra_fail_count}"
            )
