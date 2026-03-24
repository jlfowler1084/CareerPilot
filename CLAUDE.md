# CLAUDE.md — CareerPilot Project Context

## Project Identity

CareerPilot is a Python CLI application for personal career management:
- Gmail scanning for recruiter emails with Claude-powered classification and response drafting
- Google Calendar integration for availability checking and interview scheduling
- Job search automation via Indeed/Dice with application tracking
- Interview transcript analysis and mock interview coaching
- Skill gap tracking with Claude-powered study roadmap generation
- Progress journaling with weekly insights and momentum analysis

**Owner:** Joe
**Location:** `F:\Projects\CareerPilot\`
**Platform:** Windows 10, Python 3.8+ (Microsoft Store Python 3.8.10)

---

## Environment

- **OS:** Windows 10/11
- **Shell:** PowerShell 5.1+ / bash (via Git Bash or WSL) — Claude Code uses bash syntax
- **Python:** 3.8+ (Microsoft Store Python 3.8.10 — use `python -m pip install` not bare `pip`)
- **Python compat:** Use `from __future__ import annotations` in all modules with type hints — `list[str]` syntax requires 3.9+
- **Node.js:** v24.14.0 (installed at `C:\Program Files\nodejs\`)
- **MCP config:** `.mcp.json` in project root (NOT settings.json)

Use `python -m pip install` for package installs — bare `pip install` may target a different Python installation.

Temp files may be cleaned up quickly by Windows — save diagnostic outputs to persistent locations (e.g., the project's `data/` or `logs/` directory), not system temp folders.

### MCP Fallback Strategy

The Atlassian MCP server for Jira may disconnect mid-session. Follow this escalation:
1. Try MCP tools first (1 attempt)
2. If MCP fails, immediately fall back to direct Jira REST API:
   ```python
   import requests, base64, os
   auth = base64.b64encode(f"{os.environ['JIRA_EMAIL']}:{os.environ['JIRA_API_TOKEN']}".encode()).decode()
   headers = {"Authorization": f"Basic {auth}", "Content-Type": "application/json"}
   response = requests.get("https://jlfowler1084.atlassian.net/rest/api/3/issue/SCRUM-XX", headers=headers)
   ```
3. Do NOT retry MCP more than once — it wastes entire sessions
4. Jira project: SCRUM on jlfowler1084.atlassian.net, transition ID 41 = Done

---

## Testing

### Test Commands

- Run all tests: `python -m pytest tests/`
- Run a specific test file: `python -m pytest tests/test_scanner.py`
- Run with verbose output: `python -m pytest tests/ -v`
- NEVER report "no regression" without actually running the test suite

After ANY code change:
1. Run `python -m pytest tests/` against all test cases
2. If any test fails, STOP — diagnose before attempting another fix
3. Never stack multiple fixes without testing between each one
4. Report test results BEFORE telling the user "fix confirmed"

### Regression Prevention

Before implementing any fix:
1. Analyze which other modules could be affected
2. List the specific functions that will change and the regression risks
3. Run the full test suite to establish a clean baseline BEFORE editing code

After implementing any fix:
1. Run the full test suite
2. If any module regresses, STOP — diagnose before attempting another fix
3. Never stack multiple fixes without testing between each one
4. Report test results with pass/fail counts before declaring "fix confirmed"

---

## Directory Structure

```
F:\Projects\CareerPilot\
├── CLAUDE.md                      ← this file
├── README.md                      ← project description + setup instructions
├── requirements.txt               ← Python dependencies
├── .env.example                   ← environment variable template
├── .gitignore                     ← Python, .env, __pycache__, *.db, tokens, IDE
├── config/
│   ├── settings.py                ← central config (loads .env, exposes constants)
│   └── search_profiles.py         ← job search keyword/location profiles
├── src/
│   ├── __init__.py
│   ├── gmail/
│   │   ├── __init__.py
│   │   ├── scanner.py             ← Gmail API integration, recruiter detection
│   │   ├── responder.py           ← Draft/send responses via Claude
│   │   └── templates.py           ← response templates + personal context
│   ├── calendar/
│   │   ├── __init__.py
│   │   └── scheduler.py           ← Google Calendar availability + booking
│   ├── jobs/
│   │   ├── __init__.py
│   │   ├── searcher.py            ← Indeed/Dice API search wrapper
│   │   ├── tracker.py             ← application tracking (SQLite)
│   │   └── analyzer.py            ← job description analysis via Claude
│   ├── journal/
│   │   ├── __init__.py
│   │   ├── entries.py             ← create/read/search journal entries
│   │   └── insights.py            ← Claude-powered gap analysis on entries
│   ├── interviews/
│   │   ├── __init__.py
│   │   ├── transcripts.py         ← load and parse interview transcripts
│   │   └── coach.py               ← Claude-powered interview analysis
│   ├── skills/
│   │   ├── __init__.py
│   │   ├── tracker.py             ← skill inventory + progress tracking
│   │   └── roadmap.py             ← study plan generation via Claude
│   └── db/
│       ├── __init__.py
│       └── models.py              ← SQLite schema + CRUD operations
├── cli.py                         ← main CLI entry point (Click + Rich)
├── tests/
│   └── ...                        ← pytest test files
└── data/
    ├── journal/                   ← markdown journal entries
    ├── transcripts/               ← interview transcript files
    ├── gmail_token.json           ← Gmail OAuth token (gitignored)
    └── calendar_token.json        ← Calendar OAuth token (gitignored)
```

---

## Code Conventions

### Python

- Use `click` for CLI interfaces — `cli.py` is the main entry point
- Use `Rich` for terminal UI (tables, panels, progress bars, markdown)
- Include `if __name__ == "__main__":` guards in all runnable modules
- Use `logging` module, not bare `print()`, for status output
- On Windows, reconfigure stdout/stderr to UTF-8 when output may be captured:
  ```python
  if sys.platform == 'win32':
      sys.stdout.reconfigure(encoding='utf-8', errors='replace')
      sys.stderr.reconfigure(encoding='utf-8', errors='replace')
  ```
- Resolve file paths relative to script location using `Path(__file__).resolve().parent`
- Use `python-dotenv` to load `.env` — all config via `config/settings.py`
- SQLite for local data (applications, skills, interview analyses) — database at `data/careerpilot.db`
- Google OAuth tokens stored in `data/` directory, auto-refreshed on expiry

### General

- All paths configurable via `config/settings.py` — reference paths relative to project root
- When generating code, produce **complete working files**, not fragments
- When modifying existing files, show specific changes with surrounding context
- Timezone: `America/Indiana/Indianapolis` (EST, no DST — Indiana is always Eastern)

---

## Key Components

### config/settings.py

Loads `.env` and exposes all config values as module-level constants:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — Google OAuth
- `GMAIL_SCOPES`, `CALENDAR_SCOPES` — Google API scopes
- `DB_PATH` — SQLite database path (default: `data/careerpilot.db`)

### CLI Commands (Click)

| Command | Purpose |
|---|---|
| `python cli.py scan` | Scan Gmail + display recruiter emails, respond/decline/skip |
| `python cli.py calendar` | Show availability for next 5 days |
| `python cli.py journal new` | Create a new journal entry |
| `python cli.py journal list` | Show recent entries |
| `python cli.py journal insights` | Weekly summary via Claude |
| `python cli.py skills` | Show skill inventory with gap visualization |
| `python cli.py roadmap` | Generate study roadmap via Claude |
| `python cli.py search` | Run job search profiles |
| `python cli.py tracker` | Show application pipeline (kanban) |
| `python cli.py tracker stats` | Search/application analytics |
| `python cli.py interview analyze <file>` | Analyze interview transcript |
| `python cli.py interview mock` | Interactive mock interview |

### API Integrations

| API | Purpose | Auth |
|---|---|---|
| Anthropic (Claude) | Email classification, response drafting, gap analysis, interview coaching, roadmap generation | API key in `.env` |
| Gmail API | Inbox scanning, draft creation, email sending | OAuth2 (InstalledAppFlow) |
| Google Calendar API | Availability checking, event creation | OAuth2 (InstalledAppFlow) |
| Indeed (via MCP) | Job search | MCP server |
| Dice (via MCP) | Job search | MCP server |

### Claude API Pattern

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="...",
    messages=[{"role": "user", "content": "..."}],
)
```

### SQLite Tables

| Table | Purpose |
|---|---|
| `applications` | Job application tracking (status, dates, notes) |
| `skills` | Skill inventory (name, category, current/target level) |
| `interview_analyses` | Stored interview analysis results for trend tracking |

---

## External Dependencies

| Package | Purpose |
|---|---|
| `anthropic` | Claude API SDK |
| `google-auth`, `google-auth-oauthlib`, `google-auth-httplib2` | Google OAuth2 |
| `google-api-python-client` | Gmail and Calendar API client |
| `python-dotenv` | Load `.env` config |
| `rich` | Terminal UI (tables, panels, progress bars) |
| `click` | CLI framework |
| `pytest` | Test framework |

---

## MCP Servers

MCP configuration lives in `.mcp.json` at the project root — **not** in `settings.py` or `.claude/settings.json`.

### Prerequisites

| Requirement | Status | Details |
|---|---|---|
| Node.js | Installed | v24.14.0 at `C:\Program Files\nodejs\node.exe` |
| npx | Installed | `C:\Program Files\nodejs\npx.cmd` (bundled with Node.js) |

No global npm packages required — servers are fetched via `npx -y` on first use.

### Context7 (`@upstash/context7-mcp`)

Provides up-to-date library documentation and code examples. Use when working with any third-party library to get current API docs rather than relying on training-data approximations.

### Atlassian MCP

Connects to Atlassian Cloud (Jira, Confluence) via the official hosted MCP endpoint. Authenticates via browser OAuth on first use each session.

**Fallback if unavailable:** Update Jira tickets manually via browser or use direct REST API.

---

## Common Mistakes to Avoid

- Don't hardcode absolute paths — everything goes through `config/settings.py`
- Don't add Python dependencies without calling them out — update `requirements.txt`
- Don't use bare `pip install` — use `python -m pip install`
- Don't recommend rewriting working components in a different language/framework without clear reason
- Don't overwrite MCP config files (e.g., `.mcp.json`) — always merge new entries into the existing object
- Don't restructure config schema without discussion
- Don't stack multiple code fixes without running the test suite between each one
- Don't report "no regression" without actually running pytest
- Don't retry failed MCP connections more than once — fall back to REST API immediately
- Don't assume temp files still exist — Windows may clean them up
- Don't send emails without explicit user approval — Gmail responder starts in draft-only mode

---

## Git Workflow

**Repo:** `jlfowler1084/CareerPilot` (private)
**Branch:** `master` (default working branch)
**Remote:** `origin` → GitHub

### Standard workflow for all code changes:

1. **Pull before starting work:** `git pull origin master` to ensure you're on the latest
2. **Make changes** — edit files as needed
3. **Stage and commit** with a descriptive message:
   ```
   git add -A
   git commit -m "feat: description of what changed"
   ```
4. **Push to remote:** `git push origin master`

### Commit message conventions:

- `feat:` — new feature or capability
- `fix:` — bug fix
- `refactor:` — code restructuring, no behavior change
- `docs:` — documentation updates (CLAUDE.md, README, comments)
- `chore:` — maintenance (dependencies, config, cleanup)
- `test:` — adding or updating tests

### Rules:

- **Every task that modifies project files should end with a commit and push.** Don't leave uncommitted changes.
- **Never commit** files matching `.gitignore` patterns: `data/`, `*.db`, token files, `.env`, `__pycache__/`, `.claude/settings.local.json`
- If a task involves multiple logical changes, use **separate commits** for each
- Before starting any work session, run `git status` to check for uncommitted changes from previous sessions

---

## Privacy & Safety

- **Draft-only mode:** The Gmail responder saves drafts — nothing sends without explicit user approval
- **All data stays local:** SQLite database + markdown files. Nothing leaves the machine except API calls to Google and Anthropic
- **OAuth tokens:** Stored locally in `data/` directory, never committed to git
- **API keys:** Stored in `.env`, never committed to git

---

## Things to Avoid

- **Don't suggest cloud services** for features that work locally unless specifically asked
- **Don't auto-send emails** — always draft first, require explicit approval
- **Don't store API keys in code** — always use `.env` and `config/settings.py`
- **Don't skip OAuth token refresh** — always handle expired tokens gracefully
- **Don't break the CLI** — all features accessible via `cli.py` commands

---

## Current Priorities

Phase-based development roadmap:
1. Phase 1 — Gmail recruiter scanner + response drafting (1a: scanner, 1b: responder)
2. Phase 2 — Google Calendar integration (availability + scheduling)
3. Phase 3 — Journal system + skill gap analysis
4. Phase 4 — Interview transcript analysis + coaching
5. Phase 5 — Job search integration + application tracker
6. Phase 6 — Unified dashboard CLI + daily workflow
