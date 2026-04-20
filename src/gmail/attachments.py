"""Gmail attachment extraction for job description ingestion.

Walks a Gmail message's MIME parts, downloads PDF/DOCX attachments,
extracts their text, and applies simple heuristics to infer the job
title and hiring company.

Intentionally scoped: the body-text walking in scanner._extract_body
stays there. This module only cares about parts with attachment filenames.
"""

from __future__ import annotations

import base64
import io
import logging
import re
from email.utils import parseaddr
from typing import List, Optional

logger = logging.getLogger(__name__)

SUPPORTED_MIMETYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_TITLE_PATTERN = re.compile(
    r"^\s*(?:Job Title|Position|Role|Title)\s*[:\-]\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_COMPANY_PATTERN = re.compile(
    r"^\s*(?:Company|Employer|Client)\s*[:\-]\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

_GREETING_PREFIXES = ("dear ", "hi ", "hello ", "greetings", "subject:")


def list_supported_attachments(payload: dict) -> List[dict]:
    """Walk MIME parts and return metadata for supported attachments.

    Returns list of dicts with keys: filename, mimetype, attachment_id, size.
    """
    found: List[dict] = []
    _walk_parts(payload, found)
    return [a for a in found if a["mimetype"] in SUPPORTED_MIMETYPES]


def _walk_parts(payload: dict, found: List[dict]) -> None:
    """Recursively collect attachment metadata from MIME parts."""
    filename = payload.get("filename", "")
    body = payload.get("body", {})
    if filename and body.get("attachmentId"):
        found.append({
            "filename": filename,
            "mimetype": payload.get("mimeType", ""),
            "attachment_id": body["attachmentId"],
            "size": body.get("size", 0),
        })
    for part in payload.get("parts", []):
        _walk_parts(part, found)


def download_attachment(service, message_id: str, attachment_id: str) -> bytes:
    """Download raw attachment bytes from the Gmail API."""
    result = service.users().messages().attachments().get(
        userId="me", messageId=message_id, id=attachment_id,
    ).execute()
    data = result.get("data", "")
    return base64.urlsafe_b64decode(data)


def extract_pdf_text(data: bytes) -> str:
    """Extract text from a PDF blob using pdfminer.six."""
    from pdfminer.high_level import extract_text
    try:
        return extract_text(io.BytesIO(data)) or ""
    except Exception as exc:
        logger.warning("PDF extraction failed: %s", exc)
        return ""


def extract_docx_text(data: bytes) -> str:
    """Extract text from a DOCX blob using python-docx."""
    from docx import Document
    try:
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as exc:
        logger.warning("DOCX extraction failed: %s", exc)
        return ""


def parse_title(text: str) -> Optional[str]:
    """Extract job title via simple heuristics. Returns None if low confidence."""
    if not text:
        return None
    m = _TITLE_PATTERN.search(text)
    if m:
        return m.group(1).strip()
    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) <= 5 or not line[0].isalnum():
            continue
        if line.lower().startswith(_GREETING_PREFIXES):
            return None
        return line
    return None


def parse_company_from_text(text: str) -> Optional[str]:
    """Extract company from JD text via 'Company:' pattern. Returns None if absent."""
    if not text:
        return None
    m = _COMPANY_PATTERN.search(text)
    return m.group(1).strip() if m else None


def parse_company_from_sender(sender: str) -> Optional[str]:
    """Derive a best-effort company slug from an email sender's domain.

    Strips common no-reply prefixes and the TLD suffix. Returns the
    core domain slug (lowercase), or None if sender is empty/unparseable.
    Caller can title-case or map it to a canonical name if desired.
    """
    if not sender:
        return None
    _, email = parseaddr(sender)
    if "@" not in email:
        return None
    domain = email.split("@", 1)[1].lower()
    domain = re.sub(r"^(mail|smtp|email|noreply|no-reply)\.", "", domain)
    parts = domain.split(".")
    core = parts[-2] if len(parts) >= 2 else domain
    return core if len(core) >= 2 else None


def extract_job_description_from_email(service, message_id: str) -> Optional[dict]:
    """End-to-end: fetch message, pick first supported attachment, extract and parse.

    Returns dict with title, company, description, filename, mimetype, sender.
    Returns None if no supported attachment is found or extraction yields empty text.
    """
    msg = service.users().messages().get(
        userId="me", id=message_id, format="full",
    ).execute()

    headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
    sender = headers.get("from", "")

    attachments = list_supported_attachments(msg["payload"])
    if not attachments:
        return None

    att = attachments[0]
    data = download_attachment(service, message_id, att["attachment_id"])

    if att["mimetype"] == "application/pdf":
        text = extract_pdf_text(data)
    else:
        text = extract_docx_text(data)

    if not text or not text.strip():
        return None

    return {
        "title": parse_title(text),
        "company": parse_company_from_text(text) or parse_company_from_sender(sender),
        "description": text,
        "filename": att["filename"],
        "mimetype": att["mimetype"],
        "sender": sender,
    }
