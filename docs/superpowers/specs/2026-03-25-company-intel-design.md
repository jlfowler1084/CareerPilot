# Company Intelligence Brief — Design Spec (SCRUM-140)

## Overview

Company intelligence engine that uses Claude + web_search to generate comprehensive research briefs for target companies. Serves the CLI now; will later power a dashboard API route.

## Approach

**Single-prompt with web_search (Option A):** One `client.messages.create()` call using the `anthropic` SDK with `tools=[{"type": "web_search_20250305", "name": "web_search"}]`. Claude autonomously searches the web and returns a structured JSON brief in one turn.

## Module: `src/intel/company_intel.py`

Class `CompanyIntelEngine`:
- Lazy-initialized `anthropic.Anthropic` client (same pattern as `JobAnalyzer`)
- `generate_brief(company, role_title=None, contact_name=None, job_url=None) -> dict`
- System prompt instructs Claude to research via web_search and return JSON
- Conditionally requests `role_analysis` (when `role_title` provided) and `interviewer_prep` (when `contact_name` provided)
- Response parsing: strip markdown fences, `json.loads()`, validate keys with defaults
- `max_tokens=8192`, model `claude-sonnet-4-6`

### Brief Schema

```json
{
    "company_overview": {
        "description": "str",
        "headquarters": "str",
        "size": "str",
        "revenue_or_funding": "str",
        "key_products": ["str"],
        "recent_news": [{"headline": "str", "date": "str", "summary": "str"}]
    },
    "culture": {
        "glassdoor_rating": "str",
        "sentiment_summary": "str",
        "work_life_balance": "str",
        "remote_policy": "str",
        "pros": ["str"],
        "cons": ["str"]
    },
    "it_intelligence": {
        "tech_stack": ["str"],
        "cloud_provider": "str",
        "infrastructure_scale": "str",
        "recent_it_postings": [{"title": "str", "signal": "str"}],
        "it_challenges": ["str"]
    },
    "role_analysis": {
        "org_fit": "str",
        "day_to_day": "str",
        "growth_potential": "str",
        "red_flags": ["str"],
        "questions_to_ask": ["str"]
    },
    "interviewer_prep": {
        "linkedin_summary": "str",
        "likely_interview_style": "str",
        "rapport_topics": ["str"]
    },
    "generated_at": "ISO timestamp",
    "sources": ["URLs"]
}
```

## Database: `company_intel` table

Added to `SCHEMA_SQL` in `src/db/models.py`:

```sql
CREATE TABLE IF NOT EXISTS company_intel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    role_title TEXT,
    brief TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    application_id INTEGER,
    FOREIGN KEY (application_id) REFERENCES applications(id)
);
```

CRUD functions:
- `cache_brief(conn, company, role_title, brief_dict, application_id=None)` — JSON-serializes brief, sets expires_at 30 days out
- `get_cached_brief(conn, company, max_age_days=30)` — returns dict or None
- `link_brief_to_application(conn, brief_id, application_id)`
- `get_brief_for_application(conn, application_id)`

## CLI: `intel` command group

| Command | Purpose |
|---|---|
| `cli.py intel research <company>` | Generate fresh brief, display, cache |
| `cli.py intel show <company>` | Show cached brief (no API call) |
| `cli.py intel refresh <company>` | Force regenerate ignoring cache |
| `cli.py intel prep <app_id>` | Brief for tracked application |

Flags for `research`: `--role`, `--contact`, `--url`

## Display

Helper `display_brief(console, brief, company)` renders Rich panels per section with colored borders. Called by all subcommands that show a brief.

## Tests

Mocked API responses (same pattern as `test_analyzer.py`):
- Brief generation with full sections
- Cache hit (no API call)
- Cache miss/expired (triggers API)
- Brief linked to application
- role_analysis conditional on role_title
- interviewer_prep conditional on contact_name
- API failure → None
- Bad JSON → None

## Out of Scope

- Morning scan integration (future wiring)
- Auto-trigger on application tracking (future wiring)
- Dashboard API route (future ticket)
