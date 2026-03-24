"""
CareerPilot Gmail API Client

Handles OAuth2 authentication, label CRUD, and filter management
via the Gmail API v1.
"""

import os
import json
from pathlib import Path
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

# Gmail API scopes needed for label + filter management
SCOPES = [
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.settings.basic",
]

TOKEN_FILE = "token.json"
CREDENTIALS_FILE = "credentials.json"


def get_gmail_service(credentials_path: str = CREDENTIALS_FILE, token_path: str = TOKEN_FILE):
    """
    Authenticate and return a Gmail API service instance.

    First run will open a browser for OAuth consent.
    Subsequent runs use the cached token.
    """
    creds = None

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(credentials_path):
                print(f"\n❌  Missing {credentials_path}")
                print("    1. Go to https://console.cloud.google.com/apis/credentials")
                print("    2. Create an OAuth 2.0 Client ID (Desktop application)")
                print("    3. Download the JSON and save it as 'credentials.json' in this directory")
                print("    4. Enable the Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com")
                raise FileNotFoundError(f"{credentials_path} not found. See instructions above.")

            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(token_path, "w") as f:
            f.write(creds.to_json())
        print("✅  Authentication successful. Token saved.")

    return build("gmail", "v1", credentials=creds)


class GmailFilterManager:
    """Manages CareerPilot labels and filters in Gmail."""

    def __init__(self, service=None):
        self.service = service or get_gmail_service()
        self._label_cache = None

    # ── Labels ───────────────────────────────────────────────────────

    def list_labels(self) -> dict:
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

    def create_label(self, name: str, show_in_list: bool = True, show_in_messages: bool = True) -> dict:
        """Create a Gmail label. Returns the label resource."""
        body = {
            "name": name,
            "labelListVisibility": "labelShow" if show_in_list else "labelHide",
            "messageListVisibility": "show" if show_in_messages else "hide",
        }
        result = self.service.users().labels().create(userId="me", body=body).execute()
        # Update cache
        if self._label_cache is not None:
            self._label_cache[result["name"]] = result["id"]
        return result

    def ensure_label_hierarchy(self, labels_config: dict) -> dict:
        """
        Create the full CareerPilot label hierarchy if it doesn't exist.
        Returns {label_name: label_id} for all created/existing labels.
        """
        created = {}
        self._refresh_label_cache()

        # Parent first
        parent = labels_config["parent"]
        if not self.label_exists(parent):
            result = self.create_label(parent)
            created[parent] = result["id"]
            print(f"  ✅  Created label: {parent}")
        else:
            created[parent] = self.get_label_id(parent)
            print(f"  ⏭️   Label exists: {parent}")

        # Children
        for short_name, full_name in labels_config["children"].items():
            if not self.label_exists(full_name):
                result = self.create_label(full_name)
                created[full_name] = result["id"]
                print(f"  ✅  Created label: {full_name}")
            else:
                created[full_name] = self.get_label_id(full_name)
                print(f"  ⏭️   Label exists: {full_name}")

        return created

    # ── Filters ──────────────────────────────────────────────────────

    def list_filters(self) -> list:
        """List all Gmail filters."""
        result = self.service.users().settings().filters().list(userId="me").execute()
        return result.get("filter", [])

    def create_filter(self, query: str, label_id: str, archive: bool = False) -> dict:
        """
        Create a Gmail filter.

        Args:
            query: Gmail search query (e.g. "from:noreply@indeed.com")
            label_id: Label ID to apply
            archive: If True, skip inbox (remove INBOX label)
        """
        action = {"addLabelIds": [label_id]}
        if archive:
            action["removeLabelIds"] = ["INBOX"]

        body = {
            "criteria": {"query": query},
            "action": action,
        }
        return self.service.users().settings().filters().create(userId="me", body=body).execute()

    def delete_filter(self, filter_id: str):
        """Delete a Gmail filter by ID."""
        self.service.users().settings().filters().delete(userId="me", id=filter_id).execute()

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

    def apply_label_to_matching(self, query: str, label_id: str, max_results: int = 200) -> int:
        """
        Retroactively apply a label to existing messages matching a query.
        Returns the count of messages labeled.
        """
        count = 0
        page_token = None

        while True:
            kwargs = {"userId": "me", "q": query, "maxResults": min(max_results - count, 100)}
            if page_token:
                kwargs["pageToken"] = page_token

            result = self.service.users().messages().list(**kwargs).execute()
            messages = result.get("messages", [])

            if not messages:
                break

            # Batch modify
            msg_ids = [m["id"] for m in messages]
            self.service.users().messages().batchModify(
                userId="me",
                body={"ids": msg_ids, "addLabelIds": [label_id]}
            ).execute()
            count += len(msg_ids)

            if count >= max_results:
                break

            page_token = result.get("nextPageToken")
            if not page_token:
                break

        return count
