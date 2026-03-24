"""Email communications dashboard — threaded inbox view with status tracking."""

from __future__ import annotations

import base64
import json
import logging
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from config import settings
from src.gmail.filter_config import LABELS

logger = logging.getLogger(__name__)

# Map CareerPilot label names to dashboard categories
LABEL_TO_CATEGORY = {
    "CareerPilot/Recruiters": "Recruiters",
    "CareerPilot/Interviews": "Interviews",
    "CareerPilot/Applications": "Applications",
    "CareerPilot/Job Alerts": "Job Alerts",
    "CareerPilot/Offers-Rejections": "Offers-Rejections",
}


class EmailDashboard:
    """Fetches and classifies Gmail threads from CareerPilot labels."""

    def __init__(self, gmail_service, user_email=None):
        """Initialize with an authenticated Gmail service.

        Args:
            gmail_service: Authenticated Gmail API service object.
            user_email: The user's email address. Auto-detected if not provided.
        """
        self._service = gmail_service
        self._user_email = user_email
        self._label_id_map = None  # {label_name: label_id}

    def _get_user_email(self):
        """Get the authenticated user's email address."""
        if self._user_email:
            return self._user_email
        try:
            profile = self._service.users().getProfile(userId="me").execute()
            self._user_email = profile.get("emailAddress", "")
        except Exception:
            logger.warning("Could not fetch user email, using empty string")
            self._user_email = ""
        return self._user_email

    def _get_label_ids(self):
        """Build {label_name: label_id} map for CareerPilot labels."""
        if self._label_id_map is not None:
            return self._label_id_map

        try:
            result = self._service.users().labels().list(userId="me").execute()
            all_labels = {l["name"]: l["id"] for l in result.get("labels", [])}
        except Exception:
            logger.error("Failed to list Gmail labels", exc_info=True)
            self._label_id_map = {}
            return self._label_id_map

        self._label_id_map = {}
        for label_name in LABEL_TO_CATEGORY:
            if label_name in all_labels:
                self._label_id_map[label_name] = all_labels[label_name]

        # Also cache the Archived label if it exists
        archived_name = "CareerPilot/Archived"
        if archived_name in all_labels:
            self._label_id_map[archived_name] = all_labels[archived_name]

        return self._label_id_map

    def fetch_threads(self, max_results=50):
        """Query Gmail for threads in CareerPilot/* labels.

        Returns:
            List of thread dicts sorted by last_message_date DESC:
            {thread_id, subject, participants, last_message_date, message_count,
             snippet, category, label_ids}
        """
        label_ids = self._get_label_ids()
        if not label_ids:
            logger.warning("No CareerPilot labels found in Gmail")
            return []

        # Collect threads from all CareerPilot labels
        seen_thread_ids = set()
        threads = []

        for label_name, label_id in label_ids.items():
            if label_name == "CareerPilot/Archived":
                continue

            try:
                response = (
                    self._service.users()
                    .threads()
                    .list(userId="me", labelIds=[label_id], maxResults=max_results)
                    .execute()
                )
            except Exception:
                logger.error("Failed to list threads for label %s", label_name, exc_info=True)
                continue

            for thread_stub in response.get("threads", []):
                tid = thread_stub["id"]
                if tid in seen_thread_ids:
                    continue
                seen_thread_ids.add(tid)

                try:
                    thread_data = (
                        self._service.users()
                        .threads()
                        .get(userId="me", id=tid, format="metadata",
                             metadataHeaders=["Subject", "From", "Date"])
                        .execute()
                    )
                except Exception:
                    logger.error("Failed to fetch thread %s", tid, exc_info=True)
                    continue

                messages = thread_data.get("messages", [])
                if not messages:
                    continue

                # Extract info from first message (subject) and last message (date)
                first_msg = messages[0]
                last_msg = messages[-1]

                first_headers = {
                    h["name"].lower(): h["value"]
                    for h in first_msg.get("payload", {}).get("headers", [])
                }
                last_headers = {
                    h["name"].lower(): h["value"]
                    for h in last_msg.get("payload", {}).get("headers", [])
                }

                subject = first_headers.get("subject", "(no subject)")

                # Collect all participants
                participants = set()
                for msg in messages:
                    hdrs = {
                        h["name"].lower(): h["value"]
                        for h in msg.get("payload", {}).get("headers", [])
                    }
                    if hdrs.get("from"):
                        participants.add(hdrs["from"])

                # Parse last message date
                date_str = last_headers.get("date", "")
                try:
                    last_date = parsedate_to_datetime(date_str)
                except Exception:
                    last_date = datetime.now(timezone.utc)

                # Determine category from thread labels
                thread_label_ids = set()
                for msg in messages:
                    thread_label_ids.update(msg.get("labelIds", []))

                category = "Uncategorized"
                for lbl_name, lbl_id in label_ids.items():
                    if lbl_id in thread_label_ids and lbl_name in LABEL_TO_CATEGORY:
                        category = LABEL_TO_CATEGORY[lbl_name]
                        break

                threads.append({
                    "thread_id": tid,
                    "subject": subject,
                    "participants": list(participants),
                    "last_message_date": last_date,
                    "message_count": len(messages),
                    "snippet": thread_data.get("snippet", ""),
                    "category": category,
                    "label_ids": list(thread_label_ids),
                })

        # Sort by last_message_date DESC
        threads.sort(key=lambda t: t["last_message_date"], reverse=True)
        return threads[:max_results]

    def classify_thread_status(self, thread):
        """Determine who needs to act on a thread.

        Args:
            thread: Thread dict from fetch_threads (must include thread_id).

        Returns:
            Dict with status, hours_since_last, is_stale keys.
        """
        user_email = self._get_user_email()

        try:
            thread_data = (
                self._service.users()
                .threads()
                .get(userId="me", id=thread["thread_id"], format="metadata",
                     metadataHeaders=["From", "Date"])
                .execute()
            )
        except Exception:
            logger.error("Failed to fetch thread for classification", exc_info=True)
            return {"status": "unknown", "hours_since_last": 0, "is_stale": False}

        messages = thread_data.get("messages", [])
        if not messages:
            return {"status": "unknown", "hours_since_last": 0, "is_stale": False}

        last_msg = messages[-1]
        headers = {
            h["name"].lower(): h["value"]
            for h in last_msg.get("payload", {}).get("headers", [])
        }

        from_addr = headers.get("from", "")
        is_from_me = user_email and user_email.lower() in from_addr.lower()

        # Check for calendar event (interview scheduling keywords in labels)
        label_ids = set()
        for msg in messages:
            label_ids.update(msg.get("labelIds", []))

        label_id_map = self._get_label_ids()
        interviews_label_id = label_id_map.get("CareerPilot/Interviews", "")
        has_interview_label = interviews_label_id in label_ids

        # Parse last message date for staleness
        date_str = headers.get("date", "")
        try:
            last_date = parsedate_to_datetime(date_str)
            if last_date.tzinfo is None:
                last_date = last_date.replace(tzinfo=timezone.utc)
            hours_since = (datetime.now(timezone.utc) - last_date).total_seconds() / 3600
        except Exception:
            hours_since = 0

        if has_interview_label:
            status = "scheduled"
        elif is_from_me:
            status = "awaiting_response"
        else:
            status = "awaiting_reply"

        return {
            "status": status,
            "hours_since_last": round(hours_since, 1),
            "is_stale": status == "awaiting_reply" and hours_since > 24,
        }

    def get_thread_messages(self, thread_id):
        """Fetch full conversation for a thread.

        Args:
            thread_id: Gmail thread ID.

        Returns:
            List of message dicts: {sender, date, body, is_from_me, message_id}
        """
        user_email = self._get_user_email()

        try:
            thread_data = (
                self._service.users()
                .threads()
                .get(userId="me", id=thread_id, format="full")
                .execute()
            )
        except Exception:
            logger.error("Failed to fetch thread messages", exc_info=True)
            return []

        result = []
        for msg in thread_data.get("messages", []):
            headers = {
                h["name"].lower(): h["value"]
                for h in msg.get("payload", {}).get("headers", [])
            }

            sender = headers.get("from", "")
            date_str = headers.get("date", "")
            try:
                date = parsedate_to_datetime(date_str).strftime("%Y-%m-%d %H:%M")
            except Exception:
                date = date_str

            body = self._extract_body(msg.get("payload", {}))
            is_from_me = user_email and user_email.lower() in sender.lower()

            result.append({
                "sender": sender,
                "date": date,
                "body": body,
                "is_from_me": is_from_me,
                "message_id": msg.get("id", ""),
            })

        return result

    def get_digest(self):
        """Summary stats for the dashboard header.

        Returns:
            Dict with awaiting_reply, stale_count, interview_count, new_24h keys.
        """
        threads = self.fetch_threads(max_results=50)

        awaiting_reply = 0
        stale_count = 0
        interview_count = 0
        new_24h = 0

        now = datetime.now(timezone.utc)

        for thread in threads:
            status_info = self.classify_thread_status(thread)
            status = status_info["status"]

            if status == "awaiting_reply":
                awaiting_reply += 1
                if status_info["is_stale"]:
                    stale_count += 1

            if thread["category"] == "Interviews":
                interview_count += 1

            # Check if thread has activity in last 24h
            last_date = thread["last_message_date"]
            if last_date.tzinfo is None:
                last_date = last_date.replace(tzinfo=timezone.utc)
            if (now - last_date).total_seconds() < 86400:
                new_24h += 1

        return {
            "awaiting_reply": awaiting_reply,
            "stale_count": stale_count,
            "interview_count": interview_count,
            "new_24h": new_24h,
        }

    def _extract_body(self, payload):
        """Extract plain text body from Gmail message payload."""
        if payload.get("mimeType") == "text/plain" and "data" in payload.get("body", {}):
            return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")

        parts = payload.get("parts", [])
        plain_text = ""
        html_text = ""

        for part in parts:
            mime = part.get("mimeType", "")
            data = part.get("body", {}).get("data", "")

            if mime == "text/plain" and data:
                plain_text = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            elif mime == "text/html" and data:
                html_text = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            elif mime.startswith("multipart/"):
                nested = self._extract_body(part)
                if nested:
                    plain_text = plain_text or nested

        if plain_text:
            return plain_text
        if html_text:
            return re.sub(r"<[^>]+>", " ", html_text)
        return ""
