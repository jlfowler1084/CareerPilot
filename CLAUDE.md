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
- SQLite for local data at `data/careerpilot.db`
- Google OAuth tokens in `data/`, auto-refreshed on expiry
- Timezone: `America/Indiana/Indianapolis` (EST, no DST)

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

### MCP Servers (Project-Specific)
- **Supabase** — cloud data sync (permission: `mcp__Supabase__*`)
- **Playwright** — browser automation for job sites (permission: `mcp__plugin_playwright_playwright__*`)
- **Indeed/Dice** — job search APIs

## Privacy & Safety
- **Draft-only mode:** Gmail responder saves drafts only — nothing sends without explicit approval
- **All data stays local:** SQLite + markdown files. Nothing leaves except API calls
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
