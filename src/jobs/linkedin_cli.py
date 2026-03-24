"""
CareerPilot CLI — LinkedIn Integration

Usage:
    python cli.py linkedin scan             Scan Gmail for LinkedIn job emails, extract and display listings
    python cli.py linkedin scan --days 30   Scan emails from last N days (default: 14)
    python cli.py linkedin search           Open LinkedIn job search URLs in browser
    python cli.py linkedin alerts           Show guide for setting up LinkedIn job alerts
    python cli.py linkedin profiles         List configured LinkedIn search profiles
"""

from __future__ import annotations

import sys
import webbrowser
from datetime import datetime, timedelta

from src.jobs.linkedin_parser import (
    parse_linkedin_email,
    deduplicate_jobs,
    build_linkedin_search_url,
    build_linkedin_alert_url,
    LINKEDIN_SEARCH_PROFILES,
)


def cmd_scan(days: int = 14, gmail_service=None):
    """
    Scan Gmail for LinkedIn job emails, parse job listings.

    Requires Gmail API access (reuses CareerPilot OAuth token).
    If gmail_service is None, will initialize from stored credentials.
    """
    if gmail_service is None:
        try:
            from config import settings
            from src.gmail.auth import get_gmail_service
            gmail_service = get_gmail_service(
                credentials_file=settings.GOOGLE_CREDENTIALS_FILE,
                token_path=settings.GMAIL_TOKEN_PATH,
                scopes=settings.GMAIL_SCOPES,
            )
        except Exception:
            print("Gmail client not available. Run from the CareerPilot project root.")
            return []

    print(f"\nScanning Gmail for LinkedIn job emails (last {days} days)...\n")

    after_date = (datetime.now() - timedelta(days=days)).strftime("%Y/%m/%d")
    query = f"from:linkedin.com after:{after_date} (subject:job OR subject:hiring OR subject:engineer OR subject:specialist OR subject:alert)"

    all_jobs = []
    page_token = None

    while True:
        kwargs = {"userId": "me", "q": query, "maxResults": 50}
        if page_token:
            kwargs["pageToken"] = page_token

        results = gmail_service.users().messages().list(**kwargs).execute()
        messages = results.get("messages", [])

        if not messages:
            break

        for msg_meta in messages:
            msg = gmail_service.users().messages().get(
                userId="me", id=msg_meta["id"], format="full"
            ).execute()

            # Extract headers
            headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
            from_addr = headers.get("From", "")
            date_str = headers.get("Date", "")
            subject = headers.get("Subject", "")

            # Extract body text
            body = _extract_body(msg["payload"])
            if not body:
                continue

            # Parse jobs from this email
            jobs = parse_linkedin_email(body, from_address=from_addr, email_date=date_str[:16])
            if jobs:
                print(f"  {subject[:70]}... -> {len(jobs)} job(s)")
                all_jobs.extend(jobs)

        page_token = results.get("nextPageToken")
        if not page_token:
            break

    # Deduplicate
    unique_jobs = deduplicate_jobs(all_jobs)

    print(f"\nFound {len(unique_jobs)} unique LinkedIn jobs ({len(all_jobs)} total before dedup)\n")

    for i, job in enumerate(unique_jobs, 1):
        salary_str = f" | {job['salary']}" if job['salary'] != "Not listed" else ""
        print(f"  {i:2}. {job['title']}")
        print(f"      {job['company']} | {job['location']}{salary_str}")
        print(f"      {job['url']}")
        print()

    return unique_jobs


def _extract_body(payload: dict) -> str:
    """Extract plain text body from Gmail message payload."""
    import base64

    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")

    # Multipart — find text/plain part
    for part in payload.get("parts", []):
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")
        # Nested multipart
        if part.get("parts"):
            result = _extract_body(part)
            if result:
                return result

    return ""


def cmd_search():
    """Open LinkedIn job search URLs in the browser."""
    print("\nOpening LinkedIn job searches in browser...\n")
    for profile_id, profile in LINKEDIN_SEARCH_PROFILES.items():
        url = build_linkedin_search_url(profile)
        print(f"  {profile['label']}")
        print(f"     {url[:80]}...")
        webbrowser.open(url)
    print(f"\n  Opened {len(LINKEDIN_SEARCH_PROFILES)} search tabs.\n")


def cmd_alerts():
    """Print a guide for setting up LinkedIn job alerts."""
    print("""
+--------------------------------------------------------+
|   LinkedIn Job Alert Setup Guide                       |
+--------------------------------------------------------+

LinkedIn job alerts send email notifications when new jobs
match your search criteria. These emails are then parsed by
CareerPilot's Gmail scanner (SCRUM-104 filters route them
to CareerPilot/Job Alerts automatically).

Steps:
  1. Open each URL below in your browser
  2. Click the "Set alert" bell icon on the search results page
  3. Set frequency to "Daily" for best coverage
  4. Ensure email notifications are ON in LinkedIn Settings:
     https://www.linkedin.com/mypreferences/d/job-alerts

Recommended alerts for your profile:
""")
    for profile_id, profile in LINKEDIN_SEARCH_PROFILES.items():
        url = build_linkedin_alert_url(profile)
        print(f"  {profile['label']}")
        print(f"     {url[:90]}")
        print()

    print("""
After setting up alerts, run:
  python cli.py linkedin scan

to parse incoming LinkedIn emails into the tracker pipeline.
""")


def cmd_profiles():
    """List configured LinkedIn search profiles."""
    print("\nLinkedIn Search Profiles\n")
    for profile_id, profile in LINKEDIN_SEARCH_PROFILES.items():
        remote_tag = " (Remote)" if profile.get("remote") else ""
        print(f"  [{profile_id}] {profile['label']}{remote_tag}")
        print(f"    Keywords: {profile['keywords']}")
        print(f"    Location: {profile['location']}")
        print()
