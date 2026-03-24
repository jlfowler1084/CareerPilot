"""Google Calendar integration — availability checking and hold creation."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

import pytz

from config import settings
from src.google_auth import get_google_service

logger = logging.getLogger(__name__)

TZ = pytz.timezone(settings.TIMEZONE)


class CalendarScheduler:
    """Queries Google Calendar for availability and creates tentative holds."""

    def __init__(self, config=None):
        """Initialize scheduler with optional config override.

        Args:
            config: Dict with keys credentials_file, token_path, scopes.
                    Falls back to config/settings.py defaults.
        """
        config = config or {}
        self._credentials_file = config.get("credentials_file", settings.GOOGLE_CREDENTIALS_FILE)
        self._token_path = config.get("token_path", settings.CALENDAR_TOKEN_PATH)
        self._scopes = config.get("scopes", settings.CALENDAR_SCOPES)
        self._service = None

    def authenticate(self):
        """Authenticate with Google Calendar API via OAuth2.

        Raises:
            FileNotFoundError: If Google credentials file is missing.
        """
        logger.info("Authenticating with Google Calendar API...")
        try:
            self._service = get_google_service(
                api_name="calendar",
                api_version="v3",
                credentials_file=self._credentials_file,
                token_path=self._token_path,
                scopes=self._scopes,
            )
            logger.info("Calendar authentication successful")
        except FileNotFoundError:
            logger.error(
                "Google credentials file not found at %s.",
                self._credentials_file,
            )
            raise
        except Exception:
            logger.error("Calendar authentication failed", exc_info=True)
            raise

    def get_availability(self, days_ahead=5, working_hours=(9, 17)):
        """Find open 1-hour slots within working hours for the next N days.

        Args:
            days_ahead: Number of days to look ahead (default 5).
            working_hours: Tuple of (start_hour, end_hour) in local time.

        Returns:
            List of datetime objects (timezone-aware, Indianapolis time)
            representing the start of each available 1-hour slot.
        """
        if not self._service:
            raise RuntimeError("Not authenticated. Call authenticate() first.")

        now = datetime.now(TZ)
        start_hour, end_hour = working_hours

        # Query range: start of today through end of days_ahead
        time_min = now.replace(hour=0, minute=0, second=0, microsecond=0)
        time_max = time_min + timedelta(days=days_ahead)

        logger.info(
            "Checking calendar availability (%d days, %d:00-%d:00 %s)",
            days_ahead, start_hour, end_hour, settings.TIMEZONE,
        )

        try:
            events_result = (
                self._service.events()
                .list(
                    calendarId="primary",
                    timeMin=time_min.isoformat(),
                    timeMax=time_max.isoformat(),
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
        except Exception:
            logger.error("Failed to fetch calendar events", exc_info=True)
            return []

        events = events_result.get("items", [])
        logger.info("Found %d calendar events in range", len(events))

        # Parse busy periods
        busy_periods = []
        for event in events:
            start = event.get("start", {})
            end = event.get("end", {})

            # Handle all-day events (date only, no dateTime)
            if "date" in start:
                evt_start = TZ.localize(datetime.strptime(start["date"], "%Y-%m-%d"))
                evt_end = TZ.localize(datetime.strptime(end["date"], "%Y-%m-%d"))
            else:
                evt_start = datetime.fromisoformat(start["dateTime"])
                evt_end = datetime.fromisoformat(end["dateTime"])
                # Convert to local timezone
                evt_start = evt_start.astimezone(TZ)
                evt_end = evt_end.astimezone(TZ)

            busy_periods.append((evt_start, evt_end))

        # Generate candidate slots
        available = []
        for day_offset in range(days_ahead):
            day = time_min + timedelta(days=day_offset)

            # Skip weekends
            if day.weekday() >= 5:
                continue

            for hour in range(start_hour, end_hour):
                slot_start = TZ.localize(
                    day.replace(hour=hour, minute=0, second=0, microsecond=0, tzinfo=None)
                )
                slot_end = slot_start + timedelta(hours=1)

                # Skip slots in the past
                if slot_start <= now:
                    continue

                # Check for conflicts
                conflict = False
                for busy_start, busy_end in busy_periods:
                    if slot_start < busy_end and slot_end > busy_start:
                        conflict = True
                        break

                if not conflict:
                    available.append(slot_start)

        logger.info("Found %d available slots", len(available))
        return available

    def format_slots(self, slots, max_slots=3):
        """Format available slots as a human-readable string.

        Args:
            slots: List of timezone-aware datetime objects.
            max_slots: Maximum number of slots to include (default 3).

        Returns:
            Formatted string like "Tuesday March 25 at 10:00 AM EST".
        """
        if not slots:
            return "No available slots found"

        formatted = []
        for slot in slots[:max_slots]:
            # Format: "Tuesday March 25 at 10:00 AM EST"
            # Use %#d/%#I on Windows (%-d/%-I is Linux-only)
            formatted.append(slot.strftime("%A %B %#d at %#I:%M %p %Z"))

        return ", ".join(formatted)

    def create_hold(self, title, datetime_obj, duration_minutes=60):
        """Create a tentative calendar event as a placeholder.

        Args:
            title: Event title (e.g. "Interview — Acme Corp").
            datetime_obj: Timezone-aware datetime for the event start.
            duration_minutes: Duration in minutes (default 60).

        Returns:
            The event ID if successful, None on failure.
        """
        if not self._service:
            raise RuntimeError("Not authenticated. Call authenticate() first.")

        end_time = datetime_obj + timedelta(minutes=duration_minutes)

        event_body = {
            "summary": title,
            "start": {
                "dateTime": datetime_obj.isoformat(),
                "timeZone": settings.TIMEZONE,
            },
            "end": {
                "dateTime": end_time.isoformat(),
                "timeZone": settings.TIMEZONE,
            },
            "status": "tentative",
        }

        logger.info(
            "Creating tentative calendar hold: '%s' at %s",
            title, datetime_obj.strftime("%Y-%m-%d %H:%M %Z"),
        )

        try:
            event = (
                self._service.events()
                .insert(calendarId="primary", body=event_body)
                .execute()
            )
            event_id = event.get("id", "")
            logger.info("Calendar hold created (event_id=%s)", event_id)
            return event_id
        except Exception:
            logger.error("Failed to create calendar hold", exc_info=True)
            return None

    def get_events(self, days_ahead=5):
        """Fetch existing calendar events for display.

        Args:
            days_ahead: Number of days to look ahead.

        Returns:
            List of dicts with keys: title, start, end, status.
        """
        if not self._service:
            raise RuntimeError("Not authenticated. Call authenticate() first.")

        now = datetime.now(TZ)
        time_min = now.replace(hour=0, minute=0, second=0, microsecond=0)
        time_max = time_min + timedelta(days=days_ahead)

        try:
            events_result = (
                self._service.events()
                .list(
                    calendarId="primary",
                    timeMin=time_min.isoformat(),
                    timeMax=time_max.isoformat(),
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
        except Exception:
            logger.error("Failed to fetch calendar events", exc_info=True)
            return []

        result = []
        for event in events_result.get("items", []):
            start = event.get("start", {})
            end = event.get("end", {})

            if "date" in start:
                start_str = start["date"] + " (all day)"
                end_str = ""
            else:
                s = datetime.fromisoformat(start["dateTime"]).astimezone(TZ)
                e = datetime.fromisoformat(end["dateTime"]).astimezone(TZ)
                start_str = s.strftime("%Y-%m-%d %I:%M %p")
                end_str = e.strftime("%I:%M %p")

            result.append({
                "title": event.get("summary", "(no title)"),
                "start": start_str,
                "end": end_str,
                "status": event.get("status", "confirmed"),
            })

        return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    scheduler = CalendarScheduler()
    scheduler.authenticate()
    slots = scheduler.get_availability(days_ahead=5)
    print(scheduler.format_slots(slots, max_slots=5))
