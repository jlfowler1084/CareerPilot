"""Abstract base classes — shim re-exporting from routing.providers.base (INFRA-244 Phase 3).

CareerPilot-local code that depends on this module continues to work unchanged.
Future contributors: prefer importing from routing.providers.base directly.
"""

from __future__ import annotations

from routing.providers.base import Provider, ProviderResponse  # noqa: F401
