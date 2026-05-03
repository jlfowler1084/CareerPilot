"""Failure handling — shim re-exporting from routing.failure (INFRA-244 Phase 3).

CareerPilot-local code that depends on this module continues to work unchanged.
Future contributors: prefer importing from routing.failure directly.
"""

from __future__ import annotations

# noqa: F401 — all re-exports are public API consumed by src/llm/router.py and tests
from routing.failure import (  # noqa: F401
    INFRA_COUNTABLE_REASONS,
    FallbackBudget,
    FallbackBudgetExhausted,
    LocalEndpointSecurityError,
    ProviderInfraError,
    SchemaValidationError,
    is_interactive_session,
    prompt_for_pii_fallback,
)
