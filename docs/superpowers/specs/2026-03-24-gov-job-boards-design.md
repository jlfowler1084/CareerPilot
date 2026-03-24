# Government & Education Job Board Integration

**Date:** 2026-03-24
**Status:** Approved
**Jira:** SCRUM-99
**Scope:** Two new scrapers (USAJobs, WorkOne), morning scan integration, `--gov` flag, tests

---

## 1. Problem

CareerPilot's scanner covers direct employer career pages (SCRUM-97) and job boards (Indeed, Dice), but misses federal and state government job aggregators. USAJobs.gov and Indiana Career Connect (WorkOne) list positions that don't appear on commercial boards.

**Overlap note:** State of Indiana (`workforindiana.in.gov`) is already in `career_page_scraper.py` COMPANIES list — that covers the state's own job board. Indiana Career Connect (`indianacareerconnect.in.gov`) is a separate state workforce aggregator where many Indiana employers (not just state government) post positions. These are different systems with different job listings. USAJobs is federal — no overlap with existing sources.

## 2. New Files

| File | Purpose |
|------|---------|
| `scanner/usajobs_scraper.py` | USAJobs federal job search via Anthropic API + web_search |
| `scanner/workone_scraper.py` | WorkOne/Indiana Career Connect search via Anthropic API + web_search |
| `scanner/test_gov_boards.py` | Tests for both scrapers + integration |

## 3. USAJobs Scraper (`scanner/usajobs_scraper.py`)

### 3.1 Search Queries

| ID | Keyword | Location |
|----|---------|----------|
| `usajobs_sysadmin_indy` | "systems administrator" | Indianapolis, IN |
| `usajobs_it_specialist_indy` | "IT specialist" | Indianapolis, IN |
| `usajobs_it_indy` | "information technology" | Indianapolis, IN |
| `usajobs_sysadmin_remote` | "systems administrator" | remote |
| `usajobs_neteng_indy` | "network engineer" | Indianapolis, IN |

### 3.2 Implementation

Single module-level function `search_usajobs()` that:
1. Iterates all 5 queries
2. Calls Anthropic API with `web_search` tool, using `site:usajobs.gov` in prompts
3. Parses JSON response into job dicts
4. Filters with `_is_relevant()` from `career_page_scraper.py`
5. Deduplicates within results (same title+company across queries)
6. Returns combined `list[dict]`

Imports shared constants and helpers from `career_page_scraper.py`: `ANTHROPIC_API_KEY`, `ANTHROPIC_API_URL`, `MODEL`, `_is_relevant`, `_parse_jobs_json`, `_slugify`.

The prompt instructs the model to search `site:usajobs.gov` for each keyword+location, specifying 50-mile radius for Indianapolis searches. Response format is JSON array with fields: title, company (agency name), location, salary, url, job_type, posted_date, description_snippet.

### 3.3 Job Dict Format (DB format)

The scraper returns dicts in **DB format** — the same structure used by `career_page_scraper.py` for `upsert_job()`:

```python
{
    "title": "IT Specialist (SysAdmin)",
    "company_id": "usajobs_department-of-veterans-affairs",
    "company_name": "Department of Veterans Affairs",
    "location": "Indianapolis, IN",
    "url": "https://www.usajobs.gov/job/...",
    "salary": "$73,286 - $95,270 per year",
    "job_type": "Full-time, Permanent",
    "posted_date": "2026-03-20",
    "description_snippet": "...",
}
```

Note: `source` is **not** in the DB dict — it does not exist in the `jobs` table schema. The `source` label is added during the DB-to-report transformation in `morning_scan.py` (see Section 5.1).

`company_id` is generated as `"usajobs_"` + `_slugify(agency_name)`. Dedup in the DB is keyed on `job_id(title, company_name, url)` hash — `company_id` is for display grouping only, not dedup.

### 3.4 Helper: `_slugify(name)`

Simple slugify: `name.lower().strip().replace(" ", "-")`. Defined once in `career_page_scraper.py` and imported by both new scrapers (consistent with how `_is_relevant` and `_parse_jobs_json` are already shared).

## 4. WorkOne Scraper (`scanner/workone_scraper.py`)

### 4.1 Search Queries

| ID | Keyword | Location |
|----|---------|----------|
| `workone_sysadmin` | "systems administrator" | Indiana |
| `workone_it_support` | "IT support" | Indiana |
| `workone_netadmin` | "network administrator" | Indiana |
| `workone_tech_gov` | "technology" state government | Indiana |

### 4.2 Implementation

Single module-level function `search_workone()` with same pattern as USAJobs. Uses `site:indianacareerconnect.in.gov` in prompts. This is the Indiana Career Connect workforce aggregator — a separate system from `workforindiana.in.gov` (which is already covered by the direct employer scraper for State of Indiana positions).

Imports same shared constants and helpers from `career_page_scraper.py`.

### 4.3 Job Dict Format

Same DB-format structure as USAJobs but with `company_id = "workone_" + _slugify(employer_name)`.

## 5. Morning Scan Integration

### 5.1 Changes to `scanner/morning_scan.py`

**New `--gov` flag:**
```
python morning_scan.py --gov    # Government sources only (USAJobs + WorkOne)
```

**Flag interaction matrix:**

| Flags | Phase 1 (Direct) | Phase 2 (Indeed/Dice) | Phase 3 (Gov) |
|-------|------|------|------|
| (none) | Yes | Yes | Yes |
| `--quick` | Yes | Skip | Skip |
| `--gov` | Skip | Skip | Yes |
| `--gov --quick` | Skip | Skip | Yes (`--gov` wins) |

**New Phase 3** added after existing Phase 2. Guard logic:

```python
# Phase 3: Government job boards (USAJobs + WorkOne)
if args.gov or (not args.quick and not args.company):
    from usajobs_scraper import search_usajobs
    from workone_scraper import search_workone

    usajobs_results = search_usajobs()
    workone_results = search_workone()

    # Upsert to DB
    for job in usajobs_results + workone_results:
        upsert_job(conn, job, scan_id)
    conn.commit()

    # Convert DB-format dicts to report-format dicts (same pattern as Phase 1)
    for job in usajobs_results:
        gov_jobs.append({
            "title": job["title"],
            "company": job["company_name"],
            "location": job.get("location", ""),
            "salary": job.get("salary", "Not listed"),
            "url": job.get("url", ""),
            "posted": job.get("posted_date", ""),
            "type": job.get("job_type", ""),
            "source": "USAJobs",
        })
    # Same for workone_results with source="WorkOne"
```

When `--gov` is set, Phases 1 and 2 are skipped:
```python
# Phase 1
if not args.gov:
    # ... existing direct employer scan ...

# Phase 2
if not args.quick and not args.gov:
    # ... existing Indeed/Dice scan ...

# Phase 3
if args.gov or (not args.quick and not args.company):
    # ... government scan ...
```

**Report generation:** Add `"USAJobs"` and `"WorkOne"` to `generate_report()` source iteration with government icon (🏛️):
```
──────────────────────────────────────────────────────────────
  🏛️ USAJOBS (3 results)
──────────────────────────────────────────────────────────────
  ▸ IT Specialist (SysAdmin)
    Department of Veterans Affairs · Indianapolis, IN
    💰 $73,286 - $95,270/year
    🔗 https://www.usajobs.gov/job/...
```

**DB storage:** Government results upserted via existing `upsert_job()` — same `career_pages.db`, same `jobs` table. The `company_id` prefix (`usajobs_`, `workone_`) prevents display collisions with direct employer entries.

**Dedup:** `deduplicate()` by title+company handles cross-source dedup in reports. `upsert_job()` handles DB-level dedup by `job_id()` hash of title+company_name+url.

**Runtime note:** Adding Phase 3 increases full scan time (2 additional API calls per query × 9 queries = ~18 API calls). For scheduled daily scans, this is acceptable. Use `--quick` for fast morning checks (Direct only) and `--gov` for targeted government checks.

### 5.2 Changes to `scanner/Start-CareerPageScan.ps1`

Add `-Gov` switch parameter:
```powershell
[switch]$Gov
```

When set, passes `--gov` to `morning_scan.py`:
```powershell
if ($Gov) { $MorningScanArgs += "--gov" }
```

**`scanner/data/run_morning_scan.ps1` (Task Scheduler wrapper):** Out of scope — it runs full scans which will now include Phase 3 automatically. If a gov-only scheduled task is needed later, it can be added separately.

## 6. Tests (`scanner/test_gov_boards.py`)

Located in `scanner/` alongside the scrapers. Uses pytest with mocked API responses.

### 6.1 Test Cases

| Test | What it verifies |
|------|-----------------|
| `test_usajobs_returns_valid_dicts` | Mocked API response → correct DB-format job dict, all required fields present, `company_id` starts with `usajobs_` |
| `test_workone_returns_valid_dicts` | Same for WorkOne — `company_id` starts with `workone_` |
| `test_usajobs_filters_irrelevant` | Non-IT titles (e.g., "Nurse Practitioner") filtered out by `_is_relevant()` |
| `test_workone_filters_irrelevant` | Same for WorkOne |
| `test_dedup_across_gov_sources` | Same job appearing in both sources deduped to one via `deduplicate()` |
| `test_gov_flag_parsing` | `--gov` arg parsed correctly, sets the flag that skips Direct/Indeed/Dice phases |

### 6.2 Mock Strategy

Patch `requests.post` using `unittest.mock.patch` to return a `MagicMock` response object:

```python
mock_response = MagicMock()
mock_response.raise_for_status.return_value = None
mock_response.json.return_value = {
    "content": [
        {"type": "text", "text": json.dumps([
            {
                "title": "IT Specialist (SysAdmin)",
                "company": "Department of Veterans Affairs",
                "location": "Indianapolis, IN",
                "salary": "$73,286 - $95,270/year",
                "url": "https://www.usajobs.gov/job/123456",
                "job_type": "Full-time",
                "posted_date": "2026-03-20",
                "description_snippet": "Manages Windows servers..."
            }
        ])}
    ]
}
```

The mock returns a single `text` block containing the JSON array — this matches the happy-path response structure. `raise_for_status()` is a no-op. No live API calls in tests.

## 7. Files Modified

| File | Change |
|------|--------|
| `scanner/usajobs_scraper.py` | New — USAJobs scraper module |
| `scanner/workone_scraper.py` | New — WorkOne scraper module |
| `scanner/morning_scan.py` | Add `--gov` flag, Phase 3 government scanning, report sections |
| `scanner/career_page_scraper.py` | Add `_slugify()` helper (shared by new scrapers) |
| `scanner/Start-CareerPageScan.ps1` | Add `-Gov` switch |
| `scanner/test_gov_boards.py` | New — 6 test cases |

## 8. Git

Single commit: `feat(SCRUM-99): government job board integration — USAJobs and WorkOne`
