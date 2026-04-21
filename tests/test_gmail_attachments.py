"""Tests for src/gmail/attachments.py — attachment extraction for CAR-156."""

from __future__ import annotations

import base64
import io
from unittest.mock import MagicMock, patch

import pytest

from src.gmail import attachments


# --- Fixtures / helpers -------------------------------------------------------


def _attachment_part(filename, mimetype, attachment_id="att_1", size=100):
    """Build a mock Gmail MIME part that looks like an attachment."""
    return {
        "filename": filename,
        "mimeType": mimetype,
        "body": {"attachmentId": attachment_id, "size": size},
    }


def _inline_part(mimetype, data_bytes=b"body"):
    """Build a mock inline MIME part (body content, not an attachment)."""
    encoded = base64.urlsafe_b64encode(data_bytes).decode("utf-8")
    return {
        "filename": "",
        "mimeType": mimetype,
        "body": {"data": encoded},
    }


def _build_docx_bytes(*paragraphs):
    """Create an in-memory DOCX and return its bytes."""
    from docx import Document
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# --- list_supported_attachments -----------------------------------------------


class TestListSupportedAttachments:
    def test_finds_pdf(self):
        payload = {
            "parts": [
                _inline_part("text/plain"),
                _attachment_part("jd.pdf", "application/pdf"),
            ],
        }
        result = attachments.list_supported_attachments(payload)
        assert len(result) == 1
        assert result[0]["filename"] == "jd.pdf"
        assert result[0]["mimetype"] == "application/pdf"

    def test_finds_docx(self):
        payload = {
            "parts": [
                _attachment_part(
                    "jd.docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ),
            ],
        }
        result = attachments.list_supported_attachments(payload)
        assert len(result) == 1
        assert result[0]["filename"] == "jd.docx"

    def test_ignores_unsupported_mimetypes(self):
        """Images and octet-stream attachments should not be returned."""
        payload = {
            "parts": [
                _attachment_part("logo.png", "image/png"),
                _attachment_part("random.bin", "application/octet-stream"),
            ],
        }
        assert attachments.list_supported_attachments(payload) == []

    def test_handles_nested_multipart(self):
        """Walks into multipart/mixed -> multipart/alternative nesting."""
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "multipart/alternative",
                    "parts": [_inline_part("text/plain"), _inline_part("text/html")],
                },
                _attachment_part("jd.pdf", "application/pdf"),
            ],
        }
        result = attachments.list_supported_attachments(payload)
        assert len(result) == 1
        assert result[0]["filename"] == "jd.pdf"

    def test_empty_when_no_attachments(self):
        payload = {"parts": [_inline_part("text/plain"), _inline_part("text/html")]}
        assert attachments.list_supported_attachments(payload) == []

    def test_skips_parts_without_attachment_id(self):
        """A part with filename but no attachmentId is not a downloadable attachment."""
        payload = {
            "parts": [
                {"filename": "inline.txt", "mimeType": "text/plain", "body": {}},
                _attachment_part("jd.pdf", "application/pdf"),
            ],
        }
        result = attachments.list_supported_attachments(payload)
        assert len(result) == 1
        assert result[0]["filename"] == "jd.pdf"


# --- parse_title --------------------------------------------------------------


class TestParseTitle:
    def test_matches_job_title_pattern(self):
        assert attachments.parse_title("Job Title: Senior Platform Engineer") \
            == "Senior Platform Engineer"

    def test_matches_position_pattern(self):
        assert attachments.parse_title("Position: Systems Administrator") \
            == "Systems Administrator"

    def test_matches_role_pattern_case_insensitive(self):
        assert attachments.parse_title("role: DevOps Lead") == "DevOps Lead"

    def test_matches_dash_separator(self):
        assert attachments.parse_title("Title - Cloud Architect") == "Cloud Architect"

    def test_fallback_to_first_substantive_line(self):
        text = "\n\n   \nSenior Infrastructure Engineer\nSome description..."
        assert attachments.parse_title(text) == "Senior Infrastructure Engineer"

    def test_none_for_empty(self):
        assert attachments.parse_title("") is None
        assert attachments.parse_title(None) is None

    def test_none_for_greeting_only(self):
        """A message that starts with a greeting has no title to extract."""
        assert attachments.parse_title("Hi Joe,\nHope you're well.") is None

    def test_none_for_whitespace_only(self):
        assert attachments.parse_title("   \n\n  \n") is None


# --- parse_company_from_text --------------------------------------------------


class TestParseCompanyFromText:
    def test_matches_company_pattern(self):
        assert attachments.parse_company_from_text("Company: Acme Corp") == "Acme Corp"

    def test_matches_employer_pattern(self):
        assert attachments.parse_company_from_text("Employer: TEKsystems") == "TEKsystems"

    def test_matches_client_pattern(self):
        assert attachments.parse_company_from_text("Client: MISO Energy") == "MISO Energy"

    def test_none_when_absent(self):
        assert attachments.parse_company_from_text("Just job description text.") is None

    def test_none_for_empty(self):
        assert attachments.parse_company_from_text("") is None


# --- parse_company_from_sender ------------------------------------------------


class TestParseCompanyFromSender:
    def test_extracts_domain_slug(self):
        assert attachments.parse_company_from_sender("sarah@teksystems.com") == "teksystems"

    def test_strips_name_wrapper(self):
        """Handles 'Sarah Kim <sarah@tek.com>' format."""
        assert attachments.parse_company_from_sender("Sarah Kim <sarah@tek.com>") == "tek"

    def test_strips_noreply_prefix(self):
        assert attachments.parse_company_from_sender("sys@no-reply.roberthalf.com") == "roberthalf"

    def test_strips_mail_prefix(self):
        assert attachments.parse_company_from_sender("sys@mail.kforce.com") == "kforce"

    def test_none_for_missing_at(self):
        assert attachments.parse_company_from_sender("not-an-email") is None

    def test_none_for_empty(self):
        assert attachments.parse_company_from_sender("") is None

    def test_none_for_too_short_slug(self):
        """A single-character domain core is too uncertain to use."""
        assert attachments.parse_company_from_sender("user@a.com") is None


# --- extract_docx_text (round-trip with real python-docx) --------------------


class TestExtractDocxText:
    def test_round_trip(self):
        data = _build_docx_bytes("Job Title: Senior Engineer", "Location: Remote")
        text = attachments.extract_docx_text(data)
        assert "Senior Engineer" in text
        assert "Remote" in text

    def test_empty_string_on_broken_blob(self):
        """Corrupt DOCX bytes produce empty string (logged), not an exception."""
        assert attachments.extract_docx_text(b"not a real docx") == ""


# --- extract_pdf_text (mocked pdfminer) --------------------------------------


class TestExtractPdfText:
    @patch("pdfminer.high_level.extract_text")
    def test_returns_text_from_pdfminer(self, mock_extract):
        mock_extract.return_value = "Title: Senior SRE\nGreat opportunity..."
        result = attachments.extract_pdf_text(b"fake-pdf-bytes")
        assert "Senior SRE" in result

    @patch("pdfminer.high_level.extract_text")
    def test_empty_string_on_extraction_failure(self, mock_extract):
        mock_extract.side_effect = Exception("boom")
        assert attachments.extract_pdf_text(b"fake-pdf-bytes") == ""


# --- download_attachment ------------------------------------------------------


class TestDownloadAttachment:
    def test_decodes_urlsafe_base64(self):
        """Downloads and URL-safe-base64 decodes the attachment payload."""
        service = MagicMock()
        payload_bytes = b"hello world"
        encoded = base64.urlsafe_b64encode(payload_bytes).decode("utf-8")
        service.users().messages().attachments().get().execute.return_value = {
            "data": encoded,
        }

        result = attachments.download_attachment(service, "msg_1", "att_1")
        assert result == payload_bytes


# --- extract_job_description_from_email (end-to-end with mocks) --------------


class TestExtractJobDescriptionFromEmail:
    def test_returns_none_when_no_supported_attachment(self):
        service = MagicMock()
        service.users().messages().get().execute.return_value = {
            "payload": {
                "headers": [{"name": "From", "value": "foo@bar.com"}],
                "parts": [_inline_part("text/plain")],
            },
        }
        assert attachments.extract_job_description_from_email(service, "msg_1") is None

    def test_full_pipeline_with_docx(self):
        """Real DOCX + mocked Gmail service → parsed dict."""
        docx_bytes = _build_docx_bytes(
            "Job Title: Senior Infrastructure Engineer",
            "Company: Acme Corp",
            "We are hiring...",
        )

        service = MagicMock()
        service.users().messages().get().execute.return_value = {
            "payload": {
                "headers": [{"name": "From", "value": "sarah@tek.com"}],
                "parts": [
                    _attachment_part(
                        "jd.docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        attachment_id="att_docx",
                    ),
                ],
            },
        }
        service.users().messages().attachments().get().execute.return_value = {
            "data": base64.urlsafe_b64encode(docx_bytes).decode("utf-8"),
        }

        result = attachments.extract_job_description_from_email(service, "msg_1")
        assert result is not None
        assert result["title"] == "Senior Infrastructure Engineer"
        assert result["company"] == "Acme Corp"
        assert "We are hiring" in result["description"]
        assert result["filename"] == "jd.docx"
        assert result["sender"] == "sarah@tek.com"

    def test_sender_fallback_for_company_when_absent_in_text(self):
        """If the JD text has no 'Company:' line, sender domain is used."""
        docx_bytes = _build_docx_bytes("Job Title: Staff Engineer", "Description only.")

        service = MagicMock()
        service.users().messages().get().execute.return_value = {
            "payload": {
                "headers": [{"name": "From", "value": "hr@teksystems.com"}],
                "parts": [
                    _attachment_part(
                        "jd.docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        attachment_id="att_docx",
                    ),
                ],
            },
        }
        service.users().messages().attachments().get().execute.return_value = {
            "data": base64.urlsafe_b64encode(docx_bytes).decode("utf-8"),
        }

        result = attachments.extract_job_description_from_email(service, "msg_1")
        assert result is not None
        assert result["company"] == "teksystems"

    def test_returns_none_when_extracted_text_empty(self):
        """Corrupt attachment yields empty text → None result."""
        service = MagicMock()
        service.users().messages().get().execute.return_value = {
            "payload": {
                "headers": [{"name": "From", "value": "x@y.com"}],
                "parts": [
                    _attachment_part(
                        "jd.docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        attachment_id="att_docx",
                    ),
                ],
            },
        }
        service.users().messages().attachments().get().execute.return_value = {
            "data": base64.urlsafe_b64encode(b"not real docx").decode("utf-8"),
        }

        assert attachments.extract_job_description_from_email(service, "msg_1") is None
