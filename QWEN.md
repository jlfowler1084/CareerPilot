# CareerPilot — Qwen Code Context

This project is a **Python CLI for end-to-end job search management**. It scans Gmail for recruiter emails, searches Indeed and Dice, tracks applications through a pipeline, analyzes interview transcripts, generates skill-gap study roadmaps, and provides a daily dashboard of pending actions. The target audience is one user (Joe) hunting sysadmin/DevOps/infrastructure contract roles in the Indianapolis area and remote.

## Tech stack

- **Python 3.8+** — the CLI and all modules. Note the floor: we target 3.8 compatibility.
- **Click** — CLI framework, main entry point and subcommand routing
- **Rich** — terminal UI, tables, markdown rendering, progress bars
- **SQLite** via `sqlite3` + light SQLAlchemy usage — local persistence at `data/careerpilot.db`
- **Google APIs** — Gmail read (`scanner.py`), Calendar read/write (`calendar_mgr.py`), OAuth via `data/token.json`
- **Anthropic Claude API** — email classification, response drafting, interview transcript analysis
- **Indeed / Dice connectors** — job search MCP servers when available, REST fallback otherwise

## Directory layout

```
cli.py                      Click CLI entry point — main + all subcommands
config/
  settings.py               central config and .env loader
modules/
  scanner.py                Gmail scan, recruiter email classification
  calendar_mgr.py           Google Calendar integration
  job_search.py             Indeed/Dice search pipeline
  interview.py              Transcript analysis and mock-interview coaching
  skills.py                 Skill tracker, gap analysis, study roadmap
  journal.py                Daily journal / insight capture
data/
  careerpilot.db            SQLite — applications, jobs, emails, skills
  token.json                Google OAuth token (gitignored)
tests/                      175 tests across all modules
prompts/                    Session handoff prompts for cross-model execution
docs/                       Design docs, ADRs
.env                        API keys (gitignored)
```

## Write permissions

All directories are writable — this is a pure code project. Modify `cli.py`, modules, tests, docs, and configs freely. The only things to leave alone are `.env`, `data/token.json`, `data/careerpilot.db`, and anything matched by `.gitignore`.

## Key entry points

```bash
# Interactive dashboard (main command)
python cli.py

# Morning briefing — 24h Gmail scan + job search + pending applications
python cli.py morning

# Gmail scan + email classification + response drafting
python cli.py scan

# Job search across Indeed + Dice
python cli.py search

# Analyze an interview transcript
python cli.py interview analyze path/to/transcript.md

# Skill gap analysis
python cli.py skills gap

# Full test suite
python -m pytest tests/

# Targeted test run
python -m pytest tests/test_scanner.py -v
```

## Testing — non-negotiable

**175 tests across all modules**, run via pytest. Mock the Gmail and Google Calendar APIs — never hit real endpoints from the test suite. Before shipping any change:

```bash
python -m pytest tests/
```

Key testing patterns:
- **Gmail and Calendar APIs are mocked** — tests must not require a valid OAuth token
- **Database tests use in-memory SQLite** — no fixture cleanup issues
- **OAuth token refresh logic has explicit test coverage** — don't regress it
- **Claude API calls are stubbed** — tests assert on the prompt shape, not real completions

## Code style

### Python compatibility
- **Target Python 3.8** — this is the floor, not 3.10+
- **`from __future__ import annotations`** at the top of every module that uses type hints — this enables PEP 585 generic syntax (`list[str]`, `dict[str, int]`) on 3.8
- Without that import, use `typing.List[str]`, `typing.Dict[str, int]`, etc.
- Never use `match`/`case` (3.10+) or `ParamSpec` (3.10+) without a fallback

### Framework patterns
- **Click** for all CLI entry points — `@click.command()`, `@click.group()`, `@click.option()`
- **Rich** for all terminal output — `console.print()`, `Table`, `Panel`, `Markdown`, never raw `print()`
- **sqlite3** for direct queries, light SQLAlchemy ORM for models with relationships
- **`logging` module** for status output, never `print()` (except through Rich's console)

### Time and locale
- **Timezone**: `America/Indiana/Indianapolis` — everything stored and displayed local
- **Date format**: ISO 8601 (`2026-04-13`) in storage, human-friendly in Rich tables

### Email and automation rules
- **Draft-only mode for all email responses** — never auto-send. Drafts land in Gmail's Drafts folder for Joe to review and send manually.

## Useful Qwen Code tasks

- Building new scanner modules (hidden job markets, career pages on company sites, staffing agency portals)
- Improving Claude prompts for email classification — especially distinguishing real recruiter outreach from automated blast emails
- Adding interview analysis features — transcript parsing, mock coaching scenarios, feedback scoring
- Expanding the skill tracker with visualization (Rich tables, matplotlib, or something terminal-friendly)
- Writing new Click commands for the CLI dashboard
- Integrating new job board APIs (LinkedIn, Glassdoor, remote-specific boards)
- Writing or improving pytest test cases when a bug is found
- Refactoring the OAuth token refresh handling if issues surface

## Gotchas

- **Don't break Python 3.8 compatibility.** No `list[str]` without `from __future__ import annotations`. No `match`/`case`. No walrus operator abuse that breaks on 3.8.
- **Don't skip OAuth token refresh handling.** If a token is stale, the scanner must refresh gracefully and persist the new token to `data/token.json`.
- **Never commit `.env`, `data/token.json`, or `data/careerpilot.db`.** All three are gitignored — keep it that way.
- **API keys stay local** — Claude API key, Google OAuth client secret, Indeed/Dice credentials, everything. Never commit, never log, never post to Slack.
- **Draft-only email**, always. The responder writes drafts; Joe sends. Do not plumb `message.send()` anywhere outside of a gated debug path.
- **SQLite file is a sacred cow** — don't run destructive migrations without a backup step. Tests should use in-memory DBs.

## See also

**`CLAUDE.md`** at the project root is the authoritative source for Claude Code-specific infrastructure — hooks, subagent coordination, worktree policy, Jira ticket prompt format, and any CareerPilot-specific CE workflow details. Qwen Code doesn't use most of that machinery directly, but if you're debugging a session issue or looking up the canonical definition of a convention, read CLAUDE.md.

The global CLAUDE.md at `C:\Users\Joe\.claude\CLAUDE.md` has cross-project rules (git workflow, commit prefixes, API cost governance, testing discipline) that apply here too.

For cross-project dependencies — especially shared data flows with SecondBrain (career-sync) and any Jira board interactions — see `F:\Obsidian\SecondBrain\Resources\project-dependencies.json`.
