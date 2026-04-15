"""Gmail inbox scanner with Claude-powered email classification."""

import base64
import json
import logging
import re
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime

from config import settings
from src.gmail.auth import get_gmail_service

logger = logging.getLogger(__name__)

RECRUITER_SEARCH_QUERIES = [
    "from:(*recruiting* OR *talent* OR *staffing* OR *careers* OR *hiring*)",
    "subject:(opportunity OR position OR role OR interview OR candidate)",
]


class GmailScanner:
    """Scans Gmail inbox for recruiter emails and classifies them via Claude."""

    def __init__(self, config=None):
        """Initialize scanner with optional config override.

        Args:
            config: Dict with keys credentials_file, token_path, scopes, anthropic_api_key.
                    Falls back to config/settings.py defaults.
        """
        config = config or {}
        self._credentials_file = config.get("credentials_file", settings.GOOGLE_CREDENTIALS_FILE)
        self._token_path = config.get("token_path", settings.GMAIL_TOKEN_PATH)
        self._scopes = config.get("scopes", settings.GMAIL_SCOPES)
        self._service = None

    def authenticate(self):
        """Authenticate with Gmail API via OAuth2.

        Raises:
            FileNotFoundError: If Google credentials file is missing.
            Exception: If OAuth flow fails.
        """
        logger.info("Authenticating with Gmail API...")
        try:
            self._service = get_gmail_service(
                credentials_file=self._credentials_file,
                token_path=self._token_path,
                scopes=self._scopes,
            )
            logger.info("Gmail authentication successful")
        except FileNotFoundError:
            logger.error(
                "Google credentials file not found at %s. "
                "Download from Google Cloud Console and save to that path.",
                self._credentials_file,
            )
            raise
        except Exception:
            logger.error("Gmail authentication failed", exc_info=True)
            raise

    def scan_inbox(self, days_back=7):
        """Search Gmail for recent recruiter-pattern emails and classify them.

        Args:
            days_back: Number of days to look back (default 7).

        Returns:
            List of dicts with keys: sender, subject, date, category, company,
            role, urgency, summary, message_id.
        """
        if not self._service:
            raise RuntimeError("Not authenticated. Call authenticate() first.")

        after_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y/%m/%d")
        query_parts = RECRUITER_SEARCH_QUERIES + [f"after:{after_date}"]
        query = " ".join(query_parts)

        logger.info("Scanning Gmail inbox (last %d days)...", days_back)
        logger.debug("Search query: %s", query)

        try:
            response = (
                self._service.users()
                .messages()
                .list(userId="me", q=query, maxResults=50)
                .execute()
            )
        except Exception:
            logger.error("Gmail API search failed", exc_info=True)
            return []

        messages = response.get("messages", [])
        logger.info("Found %d emails matching recruiter patterns", len(messages))

        results = []
        for msg_stub in messages:
            message_id = msg_stub["id"]
            try:
                email_data = self.get_email_details(message_id)
                if not email_data:
                    continue

                logger.debug("Processing: %s", email_data.get("subject", "(no subject)"))
                classification = self.classify_email(email_data)

                results.append({
                    "sender": email_data["sender"],
                    "subject": email_data["subject"],
                    "date": email_data["date"],
                    "category": classification["category"],
                    "company": classification["company"],
                    "role": classification["role"],
                    "urgency": classification["urgency"],
                    "summary": classification["summary"],
                    "message_id": message_id,
                })
            except Exception:
                logger.error("Failed to process email %s, skipping", message_id, exc_info=True)
                continue

        logger.info(
            "Classification complete: %d emails processed, %d results",
            len(messages),
            len(results),
        )
        return results

    def get_email_details(self, message_id):
        """Fetch full email content by message ID.

        Args:
            message_id: Gmail message ID.

        Returns:
            Dict with sender, subject, date, body — or None on failure.
        """
        if not self._service:
            raise RuntimeError("Not authenticated. Call authenticate() first.")

        try:
            msg = (
                self._service.users()
                .messages()
                .get(userId="me", id=message_id, format="full")
                .execute()
            )
        except Exception:
            logger.error("Failed to fetch email %s", message_id, exc_info=True)
            return None

        headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}

        sender = headers.get("from", "")
        subject = headers.get("subject", "(no subject)")

        # Parse date
        date_str = headers.get("date", "")
        try:
            date = parsedate_to_datetime(date_str).strftime("%Y-%m-%d %H:%M")
        except Exception:
            date = date_str

        # Extract body text
        body = self._extract_body(msg["payload"])

        return {
            "sender": sender,
            "subject": subject,
            "date": date,
            "body": body,
            "message_id": message_id,
        }

    def _extract_body(self, payload):
        """Extract plain text body from Gmail message payload.

        Handles both simple and multipart MIME structures.
        """
        # Simple single-part message
        if payload.get("mimeType") == "text/plain" and "data" in payload.get("body", {}):
            return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")

        # Multipart — look for text/plain first, fall back to text/html
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
                # Recurse into nested multipart
                nested = self._extract_body(part)
                if nested:
                    plain_text = plain_text or nested

        if plain_text:
            return plain_text
        if html_text:
            # Strip HTML tags for a rough text extraction
            return re.sub(r"<[^>]+>", " ", html_text)
        return ""

    def classify_email(self, email_data):
        """Classify an email using the LLM router.

        Args:
            email_data: Dict with at least subject and body keys.

        Returns:
            Dict with category, company, role, urgency, summary.
            Defaults to category "irrelevant" on failure.

        Future integration (SCRUM-98):
            Auto-classify emails from staffing agency domains as
            'recruiter_outreach': @teksystems.com, @roberthalf.com,
            @kforce.com, @insightglobal.com, @randstadusa.com,
            @apexsystems.com. This would bypass the LLM router call
            for known recruiter domains and feed into the recruiter
            relationship tracker.
        """
        default_result = {
            "category": "irrelevant",
            "company": "",
            "role": "",
            "urgency": "low",
            "summary": "Classification failed",
        }

        user_content = (
            f"Subject: {email_data.get('subject', '')}\n"
            f"From: {email_data.get('sender', '')}\n\n"
            f"{email_data.get('body', '')[:3000]}"
        )

        try:
            from src.llm.router import router
            result = router.complete(task="email_classify", prompt=user_content)
            # result is schema-validated dict from the router
            return {
                "category": result.get("category", "irrelevant"),
                "company": result.get("company", ""),
                "role": result.get("role", ""),
                "urgency": result.get("urgency", "low"),
                "summary": result.get("summary", ""),
            }
        except Exception:
            logger.error("Classification failed", exc_info=True)
            return default_result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    scanner = GmailScanner()
    scanner.authenticate()
    results = scanner.scan_inbox(days_back=7)
    for r in results:
        print(f"[{r['category']}] {r['subject']} — {r['summary']}")
