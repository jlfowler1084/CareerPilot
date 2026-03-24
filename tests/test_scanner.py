"""Tests for Gmail scanner — mocks Gmail API and Anthropic API."""

import base64
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.gmail.scanner import GmailScanner


# --- Fixtures ---


@pytest.fixture
def scanner():
    """Create a GmailScanner with dummy config (no real API calls)."""
    return GmailScanner(config={
        "credentials_file": Path("fake_creds.json"),
        "token_path": Path("fake_token.json"),
        "scopes": ["https://www.googleapis.com/auth/gmail.modify"],
        "anthropic_api_key": "fake-key",
    })


def _make_gmail_message(message_id, sender, subject, body, date="Mon, 17 Mar 2026 10:00:00 -0500"):
    """Build a mock Gmail API message response."""
    encoded_body = base64.urlsafe_b64encode(body.encode("utf-8")).decode("utf-8")
    return {
        "id": message_id,
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": sender},
                {"name": "Subject", "value": subject},
                {"name": "Date", "value": date},
            ],
            "body": {"data": encoded_body},
        },
    }


def _make_multipart_message(message_id, sender, subject, plain_body, html_body):
    """Build a mock multipart Gmail message."""
    plain_encoded = base64.urlsafe_b64encode(plain_body.encode("utf-8")).decode("utf-8")
    html_encoded = base64.urlsafe_b64encode(html_body.encode("utf-8")).decode("utf-8")
    return {
        "id": message_id,
        "payload": {
            "mimeType": "multipart/alternative",
            "headers": [
                {"name": "From", "value": sender},
                {"name": "Subject", "value": subject},
                {"name": "Date", "value": "Mon, 17 Mar 2026 10:00:00 -0500"},
            ],
            "body": {},
            "parts": [
                {"mimeType": "text/plain", "body": {"data": plain_encoded}},
                {"mimeType": "text/html", "body": {"data": html_encoded}},
            ],
        },
    }


def _mock_claude_response(json_body):
    """Create a mock Anthropic API response."""
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = json.dumps(json_body)
    mock_response.content = [mock_content]
    return mock_response


# --- Test: get_email_details ---


class TestGetEmailDetails:
    def test_plain_text_email(self, scanner):
        """Parses a simple plain-text email correctly."""
        msg = _make_gmail_message("msg1", "recruiter@acme.com", "Exciting Role", "Hello Joe")

        mock_service = MagicMock()
        mock_service.users().messages().get().execute.return_value = msg
        scanner._service = mock_service

        result = scanner.get_email_details("msg1")

        assert result["sender"] == "recruiter@acme.com"
        assert result["subject"] == "Exciting Role"
        assert result["body"] == "Hello Joe"
        assert result["message_id"] == "msg1"

    def test_multipart_email_prefers_plain(self, scanner):
        """For multipart messages, prefers text/plain over text/html."""
        msg = _make_multipart_message(
            "msg2", "hr@corp.com", "Follow up",
            "Plain body text", "<html><body>HTML body</body></html>",
        )

        mock_service = MagicMock()
        mock_service.users().messages().get().execute.return_value = msg
        scanner._service = mock_service

        result = scanner.get_email_details("msg2")
        assert result["body"] == "Plain body text"

    def test_api_failure_returns_none(self, scanner):
        """Returns None when Gmail API raises an exception."""
        mock_service = MagicMock()
        mock_service.users().messages().get().execute.side_effect = Exception("API error")
        scanner._service = mock_service

        result = scanner.get_email_details("msg_bad")
        assert result is None


# --- Test: classify_email ---


class TestClassifyEmail:
    def test_valid_classification(self, scanner):
        """Parses valid JSON classification from Claude."""
        classification = {
            "category": "recruiter_outreach",
            "company": "Acme Corp",
            "role": "Systems Engineer",
            "urgency": "high",
            "summary": "Recruiter reaching out about SE role",
        }

        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(classification)
            mock_client_fn.return_value = mock_client

            result = scanner.classify_email({"subject": "Test", "body": "Test body"})

        assert result["category"] == "recruiter_outreach"
        assert result["company"] == "Acme Corp"
        assert result["role"] == "Systems Engineer"
        assert result["urgency"] == "high"

    def test_classification_with_markdown_fences(self, scanner):
        """Strips markdown code fences from Claude response."""
        classification = {
            "category": "job_alert",
            "company": "BigTech",
            "role": "DevOps",
            "urgency": "medium",
            "summary": "Job alert from board",
        }

        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_content = MagicMock()
            mock_content.text = "```json\n" + json.dumps(classification) + "\n```"
            mock_response = MagicMock()
            mock_response.content = [mock_content]
            mock_client.messages.create.return_value = mock_response
            mock_client_fn.return_value = mock_client

            result = scanner.classify_email({"subject": "Test", "body": "body"})

        assert result["category"] == "job_alert"
        assert result["company"] == "BigTech"

    def test_malformed_json_returns_irrelevant(self, scanner):
        """Falls back to irrelevant when Claude returns unparseable text."""
        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_content = MagicMock()
            mock_content.text = "This is not JSON at all"
            mock_response = MagicMock()
            mock_response.content = [mock_content]
            mock_client.messages.create.return_value = mock_response
            mock_client_fn.return_value = mock_client

            result = scanner.classify_email({"subject": "Test", "body": "body"})

        assert result["category"] == "irrelevant"
        assert result["summary"] == "Classification failed"

    def test_invalid_category_defaults_to_irrelevant(self, scanner):
        """Corrects an unrecognized category to irrelevant."""
        classification = {
            "category": "spam",
            "company": "X",
            "role": "Y",
            "urgency": "low",
            "summary": "Unknown",
        }

        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(classification)
            mock_client_fn.return_value = mock_client

            result = scanner.classify_email({"subject": "Test", "body": "body"})

        assert result["category"] == "irrelevant"

    def test_missing_fields_use_defaults(self, scanner):
        """Missing fields in Claude response get safe defaults."""
        classification = {"category": "offer"}

        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(classification)
            mock_client_fn.return_value = mock_client

            result = scanner.classify_email({"subject": "Test", "body": "body"})

        assert result["category"] == "offer"
        assert result["company"] == ""
        assert result["role"] == ""
        assert result["urgency"] == "low"
        assert result["summary"] == ""

    def test_api_exception_returns_default(self, scanner):
        """Returns default classification when API call raises."""
        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.messages.create.side_effect = Exception("API down")
            mock_client_fn.return_value = mock_client

            result = scanner.classify_email({"subject": "Test", "body": "body"})

        assert result["category"] == "irrelevant"
        assert result["summary"] == "Classification failed"


# --- Test: scan_inbox ---


class TestScanInbox:
    def test_scan_processes_and_classifies(self, scanner):
        """Full scan flow: list messages, fetch details, classify each."""
        msg = _make_gmail_message("msg1", "recruiter@co.com", "Role for you", "Great opportunity")
        classification = {
            "category": "recruiter_outreach",
            "company": "Co",
            "role": "Engineer",
            "urgency": "medium",
            "summary": "Recruiter email",
        }

        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {
            "messages": [{"id": "msg1"}],
        }
        mock_service.users().messages().get().execute.return_value = msg
        scanner._service = mock_service

        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(classification)
            mock_client_fn.return_value = mock_client

            results = scanner.scan_inbox(days_back=7)

        assert len(results) == 1
        assert results[0]["category"] == "recruiter_outreach"
        assert results[0]["sender"] == "recruiter@co.com"
        assert results[0]["message_id"] == "msg1"

    def test_scan_skips_failed_emails(self, scanner):
        """A single email failure doesn't crash the whole scan."""
        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {
            "messages": [{"id": "msg_good"}, {"id": "msg_bad"}],
        }

        good_msg = _make_gmail_message("msg_good", "a@b.com", "Hi", "Hello")

        def get_side_effect(*args, **kwargs):
            mock_get = MagicMock()
            call_results = {"msg_good": good_msg}

            def execute_fn():
                msg_id = mock_service.users().messages().get.call_args
                # We need to handle sequential calls
                raise Exception("simulated failure")

            mock_get.execute = execute_fn
            return mock_get

        # Simpler approach: first call succeeds, second fails
        mock_get_chain = MagicMock()
        mock_get_chain.execute.side_effect = [good_msg, Exception("API error")]
        mock_service.users().messages().get.return_value = mock_get_chain
        scanner._service = mock_service

        classification = {
            "category": "job_alert",
            "company": "X",
            "role": "Y",
            "urgency": "low",
            "summary": "Alert",
        }

        with patch.object(scanner, "_get_claude_client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(classification)
            mock_client_fn.return_value = mock_client

            results = scanner.scan_inbox(days_back=7)

        # At least one result (the good one), the bad one was skipped
        assert len(results) >= 1

    def test_scan_not_authenticated_raises(self, scanner):
        """Raises RuntimeError if authenticate() wasn't called."""
        with pytest.raises(RuntimeError, match="Not authenticated"):
            scanner.scan_inbox()

    def test_scan_empty_inbox(self, scanner):
        """Returns empty list when no messages match."""
        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {}
        scanner._service = mock_service

        results = scanner.scan_inbox(days_back=7)
        assert results == []
