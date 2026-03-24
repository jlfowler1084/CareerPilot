#!/usr/bin/env python3
"""
morning_scan.py — CareerPilot Morning Scan

Runs all job search sources (Indeed via MCP, Dice via MCP, Direct employer
career pages) and produces a consolidated morning briefing.

Designed to run daily via Windows Task Scheduler or cron.

Usage:
    python morning_scan.py                  # Full scan, print report
    python morning_scan.py --quick          # Direct employers only (fastest)
    python morning_scan.py --output report  # Save report to file
    python morning_scan.py --json           # Output JSON for dashboard
"""
from __future__ import annotations

import argparse
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
    os.system(f"{sys.executable} -m pip install requests --break-system-packages -q")
    import requests

# Import the career page scraper
sys.path.insert(0, str(Path(__file__).parent))
from career_page_scraper import (
    COMPANIES, init_db, search_company, upsert_job,
    ANTHROPIC_API_KEY, ANTHROPIC_API_URL, MODEL,
)


# ═══════════════════════════════════════════════════════════════
# Indeed + Dice via Anthropic MCP
# ═══════════════════════════════════════════════════════════════

BOARD_SEARCHES = [
    {
        "id": "sysadmin_indy",
        "label": "Sys Admin — Indy",
        "keyword": "systems administrator",
        "location": "Indianapolis, IN",
        "sources": ["indeed", "dice"],
    },
    {
        "id": "syseng_indy",
        "label": "Systems Engineer — Indy",
        "keyword": "systems engineer Windows",
        "location": "Indianapolis, IN",
        "sources": ["indeed", "dice"],
    },
    {
        "id": "devops_indy",
        "label": "DevOps / Cloud — Indy",
        "keyword": "DevOps cloud engineer Azure",
        "location": "Indianapolis, IN",
        "sources": ["indeed", "dice"],
    },
    {
        "id": "powershell_remote",
        "label": "PowerShell / Automation — Remote",
        "keyword": "PowerShell automation engineer",
        "location": "remote",
        "sources": ["indeed", "dice"],
    },
    {
        "id": "infra_remote",
        "label": "Infrastructure — Remote",
        "keyword": "Windows server VMware infrastructure",
        "location": "remote",
        "sources": ["dice"],
    },
    {
        "id": "contract_infra",
        "label": "Contract — Infrastructure",
        "keyword": "Windows server VMware infrastructure contract",
        "location": "Indianapolis, IN",
        "sources": ["dice"],
    },
    {
        "id": "ad_identity",
        "label": "Active Directory / Identity — Remote",
        "keyword": "Active Directory engineer identity",
        "location": "remote",
        "sources": ["dice"],
    },
]


def search_indeed_mcp(keyword: str, location: str) -> list[dict]:
    """Search Indeed via Anthropic API + web_search.

    Note: MCP servers (mcp.indeed.com) are only accessible from within Claude.ai's
    infrastructure. For standalone scripts, we use the web_search tool instead to
    find Indeed listings via web search.
    """
    if not ANTHROPIC_API_KEY:
        return []

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
                "system": (
                    "You are a job search assistant. Use web_search to find job listings "
                    "on Indeed. Return results as a JSON array with objects containing: "
                    "title, company, location, salary, url, job_type, posted_date. "
                    "Return ONLY the JSON array, no other text."
                ),
                "messages": [{
                    "role": "user",
                    "content": (
                        f'Search Indeed for "{keyword}" jobs in "{location}". '
                        f'Search site:indeed.com for these roles. Return all relevant '
                        f'IT/infrastructure results as a JSON array.'
                    ),
                }],
                "tools": [{"type": "web_search_20250305", "name": "web_search"}],
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        text_parts = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block["text"])

        return _parse_board_results("\n".join(text_parts), "Indeed")

    except Exception as e:
        print(f"  \u26a0 Indeed error: {e}")
        return []


def search_dice_mcp(keyword: str, location: str) -> list[dict]:
    """Search Dice via Anthropic API + web_search.

    Note: MCP servers (mcp.dice.com) are only accessible from within Claude.ai's
    infrastructure. For standalone scripts, we use the web_search tool instead.
    """
    if not ANTHROPIC_API_KEY:
        return []

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
                "system": (
                    "You are a job search assistant. Use web_search to find job listings "
                    "on Dice.com. Return results as a JSON array with objects containing: "
                    "title, company, location, salary, url, job_type, posted_date. "
                    "Return ONLY the JSON array, no other text."
                ),
                "messages": [{
                    "role": "user",
                    "content": (
                        f'Search Dice.com for "{keyword}" jobs near "{location}". '
                        f'Search site:dice.com for these roles. Return all relevant '
                        f'IT/infrastructure results as a JSON array.'
                    ),
                }],
                "tools": [{"type": "web_search_20250305", "name": "web_search"}],
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        text_parts = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block["text"])

        return _parse_board_results("\n".join(text_parts), "Dice")

    except Exception as e:
        print(f"  \u26a0 Dice error: {e}")
        return []


def _parse_board_results(text: str, source: str) -> list[dict]:
    """Parse job results from MCP board responses."""
    import re

    jobs = []
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)

    # Try JSON parsing first
    try:
        # Look for a data array (Dice format)
        data_match = re.search(r'"data"\s*:\s*(\[[\s\S]*?\])', text)
        if data_match:
            parsed = json.loads(data_match.group(1))
            for job in parsed:
                jobs.append({
                    "title": job.get("title", ""),
                    "company": job.get("companyName", job.get("company", "Unknown")),
                    "location": job.get("jobLocation", {}).get("displayName", "") if isinstance(job.get("jobLocation"), dict) else job.get("location", ""),
                    "salary": job.get("salary", "Not listed"),
                    "url": job.get("detailsPageUrl", job.get("url", "")),
                    "posted": job.get("postedDate", job.get("posted_date", "")),
                    "type": job.get("employmentType", job.get("job_type", "")),
                    "source": source,
                })
            return jobs

        # Try direct JSON array
        arr_match = re.search(r"\[[\s\S]*\]", text)
        if arr_match:
            parsed = json.loads(arr_match.group(0))
            for job in parsed:
                jobs.append({
                    "title": job.get("title", job.get("Job Title", "")),
                    "company": job.get("company", job.get("Company", "Unknown")),
                    "location": job.get("location", job.get("Location", "")),
                    "salary": job.get("salary", job.get("Compensation", "Not listed")),
                    "url": job.get("url", job.get("View Job URL", "")),
                    "posted": job.get("posted_date", job.get("Posted on", "")),
                    "type": job.get("job_type", job.get("Job Type", "")),
                    "source": source,
                })
    except (json.JSONDecodeError, KeyError):
        pass

    # Fallback: text parsing for Indeed-style results
    if not jobs:
        blocks = text.split("**Job Title:**")
        for block in blocks:
            if not block.strip():
                continue
            title = block.split("\n")[0].strip()
            if not title:
                continue
            company_m = re.search(r"\*\*Company:\*\*\s*(.+)", block)
            location_m = re.search(r"\*\*Location:\*\*\s*(.+)", block)
            salary_m = re.search(r"\*\*Compensation:\*\*\s*(.+)", block)
            url_m = re.search(r"\*\*View Job URL:\*\*\s*(https?://\S+)", block)
            jobs.append({
                "title": title,
                "company": company_m[1].strip() if company_m else "Unknown",
                "location": location_m[1].strip() if location_m else "",
                "salary": salary_m[1].strip() if salary_m else "Not listed",
                "url": url_m[1].strip() if url_m else "",
                "posted": "",
                "type": "",
                "source": source,
            })

    return jobs


# ═══════════════════════════════════════════════════════════════
# Deduplication
# ═══════════════════════════════════════════════════════════════

def deduplicate(jobs: list[dict]) -> list[dict]:
    """Remove duplicate jobs by title + company. Drops jobs with no title."""
    seen = set()
    unique = []
    for job in jobs:
        title = job.get("title") or ""
        if not title.strip():
            continue
        company = job.get("company") or ""
        key = f"{title.lower().strip()}|{company.lower().strip()}"
        if key not in seen:
            seen.add(key)
            unique.append(job)
    return unique


def filter_irrelevant(jobs: list[dict]) -> list[dict]:
    """Filter out clearly irrelevant jobs."""
    noise = [
        "pest control", "hvac", "construction project", "transportation engineer",
        "mechanical engineer", "civil engineer", "epc project", "nurse", "physician",
        "pharmacist", "warehouse", "forklift", "delivery driver", "custodian",
    ]
    filtered = []
    for job in jobs:
        t = (job.get("title") or "").lower()
        if not any(n in t for n in noise):
            filtered.append(job)
    return filtered


# ═══════════════════════════════════════════════════════════════
# Report Generation
# ═══════════════════════════════════════════════════════════════

def generate_report(
    direct_jobs: list[dict],
    board_jobs: list[dict],
    scan_time: datetime,
) -> str:
    """Generate the morning briefing report."""
    all_jobs = deduplicate(filter_irrelevant(direct_jobs + board_jobs))

    lines = []
    lines.append("═" * 64)
    lines.append(f"  CareerPilot Morning Scan — {scan_time.strftime('%A, %B %d, %Y')}")
    lines.append("═" * 64)
    lines.append("")

    # Summary
    direct_count = len([j for j in all_jobs if j.get("source") == "Direct"])
    indeed_count = len([j for j in all_jobs if j.get("source") == "Indeed"])
    dice_count = len([j for j in all_jobs if j.get("source") == "Dice"])
    lines.append(f"  Total: {len(all_jobs)} unique jobs")
    lines.append(f"  Sources: {direct_count} Direct | {indeed_count} Indeed | {dice_count} Dice")
    lines.append("")

    # Direct employer results (highlight these — they're the early catches)
    direct = [j for j in all_jobs if j.get("source") == "Direct"]
    if direct:
        lines.append("─" * 64)
        lines.append("  🏢 DIRECT EMPLOYER POSTINGS (early catch)")
        lines.append("─" * 64)
        for job in direct:
            lines.append(f"  ▸ {job['title']}")
            lines.append(f"    {job.get('company', '')} · {job.get('location', '')}")
            if job.get("salary") and job["salary"] != "Not listed":
                lines.append(f"    💰 {job['salary']}")
            if job.get("url"):
                lines.append(f"    🔗 {job['url']}")
            lines.append("")

    # Board results by source
    for source in ["Indeed", "Dice"]:
        source_jobs = [j for j in all_jobs if j.get("source") == source]
        if source_jobs:
            icon = "🔵" if source == "Indeed" else "🟦"
            lines.append("─" * 64)
            lines.append(f"  {icon} {source.upper()} ({len(source_jobs)} results)")
            lines.append("─" * 64)
            for job in source_jobs:
                salary_note = ""
                if job.get("salary") and job["salary"] != "Not listed":
                    salary_note = f" | {job['salary']}"
                lines.append(f"  ▸ {job['title']}")
                lines.append(f"    {job.get('company', '')} · {job.get('location', '')}{salary_note}")
                if job.get("url"):
                    lines.append(f"    🔗 {job['url']}")
                lines.append("")

    if not all_jobs:
        lines.append("  No relevant jobs found in this scan.")
        lines.append("  Consider broadening search keywords or adding more companies.")
        lines.append("")

    lines.append("─" * 64)
    lines.append(f"  Scan completed at {scan_time.strftime('%I:%M %p %Z')}")
    lines.append("═" * 64)

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="CareerPilot Morning Scan")
    parser.add_argument("--quick", action="store_true",
                        help="Direct employers only (skip Indeed/Dice)")
    parser.add_argument("--output", "-o", help="Save report to file")
    parser.add_argument("--json", action="store_true",
                        help="Output JSON instead of text report")
    parser.add_argument("--company", help="Scan single direct employer by ID")
    args = parser.parse_args()

    scan_time = datetime.now(timezone.utc)

    if not ANTHROPIC_API_KEY:
        print("⚠ ANTHROPIC_API_KEY not set. Set it to enable API-powered scanning.")
        print("  export ANTHROPIC_API_KEY='your-key-here'")
        sys.exit(1)

    # Phase 1: Direct employer career pages
    print("\n  🏢 Scanning direct employer career pages...")
    conn = init_db()
    scan_id = scan_time.strftime("%Y%m%d_%H%M%S")
    conn.execute("INSERT INTO scans (id, started_at) VALUES (?, ?)",
                 (scan_id, scan_time.isoformat()))
    conn.commit()

    companies = COMPANIES
    if args.company:
        companies = [c for c in COMPANIES if c["id"] == args.company]

    direct_jobs = []
    for company in companies:
        print(f"     {company['name']}...", end=" ", flush=True)
        jobs = search_company(company)
        new_count = 0
        for job in jobs:
            is_new = upsert_job(conn, job, scan_id)
            if is_new:
                new_count += 1

        # Convert to common format
        for job in jobs:
            direct_jobs.append({
                "title": job["title"],
                "company": job["company_name"],
                "location": job.get("location", ""),
                "salary": job.get("salary", "Not listed"),
                "url": job.get("url", ""),
                "posted": job.get("posted_date", ""),
                "type": job.get("job_type", ""),
                "source": "Direct",
            })

        print(f"{len(jobs)} found ({new_count} new)")
        conn.commit()
        time.sleep(1)

    # Update scan record
    conn.execute("""
        UPDATE scans SET completed_at = ?, companies_scanned = ?,
            jobs_found = ?, new_jobs = ?
        WHERE id = ?
    """, (
        datetime.now(timezone.utc).isoformat(),
        len(companies), len(direct_jobs),
        len([j for j in direct_jobs]),  # simplified
        scan_id,
    ))
    conn.commit()
    conn.close()

    # Phase 2: Indeed + Dice (skip if --quick)
    board_jobs = []
    if not args.quick:
        print("\n  🔍 Scanning job boards (Indeed + Dice)...")
        for search in BOARD_SEARCHES:
            print(f"     {search['label']}...", end=" ", flush=True)
            search_jobs = []

            if "indeed" in search["sources"]:
                indeed_results = search_indeed_mcp(search["keyword"], search["location"])
                search_jobs.extend(indeed_results)

            if "dice" in search["sources"]:
                dice_results = search_dice_mcp(search["keyword"], search["location"])
                search_jobs.extend(dice_results)

            board_jobs.extend(search_jobs)
            print(f"{len(search_jobs)} results")
            time.sleep(1)

    # Generate output
    if args.json:
        all_jobs = deduplicate(filter_irrelevant(direct_jobs + board_jobs))
        output = json.dumps(all_jobs, indent=2)
    else:
        output = generate_report(direct_jobs, board_jobs, scan_time)

    if args.output:
        ext = ".json" if args.json else ".txt"
        outpath = Path(args.output).with_suffix(ext)
        outpath.parent.mkdir(parents=True, exist_ok=True)
        outpath.write_text(output, encoding="utf-8")
        print(f"\n  📄 Report saved to {outpath}")
    else:
        print(f"\n{output}")


if __name__ == "__main__":
    main()
