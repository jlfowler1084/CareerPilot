# Government Job Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Add USAJobs and WorkOne scrapers to CareerPilot's scanner with morning scan integration.

**Architecture:** Two new scraper modules following the existing Anthropic API + web_search pattern. Integrated into morning_scan.py as Phase 3 with a `--gov` flag.

**Tech Stack:** Python 3.8+, Anthropic API, SQLite, pytest, unittest.mock

**Spec:** `docs/superpowers/specs/2026-03-24-gov-job-boards-design.md`

---

### Task 1: Add `_slugify()` to career_page_scraper.py + Write Tests

**Files:**
- Modify: `scanner/career_page_scraper.py`
- Create: `scanner/test_gov_boards.py`

- [ ] **Step 1: Create test file with initial tests**

Create `scanner/test_gov_boards.py`:

```python
"""Tests for government job board scrapers."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure scanner directory is importable
sys.path.insert(0, str(Path(__file__).parent))

from career_page_scraper import _slugify


class TestSlugify:
    def test_basic(self):
        assert _slugify("Department of Veterans Affairs") == "department-of-veterans-affairs"

    def test_strips_whitespace(self):
        assert _slugify("  Eli Lilly  ") == "eli-lilly"

    def test_already_slugified(self):
        assert _slugify("already-slugged") == "already-slugged"
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python -m pytest scanner/test_gov_boards.py::TestSlugify -v`
Expected: FAIL — `_slugify` not found

- [ ] **Step 3: Add `_slugify()` to career_page_scraper.py**

Add after the `_is_relevant()` function:

```python
def _slugify(name: str) -> str:
    """Slugify a name for use as company_id."""
    return name.lower().strip().replace(" ", "-")
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `python -m pytest scanner/test_gov_boards.py::TestSlugify -v`
Expected: 3 passed

---

### Task 2: USAJobs Scraper

**Files:**
- Create: `scanner/usajobs_scraper.py`
- Modify: `scanner/test_gov_boards.py`

- [ ] **Step 1: Add USAJobs tests to test_gov_boards.py**

Append:

```python
from usajobs_scraper import search_usajobs, USAJOBS_SEARCHES, _make_usajobs_job


def _mock_api_response(jobs_json):
    """Create a mocked requests.post response."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "content": [
            {"type": "text", "text": json.dumps(jobs_json)}
        ]
    }
    return mock_resp


class TestUSAJobs:
    def test_returns_valid_dicts(self):
        """Mocked API response produces correct DB-format dicts."""
        raw_jobs = [
            {
                "title": "IT Specialist (SysAdmin)",
                "company": "Department of Veterans Affairs",
                "location": "Indianapolis, IN",
                "salary": "$73,286 - $95,270/year",
                "url": "https://www.usajobs.gov/job/123456",
                "job_type": "Full-time",
                "posted_date": "2026-03-20",
                "description_snippet": "Manages Windows servers",
            }
        ]
        with patch("usajobs_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_usajobs()

        assert len(results) >= 1
        job = results[0]
        assert job["title"] == "IT Specialist (SysAdmin)"
        assert job["company_name"] == "Department of Veterans Affairs"
        assert job["company_id"].startswith("usajobs_")
        assert "url" in job
        assert "source" not in job  # source is report-layer only

    def test_filters_irrelevant(self):
        """Non-IT titles filtered out."""
        raw_jobs = [
            {"title": "Nurse Practitioner", "company": "VA", "location": "Indy", "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
            {"title": "IT Specialist (SysAdmin)", "company": "VA", "location": "Indy", "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
        ]
        with patch("usajobs_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_usajobs()

        titles = [j["title"] for j in results]
        assert "Nurse Practitioner" not in titles
        assert "IT Specialist (SysAdmin)" in titles
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python -m pytest scanner/test_gov_boards.py::TestUSAJobs -v`
Expected: FAIL — import error

- [ ] **Step 3: Create `scanner/usajobs_scraper.py`**

```python
#!/usr/bin/env python3
"""USAJobs federal job search via Anthropic API + web_search."""

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


USAJOBS_SEARCHES = [
    {"id": "usajobs_sysadmin_indy", "keyword": "systems administrator", "location": "Indianapolis, IN"},
    {"id": "usajobs_it_specialist_indy", "keyword": "IT specialist", "location": "Indianapolis, IN"},
    {"id": "usajobs_it_indy", "keyword": "information technology", "location": "Indianapolis, IN"},
    {"id": "usajobs_sysadmin_remote", "keyword": "systems administrator", "location": "remote"},
    {"id": "usajobs_neteng_indy", "keyword": "network engineer", "location": "Indianapolis, IN"},
]


def _make_usajobs_job(raw: dict) -> dict:
    """Convert a raw parsed job dict to DB-format dict."""
    title = raw.get("title", "").strip()
    company = raw.get("company", "Unknown Agency")
    return {
        "title": title,
        "company_id": "usajobs_" + _slugify(company),
        "company_name": company,
        "location": raw.get("location", ""),
        "url": raw.get("url", ""),
        "salary": raw.get("salary", ""),
        "job_type": raw.get("job_type", ""),
        "posted_date": raw.get("posted_date", ""),
        "description_snippet": raw.get("description_snippet", "")[:500],
    }


def search_usajobs() -> list[dict]:
    """Search USAJobs for IT/infrastructure positions."""
    if not ANTHROPIC_API_KEY:
        print("  ⚠ No ANTHROPIC_API_KEY — skipping USAJobs")
        return []

    all_jobs = []
    seen = set()

    for search in USAJOBS_SEARCHES:
        radius_note = " within 50 miles" if search["location"] != "remote" else ""
        prompt = (
            f'Search site:usajobs.gov for "{search["keyword"]}" jobs '
            f'in "{search["location"]}"{radius_note}. '
            f"Find current federal government IT job postings. "
            f"For each job, extract: title, company (the federal agency name), "
            f"location, salary, url (direct usajobs.gov link), job_type, posted_date, "
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

                job = _make_usajobs_job(raw)
                key = f"{title.lower()}|{job['company_name'].lower()}"
                if key not in seen:
                    seen.add(key)
                    all_jobs.append(job)

        except Exception as e:
            print(f"  ⚠ USAJobs error ({search['id']}): {e}")
            continue

        time.sleep(1)

    return all_jobs


if __name__ == "__main__":
    jobs = search_usajobs()
    print(f"Found {len(jobs)} USAJobs listings")
    for j in jobs:
        print(f"  {j['title']} — {j['company_name']} ({j['location']})")
```

- [ ] **Step 4: Run USAJobs tests — expect PASS**

Run: `python -m pytest scanner/test_gov_boards.py::TestUSAJobs -v`
Expected: 2 passed

---

### Task 3: WorkOne Scraper

**Files:**
- Create: `scanner/workone_scraper.py`
- Modify: `scanner/test_gov_boards.py`

- [ ] **Step 1: Add WorkOne tests to test_gov_boards.py**

Append:

```python
from workone_scraper import search_workone


class TestWorkOne:
    def test_returns_valid_dicts(self):
        """Mocked API response produces correct DB-format dicts."""
        raw_jobs = [
            {
                "title": "Network Administrator",
                "company": "Indiana Department of Transportation",
                "location": "Indianapolis, IN",
                "salary": "$55,000 - $65,000",
                "url": "https://indianacareerconnect.in.gov/job/12345",
                "job_type": "Full-time",
                "posted_date": "2026-03-18",
                "description_snippet": "Manages network infrastructure",
            }
        ]
        with patch("workone_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_workone()

        assert len(results) >= 1
        job = results[0]
        assert job["title"] == "Network Administrator"
        assert job["company_name"] == "Indiana Department of Transportation"
        assert job["company_id"].startswith("workone_")
        assert "source" not in job

    def test_filters_irrelevant(self):
        """Non-IT titles filtered out."""
        raw_jobs = [
            {"title": "Truck Driver", "company": "INDOT", "location": "Indy", "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
            {"title": "Systems Administrator", "company": "INDOT", "location": "Indy", "salary": "", "url": "", "job_type": "", "posted_date": "", "description_snippet": ""},
        ]
        with patch("workone_scraper.requests.post", return_value=_mock_api_response(raw_jobs)):
            results = search_workone()

        titles = [j["title"] for j in results]
        assert "Truck Driver" not in titles
        assert "Systems Administrator" in titles
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python -m pytest scanner/test_gov_boards.py::TestWorkOne -v`
Expected: FAIL — import error

- [ ] **Step 3: Create `scanner/workone_scraper.py`**

Same structure as `usajobs_scraper.py` but with WorkOne searches and `site:indianacareerconnect.in.gov`:

```python
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


def search_workone() -> list[dict]:
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
```

- [ ] **Step 4: Run WorkOne tests — expect PASS**

Run: `python -m pytest scanner/test_gov_boards.py::TestWorkOne -v`
Expected: 2 passed

---

### Task 4: Dedup + Flag Tests

**Files:**
- Modify: `scanner/test_gov_boards.py`

- [ ] **Step 1: Add dedup and flag tests**

Append:

```python
from morning_scan import deduplicate


class TestGovIntegration:
    def test_dedup_across_gov_sources(self):
        """Same job from USAJobs and WorkOne deduped to one."""
        jobs = [
            {"title": "Systems Administrator", "company": "VA", "location": "Indy", "source": "USAJobs"},
            {"title": "Systems Administrator", "company": "VA", "location": "Indy", "source": "WorkOne"},
            {"title": "Network Engineer", "company": "DoD", "location": "Indy", "source": "USAJobs"},
        ]
        result = deduplicate(jobs)
        assert len(result) == 2

    def test_gov_flag_parsing(self):
        """--gov arg is parsed correctly."""
        from morning_scan import main
        import argparse

        # Test that the parser accepts --gov
        parser = argparse.ArgumentParser()
        parser.add_argument("--gov", action="store_true")
        parser.add_argument("--quick", action="store_true")
        args = parser.parse_args(["--gov"])
        assert args.gov is True
        assert args.quick is False
```

- [ ] **Step 2: Run integration tests — expect PASS**

Run: `python -m pytest scanner/test_gov_boards.py::TestGovIntegration -v`
Expected: 2 passed

- [ ] **Step 3: Run all scanner tests**

Run: `python -m pytest scanner/test_gov_boards.py -v`
Expected: 9 passed

---

### Task 5: Morning Scan Integration

**Files:**
- Modify: `scanner/morning_scan.py`

- [ ] **Step 1: Add `--gov` flag and Phase 3 to morning_scan.py**

Changes:
1. Add `--gov` argument to argparse
2. Guard Phase 1 with `if not args.gov:`
3. Guard Phase 2 with `if not args.quick and not args.gov:`
4. Add Phase 3 with `if args.gov or (not args.quick and not getattr(args, 'company', None)):`
5. Add USAJobs/WorkOne sections to `generate_report()`

- [ ] **Step 2: Verify morning_scan.py loads**

Run: `python scanner/morning_scan.py --help`
Expected: Shows `--gov` in help output

- [ ] **Step 3: Run all scanner tests**

Run: `python -m pytest scanner/test_gov_boards.py -v`
Expected: 9 passed

---

### Task 6: PowerShell + Commit

**Files:**
- Modify: `scanner/Start-CareerPageScan.ps1`

- [ ] **Step 1: Add -Gov switch to Start-CareerPageScan.ps1**

Add `[switch]$Gov` to the param block and the corresponding logic to pass `--gov` to morning_scan.py.

- [ ] **Step 2: Run full project test suite**

Run: `python -m pytest tests/ -v && python -m pytest scanner/test_gov_boards.py -v`
Expected: All tests pass

- [ ] **Step 3: Commit and push**

```bash
git add scanner/usajobs_scraper.py scanner/workone_scraper.py scanner/career_page_scraper.py scanner/morning_scan.py scanner/Start-CareerPageScan.ps1 scanner/test_gov_boards.py docs/superpowers/specs/2026-03-24-gov-job-boards-design.md docs/superpowers/plans/2026-03-24-gov-job-boards.md
git commit -m "feat(SCRUM-99): government job board integration — USAJobs and WorkOne

- New usajobs_scraper.py: searches 5 federal job queries via web_search
- New workone_scraper.py: searches 4 Indiana Career Connect queries
- morning_scan.py: Phase 3 government scanning, --gov flag for gov-only runs
- Start-CareerPageScan.ps1: -Gov switch
- Shared _slugify() helper in career_page_scraper.py
- 9 tests in scanner/test_gov_boards.py

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin feature/dashboard-v2
```
