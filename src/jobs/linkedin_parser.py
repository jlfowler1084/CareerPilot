"""
CareerPilot — LinkedIn Email Parser

Extracts structured job listings from LinkedIn email notifications.
Supports two email formats:
  1. Job Alert emails (from jobalerts-noreply@linkedin.com)
  2. Career Insights emails (from messages-noreply@linkedin.com)

Each returns jobs in the unified CareerPilot format:
  {title, company, location, salary, url, posted, source, linkedin_job_id}
"""

from __future__ import annotations

import re
from datetime import datetime

from config.search_profiles import LINKEDIN_SEARCH_PROFILES


def extract_linkedin_job_id(url: str) -> str | None:
    """Extract the numeric job ID from a LinkedIn job URL."""
    match = re.search(r'/jobs/view/(\d+)', url)
    return match.group(1) if match else None


def clean_linkedin_url(url: str) -> str:
    """Strip tracking params, return clean LinkedIn job URL."""
    job_id = extract_linkedin_job_id(url)
    if job_id:
        return f"https://www.linkedin.com/jobs/view/{job_id}/"
    return url


def parse_job_alert_email(body: str, email_date: str = "") -> list[dict]:
    """
    Parse LinkedIn Job Alert emails.

    Format:
        Job Title
        Company Name
        Location (optional)
        [This company is actively hiring]
        View job: https://www.linkedin.com/comm/jobs/view/XXXXXXX...
        ---------------------------------------------------------
    """
    jobs = []

    # Split on the dashed separator lines
    blocks = re.split(r'-{5,}', body)

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Find the "View job:" URL
        url_match = re.search(r'View job:\s*(https://www\.linkedin\.com/comm/jobs/view/\S+)', block)
        if not url_match:
            continue

        raw_url = url_match.group(1)
        job_id = extract_linkedin_job_id(raw_url)
        clean_url = clean_linkedin_url(raw_url)

        # Get lines before the URL — these contain title, company, location
        before_url = block[:url_match.start()].strip()
        lines = [l.strip() for l in before_url.split('\n') if l.strip()]

        # Filter out noise lines
        lines = [
            l for l in lines
            if not l.startswith('Your job alert')
            and not l.startswith("You'll receive")
            and l != 'This company is actively hiring'
        ]

        if not lines:
            continue

        title = lines[0] if len(lines) >= 1 else ""
        company = lines[1] if len(lines) >= 2 else "Unknown"
        location = lines[2] if len(lines) >= 3 else ""

        # Check if a line looks like a salary
        salary = "Not listed"
        for line in lines:
            if re.search(r'\$[\d,]+[Kk]?', line):
                salary = line
                break

        jobs.append({
            "title": title,
            "company": company,
            "location": location,
            "salary": salary,
            "url": clean_url,
            "posted": email_date,
            "source": "LinkedIn",
            "linkedin_job_id": job_id,
            "type": "",
        })

    return jobs


def parse_career_insights_email(body: str, email_date: str = "") -> list[dict]:
    """
    Parse LinkedIn Career Insights emails.

    Format:
        Job Title
        Company · Location
        $XXK-$XXXK / year (optional)
        View jobhttps://www.linkedin.com/comm/jobs/view/XXXXXXX...
    """
    jobs = []

    # Find all "View job" links
    pattern = r'View job(https://www\.linkedin\.com/comm/jobs/view/\S+)'
    matches = list(re.finditer(pattern, body))

    for i, match in enumerate(matches):
        raw_url = match.group(1)
        job_id = extract_linkedin_job_id(raw_url)
        clean_url = clean_linkedin_url(raw_url)

        # Get the text block preceding this URL
        start = matches[i - 1].end() if i > 0 else 0
        preceding = body[start:match.start()].strip()

        # Get the last few meaningful lines before "View job"
        lines = [l.strip() for l in preceding.split('\n') if l.strip()]

        # Filter noise
        lines = [
            l for l in lines
            if not l.startswith('People with similar')
            and not l.startswith('Companies with the most')
            and l not in ('', '\r')
            and not l.startswith('Trending')
            and not l.startswith('Check out')
            and len(l) > 1
        ]

        # Take the last 2-3 lines as the job block
        job_lines = lines[-3:] if len(lines) >= 3 else lines

        if not job_lines:
            continue

        title = ""
        company = "Unknown"
        location = ""
        salary = "Not listed"

        for line in job_lines:
            # Salary line
            if re.search(r'\$[\d,]+[Kk]?\s*[-–]\s*\$[\d,]+[Kk]?', line):
                salary = line.strip()
            # Company · Location line
            elif '·' in line:
                parts = line.split('·', 1)
                company = parts[0].strip()
                location = parts[1].strip() if len(parts) > 1 else ""
            # Title — the first non-salary, non-company line
            elif not title:
                title = line.strip()

        if not title:
            continue

        jobs.append({
            "title": title,
            "company": company,
            "location": location,
            "salary": salary,
            "url": clean_url,
            "posted": email_date,
            "source": "LinkedIn",
            "linkedin_job_id": job_id,
            "type": "",
        })

    return jobs


def parse_linkedin_email(body: str, from_address: str = "", email_date: str = "") -> list[dict]:
    """
    Auto-detect email type and parse accordingly.

    Args:
        body: Email body text
        from_address: Sender email address
        email_date: Date string for the posted field
    """
    if "jobalerts-noreply" in from_address:
        return parse_job_alert_email(body, email_date)
    elif "messages-noreply" in from_address or "View jobhttps" in body:
        return parse_career_insights_email(body, email_date)
    elif "jobs-noreply" in from_address:
        # "Looking for a new job?" emails — similar to career insights
        return parse_career_insights_email(body, email_date)
    else:
        # Try both parsers, return whichever finds results
        results = parse_job_alert_email(body, email_date)
        if not results:
            results = parse_career_insights_email(body, email_date)
        return results


def deduplicate_jobs(jobs: list[dict], existing_jobs: list[dict] | None = None) -> list[dict]:
    """
    Deduplicate LinkedIn jobs by job ID and title+company.
    Also deduplicates against existing Indeed/Dice results if provided.
    """
    seen_ids = set()
    seen_keys = set()
    unique = []

    # Build existing set
    if existing_jobs:
        for job in existing_jobs:
            key = f"{job.get('title', '')}|||{job.get('company', '')}".lower()
            seen_keys.add(key)
            if job.get('linkedin_job_id'):
                seen_ids.add(job['linkedin_job_id'])

    for job in jobs:
        job_id = job.get('linkedin_job_id')
        key = f"{job['title']}|||{job['company']}".lower()

        if job_id and job_id in seen_ids:
            continue
        if key in seen_keys:
            continue

        seen_ids.add(job_id)
        seen_keys.add(key)
        unique.append(job)

    return unique


# ── LinkedIn Job Search URL Builder ──────────────────────────────────


def build_linkedin_search_url(profile: dict) -> str:
    """Build a LinkedIn job search URL from a search profile."""
    from urllib.parse import quote_plus

    base = "https://www.linkedin.com/jobs/search/?"
    params = [
        f"keywords={quote_plus(profile['keywords'])}",
        f"geoId={profile['geo_id']}",
        "sortBy=R",  # sort by relevance
    ]
    if profile.get("remote"):
        params.append("f_WT=2")  # remote filter
    return base + "&".join(params)


def build_linkedin_alert_url(profile: dict) -> str:
    """Build a URL to create a LinkedIn job alert for this search."""
    # Same as search URL — user can click "Set alert" on the page
    return build_linkedin_search_url(profile)
