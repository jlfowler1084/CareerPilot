# CareerPilot

A Python CLI application for managing your job search end-to-end. Scans Gmail for recruiter emails, searches Indeed and Dice for openings, tracks applications through a pipeline, analyzes interview transcripts, generates study roadmaps from skill gaps, and ties it all together with an interactive dashboard and AI-powered daily summaries. Built with Claude (Anthropic), Google APIs, and Rich terminal UI.

## Quick Start

```bash
# Clone
git clone https://github.com/jlfowler1084/CareerPilot.git
cd CareerPilot

# Install dependencies
python -m pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys:
#   ANTHROPIC_API_KEY — required for all AI features
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — for Gmail and Calendar

# Run
python cli.py              # Interactive dashboard
python cli.py --help       # See all commands
```

## Commands

| Command | Description |
|---|---|
| `cli.py` | Interactive dashboard (main menu) |
| `cli.py morning` | Morning scan — Gmail (24h) + job search + pending apps |
| `cli.py scan` | Full Gmail scan for recruiter emails with response drafting |
| `cli.py search` | Job search across Indeed/Dice with profile selection |
| `cli.py tracker show` | Application pipeline (kanban view) |
| `cli.py tracker update <id>` | Update application status |
| `cli.py tracker stats` | Application analytics (response rate, breakdown) |
| `cli.py analyze <id>` | Job fit analysis against your skills |
| `cli.py interview analyze <file>` | Analyze interview transcript |
| `cli.py interview mock` | Interactive mock interview with AI scoring |
| `cli.py interview history` | Past interview analyses |
| `cli.py interview compare` | Trend analysis across interviews |
| `cli.py journal new` | Create journal entry |
| `cli.py journal list` | Recent entries |
| `cli.py journal insights` | Weekly AI summary |
| `cli.py skills` | Skill inventory with gap visualization |
| `cli.py roadmap` | AI-generated study plan from skill gaps |
| `cli.py calendar` | Google Calendar availability |
| `cli.py quick` | Rapid journal entry (no menus) |
| `cli.py status` | One-shot overview of today's activity |
| `cli.py daily` | AI end-of-day recap with tomorrow's priorities |

## Architecture

```
cli.py                          CLI entry point (Click + Rich)
config/
  settings.py                   Central config (.env loader)
  search_profiles.py            Job search keyword/location profiles
src/
  gmail/scanner.py              Gmail API + Claude email classification
  gmail/responder.py            Draft responses with Claude, save to Gmail
  calendar/scheduler.py         Google Calendar availability + holds
  journal/entries.py             Markdown journal with auto-tagging
  journal/insights.py            Weekly summaries + momentum tracking
  skills/tracker.py              Skill inventory with SQLite persistence
  skills/roadmap.py              Claude-powered study plan generation
  interviews/transcripts.py     Transcript parser (.txt/.md/.vtt/.srt)
  interviews/coach.py            Interview analysis, comparison, mock coaching
  jobs/searcher.py               Indeed/Dice via Anthropic MCP connectors
  jobs/tracker.py                Application pipeline (9 statuses)
  jobs/analyzer.py               Job fit scoring with Claude
  db/models.py                   SQLite schema + CRUD
tests/                           175 tests across all modules
```

## Key Integrations

- **Anthropic Claude** — Email classification, response drafting, interview analysis, mock coaching, gap analysis, study roadmaps, daily summaries, job fit scoring
- **Gmail API** — Inbox scanning, draft creation (draft-only mode — nothing sends without approval)
- **Google Calendar API** — Availability checking, interview hold creation
- **Indeed / Dice** — Job search via MCP servers through the Anthropic API
- **SQLite** — Local persistence for applications, skills, interview analyses, settings

## Privacy

All data stays local. SQLite database + markdown files on your machine. Nothing leaves except API calls to Google and Anthropic. OAuth tokens and API keys are never committed to git.

<!-- Screenshots: TODO -->
