# CareerPilot

A Python CLI for managing a job search end-to-end. Gmail triage with Claude, nine-stage application pipeline, tailored resumes and cover letters, interview transcript analysis and mock coaching, skill-gap study planning, CRM for recruiters and agencies, and ATS auto-fill — wired together behind an interactive dashboard and a multi-provider LLM router that can fall back to local models.

## Quick Start

```bash
git clone https://github.com/jlfowler1084/CareerPilot.git
cd CareerPilot

python -m pip install -r requirements.txt

cp .env.example .env
# Required:
#   ANTHROPIC_API_KEY                      Claude API
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET Gmail + Calendar OAuth
#   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY Cloud persistence
#   CAREERPILOT_USER_ID                    UUID scoping all CLI writes
# Optional:
#   MODEL_HAIKU / MODEL_SONNET             Claude model pins
#   CAREERPILOT_LLM_LOCAL_BASE_URL         Local vLLM chat endpoint
#   CAREERPILOT_LLM_LOCAL_EMBED_BASE_URL   Local embedding endpoint

python cli.py              # Interactive dashboard
python cli.py --help       # See all commands
```

## Daily workflow

| Command | What it does |
|---|---|
| `python cli.py` | Interactive dashboard (Rich TUI main menu) |
| `python cli.py morning` | Morning sweep: Gmail scan (24h) + job search + pending apps |
| `python cli.py scan` | Full Gmail scan with Claude classification and draft responses |
| `python cli.py inbox` | Threaded email dashboard with one-click actions |
| `python cli.py search` | Interactive job search across Indeed and Dice |
| `python cli.py status` | One-shot overview of today's activity |
| `python cli.py daily` | End-of-day AI recap with tomorrow's priorities |
| `python cli.py quick` | Rapid journal entry (no menus) |

## Capabilities

### Gmail triage
Claude classifies recruiter mail, drafts personalized replies into Gmail's drafts folder (nothing sends automatically), and manages filter rules. When a draft is approved, CareerPilot offers to open Calendar and create an interview hold.

<details>
<summary>Gmail commands</summary>

- `scan` — Full scan with classification and response drafting (`--days N`)
- `inbox` — Threaded email dashboard with reply, snooze, classify actions
- `filters setup` — Create labels, filter rules, and retroactively tag existing mail
- `filters list` — Show current CareerPilot filter rules
- `filters add <domain>` / `filters remove <domain>` — Manage recruiter domains
- `filters test` — Dry-run filter queries
- `filters nuke` — Remove all CareerPilot filters
</details>

### Application pipeline
Nine-stage pipeline (`found` → `interested` → `applied` → `phone_screen` → `interview` → `offer` / `rejected` / `withdrawn` / `ghosted`) with stale-app detection, analytics (response rate, avg days to response, status breakdown), and Gmail import — feed a message ID with a job-description attachment and CareerPilot extracts the role into a tracked application.

<details>
<summary>Tracker commands</summary>

- `tracker show` — Kanban view across nine statuses
- `tracker stats` — Response rate, avg days to response, status chart
- `tracker add` — Interactive wizard (or flags for scripting)
- `tracker import-from-email <message_id>` — Import from Gmail with PDF/DOCX attachment parsing
- `tracker update <id>` / `tracker status <id> <status>` / `tracker withdraw <id>`
- `tracker applied-today` — Jobs applied to today
- `tracker stale` — Apps with no status update in 14+ days
- `analyze <id>` — Claude-powered job-fit score against your profile
- `apply` — Batch apply to jobs in `found` or `interested` status
</details>

### Document generation
Structured candidate profile (personal info, work history, education, certifications, references, EEO data) feeds Claude to produce tailored resumes and cover letters per role, saved to `data/resumes/` and `data/cover_letters/`.

<details>
<summary>Profile and document commands</summary>

- `profile setup` — Interactive wizard across all sections
- `profile show` / `profile edit <section>` — View or edit
- `profile export <fmt>` / `profile import` — Resume/PDF export and JSON import
- `docs resume <job_id>` — Generate tailored resume
- `docs cover-letter <job_id>` — Generate tailored cover letter
- `docs both <job_id>` — Generate both in one pass
- `docs list` — List generated documents
</details>

### Interview coaching
Import transcripts from Otter.ai exports, Samsung voice-recorder files, or raw audio (Whisper-transcribed locally or via OpenAI). Structured analysis flags strong answers, filler words, technical accuracy, and STAR-format compliance. Compare analyses over time, or run interactive mock interviews with AI scoring.

<details>
<summary>Interview commands</summary>

- `interview import-otter <file> <kind>` — Import Otter.ai transcript
- `interview import-samsung <path> <kind>` — Import Samsung recorder file
- `interview transcribe <audio>` — Whisper transcription (`--model`, `--kind`)
- `interview watch` — Watch folder for new files and auto-import
- `interview list` — All imported transcripts
- `interview analyze <source>` — Accepts transcript ID or file path (`--kind` override)
- `interview mock` — Interactive mock interview with Claude scoring
- `interview history` / `interview compare` — Trend analysis across past interviews
</details>

### Skill gap analysis
Parses tracked applications to extract required skills, cross-references against your self-rated skill inventory, ranks gaps by market demand, and generates a focused weekly study plan.

<details>
<summary>Skills commands</summary>

- `skills` — Inventory with gap visualization
- `skills scan` — Extract skills from tracked applications via Claude
- `skills gaps` — Gaps ranked by market demand
- `skills rate <skill> <level>` — Self-assess (1-5)
- `skills log <skill> <hours> <note>` — Log study time
- `skills match <app_id>` — Skill match for a specific application
- `skills plan <days> <skill_names>` — Generate study plan
- `skills focus` — Top three priorities this week
- `skills report` — Full gap report
- `roadmap` — AI-generated study plan from current gaps (`--hours N`)
</details>

### Contacts and agencies
Professional-contact manager with interaction logging, follow-up scheduling, and tag-based filtering, backed by Supabase. A separate agencies module tracks IT staffing agencies, recruiter contacts, roles you've been submitted for, and templated outreach emails.

<details>
<summary>Contacts and agency commands</summary>

**Contacts**
- `contacts add` / `contacts show <id>` / `contacts edit <id>` / `contacts log <id>`
- `contacts search <query>` / `contacts stale` / `contacts followups`
- `contacts tag <id> <tag>` / `contacts untag <id> <tag>`
- `contacts by-type <type>` — Filter by type (recruiter, hiring_manager, peer, etc.)
- `contacts create-from-email <email> <name>` — Quick-add from an email
- `recruiters` — Alias for `contacts` filtered by `type=recruiter`

**Agencies**
- `agencies list` / `agencies search <keyword>` / `agencies summary`
- `agencies outreach` — Generate templated outreach email
- `agencies recruiter add|list|show` — Recruiter records
- `agencies interaction log <recruiter_id>` — Interaction log
- `agencies role add|list|update` — Track roles submitted through an agency
</details>

### LinkedIn, ATS portals, and form-fill
Parses LinkedIn job-alert emails into tracked applications. Tracks ATS portal accounts with staleness detection for logins. Auto-detects ATS systems from a job URL and generates an auto-fill prompt, optionally executing it via Playwright.

<details>
<summary>LinkedIn, portals, and fill commands</summary>

**LinkedIn**
- `linkedin scan` — Scan Gmail for LinkedIn job alerts (`--days N`)
- `linkedin search` — Open LinkedIn search URLs
- `linkedin alerts` — Setup guide for LinkedIn alert rules
- `linkedin profiles` — List configured search profiles

**ATS portals**
- `portals list` / `portals add` / `portals check <id>` / `portals stale`

**Auto-fill**
- `fill url <job_url>` — Detect ATS and generate fill prompt (`--execute` to run via Playwright)
- `fill detect <url>` — Identify the ATS system
- `fill list-ats` — Supported ATS systems
- `fill cheatsheet` — Quick-fill values from your profile
</details>

### Company intel, journal, and LLM ops

<details>
<summary>Intel, journal, and LLM commands</summary>

**Company intel**
- `intel research <company>` — Fresh company brief (`--role`, `--contact`, `--url`)
- `intel show <company>` / `intel refresh <company>`
- `intel prep <application_id>` — Intel for a tracked application

**Journal**
- `journal new` / `journal list` / `journal show <filename>`
- `journal search <keyword>` / `journal insights` — Weekly AI summary

**LLM router ops**
- `llm summary` — Recent calls by provider or task
- `llm prune` — Delete old call log rows
- `llm reset-budget` — Reset fallback budget counter
- `llm embed-smoke [text]` — Embedding endpoint smoke test
</details>

## Architecture

```
cli.py                          Click entry point (~5.9k lines)
config/
  settings.py                   Central config (.env loader)
  search_profiles.py            Job-search keyword/location profiles
src/
  gmail/                        Scanner, responder, filters, threaded inbox,
                                OAuth, templates, attachments
  calendar/scheduler.py         Availability checks + interview holds
  jobs/                         Tracker, applicant, analyzer, Indeed/Dice searcher,
                                LinkedIn parser + CLI
  documents/                    Resume + cover letter generators (Claude)
  profile/                      Candidate profile model + manager
  agencies/                     Staffing-agency CRM, outreach templates,
                                recruiter + submitted-role tracking
  interviews/                   Coach (mock + analysis) + transcript parser
  transcripts/                  Otter / Samsung / Whisper importers + watch folder
  skills/                       Skill inventory + study roadmap
  intel/                        Company research + skill analyzer
  journal/                      Markdown journal + weekly insights
  browser/                      ATS auto-fill (Playwright)
  llm/                          Multi-provider router with fallback chain,
                                schema validation, call logging, daily budget
    providers/                  Claude (cloud), local (vLLM-compatible)
  db/                           Supabase client, SQLite models, contacts layer
tests/                          pytest suite
.mcp.json                       MCP server config (Atlassian, Context7, Supabase,
                                Indeed, Dice, Playwright)
```

**LLM routing.** Outbound Claude calls go through `src/llm/router.py`, which picks the model tier (Haiku or Sonnet) per task, validates response schemas where applicable, logs every call with cost attribution, enforces a daily fallback budget, and optionally routes to a local vLLM endpoint for bulk or privacy-sensitive work. Embedding calls use the same abstraction with a separate local endpoint.

## Key integrations

- **Anthropic Claude** — Classification, drafting, analysis, scoring, planning, summaries. Model tier picked per task by the router.
- **OpenAI** — Whisper transcription and an OpenAI-compatible route through the LLM router.
- **Google Gmail + Calendar** — OAuth 2.0 with auto-refresh, scoped tokens stored in `data/`.
- **Supabase** — Cloud persistence for contacts and, in progress, applications. Scoped by `CAREERPILOT_USER_ID`.
- **SQLite** — Local store for skills, interview analyses, LLM call logs, and tables that remain local by design.
- **Playwright** — Browser automation for ATS form fill.
- **Indeed / Dice** — Job search via MCP connectors.
- **Rich + Click** — Terminal UI and CLI framework.

## Data and privacy

- **Draft-only Gmail.** Every response lands in Gmail drafts. Nothing sends without explicit action.
- **Split persistence, consolidating.** SQLite lives at `data/careerpilot.db`; Supabase holds contacts today and will hold applications once the in-flight consolidation finishes. Both stores are scoped by user ID.
- **OAuth tokens** live in `data/` and are gitignored. Never committed.
- **API keys** live in `.env` and are gitignored.
- **Local LLM fallback.** Set the local endpoint variables in `.env` to keep bulk embedding or chat calls on your own hardware.

<!-- Screenshots: TODO -->
