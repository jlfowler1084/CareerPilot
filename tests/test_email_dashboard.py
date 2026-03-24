"""Tests for email communications dashboard — mocks Gmail API and Anthropic API."""

from __future__ import annotations

import base64
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from src.gmail.dashboard import EmailDashboard, LABEL_TO_CATEGORY
from src.gmail.thread_actions import ThreadActions


# --- Helpers ---


def _make_label(name, label_id):
    """Build a Gmail label dict."""
    return {"name": name, "id": label_id}


def _make_thread_metadata(thread_id, messages, snippet=""):
    """Build a mock Gmail threads.get() response (metadata format)."""
    return {
        "id": thread_id,
        "snippet": snippet,
        "messages": messages,
    }


def _make_metadata_message(msg_id, sender, subject, date_str, label_ids=None):
    """Build a mock message in metadata format."""
    return {
        "id": msg_id,
        "labelIds": label_ids or [],
        "payload": {
            "headers": [
                {"name": "From", "value": sender},
                {"name": "Subject", "value": subject},
                {"name": "Date", "value": date_str},
            ],
        },
    }


def _make_full_message(msg_id, sender, subject, body, date_str, label_ids=None):
    """Build a mock message in full format."""
    encoded_body = base64.urlsafe_b64encode(body.encode("utf-8")).decode("utf-8")
    return {
        "id": msg_id,
        "labelIds": label_ids or [],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": sender},
                {"name": "Subject", "value": subject},
                {"name": "Date", "value": date_str},
            ],
            "body": {"data": encoded_body},
        },
    }


def _mock_claude_response(text):
    """Create a mock Anthropic API response."""
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = text
    mock_response.content = [mock_content]
    return mock_response


# --- Fixtures ---


# Use dynamic dates to avoid staleness depending on when tests run
_now = datetime.now(timezone.utc)
_recent = _now - timedelta(hours=2)
_stale = _now - timedelta(hours=50)

RECENT_DATE = _recent.strftime("%a, %d %b %Y %H:%M:%S +0000")
STALE_DATE = _stale.strftime("%a, %d %b %Y %H:%M:%S +0000")


@pytest.fixture
def mock_service():
    """Create a mock Gmail API service."""
    return MagicMock()


@pytest.fixture
def labels():
    """Standard CareerPilot label list."""
    return [
        _make_label("CareerPilot", "Label_parent"),
        _make_label("CareerPilot/Recruiters", "Label_rec"),
        _make_label("CareerPilot/Interviews", "Label_int"),
        _make_label("CareerPilot/Applications", "Label_app"),
        _make_label("CareerPilot/Job Alerts", "Label_ja"),
        _make_label("CareerPilot/Offers-Rejections", "Label_or"),
    ]


@pytest.fixture
def dashboard(mock_service, labels):
    """Create an EmailDashboard with mocked service and labels."""
    mock_service.users().labels().list(userId="me").execute.return_value = {
        "labels": labels,
    }
    mock_service.users().getProfile(userId="me").execute.return_value = {
        "emailAddress": "joe@example.com",
    }
    return EmailDashboard(mock_service, user_email="joe@example.com")


@pytest.fixture
def actions(mock_service, dashboard):
    """Create ThreadActions with mocked service."""
    # Reuse the dashboard's label cache setup
    mock_service.users().labels().list(userId="me").execute.return_value = {
        "labels": [
            _make_label("CareerPilot/Recruiters", "Label_rec"),
            _make_label("CareerPilot/Interviews", "Label_int"),
            _make_label("CareerPilot/Applications", "Label_app"),
            _make_label("CareerPilot/Job Alerts", "Label_ja"),
            _make_label("CareerPilot/Offers-Rejections", "Label_or"),
        ],
    }
    mock_service.users().getProfile(userId="me").execute.return_value = {
        "emailAddress": "joe@example.com",
    }
    return ThreadActions(mock_service)


@pytest.fixture
def tmp_db(tmp_path):
    """Provide a temporary SQLite database path."""
    return tmp_path / "test.db"


# --- Test: EmailDashboard.fetch_threads ---


class TestFetchThreads:
    def test_fetches_from_multiple_labels(self, dashboard, mock_service):
        """Threads are fetched from each CareerPilot label."""
        msg1 = _make_metadata_message(
            "m1", "recruiter@acme.com", "Systems Engineer role",
            RECENT_DATE, label_ids=["Label_rec"],
        )
        msg2 = _make_metadata_message(
            "m2", "hr@bigco.com", "Interview scheduling",
            RECENT_DATE, label_ids=["Label_int"],
        )

        # threads.list returns different threads per label
        def list_threads(**kwargs):
            label_id = kwargs.get("labelIds", [None])[0]
            mock_resp = MagicMock()
            if label_id == "Label_rec":
                mock_resp.execute.return_value = {
                    "threads": [{"id": "t1"}],
                }
            elif label_id == "Label_int":
                mock_resp.execute.return_value = {
                    "threads": [{"id": "t2"}],
                }
            else:
                mock_resp.execute.return_value = {"threads": []}
            return mock_resp

        mock_service.users().threads().list = list_threads

        # threads.get returns metadata for each thread
        def get_thread(**kwargs):
            tid = kwargs.get("id")
            mock_resp = MagicMock()
            if tid == "t1":
                mock_resp.execute.return_value = _make_thread_metadata(
                    "t1", [msg1], snippet="Looking for systems engineer",
                )
            elif tid == "t2":
                mock_resp.execute.return_value = _make_thread_metadata(
                    "t2", [msg2], snippet="Let's schedule an interview",
                )
            return mock_resp

        mock_service.users().threads().get = get_thread

        threads = dashboard.fetch_threads(max_results=50)
        assert len(threads) == 2

        thread_ids = {t["thread_id"] for t in threads}
        assert "t1" in thread_ids
        assert "t2" in thread_ids

    def test_deduplicates_threads(self, dashboard, mock_service):
        """Same thread appearing in multiple labels is not duplicated."""
        msg = _make_metadata_message(
            "m1", "recruiter@acme.com", "Role at Acme",
            RECENT_DATE, label_ids=["Label_rec", "Label_int"],
        )

        # Both labels return the same thread
        def list_threads(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"threads": [{"id": "t1"}]}
            return mock_resp

        mock_service.users().threads().list = list_threads

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = _make_thread_metadata(
                "t1", [msg], snippet="Duplicate test",
            )
            return mock_resp

        mock_service.users().threads().get = get_thread

        threads = dashboard.fetch_threads()
        assert len(threads) == 1

    def test_sorted_by_date_desc(self, dashboard, mock_service):
        """Threads are sorted by last_message_date descending."""
        msg_old = _make_metadata_message(
            "m1", "old@acme.com", "Old thread",
            "Fri, 20 Mar 2026 10:00:00 +0000", label_ids=["Label_rec"],
        )
        msg_new = _make_metadata_message(
            "m2", "new@acme.com", "New thread",
            RECENT_DATE, label_ids=["Label_rec"],
        )

        def list_threads(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {
                "threads": [{"id": "t1"}, {"id": "t2"}],
            }
            return mock_resp

        mock_service.users().threads().list = list_threads

        def get_thread(**kwargs):
            tid = kwargs.get("id")
            mock_resp = MagicMock()
            if tid == "t1":
                mock_resp.execute.return_value = _make_thread_metadata("t1", [msg_old])
            else:
                mock_resp.execute.return_value = _make_thread_metadata("t2", [msg_new])
            return mock_resp

        mock_service.users().threads().get = get_thread

        threads = dashboard.fetch_threads()
        assert threads[0]["thread_id"] == "t2"  # newer first
        assert threads[1]["thread_id"] == "t1"

    def test_category_assigned(self, dashboard, mock_service):
        """Thread category matches its CareerPilot label."""
        msg = _make_metadata_message(
            "m1", "recruiter@acme.com", "Opportunity",
            RECENT_DATE, label_ids=["Label_rec"],
        )

        def list_threads(**kwargs):
            mock_resp = MagicMock()
            label_id = kwargs.get("labelIds", [None])[0]
            if label_id == "Label_rec":
                mock_resp.execute.return_value = {"threads": [{"id": "t1"}]}
            else:
                mock_resp.execute.return_value = {"threads": []}
            return mock_resp

        mock_service.users().threads().list = list_threads

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = _make_thread_metadata("t1", [msg])
            return mock_resp

        mock_service.users().threads().get = get_thread

        threads = dashboard.fetch_threads()
        assert threads[0]["category"] == "Recruiters"

    def test_empty_labels(self, dashboard, mock_service):
        """Returns empty list when no CareerPilot labels have threads."""
        def list_threads(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"threads": []}
            return mock_resp

        mock_service.users().threads().list = list_threads

        threads = dashboard.fetch_threads()
        assert threads == []


# --- Test: classify_thread_status ---


class TestClassifyThreadStatus:
    def test_awaiting_reply(self, dashboard, mock_service):
        """Status is awaiting_reply when last message is from someone else."""
        msg = _make_metadata_message(
            "m1", "recruiter@acme.com", "Role at Acme",
            RECENT_DATE, label_ids=["Label_rec"],
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"messages": [msg]}
            return mock_resp

        mock_service.users().threads().get = get_thread

        thread = {"thread_id": "t1"}
        result = dashboard.classify_thread_status(thread)
        assert result["status"] == "awaiting_reply"

    def test_awaiting_response(self, dashboard, mock_service):
        """Status is awaiting_response when last message is from the user."""
        msg = _make_metadata_message(
            "m1", "joe@example.com", "Re: Role at Acme",
            RECENT_DATE, label_ids=["Label_rec"],
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"messages": [msg]}
            return mock_resp

        mock_service.users().threads().get = get_thread

        thread = {"thread_id": "t1"}
        result = dashboard.classify_thread_status(thread)
        assert result["status"] == "awaiting_response"

    def test_scheduled(self, dashboard, mock_service):
        """Status is scheduled when thread has Interviews label."""
        msg = _make_metadata_message(
            "m1", "hr@company.com", "Interview confirmation",
            RECENT_DATE, label_ids=["Label_int"],
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"messages": [msg]}
            return mock_resp

        mock_service.users().threads().get = get_thread

        thread = {"thread_id": "t1"}
        result = dashboard.classify_thread_status(thread)
        assert result["status"] == "scheduled"

    def test_stale_detection(self, dashboard, mock_service):
        """is_stale is True when awaiting_reply and >24h since last message."""
        msg = _make_metadata_message(
            "m1", "recruiter@acme.com", "Stale thread",
            STALE_DATE, label_ids=["Label_rec"],
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"messages": [msg]}
            return mock_resp

        mock_service.users().threads().get = get_thread

        thread = {"thread_id": "t1"}
        result = dashboard.classify_thread_status(thread)
        assert result["status"] == "awaiting_reply"
        assert result["is_stale"] is True
        assert result["hours_since_last"] > 24

    def test_not_stale_if_recent(self, dashboard, mock_service):
        """is_stale is False when message is recent."""
        msg = _make_metadata_message(
            "m1", "recruiter@acme.com", "Fresh thread",
            RECENT_DATE, label_ids=["Label_rec"],
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"messages": [msg]}
            return mock_resp

        mock_service.users().threads().get = get_thread

        thread = {"thread_id": "t1"}
        result = dashboard.classify_thread_status(thread)
        assert result["is_stale"] is False


# --- Test: get_digest ---


class TestGetDigest:
    def test_digest_calculation(self, dashboard, mock_service):
        """Digest counts are computed correctly."""
        # Create two threads: one awaiting_reply (stale), one awaiting_response
        msg_stale = _make_metadata_message(
            "m1", "recruiter@acme.com", "Stale msg",
            STALE_DATE, label_ids=["Label_rec"],
        )
        msg_recent = _make_metadata_message(
            "m2", "joe@example.com", "My reply",
            RECENT_DATE, label_ids=["Label_rec"],
        )

        def list_threads(**kwargs):
            label_id = kwargs.get("labelIds", [None])[0]
            mock_resp = MagicMock()
            if label_id == "Label_rec":
                mock_resp.execute.return_value = {
                    "threads": [{"id": "t1"}, {"id": "t2"}],
                }
            else:
                mock_resp.execute.return_value = {"threads": []}
            return mock_resp

        mock_service.users().threads().list = list_threads

        def get_thread(**kwargs):
            tid = kwargs.get("id")
            fmt = kwargs.get("format", "metadata")
            mock_resp = MagicMock()
            if tid == "t1":
                mock_resp.execute.return_value = _make_thread_metadata("t1", [msg_stale])
            elif tid == "t2":
                mock_resp.execute.return_value = _make_thread_metadata("t2", [msg_recent])
            return mock_resp

        mock_service.users().threads().get = get_thread

        digest = dashboard.get_digest()
        assert digest["awaiting_reply"] == 1
        assert digest["stale_count"] == 1


# --- Test: get_thread_messages ---


class TestGetThreadMessages:
    def test_returns_ordered_messages(self, dashboard, mock_service):
        """Messages are returned in order with is_from_me flag."""
        msg1 = _make_full_message(
            "m1", "recruiter@acme.com", "Opportunity",
            "Hi Joseph, interested?", RECENT_DATE,
        )
        msg2 = _make_full_message(
            "m2", "joe@example.com", "Re: Opportunity",
            "Yes, tell me more.", RECENT_DATE,
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {
                "id": "t1",
                "messages": [msg1, msg2],
            }
            return mock_resp

        mock_service.users().threads().get = get_thread

        messages = dashboard.get_thread_messages("t1")
        assert len(messages) == 2
        assert messages[0]["is_from_me"] is False
        assert messages[1]["is_from_me"] is True
        assert "interested" in messages[0]["body"].lower()
        assert "tell me more" in messages[1]["body"].lower()


# --- Test: ThreadActions.reply ---


class TestReply:
    def test_sends_full_thread_to_claude(self, actions, mock_service):
        """Reply includes full thread context when calling Claude."""
        msg1 = _make_full_message(
            "m1", "recruiter@acme.com", "Opportunity",
            "Hi Joseph, I have a role for you.",
            RECENT_DATE,
        )
        msg2 = _make_full_message(
            "m2", "joe@example.com", "Re: Opportunity",
            "Thanks! Tell me more.",
            RECENT_DATE,
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {
                "id": "t1",
                "messages": [msg1, msg2],
            }
            return mock_resp

        mock_service.users().threads().get = get_thread

        reply_text = "I'd love to learn more about this opportunity."

        with patch.object(actions, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(reply_text)
            mock_fn.return_value = mock_client

            result = actions.reply("t1", mode="interested")

        assert result == reply_text

        # Verify full thread context was sent to Claude
        call_kwargs = mock_client.messages.create.call_args[1]
        user_msg = call_kwargs["messages"][0]["content"]
        assert "I have a role for you" in user_msg
        assert "Tell me more" in user_msg


# --- Test: ThreadActions.book ---


class TestBook:
    def test_book_includes_availability(self, mock_service):
        """Book flow includes calendar availability in the Claude prompt."""
        mock_cal = MagicMock()
        from datetime import datetime
        import pytz
        tz = pytz.timezone("America/Indiana/Indianapolis")
        slots = [tz.localize(datetime(2026, 3, 25, 10, 0))]
        mock_cal.get_availability.return_value = slots
        mock_cal.format_slots.return_value = "Wednesday March 25 at 10:00 AM EST"

        mock_service.users().getProfile(userId="me").execute.return_value = {
            "emailAddress": "joe@example.com",
        }
        mock_service.users().labels().list(userId="me").execute.return_value = {
            "labels": [_make_label("CareerPilot/Recruiters", "Label_rec")],
        }

        msg = _make_full_message(
            "m1", "hr@company.com", "Schedule interview",
            "Can we schedule a call?", RECENT_DATE,
        )

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {"id": "t1", "messages": [msg]}
            return mock_resp

        mock_service.users().threads().get = get_thread

        act = ThreadActions(mock_service, cal_scheduler=mock_cal)

        with patch.object(act, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(
                "I'm available Wednesday March 25 at 10 AM."
            )
            mock_fn.return_value = mock_client

            draft, returned_slots = act.book("t1")

        assert "available" in draft.lower() or "Wednesday" in draft
        assert returned_slots == slots

        # Verify availability was in Claude prompt
        call_kwargs = mock_client.messages.create.call_args[1]
        user_msg = call_kwargs["messages"][0]["content"]
        assert "10:00 AM" in user_msg


# --- Test: ThreadActions.snooze ---


class TestSnooze:
    def test_snooze_stores_in_kv(self, actions, tmp_db):
        """Snooze stores expiry in kv_store."""
        with patch("src.db.models.get_connection") as mock_conn_fn, \
             patch("src.db.models.set_kv") as mock_set_kv:
            mock_conn_fn.return_value = MagicMock()

            result = actions.snooze("t1", days=3, subject="Test thread")

        assert result is True
        mock_set_kv.assert_called_once()
        key = mock_set_kv.call_args[0][1]
        assert key == "snooze:t1"

        value = json.loads(mock_set_kv.call_args[0][2])
        assert "snooze_until" in value
        assert value["subject"] == "Test thread"

    def test_snooze_expiry(self, actions):
        """Snoozed thread with expired date returns False for is_snoozed."""
        expired_info = json.dumps({
            "snooze_until": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
            "subject": "Old thread",
            "snoozed_at": (datetime.now(timezone.utc) - timedelta(days=4)).isoformat(),
        })

        with patch("src.db.models.get_connection") as mock_conn_fn, \
             patch("src.db.models.get_kv") as mock_get_kv:
            mock_conn = MagicMock()
            mock_conn_fn.return_value = mock_conn
            mock_get_kv.return_value = expired_info

            snoozed, info = actions.is_snoozed("t1")

        assert snoozed is False
        assert info is not None  # Returns info for "follow up!" flag

    def test_snooze_active(self, actions):
        """Active snooze returns True for is_snoozed."""
        active_info = json.dumps({
            "snooze_until": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "subject": "Snoozed thread",
            "snoozed_at": datetime.now(timezone.utc).isoformat(),
        })

        with patch("src.db.models.get_connection") as mock_conn_fn, \
             patch("src.db.models.get_kv") as mock_get_kv:
            mock_conn_fn.return_value = MagicMock()
            mock_get_kv.return_value = active_info

            snoozed, info = actions.is_snoozed("t1")

        assert snoozed is True


# --- Test: ThreadActions.archive ---


class TestArchive:
    def test_archive_swaps_labels(self, actions, mock_service):
        """Archive removes CareerPilot/* labels and adds Archived."""
        # Set up label cache
        mock_service.users().labels().list(userId="me").execute.return_value = {
            "labels": [
                _make_label("CareerPilot/Recruiters", "Label_rec"),
                _make_label("CareerPilot/Interviews", "Label_int"),
                _make_label("CareerPilot/Archived", "Label_archive"),
            ],
        }
        # Force re-init of the dashboard's label cache
        actions._dashboard._label_id_map = None

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {
                "messages": [{"id": "m1"}, {"id": "m2"}],
            }
            return mock_resp

        mock_service.users().threads().get = get_thread

        result = actions.archive("t1")
        assert result is True

        # Verify batchModify was called
        mock_service.users().messages().batchModify.assert_called_once()
        call_kwargs = mock_service.users().messages().batchModify.call_args[1]
        body = call_kwargs["body"]
        assert "Label_archive" in body["addLabelIds"]
        assert "Label_rec" in body["removeLabelIds"]

    def test_archive_creates_label_if_missing(self, actions, mock_service):
        """Archived label is created if it doesn't exist."""
        mock_service.users().labels().list(userId="me").execute.return_value = {
            "labels": [
                _make_label("CareerPilot/Recruiters", "Label_rec"),
            ],
        }
        actions._dashboard._label_id_map = None

        # Label creation mock
        mock_service.users().labels().create(
            userId="me", body=MagicMock()
        ).execute.return_value = {"id": "Label_new_archive"}

        def get_thread(**kwargs):
            mock_resp = MagicMock()
            mock_resp.execute.return_value = {
                "messages": [{"id": "m1"}],
            }
            return mock_resp

        mock_service.users().threads().get = get_thread

        result = actions.archive("t1")
        assert result is True


# --- Test: ThreadActions.track ---


class TestTrack:
    def test_track_stores_link(self, actions):
        """Track stores thread-to-job mapping in kv_store."""
        with patch("src.db.models.get_connection") as mock_conn_fn, \
             patch("src.db.models.set_kv") as mock_set_kv:
            mock_conn_fn.return_value = MagicMock()

            result = actions.track("t1", 42)

        assert result is True
        mock_set_kv.assert_called_once()
        key = mock_set_kv.call_args[0][1]
        assert key == "thread_link:t1"

        value = json.loads(mock_set_kv.call_args[0][2])
        assert value["job_id"] == 42

    def test_get_linked_job(self, actions):
        """get_linked_job retrieves the stored job ID."""
        stored = json.dumps({
            "job_id": 42,
            "linked_at": "2026-03-24T12:00:00+00:00",
        })

        with patch("src.db.models.get_connection") as mock_conn_fn, \
             patch("src.db.models.get_kv") as mock_get_kv:
            mock_conn_fn.return_value = MagicMock()
            mock_get_kv.return_value = stored

            result = actions.get_linked_job("t1")

        assert result == 42

    def test_get_linked_job_none(self, actions):
        """get_linked_job returns None when no link exists."""
        with patch("src.db.models.get_connection") as mock_conn_fn, \
             patch("src.db.models.get_kv") as mock_get_kv:
            mock_conn_fn.return_value = MagicMock()
            mock_get_kv.return_value = None

            result = actions.get_linked_job("t1")

        assert result is None
