"""Tests for the parser sentinel — rolling-median degradation detector.

Written test-first per Unit 4b execution note: boundary tests were authored
before the implementation to catch off-by-one errors in median calculation.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List
from unittest.mock import MagicMock

import pytest

from src.jobs.parsers.sentinel import is_degraded


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_manager(rows: List[Dict]) -> MagicMock:
    """Return a mock manager whose list_recent_for_profile() returns rows."""
    manager = MagicMock()
    manager.list_recent_for_profile.return_value = rows
    return manager


def _rows_for_daily_counts(day_counts: List[int], base_date: datetime = None) -> List[Dict]:
    """Build rows spanning consecutive days.

    day_counts[0] = number of rows on the most-recent day,
    day_counts[1] = rows on the day before, etc.
    """
    if base_date is None:
        base_date = datetime(2026, 4, 20, 12, 0, 0)

    rows = []
    for offset, count in enumerate(day_counts):
        day = base_date - timedelta(days=offset)
        for _ in range(count):
            rows.append({"discovered_at": day.isoformat()})
    return rows


# ---------------------------------------------------------------------------
# Happy-path (degraded)
# ---------------------------------------------------------------------------


class TestDegradedDetected:
    def test_current_well_below_median_is_degraded(self):
        """current=2, history median=10 → degraded (2 < 5.0)."""
        rows = _rows_for_daily_counts([10, 11, 9, 12, 10])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=2, manager=manager) is True

    def test_manager_called_with_correct_args(self):
        """Manager receives the profile_id and lookback_days arguments."""
        rows = _rows_for_daily_counts([10, 11, 9, 12, 10])
        manager = _make_manager(rows)
        is_degraded("my-profile", current_count=2, manager=manager, lookback_days=7)
        manager.list_recent_for_profile.assert_called_once_with("my-profile", 7)


# ---------------------------------------------------------------------------
# Happy-path (not degraded)
# ---------------------------------------------------------------------------


class TestNotDegraded:
    def test_current_above_threshold_is_not_degraded(self):
        """current=8, history median=10 → not degraded (8 >= 5.0)."""
        rows = _rows_for_daily_counts([10, 11, 9, 12, 10])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=8, manager=manager) is False


# ---------------------------------------------------------------------------
# Boundary tests — strict less-than contract
# ---------------------------------------------------------------------------


class TestBoundary:
    def test_exact_threshold_is_not_degraded(self):
        """current=5, median=10, threshold=0.5 → 5 == 0.5*10 → NOT degraded (strict <)."""
        rows = _rows_for_daily_counts([10, 11, 9, 12, 10])
        manager = _make_manager(rows)
        # median=10, threshold=0.5 → gate=5.0; current=5 is NOT < 5.0
        assert is_degraded("p1", current_count=5, manager=manager) is False

    def test_one_below_threshold_is_degraded(self):
        """current=4, median=10, threshold=0.5 → 4 < 5.0 → degraded."""
        rows = _rows_for_daily_counts([10, 11, 9, 12, 10])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=4, manager=manager) is True


# ---------------------------------------------------------------------------
# Insufficient history
# ---------------------------------------------------------------------------


class TestInsufficientHistory:
    def test_too_few_active_days_returns_false(self):
        """Only 2 active days (median=2.5) < min_history=4 → don't gate, return False."""
        rows = _rows_for_daily_counts([2, 3])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=0, manager=manager) is False

    def test_empty_history_returns_false(self):
        """No history → cannot compute median → return False (safe default)."""
        manager = _make_manager([])
        assert is_degraded("p1", current_count=0, manager=manager) is False

    def test_exactly_min_history_days_enables_gate(self):
        """4 active days satisfies min_history=4 → gate is enabled."""
        # Each of 4 days has 10 rows → median=10; current=2 → degraded
        rows = _rows_for_daily_counts([10, 10, 10, 10])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=2, manager=manager) is True


# ---------------------------------------------------------------------------
# Multi-row day grouping
# ---------------------------------------------------------------------------


class TestDayGrouping:
    def test_multiple_rows_per_day_counted_correctly(self):
        """5 distinct days with varying per-day row counts → median computed correctly.

        Days: 8, 12, 10, 10, 11 → sorted: [8, 10, 10, 11, 12] → median=10
        current=3 < 5.0 → degraded
        """
        rows = _rows_for_daily_counts([8, 12, 10, 10, 11])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=3, manager=manager) is True

    def test_skip_zero_days_uses_active_days_only(self):
        """Days with no rows are skipped; median is over active days only.

        Simulate 7 calendar days with 3 zero-count days:
        active: day0=10, day1=0(skip), day2=12, day3=0(skip), day4=9, day5=0(skip), day6=11
        active counts: [10, 12, 9, 11] → median=10.5 → gate=5.25
        current=4 < 5.25 → degraded
        """
        base = datetime(2026, 4, 20)
        rows = []
        # day0 (base): 10 rows
        for _ in range(10):
            rows.append({"discovered_at": base.isoformat()})
        # day1: 0 rows (skip)
        # day2: 12 rows
        for _ in range(12):
            rows.append({"discovered_at": (base - timedelta(days=2)).isoformat()})
        # day3: 0 rows (skip)
        # day4: 9 rows
        for _ in range(9):
            rows.append({"discovered_at": (base - timedelta(days=4)).isoformat()})
        # day5: 0 rows (skip)
        # day6: 11 rows
        for _ in range(11):
            rows.append({"discovered_at": (base - timedelta(days=6)).isoformat()})
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=4, manager=manager) is True

    def test_zero_day_gap_not_degraded_above_threshold(self):
        """Same zero-day setup but current above the gate → not degraded.

        active: [10, 12, 9, 11] → median=10.5 → gate=5.25
        current=6 >= 5.25 → not degraded
        """
        base = datetime(2026, 4, 20)
        rows = []
        for _ in range(10):
            rows.append({"discovered_at": base.isoformat()})
        for _ in range(12):
            rows.append({"discovered_at": (base - timedelta(days=2)).isoformat()})
        for _ in range(9):
            rows.append({"discovered_at": (base - timedelta(days=4)).isoformat()})
        for _ in range(11):
            rows.append({"discovered_at": (base - timedelta(days=6)).isoformat()})
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=6, manager=manager) is False


# ---------------------------------------------------------------------------
# Custom threshold/lookback overrides
# ---------------------------------------------------------------------------


class TestCustomParameters:
    def test_custom_threshold_ratio(self):
        """threshold_ratio=0.8 makes the gate much stricter."""
        # median=10, gate=8.0; current=7 < 8.0 → degraded
        rows = _rows_for_daily_counts([10, 10, 10, 10, 10])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=7, manager=manager,
                           threshold_ratio=0.8) is True

    def test_custom_threshold_ratio_not_degraded(self):
        """current=8 is NOT < 0.8*10 = 8.0 → not degraded (strict <)."""
        rows = _rows_for_daily_counts([10, 10, 10, 10, 10])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=8, manager=manager,
                           threshold_ratio=0.8) is False

    def test_custom_min_history(self):
        """min_history=2: 2 active days with median=5 satisfies the gate."""
        # active counts: [4, 6] → median=5 → gate=2.5; current=1 < 2.5 → degraded
        rows = _rows_for_daily_counts([4, 6])
        manager = _make_manager(rows)
        assert is_degraded("p1", current_count=1, manager=manager,
                           min_history=2) is True
