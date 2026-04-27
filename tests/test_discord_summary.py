"""Tests for src.jobs.discord_summary — CAR-188 Unit 6."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from src.jobs.discord_summary import format_summary, post_summary


# ---------------------------------------------------------------------------
# Minimal dataclass stubs (avoid importing the real search_engine module so
# these tests work without a live Supabase client).
# ---------------------------------------------------------------------------


@dataclass
class _ProfileResult:
    profile_id: str
    label: str
    count: int = 0
    new: int = 0
    updated: int = 0
    degraded: bool = False
    error: Optional[str] = None


@dataclass
class _RunSummary:
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    profiles: Dict[str, Any] = field(default_factory=dict)
    total_new: int = 0
    total_updated: int = 0
    total_degraded_profiles: int = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_summary(
    profiles_spec: Optional[List[Dict[str, Any]]] = None,
    elapsed_secs: float = 5.0,
) -> "_RunSummary":
    """Build a _RunSummary from a list of profile spec dicts.

    Each spec supports keys: label, new, updated, count, degraded, error.
    """
    started = datetime(2026, 4, 27, 12, 0, 0)
    completed = started + timedelta(seconds=elapsed_secs)
    summary = _RunSummary(started_at=started, completed_at=completed)

    total_new = 0
    total_updated = 0
    total_degraded = 0

    for i, spec in enumerate(profiles_spec or []):
        pid = f"profile-{i}"
        pr = _ProfileResult(
            profile_id=pid,
            label=spec.get("label", f"Profile {i}"),
            count=spec.get("count", spec.get("new", 0) + spec.get("updated", 0)),
            new=spec.get("new", 0),
            updated=spec.get("updated", 0),
            degraded=spec.get("degraded", False),
            error=spec.get("error", None),
        )
        summary.profiles[pid] = pr
        total_new += pr.new
        total_updated += pr.updated
        if pr.degraded:
            total_degraded += 1

    summary.total_new = total_new
    summary.total_updated = total_updated
    summary.total_degraded_profiles = total_degraded
    return summary


def _make_recent_rows(
    n: int = 3,
    titles: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    rows = []
    for i in range(n):
        title = (titles[i] if titles and i < len(titles) else f"Job Title {i + 1}")
        rows.append(
            {
                "title": title,
                "company": f"Company {i + 1}",
                "location": f"City {i + 1}, IN",
            }
        )
    return rows


def _make_manager(recent_rows: Optional[List[Dict]] = None) -> MagicMock:
    mgr = MagicMock()
    mgr.list_recent_new.return_value = recent_rows if recent_rows is not None else []
    return mgr


# ---------------------------------------------------------------------------
# format_summary — happy path
# ---------------------------------------------------------------------------


class TestFormatSummaryHappyPath:
    def test_header_contains_date_and_counts(self) -> None:
        """Header shows today's date, total new, and profile count."""
        summary = _make_summary(
            [
                {"label": "SysAdmin Local", "new": 2, "updated": 1},
                {"label": "DevOps Local", "new": 2, "updated": 0},
                {"label": "Contract Infra", "new": 1, "updated": 3},
            ]
        )
        recent = _make_recent_rows(3)
        msg = format_summary(summary, recent)

        # Header should contain total_new=5 and profile_count=3
        assert "+5 new" in msg
        assert "3 profile" in msg

    def test_per_profile_bullets_present(self) -> None:
        """Each profile has a bullet line with its new and updated counts."""
        summary = _make_summary(
            [
                {"label": "SysAdmin Local", "new": 2, "updated": 1},
                {"label": "DevOps Local", "new": 2, "updated": 0},
                {"label": "Contract Infra", "new": 1, "updated": 3},
            ]
        )
        recent = _make_recent_rows(3)
        msg = format_summary(summary, recent)

        assert "SysAdmin Local: +2 new, 1 updated" in msg
        assert "DevOps Local: +2 new, 0 updated" in msg
        assert "Contract Infra: +1 new, 3 updated" in msg

    def test_top_3_new_section_present(self) -> None:
        """Top 3 new section lists titles, companies, and locations."""
        summary = _make_summary(
            [
                {"label": "SysAdmin Local", "new": 5, "updated": 1},
            ]
        )
        recent = _make_recent_rows(
            3, titles=["Senior SysAdmin", "Network Engineer", "Cloud Ops"]
        )
        msg = format_summary(summary, recent)

        assert "Senior SysAdmin" in msg
        assert "Network Engineer" in msg
        assert "Cloud Ops" in msg
        # At least one "@ Company" marker present
        assert "@ Company 1" in msg

    def test_footer_contains_runtime(self) -> None:
        """Footer includes runtime in seconds."""
        summary = _make_summary(
            [{"label": "SysAdmin Local", "new": 2, "updated": 1}],
            elapsed_secs=7.3,
        )
        msg = format_summary(summary, _make_recent_rows(1))
        assert "7.3s" in msg

    def test_footer_mentions_indeed_deferred(self) -> None:
        """Footer always mentions Indeed deferred to v2 (Dice-only in v1)."""
        summary = _make_summary([{"label": "SysAdmin Local", "new": 2, "updated": 1}])
        msg = format_summary(summary, _make_recent_rows(1))
        assert "Indeed deferred to v2 (CAR-189)" in msg


# ---------------------------------------------------------------------------
# format_summary — edge cases
# ---------------------------------------------------------------------------


class TestFormatSummaryEdgeCases:
    def test_zero_new_rows_header(self) -> None:
        """When total_new is 0, header says 'No new results today'."""
        summary = _make_summary([{"label": "SysAdmin Local", "new": 0, "updated": 5}])
        msg = format_summary(summary, [])
        assert "No new results today" in msg

    def test_one_profile_degraded_marker(self) -> None:
        """A degraded profile shows the DEGRADED marker on its line."""
        summary = _make_summary(
            [
                {"label": "SysAdmin Local", "new": 2, "updated": 1, "degraded": True},
                {"label": "DevOps Local", "new": 3, "updated": 0},
            ]
        )
        msg = format_summary(summary, _make_recent_rows(3))
        assert "DEGRADED (parser sentinel)" in msg
        # Only one profile is degraded — the other should not have the marker
        lines = msg.splitlines()
        devops_line = next((l for l in lines if "DevOps Local" in l), None)
        assert devops_line is not None
        assert "DEGRADED" not in devops_line

    def test_all_profiles_degraded_header(self) -> None:
        """When all profiles are degraded, header includes the warning."""
        summary = _make_summary(
            [
                {"label": "SysAdmin Local", "new": 1, "updated": 0, "degraded": True},
                {"label": "DevOps Local", "new": 0, "updated": 0, "degraded": True},
            ]
        )
        msg = format_summary(summary, [])
        assert "ALL PROFILES DEGRADED" in msg

    def test_profile_with_error_shows_error_line(self) -> None:
        """A profile with an error field includes the error text."""
        summary = _make_summary(
            [
                {
                    "label": "Broken Profile",
                    "new": 0,
                    "updated": 0,
                    "error": "Connection timeout",
                }
            ]
        )
        msg = format_summary(summary, [])
        assert "ERROR: Connection timeout" in msg

    def test_empty_recent_rows_no_top3_section(self) -> None:
        """When recent_new_rows is empty, top-3 section is omitted."""
        summary = _make_summary([{"label": "SysAdmin Local", "new": 0, "updated": 5}])
        msg = format_summary(summary, [])
        assert "Top 3" not in msg

    def test_indeed_footer_always_present(self) -> None:
        """Footer indeed-deferred note is always shown (v1 is Dice-only)."""
        summary = _make_summary([{"label": "Dice Profile", "new": 4, "updated": 2}])
        msg = format_summary(summary, [])
        assert "Indeed deferred to v2 (CAR-189)" in msg


# ---------------------------------------------------------------------------
# post_summary
# ---------------------------------------------------------------------------


class TestPostSummary:
    def _basic_summary(self) -> "_RunSummary":
        return _make_summary([{"label": "SysAdmin Local", "new": 2, "updated": 1}])

    def test_dry_run_does_not_invoke_subprocess(self, capsys) -> None:
        """dry_run=True prints the message and returns True without calling pwsh."""
        summary = self._basic_summary()
        mgr = _make_manager(_make_recent_rows(2))

        with patch("src.jobs.discord_summary.subprocess.run") as mock_run:
            result = post_summary(summary, mgr, dry_run=True)

        mock_run.assert_not_called()
        assert result is True
        captured = capsys.readouterr()
        assert "CareerPilot" in captured.out or "new" in captured.out

    def test_dry_run_true_returns_true(self) -> None:
        """dry_run=True always returns True."""
        summary = self._basic_summary()
        mgr = _make_manager()

        with patch("src.jobs.discord_summary.subprocess.run"):
            result = post_summary(summary, mgr, dry_run=True)

        assert result is True

    def test_pwsh_success_returns_true(self) -> None:
        """When pwsh returns exit code 0, returns True."""
        summary = self._basic_summary()
        mgr = _make_manager(_make_recent_rows(1))

        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stderr = ""

        with patch("src.jobs.discord_summary.subprocess.run", return_value=mock_completed):
            result = post_summary(summary, mgr)

        assert result is True

    def test_pwsh_nonzero_exit_returns_false_no_raise(self) -> None:
        """When pwsh returns non-zero exit code, returns False and does not raise."""
        summary = self._basic_summary()
        mgr = _make_manager([])

        mock_completed = MagicMock()
        mock_completed.returncode = 1
        mock_completed.stderr = "Error: webhook failed"

        with patch("src.jobs.discord_summary.subprocess.run", return_value=mock_completed):
            result = post_summary(summary, mgr)

        assert result is False

    def test_pwsh_timeout_returns_false_no_raise(self) -> None:
        """When pwsh times out, returns False and does not raise."""
        summary = self._basic_summary()
        mgr = _make_manager([])

        with patch(
            "src.jobs.discord_summary.subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="pwsh", timeout=15),
        ):
            result = post_summary(summary, mgr)

        assert result is False

    def test_pwsh_file_not_found_returns_false_no_raise(self) -> None:
        """When pwsh is not installed (FileNotFoundError), returns False and does not raise."""
        summary = self._basic_summary()
        mgr = _make_manager([])

        with patch(
            "src.jobs.discord_summary.subprocess.run",
            side_effect=FileNotFoundError("No such file or directory: 'pwsh'"),
        ):
            result = post_summary(summary, mgr)

        assert result is False

    def test_pwsh_nonzero_logs_warning(self, caplog) -> None:
        """Non-zero exit code from pwsh emits a warning log."""
        import logging

        summary = self._basic_summary()
        mgr = _make_manager([])

        mock_completed = MagicMock()
        mock_completed.returncode = 2
        mock_completed.stderr = "webhook script error"

        with patch(
            "src.jobs.discord_summary.subprocess.run", return_value=mock_completed
        ):
            with caplog.at_level(logging.WARNING, logger="src.jobs.discord_summary"):
                post_summary(summary, mgr)

        assert any(
            "non-zero" in record.message.lower() or "returncode" in record.message.lower()
            for record in caplog.records
        )
