---
date: 2026-04-27
topic: careerpilot-job-search-cli-v1
---

# CareerPilot Job Search v1 — CLI Engine + Dashboard Reader

## Problem Frame

CareerPilot's job-search features today are simultaneously expensive and low-quality. The dashboard's `search-indeed` route uses Anthropic Haiku + `web_search` (~$0.10/search) and the prompt itself admits "if results show summary pages without detailed listings, extract whatever you CAN see" — degraded output is baked into the design. The Indeed detail-fetch path silently fails because Indeed's MCP requires Claude.ai connector auth, not API keys, so the detail panel renders empty (the user's screenshot of an Indeed result with no description and no apply link visible). The `extract-job` paste-URL route is the most expensive single call in the system at ~$0.30/paste (Sonnet + 5 web_search uses).

The user reports that CareerPilot today is genuinely most useful as a tracker for applications they already have leads on; the exploratory search experience is poor enough that they avoid it. The v1 goal is to flip search from "expensive and unreliable" to "free and rich" by inverting the architecture: the CLI on the workstation becomes the search engine, the Vercel-deployed dashboard becomes the reader, and the data flow crosses Supabase in one direction.

This is option C ("move-flow-to-CLI") from the CAR-142 Phase 2 deferred decisions, refined into a concrete shape: dashboard isn't abandoned, it's repositioned as a consumer of search artifacts the same way it already consumes `docs/research/<company>-<date>.md` artifacts the `careerpilot-research` skill produces.

## Architecture (one-direction data flow)

```
                  Workstation (CLI side, the muscle)
                  ┌───────────────────────────────────────┐
                  │  python -m careerpilot search         │
                  │  run-profiles                         │
                  │   ├─ Firecrawl: Indeed search URLs    │
                  │   ├─ Dice MCP: existing direct path   │
                  │   ├─ Parsers: search-list extract     │
                  │   │  (no LLM)                         │
                  │   └─ Writes to Supabase:              │
                  │       job_search_results              │
                  └────────────────┬──────────────────────┘
                                   │  (write)
                                   ▼
                            ┌──────────────┐
                            │   Supabase   │
                            └──────┬───────┘
                                   │  (read)
                                   ▼
              Vercel dashboard (browse / organize / track)
              ┌─────────────────────────────────────────┐
              │  Search Results view, filters, badge    │
              │  Detail panel: full description, link   │
              │  Track → creates application row,       │
              │     existing Research tab takes over    │
              └─────────────────────────────────────────┘

  Engagement push:
  At the end of each scheduled run, the CLI also posts a
  daily Discord summary via the discord-webhook skill —
  total new rows, per-profile breakdown, top 3 by recency.

  Eager enrichment is part of the same scheduled run:
  for each result, the CLI scrapes the job URL via Firecrawl
  and structures it via local Qwen, populating description /
  requirements / nice_to_haves before writing the row.
  Dashboard reads fully-populated rows; no on-demand enrichment.
```

## Requirements

**Engine + Sources**

- **R1.** Introduce a Python CLI command (final invocation form deferred to planning — see Outstanding Questions) as the v1 search engine. Runs without a Claude Code session under Windows Task Scheduler (Windows) or cron. Idempotent on rerun (upserts, never duplicates). Writes results to Supabase via the project's existing service-role Python client (`src/db/supabase_client.py`).
- **R2.** Indeed search is implemented by scraping `indeed.com/jobs?q=<keyword>&l=<location>` (and the contract/remote variants) via Firecrawl. The dashboard's current Anthropic Haiku + `web_search` path in `dashboard/src/app/api/search-indeed/route.ts` is decommissioned (R18). **Parser sentinel:** for each profile, the engine compares the listing-extraction count against the trailing-7-day-median count for that profile (computed from `job_search_results.discovered_at` plus a small per-profile run-summary log). If the current count is < 50% of the median (and median ≥ 4), the run logs a warning, marks the profile run as "degraded," and **skips stale-flip for that profile** (see R10). Initial validation (first 30 minutes of implementation) confirms Firecrawl can reach Indeed at all; if it can't, R2 collapses to "Indeed punted to v2" and v1 ships Dice-only — see Outstanding Questions for the explicit branch.
- **R3.** Dice search continues to use the existing `searchDiceDirect()` direct-MCP path. The call site moves from the Vercel route to the CLI engine. No LLM cost; the existing parser stays.
- **R4.** Search-list extraction (the listing of jobs in a results page) is parser-based on Firecrawl markdown. No LLM is invoked at this stage. Per-source parsers live alongside the engine: Indeed parser parses Firecrawl markdown; Dice already returns structured JSON via MCP.
- **R5.** Search profiles for v1 read from the **Supabase `search_profiles` table** (canonical source). The 8 profiles in `config/search_profiles.py::SEARCH_PROFILES` are migrated into the table once via a Supabase migration; the Python `SEARCH_PROFILES` dict is then deprecated (the file remains only for `LINKEDIN_SEARCH_PROFILES` which stays out-of-scope for v1). Schema reconciliation: the existing dashboard `search_profiles` row shape (`keyword`, `location`, `source`, `is_default`, `sort_order`, …) needs (a) `source` enum aligned to `'indeed' | 'dice'` only — drop `'both'` and `'dice_contract'`, and (b) a new `contract_only BOOLEAN DEFAULT FALSE` column to preserve the Python file's semantics. `dashboard/src/lib/constants.ts::DEFAULT_SEARCH_PROFILES` is updated to match the new schema (or removed if Supabase reads no longer need a fallback).
- **R6.** Optional thin Claude Code skill wrapper (`/careerpilot-job-search`) for interactive ad-hoc runs. Same engine underneath. Additive — not required for v1 to ship; ship the CLI first.

**Storage + Dedup**

- **R7.** New Supabase table `job_search_results` with the following columns: `id`, `user_id`, `source` (`'indeed'|'dice'`), `source_id`, `url`, `title`, `company`, `location`, `salary`, `job_type`, `posted_date`, `easy_apply`, `profile_id`, `profile_label`, `description` (nullable), `requirements` (jsonb array, nullable), `nice_to_haves` (jsonb array, nullable), `discovered_at`, `last_seen_at`, `last_enriched_at` (nullable), `status` (`'new'|'viewed'|'tracked'|'dismissed'|'stale'`), `application_id` (nullable FK to `applications.id`).
- **R8.** Composite uniqueness on `(user_id, source, source_id)`. Reruns upsert: existing row gets `last_seen_at` bumped and any newly-visible fields overwritten; a non-present row is inserted.
- **R9.** Rows are scoped by `user_id`, matching the existing `ApplicationTracker` pattern (`src/jobs/tracker.py:77`): the CLI uses the service-role Supabase client (`src/db/supabase_client.py` — bypasses RLS by design) and explicitly stamps `user_id` from `settings.CAREERPILOT_USER_ID` on every insert/upsert. RLS policies on the table are scoped to `user_id` for the dashboard side (which authenticates as the user, not service-role).
- **R10.** Stale auto-detection: a result whose `last_seen_at` is older than 14 days flips `status='stale'` on the next scheduled run, **gated on "the source profile ran successfully on this run"** — not just on the date threshold. A profile run flagged "degraded" by R2's parser sentinel does not flip its rows stale; the rows simply retain whatever status they had. This prevents a single bad scrape (e.g., Indeed CAPTCHA returning empty markdown) from cascading into mass-staling the user's entire Indeed corpus. Stale rows remain visible but are visually de-emphasized in the dashboard.

**Enrichment**

- **R11.** Per-job-detail fields (`description`, `requirements`, `nice_to_haves`) are populated **eagerly** on the workstation, in the same pass as the scheduled CLI run. Not lazy, not on-demand from the dashboard. The dashboard reads fully-populated rows.
- **R12.** Eager enrichment scrapes the job's detail URL via Firecrawl and produces structured output via local Qwen (the R9 task pattern from CAR-142: bounded schema, structured-output validation). No Anthropic call path. The CLI engine owns this end-to-end. For Dice results, the existing Dice MCP `summary` field MAY substitute for a Firecrawl scrape if planning determines the data is sufficient; for Indeed, Firecrawl-scrape-then-Qwen is the only path.
- **R13.** Enriched fields are stored as nullable columns directly on `job_search_results` (per the R7 schema). No separate cache table. `last_enriched_at` records when the row was enriched. Re-runs of the scheduled job re-enrich rows whose `last_enriched_at` is older than a TTL (planning sets the exact value; default reasonable starting point: 14 days).
- **R14.** The `careerpilot-research` skill (`/careerpilot-research`) is **not** auto-triggered from search results. The existing manual seam from the application's Research tab (post-Track) remains the only trigger. Auto-research-on-search is explicitly v2.

**Dashboard surface**

- **R15.** Dashboard adds a "Search Results" view (top-level navigation entry, alongside Applications) that lists rows from `job_search_results` for the authenticated user, ordered by `last_seen_at DESC`, with filters for `profile_id` and `status`.
- **R16.** The detail panel for a search result surfaces a clickable apply link sourced from `url` (or `applyUrl` if returned by enrichment). The current bug visible in the user's screenshot is fixed in the same release.
- **R17.** A "Track" action on a search result creates an `applications` row via the existing `use-applications.addApplication` seam, sets the search result's `status='tracked'` and `application_id`, and routes the user to the new application's Research tab. No duplicate-application creation if the same `(source, source_id)` is already tracked.
- **R18.** The dashboard's `search-indeed/route.ts` and `search-dice/route.ts` Vercel routes are decommissioned. The "Search Jobs" UI surface in the dashboard is repointed to read from `job_search_results` rather than POSTing to those routes.

**Engagement surface**

- **R21.** **Badge count.** The dashboard's Search Results nav entry displays a count of `status='new'` rows for the authenticated user. Status transition: a row flips `new → viewed` when the user opens its detail panel for the first time (the dashboard issues a single update on first open; subsequent opens are no-ops). The badge query is `count(*) FROM job_search_results WHERE user_id = auth.uid() AND status = 'new'`. Implementation reuses any existing nav-badge component pattern in the dashboard; if none exists, planning specifies a minimal one.
- **R22.** **Discord daily summary.** At the end of each scheduled `run-profiles` invocation, the CLI engine posts a one-message summary to the project's Discord webhook via the global `discord-webhook` skill (already configured in the user's environment). Summary includes: run timestamp, total new rows added, per-profile breakdown (`profile_label: N new`), and the top 3 most-recent new rows formatted as `{title} @ {company} — {location}`. Webhook URL is read from `.env` (e.g., `CAREERPILOT_DISCORD_WEBHOOK_URL`). Webhook failures are logged but do not fail the run.

**Out-of-scope reminders / preserved paths**

- **R19.** The dashboard `extract-job/route.ts` (paste-URL flow) is preserved unchanged in v1. Different use case (mobile, away from workstation), explicitly v2 candidate for cost trimming.
- **R20.** The CLI's `src/jobs/searcher.py::JobSearcher.search_indeed` stub is replaced with the Firecrawl path. `JobSearcher.search_dice` is preserved as-is.

## Success Criteria

1. **Cost flips to zero (search side).** A Vercel deployment of the dashboard makes zero Anthropic API calls during any search-related flow — list browsing, detail browsing, or scheduled search execution. Detail enrichment runs entirely on the workstation via Firecrawl + local Qwen. The only Anthropic cost path remaining anywhere in the system is the unchanged paste-URL flow (`extract-job/route.ts`), which is explicitly out of v1 scope.
2. **Screenshot symptom is gone.** Opening any search result in the dashboard shows full description text and a visibly clickable apply link. Indeed results no longer render an empty detail panel.
3. **Search runs on schedule without a session.** A scheduled invocation under Windows Task Scheduler completes successfully without a Claude Code session present, in ≤ 5 minutes for the current 8-profile set. The success **gate** is "Dice profiles produce ≥ 20 fresh-or-bumped rows on a clean run" (defensible without Indeed). The success **target** is ≥ 30 fresh-or-bumped rows total, with Indeed contribution treated as bonus rather than blocking. A run that hits the gate but not the target is still v1-acceptable; planning monitors the gap.
4. **Track flow ends on the Research tab.** A user can click Track on a search result and land on the new application's Research tab with no extra navigation steps. The existing `careerpilot-research` skill flow takes over from there.
5. **Credit budget holds.** Daily Firecrawl credit cost for the scheduled run (search-list pages + per-result detail scrapes for eager enrichment) is bounded by `(num_profiles × num_listing_pages_per_profile) + (num_profiles × top_N_per_profile)`. With current 8 profiles, ~1 listing page each, and a default of `top_N=15`, the daily ceiling is ~130 credits. Planning sets the exact ceiling and a per-profile `top_N` cap.
6. **Engagement surface works.** A scheduled run that adds new rows produces both (a) a non-zero badge count on the dashboard's Search Results nav entry and (b) a Discord summary message posted via the configured webhook. Opening a result decrements the badge.

## Scope Boundaries

**Out of scope for v1 — tracked in the v2 ticket:**

- LinkedIn job-listing scraping. Profile config exists in `config/search_profiles.py::LINKEDIN_SEARCH_PROFILES` but no scraping mechanism. Needs a separate auth/cookies validation spike.
- Dashboard-driven "Run now" / synchronous-feeling triggers. Requires a polling watcher or Supabase realtime subscription.
- ~~Dashboard CRUD for search profiles~~ — **graduated to v1** (R5). The Supabase `search_profiles` table and the dashboard CRUD on it already exist; v1 simply makes them canonical instead of fallback.
- Polling watcher / long-running CLI daemon for sub-minute request→result latency.
- Auto-trigger of `/careerpilot-research` from search results (vs. the current manual trigger from the Research tab).
- Cost-trimming the paste-URL `extract-job/route.ts` (Sonnet → Haiku, or Firecrawl-based replacement).
- An in-dashboard search-result relevance scorer using local Qwen + resume context.

**Out of scope entirely (not v2 either):**

- Multi-user / shared search-queue workflows.
- Replacement of the paste-URL extract path with a CLI flow (it's a separate-architecture flow on purpose).

## Key Decisions

- **CLI is engine, dashboard is reader.** Inverts the Vercel→workstation reachability problem from CAR-142 Phase 2. Same pattern as `careerpilot-research` (workstation produces an artifact, dashboard reads it). Dropping the bidirectional requirement removes a class of architectural problems wholesale.
- **Async-only v1; sync-feeling triggers explicitly deferred.** v1 ships the data flow without a polling watcher. Once the rest is proven, dashboard "Run now" buttons can be bolted on without rework — they write a `pending` row to a queue table that the CLI picks up. No reason to take that complexity now.
- **Eager per-job-detail enrichment, on the workstation.** Original framing leaned lazy on the assumption that Firecrawl credits per-result were the dominant marginal cost. They're not — Firecrawl is ~$0.005/credit and local Qwen is free per call once the GPU is hot. Eager-on-workstation is ~$16/month more in Firecrawl credits than lazy but eliminates the entire Vercel→Anthropic seam, all loading/failure/never-enriched UX states for the detail panel, and the cap-mechanism debt of option (a). The simpler architecture wins on a single-user single-workstation app.
- **No LLM in search-list extraction.** Firecrawl markdown of a results page is deterministically parseable. Adding an LLM at this layer adds cost and a class of failures (hallucination, schema validation) without value.
- **Engine is Python CLI, not a Claude Code skill.** Schedulable from Windows Task Scheduler (Windows) or cron (other OSes) without an open Claude Code session. The skill wrapper (R6) is optional sugar for interactive runs.
- **Sources are Indeed + Dice for v1; LinkedIn deferred.** LinkedIn requires auth/cookies for reliable scraping. Adding it "for completeness" would block v1 on a separate validation spike. Profiles are pre-defined; only the scraping mechanism is the v2 lift.
- **Supabase is the v1 profile source-of-truth, not the Python file.** Reality-check during document review surfaced that the dashboard already has Supabase `search_profiles` CRUD (`use-search-profiles.ts`) and `DEFAULT_SEARCH_PROFILES` in `dashboard/src/lib/constants.ts` with a different schema than the Python file. Three sources of truth would silently drift; consolidating onto Supabase is the only path that doesn't carry forward the divergence. Side benefit: the deferred-to-v2 "dashboard profile CRUD" item is already built — graduating to v1 is exposing work that exists, not adding new scope.
- **Indeed bot-detection is engineered for, not just risked.** The engine carries a parser sentinel (R2) that detects silent-failure scrapes by comparing extraction count against a per-profile rolling median, and a stale-flip gate (R10) that prevents one bad scrape from cascading into a mass-stale event. Day-one validation in the first 30 minutes of implementation confirms Firecrawl reaches Indeed at all; if it doesn't, the doc has an explicit Dice-only fallback path with a defensible ≥20-row gate (SC3) that ships v1 without Indeed. This is the difference between hoping Indeed works and being robust whether it does or not.

## Dependencies / Assumptions

- **Firecrawl is installed and authenticated on the workstation** (verified — `.firecrawl/` exists at repo root; `careerpilot-research` skill setup notes confirm it).
- **Local Qwen / vLLM is reachable** (CAR-142 Phase 1a deployment, `LLM_LOCAL_BASE_URL`).
- **Supabase MCP is configured** for migration application (pattern used in CAR-163 / CAR-168).
- **`careerpilot-research` skill is live** at `.claude/skills/careerpilot-research/SKILL.md` (CAR-183, merged 2026-04-26).
- **`use-applications.addApplication` seam exists** in `dashboard/src/hooks/use-applications.ts` — the canonical "create an application" path post-CAR-163. Used by R17.
- **`discord-webhook` skill is configured** in the user's global skills tree (`~/.claude/skills/discord-webhook/`) with a working webhook URL. Used by R22. v1 assumes the skill's invocation contract is stable.
- **Supabase `search_profiles` is the canonical source for v1 profiles** after the one-time migration. The dashboard hook `dashboard/src/hooks/use-search-profiles.ts` already implements full CRUD against this table; that CRUD path graduates to v1 by virtue of being the editing surface for the canonical source (see Key Decisions). `config/search_profiles.py::LINKEDIN_SEARCH_PROFILES` remains in the file for v2 LinkedIn work.
- **Indeed search URL structure** (`indeed.com/jobs?q=…&l=…`) is publicly accessible and returns SSR HTML compatible with Firecrawl markdown extraction. To be confirmed in the first 30 minutes of implementation.

## Outstanding Questions

### Resolve Before Planning

*(none — the brainstorm reached a clean architecture; remaining items are technical or research questions deferred below)*

### Deferred to Planning

- [Affects R2][Needs research] **Validate Firecrawl can scrape Indeed search-results pages without bot-detection blocking.** Run a single-URL Firecrawl test in the first 30 minutes of implementation. **Two explicit branches:** (a) if the test returns parseable listings, R2 ships as written and the parser sentinel covers ongoing degradation; (b) if the test returns 403/CAPTCHA/empty markdown, Indeed is punted to v2 immediately — R2 reduces to "Dice-only," R20's `JobSearcher.search_indeed` stays a stub, the dashboard's Search Results view hides Indeed-source filtering, and SC2's screenshot-symptom criterion drops the Indeed clause. The Dice-only fallback is still a complete v1 against SC3's Dice-only ≥20 gate.
- [Affects R7, R9][Technical] **Concrete Supabase migration script for `job_search_results`.** Planning produces the migration via Supabase MCP `apply_migration`, including the indices on `(user_id, last_seen_at DESC)` and `(user_id, source, source_id)`.
- [Affects R10][Technical] **Stale-detection placement.** Either a step at the start of `run-profiles` (cheap, runs daily), a separate Supabase scheduled function, or a Postgres trigger. Planning picks one. Note that stale-flip MUST be gated on "we ran this profile successfully" rather than just `last_seen_at < threshold`, otherwise a single failed scrape (e.g., Indeed CAPTCHA returning empty) would mass-flip the user's whole Indeed corpus.
- [Affects R12, R13][Technical] **Dice detail data sufficiency.** Planning verifies whether the Dice MCP `summary` field is sufficient for `description`, or whether Dice results also need a Firecrawl scrape on the dice.com detail URL. If the latter, the daily credit budget rises proportionally.
- [Affects R13][Technical] **Enrichment TTL.** Default starting point is 14 days (re-enrich rows older than that on subsequent scheduled runs). Planning may pick a different value based on the actual rate of Indeed/Dice content drift.
- [Affects R15][UX] **Search Results view shape in the dashboard.** New top-level page, integrated into the existing applications grid as a filter, or a side-panel? Planning produces a brief UX mock or chooses based on existing nav patterns.
- [Affects R20][Technical] **CLI module layout.** Does the new search engine live in `src/jobs/searcher.py` (extending `JobSearcher`), or in a new `src/jobs/firecrawl_search.py`? Planning picks based on how cleanly the Firecrawl path composes with the existing class.

### Deferred to v2 (separate Jira ticket)

- LinkedIn job-listing scraping (LINKEDIN_SEARCH_PROFILES already defined; needs auth/scraping path).
- Dashboard "Run now" / synchronous-feeling triggers (`pending` row in Supabase + CLI watcher polling).
- ~~Dashboard-side profile CRUD (move profiles from file → Supabase)~~ — **graduated to v1** (R5).
- Polling watcher / sub-minute request→result latency.
- Auto-trigger of `/careerpilot-research` on search results.
- Cost trim of paste-URL `extract-job/route.ts` (Sonnet → Haiku, or Firecrawl-based replacement).
- In-dashboard search-result relevance scorer using local Qwen + resume context.

## Next Steps

`-> /ce:work` for implementation (plan written 2026-04-27).

**Tickets created 2026-04-27:**
- **CAR-188** (Story) — v1 implementation: <https://jlfowler1084.atlassian.net/browse/CAR-188>
- **CAR-189** (Task) — v2 deferred-features tracker: <https://jlfowler1084.atlassian.net/browse/CAR-189>

**Plan:** `docs/plans/2026-04-27-001-feat-careerpilot-job-search-cli-v1-plan.md`
