#!/usr/bin/env python3
"""
career_page_scraper.py — Direct Company Career Page Monitor (SCRUM-97)

Scans major Indianapolis employer career pages for IT/infrastructure roles
using the Anthropic API with web_search. Results stored in SQLite for
deduplication, change detection, and morning scan integration.

Usage:
    python career_page_scraper.py scan              # Run full scan
    python career_page_scraper.py scan --company lilly  # Scan one company
    python career_page_scraper.py list              # Show all stored jobs
    python career_page_scraper.py new               # Show jobs found in last scan
    python career_page_scraper.py stats             # Show scan statistics
    python career_page_scraper.py export            # Export JSON for dashboard
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("Installing requests...")
    os.system(f"{sys.executable} -m pip install requests --break-system-packages -q")
    import requests


# ═══════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-20250514"
DB_PATH = Path(__file__).parent / "data" / "career_pages.db"

# Target role keywords — matched against job titles
ROLE_KEYWORDS = [
    "systems administrator", "system administrator", "sysadmin",
    "systems engineer", "infrastructure engineer", "platform engineer",
    "windows server", "windows administrator",
    "active directory", "identity engineer",
    "devops engineer", "cloud engineer", "azure engineer",
    "powershell", "automation engineer",
    "network engineer", "network administrator",
    "IT manager", "IT director", "IT operations",
    "help desk", "desktop support", "IT support",
    "VMware", "virtualization engineer",
    "security engineer", "cybersecurity", "information security",
    "M365", "Microsoft 365", "Exchange administrator",
    "site reliability", "SRE",
    "IT analyst", "technology analyst",
    "database administrator", "DBA",
    "storage engineer", "backup administrator",
]

# Negative keywords — filter out irrelevant results
NEGATIVE_KEYWORDS = [
    "nurse", "physician", "pharmacist", "clinical", "medical director",
    "sales representative", "account executive", "marketing manager",
    "warehouse", "forklift", "production operator", "assembly",
    "truck driver", "delivery", "custodian", "janitor",
    "intern", "internship", "co-op",
]

# Target companies with career page URLs and search strategies
COMPANIES = [
    {
        "id": "lilly",
        "name": "Eli Lilly",
        "careers_url": "https://careers.lilly.com/us/en/c/information-technology-jobs",
        "search_queries": [
            "site:careers.lilly.com systems administrator Indianapolis",
            "site:careers.lilly.com infrastructure engineer Indianapolis",
            "site:careers.lilly.com Windows server engineer Indianapolis",
            "site:jobsearch.lilly.com IT infrastructure Indianapolis",
        ],
        "location": "Indianapolis, IN",
        "industry": "Pharmaceutical",
    },
    {
        "id": "elevance",
        "name": "Elevance Health",
        "careers_url": "https://careers.elevancehealth.com/jobs",
        "search_queries": [
            "site:careers.elevancehealth.com systems administrator Indianapolis",
            "site:careers.elevancehealth.com infrastructure engineer Indianapolis",
            "site:careers.elevancehealth.com Windows server IT Indianapolis",
            "Elevance Health IT infrastructure jobs Indianapolis 2026",
        ],
        "location": "Indianapolis, IN",
        "industry": "Healthcare/Insurance",
    },
    {
        "id": "cummins",
        "name": "Cummins",
        "careers_url": "https://www.cummins.com/careers",
        "search_queries": [
            "site:cummins.com careers systems administrator Indianapolis",
            "site:cummins.com careers IT infrastructure Indianapolis",
            "Cummins IT infrastructure engineer Indianapolis 2026",
        ],
        "location": "Indianapolis, IN",
        "industry": "Manufacturing/Engineering",
    },
    {
        "id": "iuhealth",
        "name": "IU Health",
        "careers_url": "https://iuhealth.org/careers",
        "search_queries": [
            "site:iuhealth.org careers systems administrator",
            "site:iuhealth.org careers IT infrastructure engineer",
            "IU Health IT systems engineer Indianapolis 2026",
        ],
        "location": "Indianapolis, IN",
        "industry": "Healthcare",
    },
    {
        "id": "salesforce",
        "name": "Salesforce",
        "careers_url": "https://careers.salesforce.com/en/jobs/",
        "search_queries": [
            "site:careers.salesforce.com systems administrator Indianapolis",
            "site:careers.salesforce.com infrastructure engineer Indianapolis",
            "Salesforce IT infrastructure Indianapolis remote 2026",
        ],
        "location": "Indianapolis, IN / Remote",
        "industry": "Technology",
    },
    {
        "id": "roche",
        "name": "Roche Diagnostics",
        "careers_url": "https://careers.roche.com/global/en",
        "search_queries": [
            "site:careers.roche.com systems administrator Indianapolis",
            "site:careers.roche.com IT infrastructure Indianapolis",
            "Roche Diagnostics IT jobs Indianapolis 2026",
        ],
        "location": "Indianapolis, IN",
        "industry": "Diagnostics/Healthcare",
    },
    {
        "id": "indiana_state",
        "name": "State of Indiana",
        "careers_url": "https://workforindiana.in.gov/",
        "search_queries": [
            "site:workforindiana.in.gov systems administrator",
            "site:workforindiana.in.gov IT infrastructure",
            "State of Indiana IT systems administrator Indianapolis 2026",
        ],
        "location": "Indianapolis, IN",
        "industry": "Government",
    },
    {
        "id": "iu",
        "name": "Indiana University",
        "careers_url": "https://jobs.iu.edu/",
        "search_queries": [
            "site:jobs.iu.edu systems administrator",
            "site:jobs.iu.edu IT infrastructure engineer",
            "Indiana University IT systems administrator Indianapolis IUPUI 2026",
        ],
        "location": "Indianapolis, IN",
        "industry": "Education",
    },
    {
        "id": "purdue",
        "name": "Purdue University",
        "careers_url": "https://careers.purdue.edu/",
        "search_queries": [
            "site:careers.purdue.edu systems administrator",
            "site:careers.purdue.edu IT infrastructure",
            "Purdue University IT systems engineer West Lafayette 2026",
        ],
        "location": "West Lafayette, IN",
        "industry": "Education",
    },
    {
        "id": "indy_city",
        "name": "City of Indianapolis",
        "careers_url": "https://www.indy.gov/careers",
        "search_queries": [
            "site:indy.gov IT systems administrator",
            "City of Indianapolis IT infrastructure jobs 2026",
            "Indianapolis Marion County IT technology jobs 2026",
        ],
        "location": "Indianapolis, IN",
        "industry": "Government",
    },
]


# ═══════════════════════════════════════════════════════════════
# Database
# ═══════════════════════════════════════════════════════════════

def init_db():
    """Initialize SQLite database with schema."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            company_id TEXT NOT NULL,
            company_name TEXT NOT NULL,
            location TEXT,
            url TEXT,
            salary TEXT,
            job_type TEXT,
            posted_date TEXT,
            description_snippet TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            scan_id TEXT NOT NULL,
            is_relevant INTEGER DEFAULT 1,
            applied INTEGER DEFAULT 0,
            notes TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scans (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            companies_scanned INTEGER DEFAULT 0,
            jobs_found INTEGER DEFAULT 0,
            new_jobs INTEGER DEFAULT 0,
            errors TEXT
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON jobs(first_seen)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_jobs_scan ON jobs(scan_id)
    """)
    conn.commit()
    return conn


def job_id(title: str, company: str, url: str = "") -> str:
    """Generate stable ID from title + company + url."""
    raw = f"{title.lower().strip()}|{company.lower().strip()}|{url.strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def upsert_job(conn, job: dict, scan_id: str) -> bool:
    """Insert or update a job. Returns True if this is a new job."""
    jid = job_id(job["title"], job["company_name"], job.get("url", ""))
    now = datetime.now(timezone.utc).isoformat()

    existing = conn.execute("SELECT id FROM jobs WHERE id = ?", (jid,)).fetchone()
    if existing:
        conn.execute("""
            UPDATE jobs SET last_seen = ?, scan_id = ?,
                salary = COALESCE(?, salary),
                url = COALESCE(?, url)
            WHERE id = ?
        """, (now, scan_id, job.get("salary"), job.get("url"), jid))
        return False
    else:
        conn.execute("""
            INSERT INTO jobs (id, title, company_id, company_name, location, url,
                salary, job_type, posted_date, description_snippet,
                first_seen, last_seen, scan_id, is_relevant)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            jid, job["title"], job["company_id"], job["company_name"],
            job.get("location", ""), job.get("url", ""),
            job.get("salary", ""), job.get("job_type", ""),
            job.get("posted_date", ""), job.get("description_snippet", ""),
            now, now, scan_id, 1
        ))
        return True


# ═══════════════════════════════════════════════════════════════
# Anthropic API + Web Search
# ═══════════════════════════════════════════════════════════════

def search_company(company: dict) -> list[dict]:
    """Search a company's career pages for relevant IT jobs."""
    if not ANTHROPIC_API_KEY:
        print(f"  ⚠ No ANTHROPIC_API_KEY set — skipping API search for {company['name']}")
        return []

    role_list = ", ".join(ROLE_KEYWORDS[:10])
    queries_list = "\n".join(f"  - {q}" for q in company["search_queries"])

    prompt = f"""Search for current IT infrastructure and systems administration job openings at {company['name']} in or near Indianapolis, IN (or remote positions).

Target career page: {company['careers_url']}

Search these queries to find relevant postings:
{queries_list}

I'm looking for roles matching these keywords: {role_list}

For each job found, extract:
- title: The exact job title
- url: Direct link to the job posting
- location: City/state or Remote
- salary: If listed
- job_type: Full-time, Contract, etc.
- posted_date: If visible
- description_snippet: 1-2 sentence summary of the role

Return results as a JSON array. If no relevant IT/infrastructure jobs are found, return an empty array [].
Return ONLY the JSON array, no other text."""

    try:
        resp = requests.post(
            ANTHROPIC_API_URL,
            headers={
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": MODEL,
                "max_tokens": 4000,
                "tools": [{"type": "web_search_20250305", "name": "web_search"}],
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        # Extract text from response content blocks
        text_parts = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block["text"])

        full_text = "\n".join(text_parts)

        # Parse JSON from response
        jobs = _parse_jobs_json(full_text, company)
        return jobs

    except requests.exceptions.Timeout:
        print(f"  ⚠ Timeout searching {company['name']}")
        return []
    except requests.exceptions.RequestException as e:
        print(f"  ⚠ API error for {company['name']}: {e}")
        return []
    except Exception as e:
        print(f"  ⚠ Unexpected error for {company['name']}: {e}")
        return []


def _parse_jobs_json(text: str, company: dict) -> list[dict]:
    """Parse JSON job array from API response text."""
    # Try to find JSON array in the text
    import re

    # Strip markdown code fences
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)

    # Find the JSON array
    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        return []

    try:
        raw_jobs = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []

    jobs = []
    for raw in raw_jobs:
        title = raw.get("title", "").strip()
        if not title:
            continue

        # Relevance check
        if not _is_relevant(title):
            continue

        jobs.append({
            "title": title,
            "company_id": company["id"],
            "company_name": company["name"],
            "location": raw.get("location", company.get("location", "")),
            "url": raw.get("url", ""),
            "salary": raw.get("salary", ""),
            "job_type": raw.get("job_type", ""),
            "posted_date": raw.get("posted_date", ""),
            "description_snippet": raw.get("description_snippet", "")[:500],
        })

    return jobs


def _is_relevant(title: str) -> bool:
    """Check if a job title is relevant to our search."""
    t = title.lower()

    # Check negative keywords first
    for neg in NEGATIVE_KEYWORDS:
        if neg.lower() in t:
            return False

    # Check positive keywords
    for kw in ROLE_KEYWORDS:
        if kw.lower() in t:
            return True

    # Broad IT terms that are still relevant
    broad_terms = [
        "it ", "i.t.", "information technology", "technical", "server",
        "cloud", "azure", "aws", "infrastructure", "network",
        "admin", "engineer", "architect", "analyst",
        "devops", "sre", "security", "cyber",
    ]
    matches = sum(1 for term in broad_terms if term in t)
    return matches >= 2  # Need at least 2 broad terms


# ═══════════════════════════════════════════════════════════════
# CLI Commands
# ═══════════════════════════════════════════════════════════════

def cmd_scan(args):
    """Run a career page scan."""
    conn = init_db()
    scan_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    started = datetime.now(timezone.utc).isoformat()

    conn.execute(
        "INSERT INTO scans (id, started_at) VALUES (?, ?)",
        (scan_id, started)
    )
    conn.commit()

    # Filter companies if specified
    companies = COMPANIES
    if args.company:
        companies = [c for c in COMPANIES if c["id"] == args.company]
        if not companies:
            valid = ", ".join(c["id"] for c in COMPANIES)
            print(f"Unknown company: {args.company}. Valid: {valid}")
            return

    total_found = 0
    total_new = 0
    errors = []

    print(f"\n{'═' * 60}")
    print(f"  Career Page Scan — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Scanning {len(companies)} companies")
    print(f"{'═' * 60}\n")

    for company in companies:
        print(f"  🔍 {company['name']} ({company['careers_url']})")

        jobs = search_company(company)
        new_count = 0

        for job in jobs:
            is_new = upsert_job(conn, job, scan_id)
            if is_new:
                new_count += 1

        total_found += len(jobs)
        total_new += new_count

        status = f"✅ {len(jobs)} jobs found ({new_count} new)"
        print(f"     {status}")

        conn.commit()
        time.sleep(1)  # Rate limiting between companies

    # Update scan record
    conn.execute("""
        UPDATE scans SET completed_at = ?, companies_scanned = ?,
            jobs_found = ?, new_jobs = ?, errors = ?
        WHERE id = ?
    """, (
        datetime.now(timezone.utc).isoformat(),
        len(companies), total_found, total_new,
        json.dumps(errors) if errors else None,
        scan_id,
    ))
    conn.commit()

    print(f"\n{'─' * 60}")
    print(f"  Scan complete: {total_found} total, {total_new} new")
    if total_new > 0:
        print(f"\n  🆕 New jobs found:")
        rows = conn.execute("""
            SELECT title, company_name, location, url
            FROM jobs WHERE scan_id = ? AND first_seen = last_seen
            ORDER BY company_name
        """, (scan_id,)).fetchall()
        for row in rows:
            print(f"     • {row['title']} — {row['company_name']}")
            if row['url']:
                print(f"       {row['url']}")
    print()

    conn.close()


def cmd_list(args):
    """List all stored jobs."""
    conn = init_db()
    rows = conn.execute("""
        SELECT title, company_name, location, salary, url,
               first_seen, last_seen, applied
        FROM jobs WHERE is_relevant = 1
        ORDER BY first_seen DESC
    """).fetchall()

    if not rows:
        print("\nNo jobs in database. Run 'scan' first.\n")
        return

    print(f"\n{'═' * 70}")
    print(f"  Stored Jobs ({len(rows)} total)")
    print(f"{'═' * 70}")

    current_company = None
    for row in rows:
        if row["company_name"] != current_company:
            current_company = row["company_name"]
            print(f"\n  📌 {current_company}")
            print(f"  {'─' * 50}")

        applied_marker = " ✅" if row["applied"] else ""
        salary = f" | {row['salary']}" if row['salary'] else ""
        print(f"     {row['title']}{applied_marker}")
        print(f"     {row['location']}{salary}")
        if row["url"]:
            print(f"     🔗 {row['url']}")
        print()

    conn.close()


def cmd_new(args):
    """Show jobs found in the most recent scan."""
    conn = init_db()
    last_scan = conn.execute(
        "SELECT id FROM scans ORDER BY started_at DESC LIMIT 1"
    ).fetchone()

    if not last_scan:
        print("\nNo scans yet. Run 'scan' first.\n")
        return

    rows = conn.execute("""
        SELECT title, company_name, location, salary, url, first_seen
        FROM jobs
        WHERE scan_id = ? AND first_seen = last_seen AND is_relevant = 1
        ORDER BY company_name
    """, (last_scan["id"],)).fetchall()

    if not rows:
        print("\nNo new jobs in the most recent scan.\n")
        return

    print(f"\n🆕 New Jobs from Last Scan ({len(rows)})")
    print(f"{'═' * 60}")
    for row in rows:
        print(f"  {row['title']} — {row['company_name']}")
        print(f"  {row['location']}")
        if row['salary']:
            print(f"  💰 {row['salary']}")
        if row['url']:
            print(f"  🔗 {row['url']}")
        print()

    conn.close()


def cmd_stats(args):
    """Show scan statistics."""
    conn = init_db()

    total_jobs = conn.execute(
        "SELECT COUNT(*) as c FROM jobs WHERE is_relevant = 1"
    ).fetchone()["c"]

    by_company = conn.execute("""
        SELECT company_name, COUNT(*) as c
        FROM jobs WHERE is_relevant = 1
        GROUP BY company_name ORDER BY c DESC
    """).fetchall()

    last_scans = conn.execute("""
        SELECT id, started_at, companies_scanned, jobs_found, new_jobs
        FROM scans ORDER BY started_at DESC LIMIT 5
    """).fetchall()

    print(f"\n{'═' * 60}")
    print(f"  Career Page Monitor — Statistics")
    print(f"{'═' * 60}")
    print(f"\n  Total tracked jobs: {total_jobs}")
    print(f"\n  By Company:")
    for row in by_company:
        print(f"    {row['company_name']}: {row['c']} jobs")

    if last_scans:
        print(f"\n  Recent Scans:")
        for scan in last_scans:
            dt = scan["started_at"][:16].replace("T", " ")
            print(f"    {dt} — {scan['jobs_found']} found, {scan['new_jobs']} new")

    print()
    conn.close()


def cmd_export(args):
    """Export jobs as JSON for dashboard integration."""
    conn = init_db()
    rows = conn.execute("""
        SELECT title, company_name as company, location, salary, url,
               job_type as type, posted_date as posted,
               first_seen, description_snippet as description
        FROM jobs WHERE is_relevant = 1
        ORDER BY first_seen DESC
    """).fetchall()

    jobs = []
    for row in rows:
        jobs.append({
            "title": row["title"],
            "company": row["company"],
            "location": row["location"],
            "salary": row["salary"] or "Not listed",
            "url": row["url"],
            "type": row["type"] or "",
            "posted": row["posted"] or "",
            "source": "Direct",
            "firstSeen": row["first_seen"],
            "description": row["description"] or "",
        })

    output = json.dumps(jobs, indent=2)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"Exported {len(jobs)} jobs to {args.output}")
    else:
        print(output)

    conn.close()


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Career Page Monitor — Scan Indy employer career pages for IT jobs"
    )
    subparsers = parser.add_subparsers(dest="command")

    scan_parser = subparsers.add_parser("scan", help="Run career page scan")
    scan_parser.add_argument("--company", help="Scan a single company by ID")
    scan_parser.set_defaults(func=cmd_scan)

    list_parser = subparsers.add_parser("list", help="List all tracked jobs")
    list_parser.set_defaults(func=cmd_list)

    new_parser = subparsers.add_parser("new", help="Show new jobs from last scan")
    new_parser.set_defaults(func=cmd_new)

    stats_parser = subparsers.add_parser("stats", help="Show statistics")
    stats_parser.set_defaults(func=cmd_stats)

    export_parser = subparsers.add_parser("export", help="Export jobs as JSON")
    export_parser.add_argument("--output", "-o", help="Output file path")
    export_parser.set_defaults(func=cmd_export)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    args.func(args)


if __name__ == "__main__":
    main()
