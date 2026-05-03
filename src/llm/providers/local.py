"""Local provider — shim re-exporting from routing.providers.local (INFRA-244 Phase 3).

CareerPilot-local code that depends on this module continues to work unchanged.
Future contributors: prefer importing from routing.providers.local directly.
"""

from __future__ import annotations

from routing.providers.local import LocalProvider, validate_endpoint_url  # noqa: F401
