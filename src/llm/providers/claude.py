"""Claude provider — shim re-exporting from routing.providers.claude (INFRA-244 Phase 3).

CareerPilot-local code that depends on this module continues to work unchanged.
Future contributors: prefer importing from routing.providers.claude directly.
"""

from __future__ import annotations

from routing.providers.claude import ClaudeProvider  # noqa: F401
