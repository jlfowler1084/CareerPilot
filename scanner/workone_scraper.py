#!/usr/bin/env python3
"""WorkOne / Indiana Career Connect job search via Anthropic API + web_search."""

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


WORKONE_SEARCHES = [
    {"id": "workone_sysadmin", "keyword": "systems administrator", "location": "Indiana"},
    {"id": "workone_it_support", "keyword": "IT support", "location": "Indiana"},
    {"id": "workone_netadmin", "keyword": "network administrator", "location": "Indiana"},
    {"id": "workone_tech_gov", "keyword": "technology state government", "location": "Indiana"},
]


def _make_workone_job(raw: dict) -> dict:
    """Convert a raw parsed job dict to DB-format dict."""
    title = raw.get("title", "").strip()
    company = raw.get("company", "Unknown Employer")
    return {
        "title": title,
        "company_id": "workone_" + _slugify(company),
        "company_name": company,
        "location": raw.get("location", ""),
        "url": raw.get("url", ""),
        "salary": raw.get("salary", ""),
        "job_type": raw.get("job_type", ""),
        "posted_date": raw.get("posted_date", ""),
        "description_snippet": raw.get("description_snippet", "")[:500],
    }


def search_workone() -> list:
    """Search Indiana Career Connect for IT positions."""
    if not ANTHROPIC_API_KEY:
        print("  ⚠ No ANTHROPIC_API_KEY — skipping WorkOne")
        return []

    all_jobs = []
    seen = set()

    for search in WORKONE_SEARCHES:
        prompt = (
            f'Search site:indianacareerconnect.in.gov for "{search["keyword"]}" '
            f'jobs in {search["location"]}. '
            f"Find current job postings on Indiana Career Connect / WorkOne. "
            f"For each job, extract: title, company (the employer name), "
            f"location, salary, url (direct link), job_type, posted_date, "
            f"description_snippet. Return ONLY a JSON array, no other text."
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

                job = _make_workone_job(raw)
                key = f"{title.lower()}|{job['company_name'].lower()}"
                if key not in seen:
                    seen.add(key)
                    all_jobs.append(job)

        except Exception as e:
            print(f"  ⚠ WorkOne error ({search['id']}): {e}")
            continue

        time.sleep(1)

    return all_jobs


if __name__ == "__main__":
    jobs = search_workone()
    print(f"Found {len(jobs)} WorkOne listings")
    for j in jobs:
        print(f"  {j['title']} — {j['company_name']} ({j['location']})")
