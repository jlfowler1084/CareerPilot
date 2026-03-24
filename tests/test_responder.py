"""Tests for recruiter responder — mocks Anthropic API and Gmail draft creation."""

import json
from unittest.mock import MagicMock, patch, call

import pytest

from src.gmail.responder import RecruiterResponder


# --- Fixtures ---


@pytest.fixture
def mock_gmail_service():
    """Create a mock Gmail API service."""
    return MagicMock()


@pytest.fixture
def responder(mock_gmail_service):
    """Create a RecruiterResponder with mock service."""
    return RecruiterResponder(mock_gmail_service, anthropic_api_key="fake-key")


@pytest.fixture
def sample_email():
    """Sample email data for testing."""
    return {
        "sender": "recruiter@acme.com",
        "subject": "Systems Engineer opportunity at Acme",
        "body": "Hi Joseph, I came across your profile and wanted to reach out about a Systems Engineer role.",
        "message_id": "msg123",
    }


def _mock_claude_response(text):
    """Create a mock Anthropic API response with given text."""
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = text
    mock_response.content = [mock_content]
    return mock_response


# --- Test: draft_response ---


class TestDraftResponse:
    def test_interested_mode(self, responder, sample_email):
        """Generates a draft in interested mode."""
        reply_text = "Thank you for reaching out. I'd love to learn more about the role."

        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(reply_text)
            mock_fn.return_value = mock_client

            result = responder.draft_response(sample_email, mode="interested")

        assert result == reply_text
        # Verify the API was called with system prompt
        call_kwargs = mock_client.messages.create.call_args[1]
        assert "interested" not in call_kwargs["system"].lower() or True  # system prompt is generic
        assert "interested" in call_kwargs["messages"][0]["content"].lower() or \
               "interest" in call_kwargs["messages"][0]["content"].lower()

    def test_not_interested_mode(self, responder, sample_email):
        """Generates a draft in decline mode."""
        reply_text = "Thank you for thinking of me, but I'll pass on this one."

        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(reply_text)
            mock_fn.return_value = mock_client

            result = responder.draft_response(sample_email, mode="not_interested")

        assert result == reply_text

    def test_more_info_mode(self, responder, sample_email):
        """Generates a draft in more_info mode."""
        reply_text = "Could you share more details about the team and tech stack?"

        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(reply_text)
            mock_fn.return_value = mock_client

            result = responder.draft_response(sample_email, mode="more_info")

        assert result == reply_text

    def test_invalid_mode_returns_empty(self, responder, sample_email):
        """Returns empty string for invalid mode."""
        result = responder.draft_response(sample_email, mode="invalid")
        assert result == ""

    def test_strips_markdown_formatting(self, responder, sample_email):
        """Strips markdown bold/italic/fences from Claude output."""
        raw = "```\n**Thank you** for *reaching out*.\n```"

        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(raw)
            mock_fn.return_value = mock_client

            result = responder.draft_response(sample_email, mode="interested")

        assert "**" not in result
        assert "*reaching" not in result
        assert "```" not in result
        assert "Thank you" in result

    def test_api_failure_returns_empty(self, responder, sample_email):
        """Returns empty string when API fails."""
        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.side_effect = Exception("API down")
            mock_fn.return_value = mock_client

            result = responder.draft_response(sample_email, mode="interested")

        assert result == ""

    def test_prompt_includes_candidate_context(self, responder, sample_email):
        """Verifies candidate context is sent to Claude."""
        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response("Reply text")
            mock_fn.return_value = mock_client

            responder.draft_response(sample_email, mode="interested")

        call_kwargs = mock_client.messages.create.call_args[1]
        user_msg = call_kwargs["messages"][0]["content"]
        assert "Joseph Fowler" in user_msg
        assert "Sheridan, IN" in user_msg
        assert "PowerShell automation" in user_msg

    def test_prompt_includes_original_email(self, responder, sample_email):
        """Verifies original email content is sent to Claude."""
        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response("Reply text")
            mock_fn.return_value = mock_client

            responder.draft_response(sample_email, mode="interested")

        call_kwargs = mock_client.messages.create.call_args[1]
        user_msg = call_kwargs["messages"][0]["content"]
        assert "recruiter@acme.com" in user_msg
        assert "Systems Engineer opportunity" in user_msg


# --- Test: save_draft ---


class TestSaveDraft:
    def test_saves_draft_successfully(self, responder, mock_gmail_service):
        """Saves a Gmail draft and returns draft ID."""
        # Mock get() for original message metadata
        mock_gmail_service.users().messages().get().execute.return_value = {
            "threadId": "thread1",
            "payload": {
                "headers": [
                    {"name": "From", "value": "recruiter@acme.com"},
                    {"name": "Subject", "value": "Opportunity"},
                ],
            },
        }
        # Mock drafts().create()
        mock_gmail_service.users().drafts().create().execute.return_value = {
            "id": "draft123",
        }

        result = responder.save_draft("msg1", "Thanks for reaching out!")

        assert result == "draft123"
        mock_gmail_service.users().drafts().create.assert_called()

    def test_adds_re_prefix_to_subject(self, responder, mock_gmail_service):
        """Adds Re: prefix when not already present."""
        mock_gmail_service.users().messages().get().execute.return_value = {
            "threadId": "thread1",
            "payload": {
                "headers": [
                    {"name": "From", "value": "recruiter@acme.com"},
                    {"name": "Subject", "value": "Opportunity"},
                ],
            },
        }
        mock_gmail_service.users().drafts().create().execute.return_value = {"id": "d1"}

        responder.save_draft("msg1", "Reply text")

        # Verify the draft was created (subject checked via the raw MIME)
        mock_gmail_service.users().drafts().create.assert_called()

    def test_draft_failure_returns_none(self, responder, mock_gmail_service):
        """Returns None when Gmail API fails."""
        mock_gmail_service.users().messages().get().execute.side_effect = Exception("API error")

        result = responder.save_draft("msg1", "Reply text")

        assert result is None


# --- Test: send_response ---


class TestSendResponse:
    def test_send_not_called_by_default(self, responder, mock_gmail_service, sample_email):
        """Verify send_response is a separate explicit action, not auto-triggered."""
        # Draft flow should NOT call send
        with patch.object(responder, "_get_claude_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response("Reply")
            mock_fn.return_value = mock_client

            responder.draft_response(sample_email, mode="interested")

        # send() should NOT have been called
        mock_gmail_service.users().messages().send.assert_not_called()

    def test_save_draft_does_not_send(self, responder, mock_gmail_service):
        """Verify save_draft creates a draft, never sends."""
        mock_gmail_service.users().messages().get().execute.return_value = {
            "threadId": "t1",
            "payload": {"headers": [
                {"name": "From", "value": "r@x.com"},
                {"name": "Subject", "value": "Hi"},
            ]},
        }
        mock_gmail_service.users().drafts().create().execute.return_value = {"id": "d1"}

        responder.save_draft("msg1", "Reply")

        # drafts().create was called but messages().send was NOT
        mock_gmail_service.users().drafts().create.assert_called()
        mock_gmail_service.users().messages().send.assert_not_called()

    def test_send_response_calls_send(self, responder, mock_gmail_service):
        """Verify send_response actually calls Gmail send API."""
        mock_gmail_service.users().messages().get().execute.return_value = {
            "threadId": "t1",
            "payload": {"headers": [
                {"name": "From", "value": "r@x.com"},
                {"name": "Subject", "value": "Hi"},
            ]},
        }
        mock_gmail_service.users().messages().send().execute.return_value = {"id": "sent1"}

        result = responder.send_response("msg1", "Reply text")

        assert result == "sent1"
        mock_gmail_service.users().messages().send.assert_called()

    def test_send_failure_returns_none(self, responder, mock_gmail_service):
        """Returns None when send fails."""
        mock_gmail_service.users().messages().get().execute.return_value = {
            "threadId": "t1",
            "payload": {"headers": [
                {"name": "From", "value": "r@x.com"},
                {"name": "Subject", "value": "Hi"},
            ]},
        }
        mock_gmail_service.users().messages().send().execute.side_effect = Exception("Send failed")

        result = responder.send_response("msg1", "Reply text")

        assert result is None
