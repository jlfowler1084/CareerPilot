#!/usr/bin/env python3
"""IT staffing agency job search via Anthropic API + web_search."""

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
    _is_relevant, _slugify,
)


STAFFING_AGENCIES = [
    {
        "id": "teksystems",
        "name": "TEKsystems",
        "site": "teksystems.com",
    },
    {
        "id": "roberthalf",
        "name": "Robert Half Technology",
        "site": "roberthalf.com",
    },
    {
        "id": "kforce",
        "name": "Kforce",
        "site": "kforce.com",
    },
    {
        "id": "insightglobal",
        "name": "Insight Global",
        "site": "insightglobal.com",
    },
    {
        "id": "randstad",
        "name": "Randstad Technologies",
        "site": "randstadusa.com",
    },
    {
        "id": "apexsystems",
        "name": "Apex Systems",
        "site": "apexsystems.com",
    },
]

SEARCH_TERMS = [
    "systems administrator",
    "infrastructure engineer",
    "Windows server",
    "IT support",
]


def _make_staffing_job(raw: dict, agency: dict) -> dict:
    """Convert a raw parsed job dict to DB-format dict."""
    title = raw.get("title", "").strip()
    return {
        "title": title,
        "company_id": "staffing_" + _slugify(agency["name"]),
        "company_name": agency["name"],
        "location": raw.get("location", ""),
        "url": raw.get("url", ""),
        "salary": raw.get("salary", ""),
        "job_type": raw.get("job_type", ""),
        "posted_date": raw.get("posted_date", ""),
        "description_snippet": raw.get("description_snippet", "")[:500],
    }


def search_staffing_agencies() -> list:
    """Search all staffing agency job boards for IT/infrastructure positions.

    Sends one API call per agency covering all search terms, for 6 total calls.
    """
    if not ANTHROPIC_API_KEY:
        print("  ⚠ No ANTHROPIC_API_KEY — skipping staffing agencies")
        return []

    all_jobs = []
    seen = set()

    for agency in STAFFING_AGENCIES:
        terms_str = ", ".join(f'"{t}"' for t in SEARCH_TERMS)
        prompt = (
            f'Search site:{agency["site"]} for IT/infrastructure jobs '
            f'in Indianapolis, IN. '
            f'Search terms: {terms_str}. '
            f'For each job found, extract: title, company, location, salary, '
            f'url (direct link to the job posting), job_type, posted_date, '
            f'description_snippet. Return ONLY a JSON array, no other text.'
        )

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
                continue

            raw_jobs = json.loads(match.group(0))

            for raw in raw_jobs:
                title = raw.get("title", "").strip()
                if not title or not _is_relevant(title):
                    continue

                job = _make_staffing_job(raw, agency)
                key = f"{title.lower()}|{agency['name'].lower()}"
                if key not in seen:
                    seen.add(key)
                    all_jobs.append(job)

        except Exception as e:
            print(f"  ⚠ Staffing error ({agency['name']}): {e}")
            continue

        time.sleep(1)

    return all_jobs


if __name__ == "__main__":
    jobs = search_staffing_agencies()
    print(f"Found {len(jobs)} staffing agency listings")
    for j in jobs:
        print(f"  {j['title']} — {j['company_name']} ({j['location']})")
