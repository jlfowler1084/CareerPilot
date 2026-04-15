"""Failure handling — fallback budget, PII policy, error types, session detection."""

from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Infra-countable failure reasons — these count toward the daily fallback budget.
# ---------------------------------------------------------------------------

INFRA_COUNTABLE_REASONS = frozenset({
    "connection_error", "timeout", "http_5xx",
    "empty_response", "truncated_finish_reason", "json_parse_error",
})


class ProviderInfraError(Exception):
    """Raised when a provider fails due to infrastructure issues (timeout, connection, etc.)."""


class LocalEndpointSecurityError(Exception):
    """Raised when the local endpoint URL fails security validation."""


class SchemaValidationError(Exception):
    """Raised when the local provider returns JSON that fails schema validation."""


class FallbackBudgetExhausted(Exception):
    """Raised when the daily Claude fallback budget is exhausted."""


class FallbackBudget:
    """Tracks and enforces the daily Claude fallback budget."""

    def __init__(self, daily_limit: int = 50) -> None:
        self._limit = daily_limit

    def consume_slot(self, conn) -> None:
        """Check budget. Raises FallbackBudgetExhausted if at/over limit.

        MUST be called inside a BEGIN IMMEDIATE transaction — the check and
        subsequent write are atomic only within the same transaction.

        Raises:
            FallbackBudgetExhausted: If the daily budget is exhausted.
        """
        placeholders = ",".join("?" * len(INFRA_COUNTABLE_REASONS))
        count = conn.execute(
            f"SELECT COUNT(*) FROM llm_calls "
            f"WHERE provider_used='local' "
            f"AND fallback_reason IN ({placeholders}) "
            f"AND created_at > datetime('now','-24 hours') "
            f"AND created_at > COALESCE("
            f"  (SELECT last_reset_at FROM llm_budget_resets), '1970-01-01'"
            f")",
            tuple(INFRA_COUNTABLE_REASONS),
        ).fetchone()[0]
        if count >= self._limit:
            raise FallbackBudgetExhausted(
                f"Daily fallback budget exhausted: {count}/{self._limit} in last 24h"
            )


def is_interactive_session() -> bool:
    """Return True if running in an interactive terminal (not unattended/scheduled)."""
    import sys
    return (
        sys.stdin.isatty()
        and sys.stdout.isatty()
        and os.environ.get("CAREERPILOT_UNATTENDED") != "1"
    )


def prompt_for_pii_fallback(task: str) -> bool:
    """Prompt the user to approve sending PII-bearing task to Claude.

    Returns:
        True if approved, False if denied.
    """
    import click
    try:
        return click.confirm(
            f"Local provider failed for PII-bearing task '{task}'. Send to Claude?",
            default=False,
        )
    except (KeyboardInterrupt, EOFError):
        return False
