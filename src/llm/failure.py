"""Failure handling — fallback budget, PII policy, error types, session detection."""

from __future__ import annotations

# Unit 4 implementation


class ProviderInfraError(Exception):
    """Raised when a provider fails due to infrastructure issues (timeout, connection, etc.)."""


class LocalEndpointSecurityError(Exception):
    """Raised when the local endpoint URL fails security validation."""


class FallbackBudgetExhausted(Exception):
    """Raised when the daily Claude fallback budget is exhausted."""


class FallbackBudget:
    """Tracks and enforces the daily Claude fallback budget."""

    def consume_slot(self, conn) -> None:
        """Attempt to consume one fallback slot.

        Raises:
            FallbackBudgetExhausted: If the budget is exhausted.
        """
        raise NotImplementedError("Unit 4 not yet implemented")


def is_interactive_session() -> bool:
    """Return True if running in an interactive terminal (not unattended/scheduled)."""
    raise NotImplementedError("Unit 4 not yet implemented")


def prompt_for_pii_fallback(task: str) -> bool:
    """Prompt the user to approve sending PII-bearing task to Claude.

    Returns:
        True if approved, False if denied.
    """
    raise NotImplementedError("Unit 4 not yet implemented")
