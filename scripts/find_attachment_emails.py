"""Print recent Gmail messages with PDF/DOCX attachments.

Prints the Gmail API message_id (not the web-UI thread token) so the
output can be piped directly into `tracker import-from-email`.

Usage:
    python scripts/find_attachment_emails.py            # last 30 days
    python scripts/find_attachment_emails.py --days 7   # last 7 days
    python scripts/find_attachment_emails.py --max 50   # more results
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Make project root importable when invoked as `python scripts/...`
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import settings  # noqa: E402
from src.gmail.auth import get_gmail_service  # noqa: E402

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=30, help="Lookback window (default 30).")
    parser.add_argument("--max", type=int, default=25, help="Max results (default 25).")
    args = parser.parse_args()

    service = get_gmail_service(
        credentials_file=settings.GOOGLE_CREDENTIALS_FILE,
        token_path=settings.GMAIL_TOKEN_PATH,
        scopes=settings.GMAIL_SCOPES,
    )

    query = f"newer_than:{args.days}d has:attachment (filename:pdf OR filename:docx)"
    resp = (
        service.users()
        .messages()
        .list(userId="me", q=query, maxResults=args.max)
        .execute()
    )
    msgs = resp.get("messages", [])

    if not msgs:
        print(f"No messages with PDF/DOCX attachments in the last {args.days} days.")
        return 0

    print(f"{len(msgs)} candidate message(s) with PDF/DOCX attachments:\n")
    for m in msgs:
        meta = (
            service.users()
            .messages()
            .get(
                userId="me",
                id=m["id"],
                format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            )
            .execute()
        )
        headers = {h["name"]: h["value"] for h in meta["payload"]["headers"]}
        print(f"  {m['id']}")
        print(f"    From:    {headers.get('From', '')[:70]}")
        print(f"    Subject: {headers.get('Subject', '')[:80]}")
        print(f"    Date:    {headers.get('Date', '')}")
        print()

    print("To import one:  python cli.py tracker import-from-email <ID> --dry-run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
