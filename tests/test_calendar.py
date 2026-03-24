"""Tests for CalendarScheduler — mocks Google Calendar API."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytz
import pytest

from src.calendar.scheduler import CalendarScheduler

TZ = pytz.timezone("America/Indiana/Indianapolis")


# --- Fixtures ---


@pytest.fixture
def scheduler():
    """Create a CalendarScheduler with dummy config."""
    return CalendarScheduler(config={
        "credentials_file": Path("fake_creds.json"),
        "token_path": Path("fake_token.json"),
        "scopes": ["https://www.googleapis.com/auth/calendar"],
    })


def _make_event(summary, start_dt, end_dt):
    """Build a mock Calendar API event."""
    return {
        "summary": summary,
        "start": {"dateTime": start_dt.isoformat()},
        "end": {"dateTime": end_dt.isoformat()},
        "status": "confirmed",
    }


def _make_allday_event(summary, date_str, end_date_str):
    """Build a mock all-day Calendar event."""
    return {
        "summary": summary,
        "start": {"date": date_str},
        "end": {"date": end_date_str},
        "status": "confirmed",
    }


def _setup_mock_service(scheduler, events):
    """Wire up a mock calendar service with given events."""
    mock_service = MagicMock()
    mock_service.events().list().execute.return_value = {"items": events}
    scheduler._service = mock_service
    return mock_service


# --- Test: get_availability ---


class TestGetAvailability:
    def test_empty_calendar_returns_all_working_slots(self, scheduler):
        """An empty calendar should return all weekday working-hour slots."""
        _setup_mock_service(scheduler, [])

        # Use a known Monday to control the test
        monday = TZ.localize(datetime(2026, 3, 23, 7, 0, 0))
        with patch("src.calendar.scheduler.datetime") as mock_dt:
            mock_dt.now.return_value = monday
            mock_dt.fromisoformat = datetime.fromisoformat
            mock_dt.strptime = datetime.strptime

            slots = scheduler.get_availability(days_ahead=5, working_hours=(9, 17))

        # 5 weekdays * 8 hours = 40 slots max (minus any past slots on day 1)
        assert len(slots) > 0
        # All slots should be on weekdays
        for slot in slots:
            assert slot.weekday() < 5, f"Got weekend slot: {slot}"
        # All slots should be in working hours
        for slot in slots:
            assert 9 <= slot.hour < 17, f"Slot outside working hours: {slot}"

    def test_busy_event_blocks_slot(self, scheduler):
        """An event from 10-11am should block the 10am slot."""
        monday_10am = TZ.localize(datetime(2026, 3, 23, 10, 0))
        monday_11am = TZ.localize(datetime(2026, 3, 23, 11, 0))
        event = _make_event("Team standup", monday_10am, monday_11am)

        _setup_mock_service(scheduler, [event])

        monday_7am = TZ.localize(datetime(2026, 3, 23, 7, 0, 0))
        with patch("src.calendar.scheduler.datetime") as mock_dt:
            mock_dt.now.return_value = monday_7am
            mock_dt.fromisoformat = datetime.fromisoformat
            mock_dt.strptime = datetime.strptime

            slots = scheduler.get_availability(days_ahead=1, working_hours=(9, 12))

        # Should have 9am and 11am, but NOT 10am
        slot_hours = [s.hour for s in slots]
        assert 10 not in slot_hours, "10am slot should be blocked"
        assert 9 in slot_hours, "9am should be available"
        assert 11 in slot_hours, "11am should be available"

    def test_overlapping_event_blocks_slot(self, scheduler):
        """An event from 9:30-10:30 should block both 9am and 10am slots."""
        start = TZ.localize(datetime(2026, 3, 23, 9, 30))
        end = TZ.localize(datetime(2026, 3, 23, 10, 30))
        event = _make_event("Meeting", start, end)

        _setup_mock_service(scheduler, [event])

        monday_7am = TZ.localize(datetime(2026, 3, 23, 7, 0, 0))
        with patch("src.calendar.scheduler.datetime") as mock_dt:
            mock_dt.now.return_value = monday_7am
            mock_dt.fromisoformat = datetime.fromisoformat
            mock_dt.strptime = datetime.strptime

            slots = scheduler.get_availability(days_ahead=1, working_hours=(9, 12))

        slot_hours = [s.hour for s in slots]
        assert 9 not in slot_hours, "9am should be blocked (event at 9:30)"
        assert 10 not in slot_hours, "10am should be blocked (event until 10:30)"
        assert 11 in slot_hours, "11am should be available"

    def test_back_to_back_events(self, scheduler):
        """Back-to-back events 9-10 and 10-11 should block both slots."""
        evt1 = _make_event(
            "Call 1",
            TZ.localize(datetime(2026, 3, 23, 9, 0)),
            TZ.localize(datetime(2026, 3, 23, 10, 0)),
        )
        evt2 = _make_event(
            "Call 2",
            TZ.localize(datetime(2026, 3, 23, 10, 0)),
            TZ.localize(datetime(2026, 3, 23, 11, 0)),
        )

        _setup_mock_service(scheduler, [evt1, evt2])

        monday_7am = TZ.localize(datetime(2026, 3, 23, 7, 0, 0))
        with patch("src.calendar.scheduler.datetime") as mock_dt:
            mock_dt.now.return_value = monday_7am
            mock_dt.fromisoformat = datetime.fromisoformat
            mock_dt.strptime = datetime.strptime

            slots = scheduler.get_availability(days_ahead=1, working_hours=(9, 12))

        slot_hours = [s.hour for s in slots]
        assert 9 not in slot_hours
        assert 10 not in slot_hours
        assert 11 in slot_hours

    def test_skips_weekends(self, scheduler):
        """Slots should never fall on Saturday or Sunday."""
        _setup_mock_service(scheduler, [])

        # Start on Friday — days_ahead=4 covers Fri, Sat, Sun, Mon
        friday = TZ.localize(datetime(2026, 3, 27, 7, 0, 0))
        with patch("src.calendar.scheduler.datetime") as mock_dt:
            mock_dt.now.return_value = friday
            mock_dt.fromisoformat = datetime.fromisoformat
            mock_dt.strptime = datetime.strptime

            slots = scheduler.get_availability(days_ahead=4, working_hours=(9, 12))

        for slot in slots:
            assert slot.weekday() < 5, f"Weekend slot found: {slot}"

    def test_skips_past_slots(self, scheduler):
        """Slots before current time should be excluded."""
        _setup_mock_service(scheduler, [])

        # Now is Monday at 2pm — all morning slots should be gone
        monday_2pm = TZ.localize(datetime(2026, 3, 23, 14, 0, 0))
        with patch("src.calendar.scheduler.datetime") as mock_dt:
            mock_dt.now.return_value = monday_2pm
            mock_dt.fromisoformat = datetime.fromisoformat
            mock_dt.strptime = datetime.strptime

            slots = scheduler.get_availability(days_ahead=1, working_hours=(9, 17))

        for slot in slots:
            assert slot > monday_2pm, f"Past slot found: {slot}"

    def test_not_authenticated_raises(self, scheduler):
        """Raises RuntimeError if authenticate() wasn't called."""
        with pytest.raises(RuntimeError, match="Not authenticated"):
            scheduler.get_availability()

    def test_timezone_is_indianapolis(self, scheduler):
        """All returned slots should be in Indianapolis timezone."""
        _setup_mock_service(scheduler, [])

        monday = TZ.localize(datetime(2026, 3, 23, 7, 0, 0))
        with patch("src.calendar.scheduler.datetime") as mock_dt:
            mock_dt.now.return_value = monday
            mock_dt.fromisoformat = datetime.fromisoformat
            mock_dt.strptime = datetime.strptime

            slots = scheduler.get_availability(days_ahead=1, working_hours=(9, 12))

        for slot in slots:
            assert slot.tzinfo is not None, "Slot should be timezone-aware"
            assert str(slot.tzinfo) == "America/Indiana/Indianapolis" or "EST" in str(slot.tzinfo) or "EDT" in str(slot.tzinfo)


# --- Test: format_slots ---


class TestFormatSlots:
    def test_formats_single_slot(self, scheduler):
        """Formats a single slot correctly."""
        slot = TZ.localize(datetime(2026, 3, 25, 10, 0))
        result = scheduler.format_slots([slot], max_slots=3)
        assert "Wednesday" in result
        assert "March" in result
        assert "10" in result
        assert "AM" in result

    def test_formats_multiple_slots(self, scheduler):
        """Formats multiple slots as comma-separated string."""
        slots = [
            TZ.localize(datetime(2026, 3, 25, 10, 0)),
            TZ.localize(datetime(2026, 3, 26, 14, 0)),
        ]
        result = scheduler.format_slots(slots, max_slots=3)
        assert "Wednesday" in result
        assert "Thursday" in result
        assert ", " in result

    def test_respects_max_slots(self, scheduler):
        """Only includes up to max_slots entries."""
        slots = [
            TZ.localize(datetime(2026, 3, 25, 10, 0)),
            TZ.localize(datetime(2026, 3, 25, 11, 0)),
            TZ.localize(datetime(2026, 3, 25, 12, 0)),
            TZ.localize(datetime(2026, 3, 25, 13, 0)),
        ]
        result = scheduler.format_slots(slots, max_slots=2)
        # Should only have 2 entries (1 comma separator)
        assert result.count(", ") == 1

    def test_empty_slots(self, scheduler):
        """Returns fallback message for empty slot list."""
        result = scheduler.format_slots([], max_slots=3)
        assert "No available" in result


# --- Test: create_hold ---


class TestCreateHold:
    def test_creates_tentative_event(self, scheduler):
        """Creates a tentative calendar event."""
        mock_service = MagicMock()
        mock_service.events().insert().execute.return_value = {"id": "evt123"}
        scheduler._service = mock_service

        dt = TZ.localize(datetime(2026, 3, 25, 10, 0))
        result = scheduler.create_hold("Interview — Acme", dt, duration_minutes=60)

        assert result == "evt123"
        mock_service.events().insert.assert_called()

    def test_create_hold_failure(self, scheduler):
        """Returns None when event creation fails."""
        mock_service = MagicMock()
        mock_service.events().insert().execute.side_effect = Exception("API error")
        scheduler._service = mock_service

        dt = TZ.localize(datetime(2026, 3, 25, 10, 0))
        result = scheduler.create_hold("Interview", dt)

        assert result is None

    def test_not_authenticated_raises(self, scheduler):
        """Raises RuntimeError if not authenticated."""
        dt = TZ.localize(datetime(2026, 3, 25, 10, 0))
        with pytest.raises(RuntimeError, match="Not authenticated"):
            scheduler.create_hold("Interview", dt)


# --- Test: get_events ---


class TestGetEvents:
    def test_returns_formatted_events(self, scheduler):
        """Fetches and formats calendar events."""
        evt = _make_event(
            "Team meeting",
            TZ.localize(datetime(2026, 3, 25, 10, 0)),
            TZ.localize(datetime(2026, 3, 25, 11, 0)),
        )
        _setup_mock_service(scheduler, [evt])

        events = scheduler.get_events(days_ahead=5)

        assert len(events) == 1
        assert events[0]["title"] == "Team meeting"
        assert "10" in events[0]["start"]

    def test_handles_allday_events(self, scheduler):
        """Handles all-day events without crashing."""
        evt = _make_allday_event("Holiday", "2026-03-25", "2026-03-26")
        _setup_mock_service(scheduler, [evt])

        events = scheduler.get_events(days_ahead=5)

        assert len(events) == 1
        assert "all day" in events[0]["start"]
