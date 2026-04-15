"""Thread actions — reply, book, snooze, archive, track, view for inbox threads."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from config import settings
from src.gmail.dashboard import EmailDashboard
from src.gmail.templates import format_context_block

logger = logging.getLogger(__name__)


class ThreadActions:
    """One-click actions for email threads in the inbox dashboard."""

    def __init__(self, gmail_service, responder=None, cal_scheduler=None):
        """Initialize with Gmail service and optional responder/scheduler.

        Args:
            gmail_service: Authenticated Gmail API service.
            responder: RecruiterResponder instance (for draft saving).
            cal_scheduler: CalendarScheduler instance (for availability).
        """
        self._service = gmail_service
        self._responder = responder
        self._cal_scheduler = cal_scheduler
        self._dashboard = EmailDashboard(gmail_service)

    def reply(self, thread_id, mode="interested"):
        """Generate a Claude-powered reply using full thread context.

        Args:
            thread_id: Gmail thread ID.
            mode: One of "interested", "not_interested", "more_info".

        Returns:
            Generated draft text, or empty string on failure.
        """
        messages = self._dashboard.get_thread_messages(thread_id)
        if not messages:
            logger.error("No messages found in thread %s", thread_id)
            return ""

        context_block = format_context_block()

        # Build thread conversation for Claude
        thread_text = ""
        for msg in messages:
            direction = "ME" if msg["is_from_me"] else "THEM"
            thread_text += (
                f"[{direction}] {msg['sender']} ({msg['date']}):\n"
                f"{msg['body'][:2000]}\n\n"
            )

        mode_descriptions = {
            "interested": "Express genuine interest and willingness to continue the conversation.",
            "not_interested": "Politely decline. Be gracious, leave the door open for future opportunities.",
            "more_info": "Ask clarifying questions about the role, team, or next steps.",
        }

        user_content = (
            f"--- CANDIDATE INFO ---\n{context_block}\n\n"
            f"--- CONVERSATION THREAD ---\n{thread_text}\n"
            f"--- INSTRUCTIONS ---\n"
            f"Based on this email conversation thread, draft a reply.\n"
            f"Mode: {mode}. {mode_descriptions.get(mode, '')}\n"
            f"Keep it natural — this is a reply in an ongoing conversation, not a cold email."
        )

        try:
            import re
            from src.llm.router import router
            draft_text = router.complete(task="gmail_thread_actions", prompt=user_content)
            draft_text = re.sub(r"^```\w*\s*", "", draft_text)
            draft_text = re.sub(r"\s*```$", "", draft_text)
            draft_text = re.sub(r"\*\*(.+?)\*\*", r"\1", draft_text)
            draft_text = re.sub(r"\*(.+?)\*", r"\1", draft_text)
            return draft_text
        except Exception:
            logger.error("Failed to generate thread reply", exc_info=True)
            return ""

    def save_reply_draft(self, thread_id, draft_text):
        """Save a reply as a Gmail draft on the thread.

        Args:
            thread_id: Gmail thread ID.
            draft_text: The reply text.

        Returns:
            Draft ID if successful, None on failure.
        """
        messages = self._dashboard.get_thread_messages(thread_id)
        if not messages:
            return None

        last_msg = messages[-1]
        if self._responder:
            return self._responder.save_draft(last_msg["message_id"], draft_text)

        # Fallback: save draft directly
        import base64
        from email.mime.text import MIMEText

        try:
            original = (
                self._service.users()
                .messages()
                .get(userId="me", id=last_msg["message_id"],
                     format="metadata", metadataHeaders=["Subject", "From"])
                .execute()
            )
            headers = {
                h["name"].lower(): h["value"]
                for h in original.get("payload", {}).get("headers", [])
            }
            to_address = headers.get("from", "")
            subject = headers.get("subject", "")
            if not subject.lower().startswith("re:"):
                subject = f"Re: {subject}"

            mime_msg = MIMEText(draft_text)
            mime_msg["to"] = to_address
            mime_msg["subject"] = subject
            mime_msg["In-Reply-To"] = last_msg["message_id"]
            mime_msg["References"] = last_msg["message_id"]

            raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")
            draft_body = {
                "message": {"raw": raw, "threadId": thread_id},
            }
            draft = (
                self._service.users()
                .drafts()
                .create(userId="me", body=draft_body)
                .execute()
            )
            return draft.get("id")
        except Exception:
            logger.error("Failed to save reply draft", exc_info=True)
            return None

    def book(self, thread_id):
        """Generate a calendar-aware scheduling response.

        Args:
            thread_id: Gmail thread ID.

        Returns:
            Tuple of (draft_text, available_slots) or ("", []) on failure.
        """
        messages = self._dashboard.get_thread_messages(thread_id)
        if not messages:
            return "", []

        # Get availability
        slots = []
        availability_text = "No calendar connected"
        if self._cal_scheduler:
            try:
                slots = self._cal_scheduler.get_availability(days_ahead=5)
                if slots:
                    availability_text = self._cal_scheduler.format_slots(slots, max_slots=5)
                else:
                    availability_text = "No open slots in the next 5 days"
            except Exception:
                logger.warning("Could not fetch calendar availability")

        context_block = format_context_block()
        thread_text = ""
        for msg in messages:
            direction = "ME" if msg["is_from_me"] else "THEM"
            thread_text += (
                f"[{direction}] {msg['sender']} ({msg['date']}):\n"
                f"{msg['body'][:2000]}\n\n"
            )

        user_content = (
            f"--- CANDIDATE INFO ---\n{context_block}\n\n"
            f"--- CONVERSATION THREAD ---\n{thread_text}\n"
            f"--- AVAILABLE TIME SLOTS ---\n{availability_text}\n\n"
            f"--- INSTRUCTIONS ---\n"
            f"Draft a reply to schedule a call or meeting. "
            f"Include the available time slots above. "
            f"Keep it natural and professional."
        )

        try:
            import re
            from src.llm.router import router
            draft_text = router.complete(task="gmail_thread_actions", prompt=user_content)
            draft_text = re.sub(r"^```\w*\s*", "", draft_text)
            draft_text = re.sub(r"\s*```$", "", draft_text)
            return draft_text, slots
        except Exception:
            logger.error("Failed to generate booking reply", exc_info=True)
            return "", slots

    def snooze(self, thread_id, days=3, subject=""):
        """Mark a thread for follow-up after a delay.

        Args:
            thread_id: Gmail thread ID.
            days: Number of days to snooze (default 3).
            subject: Thread subject for display when snooze expires.

        Returns:
            True if snooze was saved.
        """
        from src.db import models

        snooze_until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        value = json.dumps({
            "snooze_until": snooze_until,
            "subject": subject,
            "snoozed_at": datetime.now(timezone.utc).isoformat(),
        })

        try:
            conn = models.get_connection()
            models.set_kv(conn, f"snooze:{thread_id}", value)
            conn.close()
            logger.info("Snoozed thread %s for %d days", thread_id, days)
            return True
        except Exception:
            logger.error("Failed to snooze thread %s", thread_id, exc_info=True)
            return False

    def is_snoozed(self, thread_id):
        """Check if a thread is currently snoozed.

        Returns:
            Tuple of (is_snoozed, snooze_info_dict_or_None).
        """
        from src.db import models

        try:
            conn = models.get_connection()
            raw = models.get_kv(conn, f"snooze:{thread_id}")
            conn.close()
        except Exception:
            return False, None

        if not raw:
            return False, None

        try:
            info = json.loads(raw)
            snooze_until = datetime.fromisoformat(info["snooze_until"])
            if snooze_until.tzinfo is None:
                snooze_until = snooze_until.replace(tzinfo=timezone.utc)

            if datetime.now(timezone.utc) < snooze_until:
                return True, info
            else:
                # Snooze expired — clean up
                conn = models.get_connection()
                conn.execute("DELETE FROM kv_store WHERE key = ?", (f"snooze:{thread_id}",))
                conn.commit()
                conn.close()
                return False, info  # Return info so caller can flag "follow up!"
        except Exception:
            return False, None

    def archive(self, thread_id):
        """Move thread out of active view by swapping labels.

        Removes CareerPilot/* labels, adds CareerPilot/Archived.

        Returns:
            True if successful.
        """
        label_ids = self._dashboard._get_label_ids()

        # Ensure Archived label exists
        archived_label_id = label_ids.get("CareerPilot/Archived")
        if not archived_label_id:
            try:
                label_body = {
                    "name": "CareerPilot/Archived",
                    "labelListVisibility": "labelShow",
                    "messageListVisibility": "show",
                }
                created = (
                    self._service.users()
                    .labels()
                    .create(userId="me", body=label_body)
                    .execute()
                )
                archived_label_id = created["id"]
                self._dashboard._label_id_map["CareerPilot/Archived"] = archived_label_id
            except Exception:
                logger.error("Failed to create Archived label", exc_info=True)
                return False

        # Get current labels on the thread's messages
        remove_ids = []
        for label_name, label_id in label_ids.items():
            if label_name != "CareerPilot/Archived" and label_name.startswith("CareerPilot/"):
                remove_ids.append(label_id)

        try:
            # Fetch thread to get message IDs
            thread_data = (
                self._service.users()
                .threads()
                .get(userId="me", id=thread_id, format="minimal")
                .execute()
            )
            msg_ids = [m["id"] for m in thread_data.get("messages", [])]

            if msg_ids:
                self._service.users().messages().batchModify(
                    userId="me",
                    body={
                        "ids": msg_ids,
                        "addLabelIds": [archived_label_id],
                        "removeLabelIds": remove_ids,
                    },
                ).execute()

            logger.info("Archived thread %s (%d messages)", thread_id, len(msg_ids))
            return True
        except Exception:
            logger.error("Failed to archive thread %s", thread_id, exc_info=True)
            return False

    def track(self, thread_id, job_id):
        """Link a thread to a tracked application.

        Args:
            thread_id: Gmail thread ID.
            job_id: Application ID from the tracker database.

        Returns:
            True if saved.
        """
        from src.db import models

        value = json.dumps({
            "job_id": job_id,
            "linked_at": datetime.now(timezone.utc).isoformat(),
        })

        try:
            conn = models.get_connection()
            models.set_kv(conn, f"thread_link:{thread_id}", value)
            conn.close()
            logger.info("Linked thread %s to job %d", thread_id, job_id)
            return True
        except Exception:
            logger.error("Failed to link thread %s to job %d", thread_id, job_id, exc_info=True)
            return False

    def get_linked_job(self, thread_id):
        """Get the linked job ID for a thread.

        Returns:
            Job ID (int) or None.
        """
        from src.db import models

        try:
            conn = models.get_connection()
            raw = models.get_kv(conn, f"thread_link:{thread_id}")
            conn.close()
        except Exception:
            return None

        if not raw:
            return None

        try:
            info = json.loads(raw)
            return info.get("job_id")
        except Exception:
            return None

    def view(self, thread_id, console):
        """Display full thread conversation with Rich formatting.

        Args:
            thread_id: Gmail thread ID.
            console: Rich Console instance.
        """
        from rich.panel import Panel

        messages = self._dashboard.get_thread_messages(thread_id)
        if not messages:
            console.print("[red]No messages found in thread.[/red]")
            return

        for msg in messages:
            if msg["is_from_me"]:
                border = "green"
                label = "You"
            else:
                border = "cyan"
                label = msg["sender"][:50]

            body = msg["body"][:3000] if msg["body"] else "(empty)"
            console.print(Panel(
                body,
                title=f"{label} ({msg['date']})",
                border_style=border,
            ))
            console.print()
