---
date: 2026-04-14
topic: local-llm-router
---

# Local LLM Router — Phase 1a

## Problem Frame

CareerPilot currently makes every LLM call against the Anthropic API. Gmail scans, job scans, skill extraction, company intel, and journal processing all incur metered spend on top of the user's Claude Max subscription, which discourages running them on demand. The user has a Blackwell RTX Pro 6000 with Qwen 3 chat and qwen3-embedding-8b loaded locally, which can absorb the high-volume, structured tasks at zero marginal cost — but today 15 files under `src/` each instantiate their own hardcoded `anthropic.Anthropic()` client with no shared abstraction.

Phase 1a ships the cost-cut value on its own: a single router, 15 call sites migrated, structured-extraction tasks routed to local, safe infrastructure fallback, and a working `embed()` primitive against qwen3-embedding-8b. The validation-loop work (paginated review UI, promotion thresholds, paired baseline shadow runs) is deliberately deferred to Phase 1b — a separate brainstorm that runs once Phase 1a is in production and has produced organic review data. Phase 2 remains RAG, semantic search, and vector storage over the embeddings Phase 1a makes possible.

## Requirements

**Router Core**
- R1. Introduce a single LLM call surface (`llm.complete(task=..., prompt=..., schema=..., **overrides)`) that every module in `src/` uses instead of instantiating `anthropic.Anthropic()` directly. Per-call overrides (e.g., `max_tokens` sized to input length) are accepted as kwargs; task-level defaults (system prompt, temperature, model tier, default max_tokens) live in the task config map.
- R2. The router resolves `task` → provider through a task→provider map defined in `config/settings.py`, with per-task environment-variable overrides (e.g., `CAREERPILOT_LLM_TASK_EMAIL_CLASSIFY=claude`) and a global kill-switch `CAREERPILOT_LLM_FORCE=claude` that forces all tasks back to Claude for debugging.
- R3. The router implements a working `llm.embed(task=..., text=...)` against qwen3-embedding-8b via the OpenAI-compatible `/v1/embeddings` endpoint. At least one smoke-test caller exercises it end-to-end as part of Phase 1a acceptance. RAG, semantic search, and vector storage remain Phase 2 — `embed()` is the working primitive, not the full feature.
- R4. The router's `complete()` method accepts an optional JSON schema and returns parsed objects, not raw strings. Schema enforcement mechanism is per-provider: Claude uses Anthropic tool-use forced calls (Anthropic has no native `response_format=json_schema`), local uses the runtime's native JSON mode (vLLM `guided_json`, Ollama `format=json` with schema, etc.). The router performs post-parse schema validation regardless of provider and raises a typed `SchemaValidationError` on failure.

**Providers**
- R5. A Claude provider wraps the existing `anthropic` SDK usage. Per-call-site model selection (Haiku vs. Sonnet), system prompt, and temperature move from the call site into the task config map.
- R6. A local provider speaks the OpenAI-compatible Chat Completions and Embeddings API so it works interchangeably with vLLM, LM Studio, Ollama, or llama.cpp. The endpoint URL, model name, and API key (if any) come from `.env`. On router startup, the local URL is validated: it must resolve to a loopback address or an explicit `CAREERPILOT_LLM_LOCAL_ALLOWLIST` entry, otherwise the router refuses to initialize and a clear error is logged. The runtime choice is an env-var decision, not a code decision; runtime-specific schema-capability discrepancies are resolved at call time by the post-parse validation in R4, not by a startup lint.

**Failure Handling**
- R7. Failure modes are split by cause:
  - **Infrastructure failures** (connection error, timeout, HTTP 5xx, empty response, truncated `finish_reason`, JSON parse error) auto-fall back to Claude, record `fallback_reason`, and return the Claude result. Callers never see an infrastructure failure.
  - **Schema-validation failures** do **not** silently fall back. The router logs the local response as a `schema_invalid=true` row in `llm_calls`, then issues a replacement call to Claude and logs that as a separate row. The caller receives the Claude result. This keeps bad local outputs visible in the log for later review without hiding them behind a fallback statistic.
  - **Per-task fallback policy:** tasks handling recruiter PII (`email_classify`, `profile_extract`, `company_intel`) default to `fallback_policy=prompt` — during an interactive CLI session, the router asks for confirmation before sending the prompt to Claude; during an unattended session, the call fails closed and logs `fallback_reason=pii_fallback_blocked`. Non-PII tasks default to `fallback_policy=allow`.
  - `fallback_reason` is an enumerated value: `{connection_error, timeout, http_5xx, empty_response, truncated_finish_reason, json_parse_error, pii_fallback_blocked, fallback_budget_exhausted, env_override, kill_switch, unknown}`. Schema-validation failures are intentionally **not** in this enum: the local call is logged with `schema_invalid=true` and `fallback_reason=NULL`, and the replacement Claude call is logged as a separate row with `fallback_reason=NULL` because it is a replacement, not a fallback.
  - **Interactive-session detection** (used by PII fallback prompt): `sys.stdin.isatty() AND sys.stdout.isatty() AND os.environ.get("CAREERPILOT_UNATTENDED") != "1"`. Scheduled scans (Windows Task Scheduler, cron) must set `CAREERPILOT_UNATTENDED=1` in the task action so detection cannot be fooled by TTY inheritance. When the env var is absent and the TTY check is ambiguous, the router defaults to unattended (fail-closed) rather than interactive (prompt-and-hang).
  - **PII prompt UX defaults:** bare Enter = No (fail-closed), Ctrl-C = No, EOF = No. One prompt per call, not per session. If prompts fire repeatedly during a flaky local outage, the user is expected to Ctrl-C and fix the server; muscle-memory approval is not a mode the router tries to prevent beyond defaulting to No.
  - **Schema-validation failure on a PII-bearing task** always logs the local response as `schema_invalid=true`. The replacement Claude call still goes through the task's `fallback_policy`, so a schema-fail on `email_classify` prompts the user (interactive) or fails closed (unattended) before the Claude replacement runs.
- R8. A rolling 24-hour fallback budget (configurable, default 20 fallbacks) protects against runaway spend during a local-server outage. When the budget is exhausted, the router fails closed (raises `FallbackBudgetExhausted`) until either the next rolling-window expiry or a manual reset via `careerpilot llm-reset-budget`. Budget state is logged to `llm_calls` via `fallback_reason=fallback_budget_exhausted`. Out-of-band notification (Discord webhook, email, etc.) is explicitly deferred — fail-closed alone is sufficient for Phase 1a's threat model because unattended-scan observability is a Phase 1b concern.

**Phase 1a Task Assignments (Structured-Local Tier)**
- R9. The following structured-extraction tasks route to **local** in Phase 1a defaults. Schema validation is enforced on every call via R4, and schema-failures are captured per R7 for later review:
  - `email_classify` — [src/gmail/scanner.py](src/gmail/scanner.py)
  - `job_analyze` — [src/jobs/analyzer.py](src/jobs/analyzer.py)
  - `skill_extract` — [src/intel/skill_analyzer.py](src/intel/skill_analyzer.py)
  - `company_intel` — [src/intel/company_intel.py](src/intel/company_intel.py)
  - `profile_extract` — [src/profile/manager.py](src/profile/manager.py)
  - `gmail_thread_actions` — [src/gmail/thread_actions.py](src/gmail/thread_actions.py)

**Phase 1a Task Assignments (Claude-Default Tier)**
- R10. The following tasks stay on **Claude** in Phase 1a defaults. Promotion to local happens in Phase 1b based on review data accumulated from organic Phase 1a usage.
  - *Generative, user-reads-themselves (quiet-failure risk)* — schema validation is weak or absent, so these need human review evidence before promotion:
    - `roadmap_generate` — [src/skills/roadmap.py](src/skills/roadmap.py)
    - `journal_entry` — [src/journal/entries.py](src/journal/entries.py)
    - `journal_insights` — [src/journal/insights.py](src/journal/insights.py)
    - `transcript_analyze` — [src/interviews/transcripts.py](src/interviews/transcripts.py)
  - *Tone-sensitive or third-party-facing* — promotion gated on an explicit Phase 2+ decision, not just quality metrics:
    - `recruiter_respond` — [src/gmail/responder.py](src/gmail/responder.py)
    - `interview_coach` — [src/interviews/coach.py](src/interviews/coach.py) (planning splits into `interview_question_gen`, `interview_answer_eval`, `interview_summary`)
    - `resume_generate` — [src/documents/resume_generator.py](src/documents/resume_generator.py)
    - `cover_letter` — [src/documents/cover_letter_generator.py](src/documents/cover_letter_generator.py)

**Logging**
- R11. Every LLM call (local and Claude) is logged to a new `llm_calls` SQLite table capturing at minimum: `id, task, provider_requested, provider_used, model, system_prompt, prompt, response, schema_id, schema_invalid, latency_ms, tokens_in, tokens_out, fallback_reason, created_at, reviewed_at, review_verdict`. Retention: rows older than 90 days are eligible for deletion via `careerpilot llm-prune`; `prompt` and `response` fields are truncated at 16 KB on write with a `truncated` flag. Row-level PII in `llm_calls` lives in the same trust boundary as the existing `contacts` and `applications` tables — no new application-layer access controls in Phase 1a. When an env override or kill-switch routes a call away from its task-map default, `provider_requested` reflects the overridden destination and `fallback_reason` is set to `env_override` or `kill_switch` so future stats do not misattribute user-directed routing as a local failure. The `reviewed_at` and `review_verdict` columns are present but unused in Phase 1a — they are reserved for the Phase 1b review UI so Phase 1a data becomes immediately usable when Phase 1b ships.
- R12. A minimal `careerpilot llm-summary` command prints a one-screen text summary from `llm_calls`: per-task call counts for the last 7 and 30 days, per-task fallback counts grouped by `fallback_reason`, current rolling-budget consumption, and the total row count in the table. This is not a review UI — it is a sanity check that Phase 1a is behaving and that Phase 1b has meaningful data to work with. No pagination, no interactive marking, no thresholds.

**Phase 1a Prerequisites**
- R13. Before Phase 1a rollout, the user manually records current monthly Anthropic spend (one-line read from the billing dashboard) and current weekly scan-invocation frequency (from existing CLI logs or memory). These numbers are written to `docs/brainstorms/local-llm-router-baseline.md` as a one-time note. Post-rollout deltas on both numbers are the real success signal for the behavior-change goal ("run scans whenever I want"). This is a five-minute prerequisite, not a feature.

## Success Criteria

- Running the R9 structured-local tasks against local Qwen costs $0 in Anthropic spend (excluding infrastructure fallbacks) and the user can spot-check individual outputs via direct SQLite inspection of `llm_calls` and judge them plausible.
- Monthly Anthropic spend after Phase 1a rollout drops measurably compared to the R13 baseline; weekly scan-invocation frequency increases or stays flat.
- No module in `src/` imports `anthropic` directly after Phase 1a; all 15 call sites flow through `src/llm/router.py` (the Claude provider is the only place the SDK is touched).
- `llm.embed()` returns real vectors end-to-end for at least one smoke-test caller, confirming the local embedding endpoint works and Phase 2 RAG has concrete ground.
- The user can flip a task between `local` and `claude` by editing one line in `config/settings.py` or one env var, with no code changes.
- A local-server outage during an unattended scheduled scan results in either a completed scan (within the rolling fallback budget) or a fail-closed `FallbackBudgetExhausted` raise — never silently-drained API spend.
- A schema-validation failure on a local task results in a `schema_invalid=true` row in `llm_calls` and a replacement Claude call, both visible via SQL.

## Scope Boundaries

- **Out: Review UI, pagination, promotion thresholds, paired baseline shadow runs, inline review prompts, staleness indicators.** All validation-loop work is Phase 1b. Phase 1a produces the data; Phase 1b produces the decision-making tooling.
- **Out: Out-of-band notifications (Discord, email, webhook).** Fail-closed behavior is the only Phase 1a mechanism. Observability for unattended scans is a Phase 1b concern.
- **Out: RAG, semantic search, vector storage.** `embed()` is implemented in Phase 1a; no consumer features beyond the smoke test. Phase 2.
- **Out: Promoting tone-sensitive or third-party-facing tasks to local.** Recruiter response drafting, resume/cover letter generation, and interview coaching require an explicit Phase 2+ decision.
- **Out: Shadow mode, A/B comparison, or gold-set eval harness.** None in Phase 1a. Phase 1b may add a bounded one-time shadow run once the input-sourcing question is resolved.
- **Out: Supporting multiple local providers simultaneously.** One local endpoint at a time, configured via `.env`.
- **Out: Startup schema-capability lint or runtime capability profiles.** Single-runtime Phase 1a; runtime differences are caught at call time by R4's post-parse validation.
- **Out: Prompt optimization or model fine-tuning for Qwen.** Poor task performance is addressed by flipping the task to Claude via R2 overrides, not by tuning.
- **Out: Queue-and-retry semantics.** Infrastructure fallback to Claude is synchronous. No persistent job queue.
- **Out: Cost accounting in dollars.** The R13 baseline/post-rollout billing-dashboard read is the cost signal.
- **Out: Multi-user review or shared review queues.** Single user, single workstation.

## Key Decisions

- **Split into Phase 1a and Phase 1b:** Phase 1a delivers the cost-cut value (router + offload + logging + infra fallback + embed) as an independently shippable unit. Phase 1b (future brainstorm) delivers the review UI, promotion thresholds, and any shadow-run work. Rationale: round-2 review showed that bundling the validation loop with the router migration gated cost savings behind harness work that had unresolved implementation questions (no raw inputs for shadow run, no Discord config, undefined interactive detection). Splitting unblocks the cost-cut goal while preserving all the quality work as a follow-on.
- **Structured-local / generative-Claude tier split in Phase 1a:** Phase 1a only routes schema-guarded structured extraction to local. Generative tasks (roadmaps, journal insights, transcript analysis) stay on Claude until Phase 1b produces review evidence. Rationale: structured failures are loud (schema validation catches them); generative failures are quiet. Different risk profiles.
- **Split fallback semantics by cause:** Infrastructure failures fall back silently; schema-validation failures are logged-and-replaced without showing up in the fallback statistic; PII-bearing tasks require confirmation. Rationale: a single policy would hide quality signal behind transient network blips.
- **Fail-closed fallback budget, no out-of-band notification:** A 24-hour rolling budget with fail-closed behavior handles the "scheduled scan, user on a trip, local server down all week" scenario without requiring Discord or email plumbing. The user finds out the next time they run a CLI command; fail-closed guarantees no surprise spend regardless of when they notice.
- **OpenAI-compatible local provider with startup URL validation, no capability lint:** The serving runtime is an env-var decision. The router validates that the URL resolves to a safe address. Runtime schema-feature differences are caught at call time by post-parse validation, not by a startup lint that has no cross-runtime discovery standard.
- **R11 reserves `reviewed_at` / `review_verdict` columns unused:** Phase 1a writes the columns as NULL so Phase 1a data is immediately usable when Phase 1b ships a review UI. Cheap forward-compat.
- **`embed()` implemented for real in Phase 1a:** ~1 day of work, proves the local embedding endpoint works end-to-end, and de-risks Phase 2 RAG significantly. The embedding model is already loaded on hardware bought specifically for this kind of work — deferring the primitive wastes the investment.
- **Manual baseline capture, not tooling:** R13 is a five-minute note the user writes once before rollout. No dashboard, no automated capture. The goal is to know whether Phase 1a actually changed behavior, not to build cost analytics.

## Dependencies / Assumptions

- **Local LLM serving layer is already running or will be, with an OpenAI-compatible endpoint for both chat and embeddings.** The user has Qwen 3 and qwen3-embedding-8b loaded on the Blackwell RTX Pro 6000; Phase 1a assumes both endpoints are reachable at URLs in `.env`. Standing up the serving layer itself is out of scope. Phase 1a success criteria cannot be validated until the serving layer is verified reachable — this is a hard prerequisite for test and rollout.
- **Qwen 3 is capable enough at the R9 structured-extraction task list.** The falsification mechanism in Phase 1a is direct SQL inspection of `llm_calls`: if `schema_invalid=true` rate or user plausibility-check failures are high for a task, flip it to Claude via R2 override. The more rigorous Phase 1b shadow-run comparison is deferred.
- **SQLite schema changes do not require a migration framework.** CareerPilot uses direct SQLite; adding `llm_calls` is a one-shot `CREATE TABLE IF NOT EXISTS` at startup, consistent with current patterns. Add an index on `(task, created_at)` at the same time.
- **The user is the sole operator and reviewer.** Phase 1a's spot-check mechanism is the user running direct SQL queries or the `llm-summary` command — not a multi-user review queue.

## Outstanding Questions

### Deferred to Planning

- [Affects R6][Technical] Which serving runtime should the router document as the primary reference target (vLLM, LM Studio, Ollama, llama.cpp), and what `.env` keys does it need? Planning picks one for the README and `.env.example`. The router is runtime-agnostic at code level.
- [Affects R1, R5][Needs research] Full inventory of all 15 call sites' current system prompts, temperatures, max_tokens, and model selections. Planning produces the task config map as its first deliverable before router code is written.
- [Affects R10][Needs research] The three Claude calls in [src/interviews/coach.py](src/interviews/coach.py) (question generation, answer evaluation, summary) should be split into separate task IDs so Phase 1b can decide their routing independently.
- [Affects R8][Technical] What is the concrete default fallback budget number (20/day is a placeholder)? Should it scale by task or stay global? Planning picks a number and makes it configurable.

### Deferred to Phase 1b Brainstorm

- Review UI design: pagination model, filter set, inline-vs-batch review, keybindings, truncation-vs-pager for PII fields.
- Promotion and demotion thresholds: what counts as "enough" review data to promote a task, and what triggers an auto-demote warning.
- Paired baseline shadow runs: how to source raw inputs, whether to use live-capture mode or synthetic inputs, consent handling for bulk PII batches, `shadow_pair_id` column addition to `llm_calls`.
- Out-of-band notification: Discord, email, or file-based, and the concrete payload schema (PII-free).

## Next Steps

-> `/ce:plan` for structured implementation planning of Phase 1a

A Phase 1b brainstorm will follow after Phase 1a is in production and has accumulated organic review data.
