---
description: Run CareerPilot job search across Dice + LinkedIn, then triage results grouped by source
argument-hint: [--dry-run] [--profile NAME] [--no-discord]
---

# /job-search — Run + Triage

**Purpose:** Run `python -m cli search run-profiles` (the same command the daily 06:30 scheduled task fires), then present a triage view of today's results grouped by source so you can see Dice and LinkedIn coverage side-by-side.

This wraps the engine at `src/jobs/search_engine.py:run_profiles`. It does NOT add a new search path — it presents what the engine produced.

## Arguments forwarded

Any `$ARGUMENTS` you pass are forwarded to `python -m cli search run-profiles`:

- `--dry-run` — no Supabase writes, no Discord post (ad-hoc preview)
- `--profile NAME` — run only one profile (repeatable)
- `--no-discord` — skip the Discord summary post
- `--skip-stale-flip` — don't flip stale rows for healthy profiles

Examples: `/job-search`, `/job-search --dry-run`, `/job-search --profile sysadmin_local --no-discord`.

## Step 1 — Pre-flight diagnosis (BEFORE running)

Read project context to anticipate gaps. Run these in parallel:

1. Count how many search profiles exist per source. This determines what the run *can* return — a missing `source='linkedin'` profile is the #1 cause of "why didn't LinkedIn show up?":

```bash
python -c "from src.db.supabase_client import get_supabase_client; r = get_supabase_client().table('search_profiles').select('source,name,enabled').execute(); from collections import Counter; c = Counter(p['source'] for p in r.data if p.get('enabled', True)); print('Enabled profile sources:', dict(c)); [print(f'  - {p[\"name\"]} ({p[\"source\"]}, enabled={p.get(\"enabled\", True)})') for p in r.data]"
```

2. If LinkedIn profile exists, peek at how many LinkedIn job-alert emails arrived in the last 2 days. CAR-189's pipeline parses these emails — if the inbox has none, LinkedIn returns 0 even with a profile configured:

```bash
python -c "from config import settings; from src.gmail.auth import get_gmail_service; from src.jobs.linkedin_parser import scan_emails; svc = get_gmail_service(credentials_file=settings.GOOGLE_CREDENTIALS_FILE, token_path=settings.GMAIL_TOKEN_PATH, scopes=settings.GMAIL_SCOPES); jobs = scan_emails(svc, days=2); print(f'LinkedIn job-alert emails (last 2 days): {len(jobs)} listings parsed')"
```

If either command fails, surface the error but continue — the search itself doesn't depend on these.

## Step 2 — Run the engine

Invoke the actual CLI command, forwarding the user's arguments:

```bash
python -m cli search run-profiles $ARGUMENTS
```

Stream output verbatim. The engine prints a Rich summary table at the end with per-profile new/updated/degraded counts. Watch for these signals:

- **`degraded: YES`** on any profile → sentinel detected zero or near-zero results when prior runs returned more. Don't silently retry — surface it.
- **`Indeed deferred to v2`** → expected log line; CAR-189 disabled Indeed on purpose. Mention it in the summary so the user remembers.
- **Non-zero exit** → the command failed before completion. Stop and report; do not proceed to triage.

## Step 3 — Triage view (NEW + UPDATED rows from this run)

After a successful run, query Supabase for the rows the engine just touched and present them grouped by source. Use the existing manager — do NOT reach into the table directly:

```bash
python -c "
from src.jobs.job_search_results import JobSearchResultsManager
import json
mgr = JobSearchResultsManager()
rows = mgr.list_recent_new(limit=50)
out = [{'source': r.get('source'), 'title': r.get('title'), 'company': r.get('company'), 'location': r.get('location'), 'salary': r.get('salary'), 'url': r.get('url'), 'posted_date': r.get('posted_date'), 'easy_apply': r.get('easy_apply'), 'profile_label': r.get('profile_label')} for r in rows]
print(json.dumps(out, indent=2, default=str))
"
```

Parse that JSON and render a Rich-style markdown table per source. Group order: `linkedin` first (it's the new pipeline you most want to verify), then `dice`, then anything else. For each row show:

| # | Title | Company | Location | Salary | Posted | Profile |
|---|-------|---------|----------|--------|--------|---------|

Truncate title and company to 40 chars. Append the `url` as a clickable link below each row, and prefix `[easy_apply]` when the flag is true.

If a source has 0 rows, render the empty section anyway with a one-line diagnosis using the pre-flight findings:

- `linkedin` empty + no `source='linkedin'` profile → "No LinkedIn profile configured. Add one to `search_profiles` with source='linkedin'."
- `linkedin` empty + profile exists but 0 emails → "LinkedIn profile is configured but Gmail had 0 job-alert emails in the last 2 days. Check that LinkedIn alerts are firing into the right inbox."
- `dice` empty → "Dice returned 0. If sentinel flagged this profile as degraded, the keyword may have hit zero hits or the MCP transport is failing."

## Step 4 — Interactive next steps

After the triage table, offer this menu (ask the user to pick by row number or skip):

1. **Open URL in browser** — `python -c "import webbrowser; webbrowser.open('<URL>')"`
2. **Save to applications tracker** — `python -m cli tracker add` (interactive wizard, pre-fills from URL when possible)
3. **Mark dismissed** — update the row's `status` to `dismissed` so it's filtered from future triage
4. **Deep-research the company** — invoke the `careerpilot-research` skill with the company name
5. **Done** — exit with no further action

Do NOT take any of these actions without the user picking a row. The whole point of triage is human-in-the-loop review of fresh listings.

## Step 5 — Final summary line

Close with one line: total new across sources, total updated, count of degraded profiles, and a note about Indeed:

```
Run summary: <N_new> new (<by source>), <N_updated> updated, <N_degraded> degraded profile(s).
Indeed remains deferred per CAR-189 — only Dice + LinkedIn are active.
```

## Failure modes

| Condition | Behavior |
|---|---|
| `python -m cli` not found | Stop. Likely cwd is wrong or venv not activated. Show the resolved cwd and the `which python` output. |
| Supabase env vars missing | `JobSearchResultsManagerNotConfiguredError` — surface the error verbatim and tell the user to check `.env` for `CAREERPILOT_USER_ID`. |
| Engine exits non-zero | Do not run Step 3. Show the engine's stderr tail and stop. |
| `list_recent_new()` returns 0 rows after a successful run | This is plausible if every listing was an UPDATE (already in the table). Note it but still render an empty triage so the user sees the structure. |
| Pre-flight LinkedIn email check fails | Continue. Note the failure as a side-channel diagnostic; the run itself doesn't need Gmail to be reachable. |

## Do NOT

- Do NOT re-implement the search logic. Always invoke `python -m cli search run-profiles`.
- Do NOT bypass `JobSearchResultsManager` for reads or writes. The service-role client + `user_id` stamping is load-bearing for RLS.
- Do NOT auto-take any triage action (open browser, save to tracker, dismiss) without explicit user selection of a row number.
- Do NOT post to Discord from this command. The engine handles Discord; this command is for terminal triage.
- Do NOT cache results across invocations. Every run queries fresh.
