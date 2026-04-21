"""Tests for src/db/supabase_client.py — CAR-164."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from src.db.supabase_client import (
    SupabaseNotConfiguredError,
    get_supabase_client,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Reset the singleton before and after each test."""
    get_supabase_client.cache_clear()
    yield
    get_supabase_client.cache_clear()


def test_missing_url_raises_configured_error(monkeypatch):
    monkeypatch.setattr("config.settings.SUPABASE_URL", "")
    monkeypatch.setattr(
        "config.settings.SUPABASE_SERVICE_ROLE_KEY", "dummy-key"
    )
    with pytest.raises(SupabaseNotConfiguredError) as exc:
        get_supabase_client()
    assert "SUPABASE_URL" in str(exc.value)


def test_missing_key_raises_configured_error(monkeypatch):
    monkeypatch.setattr(
        "config.settings.SUPABASE_URL", "https://example.supabase.co"
    )
    monkeypatch.setattr("config.settings.SUPABASE_SERVICE_ROLE_KEY", "")
    with pytest.raises(SupabaseNotConfiguredError) as exc:
        get_supabase_client()
    assert "SUPABASE_SERVICE_ROLE_KEY" in str(exc.value)


def test_missing_both_reports_both(monkeypatch):
    monkeypatch.setattr("config.settings.SUPABASE_URL", "")
    monkeypatch.setattr("config.settings.SUPABASE_SERVICE_ROLE_KEY", "")
    with pytest.raises(SupabaseNotConfiguredError) as exc:
        get_supabase_client()
    msg = str(exc.value)
    assert "SUPABASE_URL" in msg and "SUPABASE_SERVICE_ROLE_KEY" in msg


def test_factory_builds_client_with_valid_env(monkeypatch):
    """With valid env, factory calls supabase.create_client with the right args."""
    monkeypatch.setattr(
        "config.settings.SUPABASE_URL", "https://example.supabase.co"
    )
    monkeypatch.setattr(
        "config.settings.SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"
    )
    with patch("supabase.create_client") as mock_create:
        mock_create.return_value = object()  # sentinel
        client = get_supabase_client()
    mock_create.assert_called_once_with(
        "https://example.supabase.co", "test-service-role-key"
    )
    assert client is mock_create.return_value


def test_singleton_caches_across_calls(monkeypatch):
    monkeypatch.setattr(
        "config.settings.SUPABASE_URL", "https://example.supabase.co"
    )
    monkeypatch.setattr(
        "config.settings.SUPABASE_SERVICE_ROLE_KEY", "test-key"
    )
    with patch("supabase.create_client") as mock_create:
        mock_create.return_value = object()
        first = get_supabase_client()
        second = get_supabase_client()
    assert first is second
    assert mock_create.call_count == 1


# ---------------------------------------------------------------------------
# Integration smoke test — skipped unless real credentials are configured.
# Proves the client can actually reach Supabase (round-trip verification per
# CAR-164 acceptance criterion).
# ---------------------------------------------------------------------------
_REAL_URL = os.getenv("SUPABASE_URL", "")
_REAL_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


@pytest.mark.skipif(
    not (_REAL_URL and _REAL_KEY and "your-project" not in _REAL_URL),
    reason="Real SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping live smoke test",
)
def test_smoke_round_trip_against_applications_table():
    """Hit the applications table with a zero-row select to prove connectivity."""
    client = get_supabase_client()
    response = (
        client.table("applications").select("id").limit(1).execute()
    )
    # .execute() returns a response with a .data list; a successful query
    # returns a list (possibly empty). A 4xx would have raised.
    assert isinstance(response.data, list)
