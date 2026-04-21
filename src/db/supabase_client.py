"""Supabase Python client factory — CAR-164 (M1 of CAR-163 consolidation).

This module is the single source of Supabase client instances for the CLI.
It does NOT contain any business logic — porting `ApplicationTracker` and
other CLI data paths to Supabase happens in CAR-165 (M2) and downstream.

Auth strategy: (c.1) service-role key in .env
-----------------------------------------------
The CLI has no user-login flow. The dashboard authenticates via Supabase
Auth and relies on Row-Level Security; the CLI can't play that game without
a device-login or dedicated-user dance that isn't worth the complexity for
a single-user local tool. So the CLI uses the service-role key, which
bypasses RLS entirely.

Consequences of this choice:
- The CLI writes as "the server," not as a specific user. Inserts must
  explicitly set `user_id` when writing user-scoped rows (applications,
  contacts, etc.) — the client won't fill it in automatically the way the
  dashboard's session-bound client does.
- The service-role key is effectively DB superuser. Treat it like a root
  password. Never embed in client-side code. Never log the key's value.
- Alternatives considered and deferred: (c.2) device-login flow storing a
  refresh token locally; (c.3) a dedicated "CLI user" with a long-lived
  session. Both add UX friction without a user-visible benefit at this
  project's scale. See docs/brainstorms/CAR-163-application-entry-paths-
  consolidation-audit.md §3 for the full rationale.

Usage
-----
    from src.db.supabase_client import get_supabase_client

    client = get_supabase_client()
    rows = client.table("applications").select("id, title").limit(1).execute()
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from config import settings

if TYPE_CHECKING:
    from supabase import Client


class SupabaseNotConfiguredError(RuntimeError):
    """Raised when Supabase env vars are missing at client-creation time."""


@lru_cache(maxsize=1)
def get_supabase_client() -> "Client":
    """Return a process-wide singleton Supabase client.

    Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
    `config.settings` (which loads .env via python-dotenv). Raises
    `SupabaseNotConfiguredError` with remediation guidance if either is
    missing, rather than producing a client that fails opaquely on first
    use.

    The `@lru_cache(maxsize=1)` decorator gives us a lazy singleton: the
    client is built on first call and reused thereafter. Tests that need a
    fresh client (e.g., to rebind env vars) can call
    `get_supabase_client.cache_clear()`.

    Returns
    -------
    supabase.Client
        A configured Supabase client using the service-role key. All
        operations bypass RLS.

    Raises
    ------
    SupabaseNotConfiguredError
        If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is empty.
    """
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY

    missing = [name for name, value in (("SUPABASE_URL", url), ("SUPABASE_SERVICE_ROLE_KEY", key)) if not value]
    if missing:
        raise SupabaseNotConfiguredError(
            f"Missing Supabase env vars: {', '.join(missing)}. "
            "Copy .env.example → .env and fill in values from the Supabase "
            "dashboard (Project Settings → API). Service role key is the "
            "`service_role` secret, not the anon key."
        )

    from supabase import create_client

    return create_client(url, key)
