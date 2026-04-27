"""Unit tests for src.jobs.enrichment.enrich_row — CAR-188 Unit 5.

Coverage:
- Happy path: Dice listing with non-empty summary → update_enrichment called, returns True.
- Edge: Dice listing with empty summary → returns False, update_enrichment not called.
- Edge: Dice listing with None summary → returns False, update_enrichment not called.
- Edge: Missing _row_id → logs warning, returns False, update_enrichment not called.
- Indeed source → returns False, logs deferred message.
- Unknown source → returns False, logs warning.
- manager.update_enrichment raises → enrich_row catches, returns False (no propagation).
"""

from __future__ import annotations

import logging
from typing import Any, Dict
from unittest.mock import MagicMock, call

import pytest

from src.jobs.enrichment import enrich_row


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_listing(**kwargs) -> Dict[str, Any]:
    """Return a minimal Dice listing dict with a valid _row_id, with overrides."""
    base: Dict[str, Any] = {
        "source": "dice",
        "source_id": "abc-123",
        "_row_id": "row-uuid-0001",
        "summary": "A great system admin role with Linux and Windows experience.",
    }
    base.update(kwargs)
    return base


def _make_manager(**kwargs) -> MagicMock:
    """Return a MagicMock manager whose update_enrichment returns None by default."""
    mock = MagicMock()
    mock.update_enrichment.return_value = None
    for attr, val in kwargs.items():
        setattr(mock, attr, val)
    return mock


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestEnrichRowHappyPath:

    def test_dice_with_summary_calls_update_enrichment_and_returns_true(self):
        """Dice listing with non-empty summary → update_enrichment called, returns True."""
        listing = _make_listing()
        manager = _make_manager()

        result = enrich_row(listing, manager)

        assert result is True
        manager.update_enrichment.assert_called_once_with(
            row_id="row-uuid-0001",
            description="A great system admin role with Linux and Windows experience.",
            requirements=None,
            nice_to_haves=None,
        )

    def test_dice_description_is_exact_summary_text(self):
        """The description passed to update_enrichment must equal the summary exactly."""
        summary_text = "Senior SysAdmin, contract, Indianapolis. Python and Linux required."
        listing = _make_listing(summary=summary_text)
        manager = _make_manager()

        enrich_row(listing, manager)

        _, kwargs = manager.update_enrichment.call_args
        assert kwargs["description"] == summary_text

    def test_dice_requirements_and_nice_to_haves_are_none(self):
        """v1 enrichment does not populate requirements or nice_to_haves."""
        listing = _make_listing()
        manager = _make_manager()

        enrich_row(listing, manager)

        _, kwargs = manager.update_enrichment.call_args
        assert kwargs["requirements"] is None
        assert kwargs["nice_to_haves"] is None


# ---------------------------------------------------------------------------
# Empty / missing summary edge cases
# ---------------------------------------------------------------------------


class TestEnrichRowEmptySummary:

    def test_empty_string_summary_returns_false(self):
        """Empty string summary → returns False, update_enrichment not called."""
        listing = _make_listing(summary="")
        manager = _make_manager()

        result = enrich_row(listing, manager)

        assert result is False
        manager.update_enrichment.assert_not_called()

    def test_none_summary_returns_false(self):
        """None summary → returns False, update_enrichment not called."""
        listing = _make_listing(summary=None)
        manager = _make_manager()

        result = enrich_row(listing, manager)

        assert result is False
        manager.update_enrichment.assert_not_called()

    def test_missing_summary_key_returns_false(self):
        """summary key absent entirely → returns False, update_enrichment not called."""
        listing = {
            "source": "dice",
            "source_id": "no-summary",
            "_row_id": "row-uuid-0002",
        }
        manager = _make_manager()

        result = enrich_row(listing, manager)

        assert result is False
        manager.update_enrichment.assert_not_called()


# ---------------------------------------------------------------------------
# Missing _row_id
# ---------------------------------------------------------------------------


class TestEnrichRowMissingRowId:

    def test_missing_row_id_returns_false(self, caplog):
        """_row_id absent → logs warning, returns False."""
        listing = {
            "source": "dice",
            "source_id": "abc-no-row-id",
            "summary": "Some summary text",
        }
        manager = _make_manager()

        with caplog.at_level(logging.WARNING, logger="src.jobs.enrichment"):
            result = enrich_row(listing, manager)

        assert result is False
        manager.update_enrichment.assert_not_called()
        assert any("_row_id" in r.message for r in caplog.records)

    def test_none_row_id_returns_false(self):
        """_row_id=None → returns False."""
        listing = _make_listing(_row_id=None)
        manager = _make_manager()

        result = enrich_row(listing, manager)

        assert result is False
        manager.update_enrichment.assert_not_called()

    def test_empty_string_row_id_returns_false(self):
        """_row_id='' → returns False (falsy guard)."""
        listing = _make_listing(_row_id="")
        manager = _make_manager()

        result = enrich_row(listing, manager)

        assert result is False
        manager.update_enrichment.assert_not_called()


# ---------------------------------------------------------------------------
# Indeed source (deferred)
# ---------------------------------------------------------------------------


class TestEnrichRowIndeedDeferred:

    def test_indeed_source_returns_false(self):
        """Indeed listing → returns False."""
        listing = _make_listing(source="indeed", summary="Big company, great role.")
        manager = _make_manager()

        result = enrich_row(listing, manager)

        assert result is False

    def test_indeed_source_does_not_call_update_enrichment(self):
        """Indeed listing → update_enrichment never called."""
        listing = _make_listing(source="indeed", summary="Some summary.")
        manager = _make_manager()

        enrich_row(listing, manager)

        manager.update_enrichment.assert_not_called()

    def test_indeed_source_logs_deferred_message(self, caplog):
        """Indeed listing → logs INFO message about v2 deferral."""
        listing = _make_listing(source="indeed", summary="Some summary.")
        manager = _make_manager()

        with caplog.at_level(logging.INFO, logger="src.jobs.enrichment"):
            enrich_row(listing, manager)

        assert any("deferred" in r.message.lower() for r in caplog.records)


# ---------------------------------------------------------------------------
# manager.update_enrichment raises
# ---------------------------------------------------------------------------


class TestEnrichRowManagerRaises:

    def test_manager_raises_returns_false(self):
        """update_enrichment raises RuntimeError → enrich_row returns False (no propagate)."""
        listing = _make_listing()
        manager = _make_manager()
        manager.update_enrichment.side_effect = RuntimeError("Supabase timeout")

        result = enrich_row(listing, manager)

        assert result is False

    def test_manager_raises_does_not_propagate(self):
        """update_enrichment raising must not raise out of enrich_row."""
        listing = _make_listing()
        manager = _make_manager()
        manager.update_enrichment.side_effect = Exception("unexpected error")

        # Should not raise
        try:
            enrich_row(listing, manager)
        except Exception as exc:
            pytest.fail(f"enrich_row propagated an exception: {exc}")

    def test_manager_raises_logs_warning(self, caplog):
        """update_enrichment raising → logs a WARNING."""
        listing = _make_listing()
        manager = _make_manager()
        manager.update_enrichment.side_effect = RuntimeError("DB error")

        with caplog.at_level(logging.WARNING, logger="src.jobs.enrichment"):
            enrich_row(listing, manager)

        assert any(r.levelno == logging.WARNING for r in caplog.records)
