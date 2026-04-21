"""Supabase-backed contacts manager (CAR-171 / CAR-168 M5a).

Mirrors src/jobs/tracker.py::ApplicationTracker for the contacts table.
Service-role auth; every query scoped by .eq("user_id", self._user_id).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_STALE_EXCLUDED_STATUSES = ["cold", "do_not_contact"]


class ContactManagerNotConfiguredError(RuntimeError):
    """Raised when ContactManager cannot resolve a user_id."""


class ContactManager:
    """Supabase-backed CRUD + queries for the contacts table.

    Parameters
    ----------
    client : Any, optional
        Supabase client. Defaults to the cached singleton from
        src.db.supabase_client.get_supabase_client().
    user_id : str, optional
        UUID of the user to scope all queries. Defaults to the
        CAREERPILOT_USER_ID environment variable. Raises
        ContactManagerNotConfiguredError if neither is provided.
    """

    def __init__(
        self,
        client: Any = None,
        user_id: Optional[str] = None,
    ) -> None:
        if user_id is None:
            user_id = os.environ.get("CAREERPILOT_USER_ID")
        if not user_id:
            raise ContactManagerNotConfiguredError(
                "ContactManager requires a user_id (arg or CAREERPILOT_USER_ID env var). "
                "Service-role key bypasses RLS, so orphaned rows would be invisible "
                "to the dashboard. See CAR-163 audit section 3 for rationale."
            )
        self._user_id = user_id

        if client is None:
            from src.db.supabase_client import get_supabase_client
            client = get_supabase_client()
        self._client = client

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    def add_contact(
        self,
        name: str,
        contact_type: str = "recruiter",
        **kwargs: Any,
    ) -> str:
        """Insert a new contact. Returns the Supabase UUID (str).

        Allowed kwargs: company, title, email, phone, linkedin_url,
        specialization, source, last_contact_date, contact_method,
        next_followup, relationship_status, tags (List[str]), notes.
        """
        _ALLOWED = {
            "company", "title", "email", "phone", "linkedin_url",
            "specialization", "source", "last_contact_date", "contact_method",
            "next_followup", "relationship_status", "tags", "notes",
        }
        payload: Dict[str, Any] = {
            "user_id": self._user_id,
            "name": name,
            "contact_type": contact_type,
        }
        for k, v in kwargs.items():
            if k in _ALLOWED and v is not None:
                if k == "last_contact_date" and isinstance(v, datetime):
                    v = v.isoformat()
                payload[k] = v

        response = self._client.table("contacts").insert(payload).execute()
        if not response.data:
            raise RuntimeError(f"Supabase insert returned no data: {response}")
        row = response.data[0]
        logger.info("Added contact: %s (id=%s)", name, row.get("id"))
        return row["id"]

    def update_contact(self, contact_id: str, **kwargs: Any) -> bool:
        """Update contact fields. Returns True if found, False otherwise."""
        _ALLOWED = {
            "name", "company", "title", "contact_type", "email", "phone",
            "linkedin_url", "specialization", "source", "last_contact_date",
            "contact_method", "next_followup", "relationship_status",
            "tags", "notes",
        }
        if not contact_id:
            return False
        fields = {k: v for k, v in kwargs.items() if k in _ALLOWED}
        if not fields:
            return False

        current = self.get_contact(contact_id)
        if not current:
            logger.warning("Contact id=%s not found", contact_id)
            return False

        response = (
            self._client.table("contacts")
            .update(fields)
            .eq("id", contact_id)
            .eq("user_id", self._user_id)
            .execute()
        )
        if not response.data:
            logger.warning("Update returned no rows for id=%s", contact_id)
            return False
        return True

    def delete_contact(self, contact_id: str, force: bool = False) -> bool:
        """Soft delete (do_not_contact) or hard delete when force=True."""
        if not contact_id:
            return False
        current = self.get_contact(contact_id)
        if not current:
            return False

        if force:
            self._client.table("contacts").delete().eq("id", contact_id).eq(
                "user_id", self._user_id
            ).execute()
        else:
            self.update_contact(contact_id, relationship_status="do_not_contact")
        return True

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def get_contact(self, contact_id: Any) -> Optional[Dict]:
        """Get a single contact by UUID. Returns dict or None."""
        if not contact_id:
            return None
        response = (
            self._client.table("contacts")
            .select("*")
            .eq("user_id", self._user_id)
            .eq("id", contact_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    def list_contacts(
        self,
        contact_type: Optional[str] = None,
        relationship_status: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> List[Dict]:
        """List contacts with optional filters."""
        q = (
            self._client.table("contacts")
            .select("*")
            .eq("user_id", self._user_id)
        )
        if contact_type:
            q = q.eq("contact_type", contact_type)
        if relationship_status:
            q = q.eq("relationship_status", relationship_status)
        if tag:
            q = q.contains("tags", [tag])
        response = q.execute()
        return response.data or []

    def find_by_email(self, email: Any) -> Optional[Dict]:
        """Find a contact by email (case-insensitive). Returns dict or None."""
        if not email or not str(email).strip():
            return None
        response = (
            self._client.table("contacts")
            .select("*")
            .eq("user_id", self._user_id)
            .ilike("email", f"%{str(email).strip()}%")
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    def search_contacts(self, query: str) -> List[Dict]:
        """Full-text search across name, company, email, notes."""
        if not query:
            return []
        pat = f"%{query}%"
        filter_str = (
            f"name.ilike.{pat},company.ilike.{pat},"
            f"email.ilike.{pat},notes.ilike.{pat}"
        )
        response = (
            self._client.table("contacts")
            .select("*")
            .eq("user_id", self._user_id)
            .or_(filter_str)
            .execute()
        )
        return response.data or []

    def get_stale_contacts(self, days: int = 14) -> List[Dict]:
        """Get active/warm contacts with no contact in `days`+ days."""
        cutoff = datetime.now() - timedelta(days=days)
        response = (
            self._client.table("contacts")
            .select("*")
            .eq("user_id", self._user_id)
            .not_.in_("relationship_status", _STALE_EXCLUDED_STATUSES)
            .execute()
        )
        stale = []
        for row in (response.data or []):
            if row.get("relationship_status") not in ("active", "warm"):
                continue
            lcd = row.get("last_contact_date")
            if not lcd:
                continue
            try:
                dt = datetime.fromisoformat(str(lcd).replace("Z", "+00:00"))
                dt = dt.replace(tzinfo=None) if dt.tzinfo else dt
            except (ValueError, TypeError):
                continue
            if dt < cutoff:
                stale.append(row)
        return stale

    def get_followup_due(self) -> List[Dict]:
        """Get contacts with next_followup <= today."""
        today = datetime.now().strftime("%Y-%m-%d")
        response = (
            self._client.table("contacts")
            .select("*")
            .eq("user_id", self._user_id)
            .not_.is_("next_followup", "null")
            .lte("next_followup", today)
            .execute()
        )
        return response.data or []

    # ------------------------------------------------------------------
    # Tag helpers
    # ------------------------------------------------------------------

    def add_tag(self, contact_id: str, tag: str) -> bool:
        """Add a tag to a contact's tags array (no-op if already present)."""
        c = self.get_contact(contact_id)
        if not c:
            return False
        tags: List[str] = list(c.get("tags") or [])
        if tag not in tags:
            tags.append(tag)
        return self.update_contact(contact_id, tags=tags)

    def remove_tag(self, contact_id: str, tag: str) -> bool:
        """Remove a tag from a contact's tags array."""
        c = self.get_contact(contact_id)
        if not c:
            return False
        tags: List[str] = [t for t in (c.get("tags") or []) if t != tag]
        return self.update_contact(contact_id, tags=tags)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:  # pragma: no cover
        pass
