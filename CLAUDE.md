# CLAUDE.md — CareerPilot Project Context
<!-- This file contains CareerPilot-specific rules only.
     Shared conventions are inherited from ~/.claude/CLAUDE.md -->
<!-- Global hooks inherited from: ~/.claude/settings.json -->

## Project Identity
CareerPilot is a Python CLI application for personal career management:
- Gmail scanning for recruiter emails with Claude-powered classification and response drafting
- Google Calendar integration for availability checking and interview scheduling
- Job search automation via Indeed/Dice with application tracking
- Interview transcript analysis and mock interview coaching
- Skill gap tracking with Claude-powered study roadmap generation
- Progress journaling with weekly insights and momentum analysis

**Location:** `F:\Projects\CareerPilot\`
**Repo:** jlfowler1084/CareerPilot (private), **Branch:** master

## Environment (Project-Specific)
- **Python:** 3.12 — use `python -m pip install` (never bare `pip`)
- **Python compat:** PEP 585 builtin generics (`list[str]`, `dict[str, int]`) and PEP 604 union syntax (`str | None`) work directly. `from __future__ import annotations` is no longer required for type-hint purposes; only add it when you specifically want to defer all annotation evaluation.
- **Shell:** Claude Code uses bash syntax in this project

## Testing
- Run all tests: `python -m pytest tests/`
- Run specific: `python -m pytest tests/test_scanner.py -v`

## Code Conventions
### Python
- Use `click` for CLI interfaces — `cli.py` is the main entry point
- Use `Rich` for terminal UI (tables, panels, progress bars, markdown rendering)
- Use `python-dotenv` to load `.env` — all config via `config/settings.py`
- Data layer: see `## Data Layer` below — split across SQLite + Supabase, consolidation in progress (CAR-163)
- Google OAuth tokens in `data/`, auto-refreshed on expiry
- Timezone: `America/Indiana/Indianapolis` (EST, no DST)

## Data Layer

**Status: CAR-163 consolidation complete. M1-M5b shipped 2026-04-21 (applications + contacts on Supabase); M6 finalized 2026-04-22 (remaining tables stay local).**

Decision artifacts:
- Original audit + Option-C rationale: `docs/brainstorms/CAR-163-application-entry-paths-consolidation-audit.md`
- M6 per-table disposition: `docs/brainstorms/CAR-169-m6-remaining-tables-disposition.md`

**Supabase-backed (CLI + dashboard both write):**
- **Applications** — CLI via `ApplicationTracker` (`src/jobs/tracker.py`); dashboard via `use-applications.addApplication` (`dashboard/src/hooks/use-applications.ts`).
- **Contacts** — CLI via `ContactManager`; dashboard via `/api/contacts/route.ts`.

**Local SQLite (final architecture per CAR-169 M6):**
- `contact_interactions`, `submitted_roles` — deliberately local (Option-C choice from M5).
- `llm_calls`, `llm_budget_resets`, `kv_store` — CLI-internal observability / scratch; no dashboard surface.
- `skills`, `skill_log`, `skill_demand`, `skill_application_map`, `study_plan`, `transcripts` — Phase 4 scaffolding, empty today. Stay local until the feature ships a dashboard surface; migrate then as part of that feature ticket.
- `ats_portals`, `company_intel` — low-volume CLI helpers; stay local.
- `applications_deprecated_2026_04_21`, `contacts_deprecated_2026_04_21` — migration backups; drop after 2026-05-21.

**Rule of thumb for future local-vs-cloud calls:** a table moves to Supabase only when (a) a dashboard UI reads or writes it, or (b) the user needs it shared across devices. Scaffolding for unreleased features stays local; migrate as part of the feature ticket that surfaces it.

**Canonical "add an application" entry paths:**
- Dashboard "Add Application Manually" form or "Paste URL to auto-extract" — browser UX.
- CLI `tracker add` (wizard), `tracker import-from-email`, or `search` save-on-prompt — terminal/scripting UX.
- Both write the same Supabase `applications` table, scoped by `user_id`.

**Before introducing a new write path for applications or contacts**, read the audit doc and check whether the new path is needed or whether an existing seam (`ApplicationTracker.save_job` or `use-applications.addApplication`) covers it.

## Directory Structure
```
CareerPilot/
├── cli.py                 # Click CLI entry point
├── config/
│   └── settings.py        # Central configuration
├── data/
│   ├── careerpilot.db     # SQLite database
│   └── token.json         # Google OAuth token
├── modules/
│   ├── scanner.py         # Gmail scanning + classification
│   ├── calendar_mgr.py    # Google Calendar integration
│   ├── job_search.py      # Indeed/Dice automation
│   ├── interview.py       # Transcript analysis + mock interviews
│   ├── skills.py          # Skill gap tracking + study roadmaps
│   └── journal.py         # Progress journaling
├── tests/
├── .env                   # API keys (never committed)
├── prompts/               # Session handoff prompts
├── docs/plans/            # CE implementation plans (archive)
├── docs/solutions/        # Knowledge compounding (solved problems)
├── .mcp.json              # MCP server configuration
└── requirements.txt
```

## Key Components
### CLI Commands
| Command | Description |
|---------|-------------|
| `scan` | Scan Gmail for recruiter emails, classify, draft responses |
| `calendar` | Check availability, suggest interview slots |
| `search` | Search Indeed/Dice, track applications |
| `interview` | Analyze transcripts, run mock interviews |
| `skills` | Track skill gaps, generate study roadmaps |
| `journal` | Progress entries, weekly insights |

## MCP Servers
Allowed: Atlassian Rovo, Context7, Supabase, Indeed, Dice, Playwright
All servers are enabled in this project — no disables needed.
Source of truth: ClaudeInfra `configs/mcp-server-registry.json` (INFRA-70).

## Privacy & Safety
- **Draft-only mode:** Gmail responder saves drafts only — nothing sends without explicit approval
- **Data location:** Split today (SQLite local + Supabase cloud). Post-CAR-163 consolidation, application and contact rows live in Supabase under your authenticated `user_id`; local SQLite only retains tables where "stay local" was an explicit choice (see `## Data Layer`).
- **OAuth tokens:** Stored locally in `data/`, never committed
- **API keys:** In `.env`, never committed

## Project-Specific Mistakes to Avoid
- Don't skip OAuth token refresh handling
- Don't reach for `from typing import List, Dict, Optional` — Python 3.12 supports `list[str]`, `dict[str, int]`, and `str | None` natively

## Current Priorities
### Phase 1 — Foundation (Current)
- Gmail scanner with Claude classification
- SQLite storage layer
- Basic CLI structure

### Phase 2 — Calendar + Scheduling
- Google Calendar integration
- Interview slot suggestions

### Phase 3 — Job Search Automation
- Indeed/Dice API integration
- Application tracking

### Phase 4 — Intelligence Layer
- Interview transcript analysis
- Skill gap identification
- Study roadmap generation

### Phase 5 — Journaling + Insights
- Progress journaling
- Weekly momentum analysis

### Phase 6 — Polish
- Rich terminal UI
- Export capabilities
- Supabase cloud sync
