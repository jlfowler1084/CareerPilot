#!/usr/bin/env python3
"""Hidden job market scraper -- schools, dioceses, small orgs (SCRUM-119)

Scans organizations that rarely post on Indeed/Dice for IT/infrastructure
roles using the Anthropic API with web_search. One API call per category
(3 total: religious, private schools, small org aggregators).

Usage:
    python hidden_market_scraper.py scan           # Run full scan
    python hidden_market_scraper.py scan --source religious  # One category
    python hidden_market_scraper.py list            # Show all stored jobs
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    os.system(f"{sys.executable} -m pip install requests -q")
    import requests

sys.path.insert(0, str(Path(__file__).parent))
from career_page_scraper import (
    ANTHROPIC_API_KEY, ANTHROPIC_API_URL, MODEL,
    NEGATIVE_KEYWORDS, _slugify,
)


# ===================================================================
# Hidden Market Sources
# ===================================================================

HIDDEN_SOURCES = [
    # Category 1: Catholic/Religious Schools & Dioceses
    {
        "id": "archdiocese_indy",
        "name": "Archdiocese of Indianapolis",
        "category": "religious",
        "search_queries": [
            '"Archdiocese of Indianapolis" IT jobs OR technology OR systems administrator',
        ],
    },
    {
        "id": "catholic_schools_indy",
        "name": "Catholic Schools Indianapolis",
        "category": "religious",
        "search_queries": [
            '"Catholic school" Indianapolis IT support OR technology coordinator OR tech director',
        ],
    },
    {
        "id": "catholic_high_schools",
        "name": "Catholic High Schools (Indy)",
        "category": "religious",
        "search_queries": [
            "Roncalli High School OR Cathedral High School OR Bishop Chatard OR Brebeuf Jesuit employment technology",
        ],
    },
    {
        "id": "marian_university",
        "name": "Marian University",
        "category": "religious",
        "search_queries": [
            '"Marian University" Indianapolis careers IT OR technology OR systems',
        ],
    },
    {
        "id": "uindy",
        "name": "University of Indianapolis",
        "category": "religious",
        "search_queries": [
            '"University of Indianapolis" careers IT OR infrastructure OR systems administrator',
        ],
    },
    # Category 2: Private/Independent Schools
    {
        "id": "private_schools_indy",
        "name": "Private Schools (Indy)",
        "category": "private_schools",
        "search_queries": [
            '"Park Tudor" OR "International School of Indiana" OR "Sycamore School" employment technology',
        ],
    },
    {
        "id": "christian_schools_indy",
        "name": "Christian Schools (Indy)",
        "category": "private_schools",
        "search_queries": [
            '"Heritage Christian" OR "Covenant Christian" Indianapolis IT support OR technology',
        ],
    },
    # Category 3: Small Org Aggregators
    {
        "id": "nonprofit_indy",
        "name": "Indiana Nonprofits",
        "category": "small_org_aggregators",
        "search_queries": [
            "Indiana nonprofit jobs IT systems administrator",
        ],
    },
    {
        "id": "ibj_jobs",
        "name": "Indianapolis Business Journal",
        "category": "small_org_aggregators",
        "search_queries": [
            "Indianapolis Business Journal jobs technology infrastructure",
        ],
    },
    {
        "id": "craigslist_indy",
        "name": "Craigslist Indianapolis",
        "category": "small_org_aggregators",
        "search_queries": [
            "Craigslist Indianapolis systems administrator OR IT support OR network administrator",
        ],
    },
]

# Education-specific titles that wouldn't match standard ROLE_KEYWORDS
HIDDEN_ROLE_KEYWORDS = [
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
    # Education-specific titles
    "technology coordinator", "tech coordinator",
    "tech director", "technology director",
    "computer specialist", "computer technician",
    "network support", "network specialist",
    "technology specialist", "technology manager",
    "IT coordinator", "IT technician",
    "media specialist", "instructional technology",
]


# ===================================================================
# Relevance Filter (broader than career_page_scraper)
# ===================================================================

def _is_relevant_hidden(title: str) -> bool:
    """Check if a job title is relevant -- broader than standard filter."""
    t = title.lower()

    for neg in NEGATIVE_KEYWORDS:
        if neg.lower() in t:
            return False

    for kw in HIDDEN_ROLE_KEYWORDS:
        if kw.lower() in t:
            return True

    broad_terms = [
        "it ", "i.t.", "information technology", "technical", "server",
        "cloud", "azure", "aws", "infrastructure", "network",
        "admin", "engineer", "architect", "analyst",
        "devops", "sre", "security", "cyber",
        "technology", "computer", "tech ",
    ]
    matches = sum(1 for term in broad_terms if term in t)
    return matches >= 2


def _make_hidden_job(raw: dict, employer_name: str) -> dict:
    """Convert a raw parsed job dict to DB-format dict."""
    title = raw.get("title", "").strip()
    return {
        "title": title,
        "company_id": "hidden_" + _slugify(employer_name),
        "company_name": employer_name,
        "location": raw.get("location", ""),
        "url": raw.get("url", ""),
        "salary": raw.get("salary", ""),
        "job_type": raw.get("job_type", ""),
        "posted_date": raw.get("posted_date", ""),
        "description_snippet": raw.get("description_snippet", "")[:500],
    }


# ===================================================================
# Search
# ===================================================================

def _get_category_sources(category: str) -> list[dict]:
    """Get all sources for a given category."""
    return [s for s in HIDDEN_SOURCES if s["category"] == category]


def _search_category(category: str, sources: list[dict]) -> list[dict]:
    """Search all sources in a category with a single API call."""
    if not ANTHROPIC_API_KEY:
        return []

    # Build combined queries from all sources in this category
    all_queries = []
    for src in sources:
        all_queries.extend(src["search_queries"])

    queries_str = "\n".join(f"  - {q}" for q in all_queries)
    title_examples = ", ".join([
        "systems administrator", "IT support", "technology coordinator",
        "tech director", "computer specialist", "network support",
        "IT manager", "technology specialist", "infrastructure engineer",
    ])

    prompt = f"""Search for current IT and technology job openings at small organizations in the Indianapolis, IN area.

Search these queries:
{queries_str}

I'm looking for roles with titles like: {title_examples}

These are small organizations (schools, churches, nonprofits) that use non-standard IT titles. Include any role that involves managing technology, computers, or networks.

For each job found, extract:
- title: The exact job title
- employer: The actual hiring organization name
- url: Direct link to the job posting
- location: City/state
- salary: If listed
- job_type: Full-time, Part-time, Contract, etc.
- posted_date: If visible
- description_snippet: 1-2 sentence summary of the role

Return results as a JSON array. If no relevant IT/technology jobs are found, return an empty array [].
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

        text_parts = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block["text"])

        full_text = "\n".join(text_parts)

        # Parse JSON array from response
        text_clean = re.sub(r"```json\s*", "", full_text)
        text_clean = re.sub(r"```\s*", "", text_clean)
        match = re.search(r"\[[\s\S]*\]", text_clean)
        if not match:
            return []

        raw_jobs = json.loads(match.group(0))

        jobs = []
        for raw in raw_jobs:
            title = raw.get("title", "").strip()
            if not title or not _is_relevant_hidden(title):
                continue

            employer = raw.get("employer", raw.get("company", "Unknown")).strip()
            jobs.append(_make_hidden_job(raw, employer))

        return jobs

    except Exception as e:
        print(f"  ⚠ Hidden market error ({category}): {e}")
        return []


def search_hidden_market(category_filter: str = None) -> list[dict]:
    """Search hidden market sources for IT/technology positions.

    Sends one API call per category (3 total: religious, private_schools,
    small_org_aggregators). Deduplicates results.

    Args:
        category_filter: Optional category to scan (religious, private_schools,
                         small_org_aggregators). None = all categories.
    """
    if not ANTHROPIC_API_KEY:
        print("  ⚠ No ANTHROPIC_API_KEY -- skipping hidden market scan")
        return []

    categories = ["religious", "private_schools", "small_org_aggregators"]
    if category_filter:
        categories = [c for c in categories if c == category_filter]

    all_jobs = []
    seen = set()

    for category in categories:
        sources = _get_category_sources(category)
        if not sources:
            continue

        label = category.replace("_", " ").title()
        print(f"     {label}...", end=" ", flush=True)

        jobs = _search_category(category, sources)

        # Deduplicate within results
        for job in jobs:
            key = f"{job['title'].lower()}|{job['company_name'].lower()}"
            if key not in seen:
                seen.add(key)
                all_jobs.append(job)

        print(f"{len(jobs)} results")
        time.sleep(1)

    return all_jobs


# ===================================================================
# CLI
# ===================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Hidden Job Market Scraper -- Schools, Dioceses, Small Orgs"
    )
    subparsers = parser.add_subparsers(dest="command")

    scan_parser = subparsers.add_parser("scan", help="Run hidden market scan")
    scan_parser.add_argument("--source", help="Scan a single category (religious, private_schools, small_org_aggregators)")

    subparsers.add_parser("list", help="List all hidden market sources")

    args = parser.parse_args()

    if args.command == "list":
        for src in HIDDEN_SOURCES:
            print(f"  [{src['category']}] {src['name']}")
            for q in src["search_queries"]:
                print(f"    -> {q}")
        return

    if args.command == "scan":
        print(f"\n  🔍 Hidden Market Scan")
        print(f"  {'─' * 50}")
        jobs = search_hidden_market(category_filter=getattr(args, "source", None))
        print(f"\n  Found {len(jobs)} hidden market listings")
        for j in jobs:
            print(f"    ▸ {j['title']} -- {j['company_name']} ({j['location']})")
            if j.get("url"):
                print(f"      🔗 {j['url']}")
        return

    parser.print_help()


if __name__ == "__main__":
    main()
