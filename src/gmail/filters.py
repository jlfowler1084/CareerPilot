"""CareerPilot Gmail Filter Manager.

Handles label CRUD, filter management, and retroactive message tagging
via the Gmail API v1. Reuses the project's shared Google OAuth flow.
"""

from __future__ import annotations

import logging

from config import settings
from src.gmail.auth import get_gmail_service

logger = logging.getLogger(__name__)

# Scopes required for filter management (labels + settings).
# gmail.modify covers message listing, label CRUD, and batch modify.
# gmail.settings.basic covers filter CRUD.
FILTER_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.settings.basic",
]


def _get_filter_service():
    """Get a Gmail service authorized for filter operations."""
    return get_gmail_service(
        credentials_file=settings.GOOGLE_CREDENTIALS_FILE,
        token_path=settings.GMAIL_FILTER_TOKEN_PATH,
        scopes=FILTER_SCOPES,
    )


class GmailFilterManager:
    """Manages CareerPilot labels and filters in Gmail."""

    def __init__(self, service=None):
        self.service = service or _get_filter_service()
        self._label_cache: dict[str, str] | None = None

    # ── Labels ───────────────────────────────────────────────────────

    def list_labels(self) -> dict[str, str]:
        """Return {label_name: label_id} for all user labels."""
        result = self.service.users().labels().list(userId="me").execute()
        labels = result.get("labels", [])
        return {l["name"]: l["id"] for l in labels}

    def _refresh_label_cache(self):
        self._label_cache = self.list_labels()

    def label_exists(self, name: str) -> bool:
        if self._label_cache is None:
            self._refresh_label_cache()
        return name in self._label_cache

    def get_label_id(self, name: str) -> str | None:
        if self._label_cache is None:
            self._refresh_label_cache()
        return self._label_cache.get(name)

    def create_label(self, name: str) -> dict:
        """Create a Gmail label. Returns the label resource."""
        body = {
            "name": name,
            "labelListVisibility": "labelShow",
            "messageListVisibility": "show",
        }
        result = self.service.users().labels().create(userId="me", body=body).execute()
        if self._label_cache is not None:
            self._label_cache[result["name"]] = result["id"]
        return result

    def ensure_label_hierarchy(self, labels_config: dict) -> dict[str, str]:
        """Create the full CareerPilot label hierarchy if it doesn't exist.

        Returns {label_name: label_id} for all created/existing labels.
        """
        created = {}
        self._refresh_label_cache()

        parent = labels_config["parent"]
        if not self.label_exists(parent):
            result = self.create_label(parent)
            created[parent] = result["id"]
            logger.info("Created label: %s", parent)
        else:
            created[parent] = self.get_label_id(parent)
            logger.debug("Label exists: %s", parent)

        for _short_name, full_name in labels_config["children"].items():
            if not self.label_exists(full_name):
                result = self.create_label(full_name)
                created[full_name] = result["id"]
                logger.info("Created label: %s", full_name)
            else:
                created[full_name] = self.get_label_id(full_name)
                logger.debug("Label exists: %s", full_name)

        return created

    # ── Filters ──────────────────────────────────────────────────────

    def list_filters(self) -> list:
        """List all Gmail filters."""
        result = self.service.users().settings().filters().list(userId="me").execute()
        return result.get("filter", [])

    def create_filter(self, query: str, label_id: str, archive: bool = False) -> dict:
        """Create a Gmail filter that applies a label to matching messages."""
        action = {"addLabelIds": [label_id]}
        if archive:
            action["removeLabelIds"] = ["INBOX"]
        body = {
            "criteria": {"query": query},
            "action": action,
        }
        return self.service.users().settings().filters().create(
            userId="me", body=body
        ).execute()

    def delete_filter(self, filter_id: str):
        """Delete a Gmail filter by ID."""
        self.service.users().settings().filters().delete(
            userId="me", id=filter_id
        ).execute()

    def get_careerpilot_filters(self) -> list:
        """Return only filters that route to CareerPilot labels."""
        self._refresh_label_cache()
        cp_label_ids = {
            lid for name, lid in self._label_cache.items()
            if name.startswith("CareerPilot")
        }
        all_filters = self.list_filters()
        return [
            f for f in all_filters
            if set(f.get("action", {}).get("addLabelIds", [])) & cp_label_ids
        ]

    # ── Batch Apply to Existing Messages ─────────────────────────────

    def apply_label_to_matching(self, query: str, label_id: str, max_results: int = 500) -> int:
        """Retroactively apply a label to existing messages matching a query.

        Returns the count of messages labeled.
        """
        count = 0
        page_token = None

        while True:
            kwargs = {
                "userId": "me",
                "q": query,
                "maxResults": min(max_results - count, 100),
            }
            if page_token:
                kwargs["pageToken"] = page_token

            result = self.service.users().messages().list(**kwargs).execute()
            messages = result.get("messages", [])
            if not messages:
                break

            msg_ids = [m["id"] for m in messages]
            self.service.users().messages().batchModify(
                userId="me",
                body={"ids": msg_ids, "addLabelIds": [label_id]},
            ).execute()
            count += len(msg_ids)

            if count >= max_results:
                break

            page_token = result.get("nextPageToken")
            if not page_token:
                break

        return count
