"""Recruiter response drafter — generates replies via Claude, saves as Gmail drafts."""

from __future__ import annotations

import base64
import logging
import re
from email.mime.text import MIMEText

import anthropic

from config import settings
from src.gmail.templates import format_context_block

logger = logging.getLogger(__name__)

DRAFT_SYSTEM_PROMPT = (
    "You are a professional reply writer for a job seeker. "
    "Write a reply email based on the instructions below. "
    "Rules:\n"
    "- Professional but warm tone — not a corporate robot\n"
    "- Be concise\n"
    "- NEVER oversell or fabricate experience\n"
    "- NEVER use markdown formatting — write plain email text only\n"
    "- Do not include a subject line — just the body\n"
    "- Sign off with the candidate's first name only"
)

MODE_INSTRUCTIONS = {
    "interested": (
        "Express genuine interest in the role. "
        "Keep it to 3-5 sentences. "
        "Mention 2-3 time slots when you're available for a call "
        "(use placeholder times like 'Tuesday or Thursday afternoon this week' "
        "until calendar integration is available). "
        "Briefly highlight relevant experience without overselling."
    ),
    "not_interested": (
        "Politely decline this opportunity. "
        "Keep it to 2-3 sentences. "
        "Be gracious and leave the door open for future roles that might be a better fit. "
        "Do not explain why you're declining in detail."
    ),
    "more_info": (
        "Ask clarifying questions about the role. "
        "Keep it to 2-3 sentences. "
        "Ask about the specific responsibilities, team size, tech stack, "
        "or whatever details are missing from the original email. "
        "Express interest while gathering information."
    ),
}


class RecruiterResponder:
    """Generates recruiter email responses via Claude and manages Gmail drafts."""

    def __init__(self, gmail_service, anthropic_api_key=None):
        """Initialize responder with an authenticated Gmail service.

        Args:
            gmail_service: Authenticated Gmail API service object.
            anthropic_api_key: Anthropic API key (falls back to settings).
        """
        self._service = gmail_service
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._claude_client = None

    def _get_claude_client(self):
        """Lazily initialize the Anthropic client."""
        if self._claude_client is None:
            self._claude_client = anthropic.Anthropic(api_key=self._api_key)
        return self._claude_client

    def draft_response(self, email_data, mode="interested"):
        """Generate a personalized reply using Claude.

        Args:
            email_data: Dict with sender, subject, body keys.
            mode: One of "interested", "not_interested", "more_info".

        Returns:
            The generated reply text, or empty string on failure.
        """
        if mode not in MODE_INSTRUCTIONS:
            logger.error("Invalid mode '%s', must be one of: %s", mode, list(MODE_INSTRUCTIONS.keys()))
            return ""

        context_block = format_context_block()
        mode_instruction = MODE_INSTRUCTIONS[mode]

        user_content = (
            f"--- CANDIDATE INFO ---\n{context_block}\n\n"
            f"--- ORIGINAL EMAIL ---\n"
            f"From: {email_data.get('sender', '')}\n"
            f"Subject: {email_data.get('subject', '')}\n\n"
            f"{email_data.get('body', '')[:3000]}\n\n"
            f"--- INSTRUCTIONS ---\n{mode_instruction}"
        )

        logger.info("Generating '%s' response for: %s", mode, email_data.get("subject", "(no subject)"))

        try:
            client = self._get_claude_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=512,
                system=DRAFT_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_content}],
            )

            draft_text = response.content[0].text.strip()

            # Strip any markdown formatting Claude might add
            draft_text = re.sub(r"^```\w*\s*", "", draft_text)
            draft_text = re.sub(r"\s*```$", "", draft_text)
            # Remove bold/italic markdown
            draft_text = re.sub(r"\*\*(.+?)\*\*", r"\1", draft_text)
            draft_text = re.sub(r"\*(.+?)\*", r"\1", draft_text)

            logger.info("Draft generated (%d chars, mode=%s)", len(draft_text), mode)
            return draft_text

        except Exception:
            logger.error("Failed to generate draft response", exc_info=True)
            return ""

    def save_draft(self, message_id, draft_text):
        """Save a reply as a Gmail draft (NOT sent).

        Args:
            message_id: The Gmail message ID to reply to.
            draft_text: The reply text to save.

        Returns:
            The draft ID if successful, None on failure.
        """
        logger.info("Saving draft reply for message %s (DRAFT ONLY — not sending)", message_id)

        try:
            # Fetch the original message to get thread ID and sender
            original = (
                self._service.users()
                .messages()
                .get(userId="me", id=message_id, format="metadata", metadataHeaders=["Subject", "From"])
                .execute()
            )

            thread_id = original.get("threadId", "")
            headers = {h["name"].lower(): h["value"] for h in original.get("payload", {}).get("headers", [])}
            to_address = headers.get("from", "")
            subject = headers.get("subject", "")

            # Add Re: prefix if not already present
            if not subject.lower().startswith("re:"):
                subject = f"Re: {subject}"

            # Build the MIME message
            mime_msg = MIMEText(draft_text)
            mime_msg["to"] = to_address
            mime_msg["subject"] = subject
            mime_msg["In-Reply-To"] = message_id
            mime_msg["References"] = message_id

            raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")

            draft_body = {
                "message": {
                    "raw": raw,
                    "threadId": thread_id,
                },
            }

            draft = (
                self._service.users()
                .drafts()
                .create(userId="me", body=draft_body)
                .execute()
            )

            draft_id = draft.get("id", "")
            logger.info("Draft saved successfully (draft_id=%s, thread=%s)", draft_id, thread_id)
            return draft_id

        except Exception:
            logger.error("Failed to save Gmail draft for message %s", message_id, exc_info=True)
            return None

    def send_response(self, message_id, draft_text):
        """Send a reply email. Only call when explicitly approved by user.

        Args:
            message_id: The Gmail message ID to reply to.
            draft_text: The reply text to send.

        Returns:
            The sent message ID if successful, None on failure.
        """
        logger.warning("SENDING email reply for message %s — user explicitly approved", message_id)

        try:
            original = (
                self._service.users()
                .messages()
                .get(userId="me", id=message_id, format="metadata", metadataHeaders=["Subject", "From"])
                .execute()
            )

            thread_id = original.get("threadId", "")
            headers = {h["name"].lower(): h["value"] for h in original.get("payload", {}).get("headers", [])}
            to_address = headers.get("from", "")
            subject = headers.get("subject", "")

            if not subject.lower().startswith("re:"):
                subject = f"Re: {subject}"

            mime_msg = MIMEText(draft_text)
            mime_msg["to"] = to_address
            mime_msg["subject"] = subject
            mime_msg["In-Reply-To"] = message_id
            mime_msg["References"] = message_id

            raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")

            sent = (
                self._service.users()
                .messages()
                .send(userId="me", body={"raw": raw, "threadId": thread_id})
                .execute()
            )

            sent_id = sent.get("id", "")
            logger.info("Email SENT (sent_id=%s, to=%s)", sent_id, to_address)
            return sent_id

        except Exception:
            logger.error("Failed to send email reply for message %s", message_id, exc_info=True)
            return None
