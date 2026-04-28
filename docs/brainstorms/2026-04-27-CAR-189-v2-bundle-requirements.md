---
date: 2026-04-27
topic: CAR-189-v2-bundle
anchor-ticket: CAR-189
spinoff-tickets:
  - CAR-191 (cleanup + Overview "new matches" stat migration)
  - CAR-192 (Python MCP SDK migration — narrowed after spike FAIL, see § Pre-Plan Auth Spike Outcome)
status: ready-for-planning (post-spike, post-reshape)
parallelization-shape: single-phase-3-streams
review-pass: 1 (2026-04-27)
spike-result: FAIL — Indeed MCP /claude/ path uses closed client allowlist; CLI access not viable via this strategy
---

# Job Search v2 Bundle — CAR-189 + Cleanup + MCP SDK Migration

## Problem Frame

CAR-188 (Job Search v1) shipped on 2026-04-27 with Dice-only coverage after Firecrawl bot-detection blocked all three Indeed validation attempts. CAR-189 was opened as the v2 tracker holding the deferred items. This CE cycle initially scoped 4 streams (cleanup, MCP SDK + OAuth scaffolding, Indeed adapter, LinkedIn email-parser pipeline) plus a deferred-to-v3 ranker. The pre-plan auth spike resolved the Indeed-strategy question definitively and the cycle reshaped around the result.

**Pre-plan spike outcome (2026-04-27 22:20 EST): FAIL.** Indeed MCP at `mcp.indeed.com/claude/mcp` enforces a closed client_id allowlist independent of OAuth flow correctness. Dynamic registration succeeds, the OAuth 2.1 + PKCE flow completes, and the issued token has the correct audience claim — but the MCP rejects requests with `403 invalid_client / "Client not allowed"` because the dynamically-registered client_id isn't on Indeed's pre-approved list. The `/claude/` path component in the endpoint is a literal audience indicator: this MCP is provisioned for Anthropic's pre-approved Claude.ai connector, not for arbitrary CLI clients. No spike fix can change this; it's a partner-API gate. See § "Pre-Plan Auth Spike Outcome" below for the full diagnostic.

**Cycle reshape (chosen by user during review pass):**
- **S3 dropped** per the brainstorm's documented FAIL recovery branch.
- **S2 narrowed** to a Dice-transport-only SDK migration. The OAuth scaffolding (TokenStorage, OAuthClientProvider config) had no consumer once S3 dropped; carrying it would be pre-investment in a future Indeed strategy that is not yet brainstormed.
- **CAR-189's "Indeed scraping" item** stays open with the Claude.ai-connector strategy struck through. Three remaining strategies (residential proxy on Firecrawl, headless-browser scraping, Indeed Partner API registration) each warrant their own brainstorm.
- **Ranker (originally an in-scope item, deferred during the review pass)** stays deferred — the rationale is unchanged and still time-gated on v1 engagement data.

**Final cycle: 3 streams in a single phase.** S1 (cleanup + Overview stat migration), S2-narrow (Dice SDK transport), S4 (LinkedIn email-parser pipeline). All independent at the file level; none gated by the spike outcome.

## In Scope (3 streams)

1. **S1 — Orphaned-component cleanup + Overview stat migration (dashboard).** Delete confirmed-orphaned files left over from the CAR-190 ResultRow rewrite, plus migrate the Overview "new matches in 24h" stat off the orphaned `search_cache` table to `job_search_results.created_at`. Filed as CAR-191.
2. **S2 — Python MCP SDK transport migration (CLI), Dice path only.** Replace `src/jobs/searcher.py::_search_dice_direct` with calls through the official `mcp` Python SDK. Pure transport refactor — no OAuth scaffolding, no behavior change. Filed as CAR-192 (scope narrowed via comment after spike FAIL).
3. **S4 — LinkedIn integration via email-parser (CLI + dashboard).** Wire the existing `src/jobs/linkedin_cli.py::cmd_scan` (already returns deduped job dicts) and `linkedin_parser.py` into `search_engine.py` so LinkedIn rows land in Supabase `job_search_results`. Promotes the "LinkedIn scraping" deferred item off CAR-189 — though the resolution is *email-based extraction*, not web scraping. Web scraping for full-index coverage remains a v3 candidate, separate from this stream.

## Out of Scope (deferred to v3 or later)

**Dropped from this cycle by spike outcome:**
- **Indeed adapter (S3).** The Claude.ai-connector strategy on CAR-189 is structurally not viable from a CLI client (closed allowlist). The other three strategies on CAR-189 (Firecrawl residential proxy, headless-browser scraping, Indeed Partner API) remain valid candidates and each needs its own brainstorm.

**Other CAR-189 items still deferred:**
- **Relevance ranker (deferred during review pass).** v1's engagement surface (badge + Discord push) shipped today (2026-04-27); CAR-189 ticket text gates the ranker on "if v1 engagement surface doesn't move user behavior," which cannot be evaluated yet. Re-brainstorm in 2–4 weeks once v1 has behavioral data. Also blocked structurally by the Vercel↔workstation reach problem for the proposed on-demand button design.
- **Dashboard "Run now" / sync-feeling triggers.** Defers because precondition (polling watcher) is itself v3.
- **Polling watcher / sub-minute request→result latency.** Defers because the once-daily scheduled run is sufficient until v1 engagement data shows otherwise.
- **Auto-trigger of `/careerpilot-research` from search results.** Cost-driven defer (Tavily + Firecrawl per result is meaningful at scale).
- **Cost trim of paste-URL `extract-job/route.ts`.** Belongs in the next general cost audit.
- **Eager opt-in for Dice full-detail scrape (`CAREERPILOT_DICE_FULL_SCRAPE=1`).** Defers until a quality complaint about Dice descriptions surfaces in v1.

## Per-Stream Requirements

### S1 — Orphaned-Component Cleanup + Overview Stat Migration (CAR-191)

**Goal.** Delete files left over from the pre-CAR-190 SearchPage that have zero remaining importers, and migrate the Overview "new matches in 24h" stat off the soon-to-be-write-orphaned `search_cache` table to read from `job_search_results.created_at`. JobCard itself stays — it is actively consumed by `dashboard/src/components/search/result-row.tsx`.

**Delete list (verified by grep, 2026-04-27):**

| File | Why orphaned |
|---|---|
| `dashboard/src/hooks/use-search.ts` | Zero importers. The new `search/page.tsx` uses `useSearchResults`, `useSearchProfiles`, `useSuggestions`, `useAutoApplyQueue` — none of these are this hook. |
| `dashboard/src/components/search/search-history.tsx` | Zero non-self importers. |
| `dashboard/src/hooks/use-search-history.ts` | Zero non-self importers. The hook the orphaned component called. |
| `dashboard/src/components/search/job-detail-pane.tsx` | Zero non-self importers. The new `search/page.tsx` uses `DetailPanel`, not `JobDetailPane`. |

**Boundary requirements.**

- **R-S1-1.** Delete the four files above. Do not delete `JobCard` (`dashboard/src/components/shared/job-card.tsx`).
- **R-S1-2.** Update `dashboard/feature-manifest.json` to remove any feature entries whose patterns reference the deleted files.
- **R-S1-3.** **Transitive-orphan check.** `dashboard/src/lib/search-utils.ts` exports `deduplicateJobs` and `filterIrrelevant`, called only from the two orphaned hooks. After the four file deletes, grep for any *re-orphaned* exports in `lib/` and `hooks/`. Either delete them in the same PR (recommended) or open an explicit follow-up. Same audit applies to `__tests__/lib/search-utils.test.ts`.
- **R-S1-4.** **Overview "new matches" stat migration.** Patch `dashboard/src/app/(main)/page.tsx:30` and `dashboard/src/app/(main)/overview-content.tsx:259` to compute the "new matches in last 24h" count from `job_search_results.created_at` (filter: `created_at > now() - interval '24 hours'`, scoped by `user_id`). Without this migration, the stat silently empties the moment `use-search.ts` is deleted.
- **R-S1-5.** `npm run build` and `tools/regression-check.sh` must pass after deletion. Plus a manual visual confirmation against the Overview page that the "new matches" count renders a plausible non-zero value (the regression-check is pattern-based and cannot catch silent-empty-data).
- **R-S1-6.** Stream commits reference CAR-191.

**Deferred to plan.** Whether the now-fully-orphaned tables `search_runs` and `search_cache` get dropped via a Supabase migration in this stream or a follow-up. After R-S1-4 lands, no code reads or writes them; the question is just timing.

### S2 — Python MCP SDK Transport Migration, Dice Only (CAR-192, narrowed)

**Goal.** Replace the hand-rolled MCP Streamable HTTP code in `src/jobs/searcher.py` (lines 66–172, function `_search_dice_direct`) with calls through the official `mcp` Python SDK. Pure transport refactor for the Dice call site. **No OAuth scaffolding** — the original S2 scope included `OAuthClientProvider` and `JsonFileTokenStorage` helpers for S3 to consume, but S3 dropped after the spike FAIL, so those helpers have no consumer in this cycle.

**Boundary requirements.**

- **R-S2-1.** Add `mcp` to `requirements.txt` at a pinned version (latest stable at planning time, with floor + ceiling).
- **R-S2-2.** Add a new module `src/jobs/mcp_client.py` exposing:
  - `async def call_mcp_tool(url: str, tool_name: str, arguments: dict, *, auth: httpx.Auth | None = None) -> dict`
  - `def call_mcp_tool_sync(url: str, tool_name: str, arguments: dict, *, auth: httpx.Auth | None = None) -> dict` (thin `asyncio.run` wrapper)
  - The `auth=` parameter is kept on the signature for forward compatibility (future Indeed/LinkedIn auth flows) but is unused this cycle.
- **R-S2-3.** Refactor `JobSearcher.search_dice` to call `call_mcp_tool_sync`. The result-shape transformation logic stays — only the transport changes. **Test gate:** add at least one Dice integration test that mocks at the `mcp.client.streamable_http` boundary (post-migration), plus a one-time live smoke against `mcp.dice.com` documented in the PR description.
- **R-S2-4.** Existing `JobSearcher.search_indeed` stub stays (still returns `[]` and logs a warning — until a future cycle re-tackles Indeed via a different strategy).
- **R-S2-5.** Run `python -m pytest tests/`. Anything that exercises Dice search must continue to pass after Dice mocks are updated to target the SDK boundary.
- **R-S2-6.** `pip audit` (or equivalent) runs as part of the merge gate to validate supply-chain posture for the new `mcp` dependency.
- **R-S2-7.** Stream commits reference CAR-192.

**Out of scope for this narrowed S2 (relative to original S2 spec):**
- `JsonFileTokenStorage` implementation (was R-S2-3 in original spec).
- OAuth client provider integration with the SDK (was R-S2-4 in original spec).
- `data/oauth_tokens/` directory creation (was R-S2-3 implementation detail).
- Removal of the `search_indeed` stub (was R-S2-5 in original spec — kept until a future Indeed strategy ships).

**Deferred to plan.** Whether `src/jobs/enrichment.py` and the `careerpilot-research` skill use the hand-rolled pattern and should be migrated in S2 or as a follow-up. Default: follow-up unless trivial.

### S4 — LinkedIn Integration via Email Parser

**Goal.** Wire the existing `src/jobs/linkedin_cli.py::cmd_scan` (which already returns a deduped list of job dicts) and `linkedin_parser.py` into the v1 search engine so LinkedIn rows land in `job_search_results` alongside Dice. **Not web scraping** — it consumes LinkedIn job-alert emails received via Gmail (the user already has these alerts configured per `linkedin_cli.py::cmd_alerts` guidance), sidestepping the bot-detection wall. **Honest scope caveat:** alert-email coverage is a curated subset of LinkedIn's full job index, not a substitute for it (see Risks R3); web scraping remains a v3 candidate, separate from this stream's promotion-off-CAR-189.

**Boundary requirements.**

- **R-S4-1.** Source-type union widens. The Supabase `job_search_results.source` column is currently `'indeed' | 'dice'`. Migration adds `'linkedin'`. The TypeScript dashboard types in `dashboard/src/types/` and the Python `src/jobs/searcher.py` JSON shape must agree on the new union value. **This union is a frozen shared interface (see Cross-Stream Concerns).**
- **R-S4-2.** New function `JobSearcher.search_linkedin(...)` (or equivalent in `src/jobs/`) that wraps `linkedin_cli.cmd_scan` and returns rows in the same normalized shape as `search_dice`. The existing `cmd_scan` returns a deduped list of dicts (verified at line 104 of `linkedin_cli.py`) — wrap, don't rewrite.
- **R-S4-3.** Register LinkedIn in `search_engine.py::run_profiles`. The existing `LINKEDIN_SEARCH_PROFILES` in `config/search_profiles.py` must be exposed to the registration path; planning decides whether to migrate them into the Supabase `search_profiles` table (the canonical source per CAR-188) or expose them via a parallel registration path. Recommended default: migrate to Supabase to preserve a single source of truth.
- **R-S4-4.** Upsert LinkedIn rows into `job_search_results` using `linkedin_job_id` as the `source_id` so the existing `(user_id, source, source_id)` uniqueness constraint dedupes them.
- **R-S4-5.** Dashboard renders LinkedIn rows. Touchpoints: source color/badge for LinkedIn in the `sourceColor` switch in `JobCard` and `DetailPanel`; `SOURCE_OPTIONS` in `dashboard/src/components/search/search-filters.tsx:48` extended to include LinkedIn so users can filter by source; `SearchFilters['source']` type widened in `search-filter-utils.ts`. **Open design decision:** the LinkedIn-brand blue `#0077b5` clashes with the existing two blues (Indeed `#2557a7`, Dice `#0c7ff2`). Plan must pick a disambiguating treatment — LinkedIn slate-gray instead of blue, or icon on the badge, or shape change.
- **R-S4-6.** Promote the "LinkedIn scraping" deferred item off CAR-189 with the email-parser path noted as the chosen approach. Web scraping remains an explicit v3 candidate if email coverage proves insufficient.

**Deferred to plan.** Whether LinkedIn detail enrichment (description, requirements via fetching `linkedin.com/jobs/view/<id>`) is in scope this cycle. Recommended default: ship without enrichment; revisit if dashboard UX feels thin.

## Pre-Plan Auth Spike Outcome

**Status: FAIL — completed 2026-04-27 22:20 EST.**

**Spike artifact:** `scripts/spike_indeed_oauth.py`

**What worked (high-confidence positive findings):**
- RFC 9728 protected-resource metadata discovery: `https://mcp.indeed.com/.well-known/oauth-protected-resource/claude/mcp` returned a fully spec-compliant document advertising scopes (`job_seeker.company.details.read`, `job_seeker.jobs.search`, `job_seeker.profile.read`, `offline_access`) and authorization servers.
- RFC 8414 authorization-server metadata at `https://secure.indeed.com/.well-known/oauth-authorization-server` advertised `authorization_endpoint`, `token_endpoint=https://apis.indeed.com/oauth/v2/tokens`, `registration_endpoint`, full PKCE-S256 support, and `authorization_code` + `refresh_token` grant types.
- RFC 7591 dynamic client registration succeeded: `POST https://secure.indeed.com/oauth/v2/register` returned `201 Created` with a fresh `client_id`.
- Browser-based OAuth 2.1 + PKCE flow completed end-to-end: user logged into Indeed, redirect captured, authorization code exchanged for `access_token` + `refresh_token` with granted scope `offline_access job_seeker.jobs.search`.
- Refresh-token grant succeeded: subsequent `--headless` runs got fresh access tokens without user interaction.
- After adding RFC 8707 `resource=https://mcp.indeed.com/claude/mcp` to authorize and token requests, the MCP-side error mode shifted from `401 invalid_token` (audience-mismatch) to `403 invalid_client` (token audience correct, client identity rejected).

**What failed (the structural blocker):**

After every fix and on every retry, the MCP `initialize` request returned:

```
HTTP/1.1 403 Forbidden
{"error": "invalid_client", "error_description": "Client not allowed"}
```

This is `invalid_client`, not `invalid_token` or `insufficient_scope`. The token's audience claim is correct (the `resource` indicator was honored). The token's scope grant is correct (`job_seeker.jobs.search` is present). The Bearer header format is correct. The MCP server simply refuses to honor *any* token issued for *any* dynamically-registered client_id — only Indeed's pre-approved partner clients can call this endpoint. The `/claude/` path component is the literal audience identifier: it's provisioned for Anthropic's Claude.ai connector specifically.

**Why no further spike fix can change this:** the rejection is at the MCP server's client-allowlist check, which is upstream of any OAuth-flow detail we control. Adding scopes, retrying, fiddling with audience parameters, switching grant types, none of it can flip a closed allowlist.

**Implications for CAR-189:**
- The "Indeed MCP via Claude.ai connector" strategy is **ruled out** for arbitrary CLI clients.
- The remaining three CAR-189 strategies (Firecrawl residential-proxy retry, headless-browser scraping, Indeed Partner API with manual client registration) each need their own brainstorm.
- The Partner API path is the most architecturally clean of the three but requires an Indeed business agreement; the timeline is unknown.

**Compounding (per CE step 5):** This finding deserves a `docs/solutions/` entry once the cycle ships, so future-team-members re-attempting Indeed MCP don't re-walk the same dead end. Suggested title: *"Indeed MCP at /claude/ rejects dynamically-registered OAuth clients."*

## Cross-Stream Concerns

### Shared interfaces frozen before any stream spawns

| Interface | Frozen value | Owners | Why frozen |
|---|---|---|---|
| **Source type union** | `'indeed' \| 'dice' \| 'linkedin'` | S4 (extends), all dashboard streams (consume) | Coordinator emits a freeze PR before stream spawn that updates: `dashboard/src/types/index.ts:333`, `dashboard/src/lib/search-results/filters.ts:8`, `dashboard/src/hooks/use-search-profiles.ts:14`, `dashboard/src/components/search/custom-search-bar.tsx:18,32`, `dashboard/src/app/(main)/search/page.tsx:569,606`, both Supabase migration CHECK constraints (`20260427000000_..._job_search_results.sql:16` and `20260427000001_..._search_profiles.sql:33`), regenerate `dashboard/src/types/database.types.ts`, and update the `'indeed' or 'dice'` string in `src/jobs/searcher.py:37` (`SEARCH_SYSTEM_PROMPT`). The freeze PR is ~10 sites plus a Supabase migration. |
| **`call_mcp_tool` async + sync helper signatures** | `async def call_mcp_tool(url, tool_name, arguments, *, auth=None) -> dict` and `def call_mcp_tool_sync(...) -> dict` | S2 (creates) | Frozen for forward-compatibility with future auth flows; no consumer this cycle. The `auth=None` default lets S2 ship the helper without an authentication-layer dependency. |
| **`search_engine.run_profiles()` per-source dispatch** | additive `if source == 'X':` branch per source — current pattern at `src/jobs/search_engine.py:205` | S2 (touches Dice arm to use new helper), S4 (adds LinkedIn arm) | Two streams modify branches. Plan freezes the branch shape (no refactor to a registry) so concurrent additions don't conflict. |

### Conflict zones (overlap matrix)

| | S1 | S2 | S4 |
|---|---|---|---|
| **S1** | — | none | dashboard types (frozen) |
| **S2** | | — | `search_engine.py` (additive only) |
| **S4** | | | — |

After the source-union freeze, no two concurrent streams contend for the same line range.

## Parallelization Shape

**Single phase, 3 parallel streams.**

```
Coordinator pre-spawn freeze PR
└── source-type-union widened to include 'linkedin'
        (~10 dashboard sites + 1 Supabase migration + 1 Python prompt string)

Phase 1 (parallel — 3 streams, no Go/No-Go gate, no Phase 2)
├── S1: Cleanup + Overview stat migration (CAR-191)
├── S2: MCP SDK transport migration, Dice only (CAR-192)
└── S4: LinkedIn email-parser pipeline integration
```

**Why this shape (vs sequential or all-at-once with frozen interfaces):** With S3 dropped, no stream depends on another stream's output. The three streams touch entirely separate trees: S1 is dashboard-only, S2 is Python-only (with one shared `search_engine.py` arm modification), S4 spans both but uses only additive registration patterns. Sequential execution would slow the cycle without reducing risk. All-three-parallel with the source-type-union frozen pre-spawn is the optimal shape.

**Coordinator load.** Peak concurrency is 3 streams. Below the CAR-181 swarm pilot's 5-stream peak, well within validated process capacity.

**Wall-clock estimate.** ~1 cycle (each cycle ≈ one half-day of focused subagent work + coordinator merge).

**Stop-loss.** If after 2 effective cycles fewer than 2 streams have shipped, pause and re-brainstorm rather than continuing to push.

The detailed Parallelization Map (per-stream worktree branches, declared files-touched lists, merge order, intent summaries, runtime overlap checks, checkpoint commit definitions) is produced by `/ce:plan` and lives in the plan document.

## Risks & Open Questions

### Risks

- **R1 — Type union freeze drift.** The `'indeed' | 'dice' | 'linkedin'` union exists across ~10 dashboard sites + Python + Supabase migrations + a prompt string. Mitigation: the pre-spawn freeze PR enumerates all sites (per Cross-Stream Concerns); coordinator's commit is the canonical source.
- **R2 — LinkedIn email coverage is partial.** Alert-email-only coverage misses the long tail of LinkedIn's full index. Mitigation: the gap is documented in S4's goal section as an honest scope caveat; web-scraping is explicitly v3-eligible. Users who care about full LinkedIn coverage know to widen their alerts.
- **R3 — Cleanup silent regression on Overview stat.** Already mitigated by R-S1-4 (Overview migration is in S1 scope).
- **R4 — MCP SDK transport-only claim is not actually transport-only.** The SDK manages session state differently than the hand-rolled code (which currently handles Dice's stateless flow defensively). Mitigation: R-S2-3's test gate adds an integration test that mocks at the SDK boundary plus a one-time live Dice smoke before merge.
- **R5 — Cross-source visual duplication.** A job appearing in both LinkedIn alert emails and Dice MCP gets two cards in the dashboard — same title/company, different source badges, different URLs. The dashboard's active read path no longer runs client-side title+company dedup. Mitigation: ship S4 with this behavior documented; revisit if it becomes a UX complaint. Cross-source merge is its own design decision — see Open Question Q4.
- **R6 — Supply-chain posture for the new `mcp` dependency.** Pinning a young SDK ties the codebase to its release cadence. Mitigation: pin floor + ceiling; run `pip audit` as part of S2's merge gate; revisit pin during quarterly dependency review.

### Open questions (resolved in plan, not brainstorm)

- **Q1.** Does S2 also migrate `src/jobs/enrichment.py` and the `careerpilot-research` skill if they use the hand-rolled MCP pattern, or are those follow-ups?
- **Q2.** Do the orphaned Supabase tables `search_runs` and `search_cache` get dropped via migration in S1 (now that R-S1-4 ports the only live readers to a different table) or as a follow-up cleanup ticket?
- **Q3.** Does S4 add LinkedIn detail enrichment (full job description + requirements) by fetching `linkedin.com/jobs/view/<id>`, or ship without it?
- **Q4.** Does S4 migrate `LINKEDIN_SEARCH_PROFILES` into Supabase or expose them via a parallel registration path?
- **Q5.** UX policy when the same job appears in multiple sources — visible duplication (default), client-side group-by-(title, company), or upsert-time source-priority routing? See R5.

## Success Criteria

1. **Cleanup + Overview stat migration (S1, CAR-191).** Four orphaned files deleted; Overview "new matches in 24h" stat reads from `job_search_results.created_at` and renders a plausible non-zero value; `npm run build` and `tools/regression-check.sh` green; transitive orphans (`deduplicateJobs`, `filterIrrelevant`, the search-utils test file) either also deleted or filed as a follow-up.
2. **MCP SDK transport migration (S2, CAR-192).** `python -m pytest tests/` passes (with Dice mocks updated to target the SDK boundary); existing Dice search call site behaves identically post-migration; live Dice smoke documented in PR; `mcp_client.py` exposes the async/sync helpers with `auth=None` default; `pip audit` passes.
3. **LinkedIn integration (S4).** A run of `python cli.py search run-profiles` (with LinkedIn registered) writes LinkedIn rows to `job_search_results` from the user's most recent Gmail alert emails; rows render in the dashboard search page with a visually-distinct LinkedIn source badge (per R-S4-5's design decision); `SOURCE_OPTIONS` filter chip lets the user isolate LinkedIn results.
4. **CAR-189 housekeeping.** The "LinkedIn scraping" item is marked resolved with the email-parser path noted. The "Indeed scraping" item is updated to reflect the spike outcome: the Claude.ai-connector strategy is RULED OUT; the three remaining strategies (residential proxy, headless browser, Partner API) remain candidates for future cycles. The relevance-ranker item remains open with a date stamp ("revisit after 2026-05-25 once v1 engagement data exists").

## Lineage

- **Parent v1:** CAR-188 (Job Search v1 — CLI engine + dashboard reader, shipped 2026-04-27)
- **Tracker:** CAR-189 (Job Search v2 deferred-features tracker)
- **Sibling cleanup ticket:** CAR-191
- **Sibling infra ticket:** CAR-192 (narrowed scope after spike FAIL)
- **Spike artifact:** `scripts/spike_indeed_oauth.py` (status: FAIL — Indeed MCP closed-allowlist; documented for reuse if a future cycle revisits a non-MCP Indeed approach)
- **Predecessor brainstorm:** `docs/brainstorms/2026-04-27-careerpilot-job-search-cli-v1-requirements.md`
- **Predecessor plan:** `docs/plans/2026-04-27-001-feat-careerpilot-job-search-cli-v1-plan.md`
- **Process precedent:** CAR-181 swarm pilot (`docs/plans/2026-04-25-001-car-pilot-parallelization-map.md`)

## Next Step

The pre-plan auth spike is complete (FAIL); the cycle has been reshaped accordingly; the two spinoff tickets are filed (CAR-191, CAR-192).

**Run `/ce:plan` against this document** to produce the implementation plan. The plan output must include the full Parallelization Map per `templates/parallelization-map.md` (in ClaudeInfra) — per-stream worktree branches, declared files-touched lists, runtime overlap check command, merge gate sequence, and checkpoint commit definitions.

After the cycle ships, write a `docs/solutions/` entry capturing the Indeed MCP allowlist finding so it doesn't get re-discovered the hard way.
