"""JSON schema validation — shim re-exporting from routing.schema (INFRA-244 Phase 3).

CareerPilot-local code that depends on this module continues to work unchanged.
Future contributors: prefer importing from routing.schema directly.
"""

from __future__ import annotations

from routing.schema import validate_against_schema  # noqa: F401
