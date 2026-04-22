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
- **Python:** 3.8+ (Microsoft Store Python 3.8.10 — use `python -m pip install`)
- **Python compat:** Use `from __future__ import annotations` in all modules with type hints — `list[str]` syntax requires 3.9+
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

**Status: Applications + contacts unified on Supabase (CAR-163 M1-M5b shipped 2026-04-21). Remaining local tables pending CAR-169 (M6) disposition.**

See `docs/brainstorms/CAR-163-application-entry-paths-consolidation-audit.md` for the original audit. End-state decision is **Option (c) — unify on Supabase via Python client** for applications and contacts.

**Current state (as of 2026-04-22):**
- **Applications** live in Supabase. CLI writes via `ApplicationTracker` (`src/jobs/tracker.py`), dashboard writes via `use-applications.addApplication` (`dashboard/src/hooks/use-applications.ts`). Local SQLite `applications` table retired (renamed to `applications_deprecated_2026_04_21` during M3 migration).
- **Contacts** live in Supabase. CLI writes via `ContactManager`, dashboard writes via `/api/contacts/route.ts`. Local SQLite `contacts` table retired (renamed to `contacts_deprecated_2026_04_21` during M5b migration).
- **Remaining local SQLite tables** (all CLI-only, no dashboard surfacing today): `contact_interactions`, `submitted_roles` (deliberately local by Option-C choice); `skills`, `skill_log`, `skill_demand`, `skill_application_map`, `study_plan`, `transcripts`, `ats_portals`, `company_intel`, `kv_store`, `llm_calls`, `llm_budget_resets`. Disposition pending CAR-169 (M6).

**Canonical "add an application" entry paths:**
- Dashboard "Add Application Manually" form or "Paste URL to auto-extract" — browser UX
- CLI `tracker add` (wizard), `tracker import-from-email`, or `search` save-on-prompt — terminal/scripting UX
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
- Don't use `list[str]` syntax — use `List[str]` from typing or `from __future__ import annotations`

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
