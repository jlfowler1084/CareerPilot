# Local LLM Router — Phase 1a Baseline

**Established:** <!-- FILL: date of first production run -->
**Commit:** 45e2c69 (Unit 7 — final Phase 1a commit)
**Branch merged from:** `worktree/CAR-142-local-llm-router-phase-1a`

This document records the Phase 1a acceptance baseline. Fill in the bracketed
values after the first full production session (careerpilot scan + skills + journal).

---

## Hardware

| Field | Value |
|-------|-------|
| GPU | <!-- FILL: e.g. NVIDIA RTX 4090 24 GB --> |
| VRAM available | <!-- FILL: e.g. 20 GB after OS overhead --> |
| CPU / RAM | <!-- FILL --> |

---

## Chat Model (port 8000)

| Field | Value |
|-------|-------|
| Model | qwen3.5-35b-a3b-fp8 |
| Backend | <!-- FILL: vLLM version, e.g. vLLM 0.8.4 --> |
| Context window | <!-- FILL: e.g. 8192 --> |
| Quantization | FP8 |
| Thinking mode | Disabled (enable_thinking=False) |
| Observed VRAM | <!-- FILL: GB --> |

---

## Embed Model (port 8001)

| Field | Value |
|-------|-------|
| Model | <!-- FILL: e.g. Qwen3-Embedding-8B --> |
| Backend | <!-- FILL: vLLM version --> |
| Dimensions | <!-- FILL: e.g. 4096 --> |
| Observed VRAM | <!-- FILL: GB --> |

---

## Phase 1a Task Routing Map

| Task | Provider | Model | Notes |
|------|----------|-------|-------|
| email_classify | local | qwen3.5-35b-a3b-fp8 | R9, PII-prompt fallback policy |
| skill_extract | local | qwen3.5-35b-a3b-fp8 | R9, allow fallback policy |
| job_analyze | local | qwen3.5-35b-a3b-fp8 | R9 |
| profile_extract | local | qwen3.5-35b-a3b-fp8 | R9 |
| company_intel | local | qwen3.5-35b-a3b-fp8 | R9 |
| transcript_speaker_id | local | qwen3.5-35b-a3b-fp8 | R9 |
| roadmap_generate | claude | claude-sonnet-4-6 | R10, prose output |
| skill_study_plan | claude | claude-sonnet-4-6 | R10, web_search via claude_extra |
| recruiter_respond | claude | claude-sonnet-4-6 | R10 |
| cover_letter | claude | claude-sonnet-4-6 | R10 |
| resume_generate | claude | claude-sonnet-4-6 | R10, schema output |
| journal_entry | claude | claude-haiku-4-5-20251001 | R10 |
| journal_weekly_summary | claude | claude-sonnet-4-6 | R10 |
| journal_momentum | claude | claude-haiku-4-5-20251001 | R10 |
| interview_transcript_analyze | claude | claude-sonnet-4-6 | R10 |
| interview_compare | claude | claude-sonnet-4-6 | R10 |
| interview_question_gen | claude | claude-haiku-4-5-20251001 | R10, mock interview split |
| interview_answer_eval | claude | claude-sonnet-4-6 | R10, mock interview split |
| interview_summary | claude | claude-sonnet-4-6 | R10, mock interview split |
| gmail_thread_actions | claude | claude-sonnet-4-6 | R10 |
| daily_summary | claude | claude-sonnet-4-6 | R10 |
| embed_default | local | <!-- FILL: embed model name --> | R11, not logged to llm_calls |

---

## Observed Performance (first production session)

### Local Provider (Qwen3.5-35B-A3B-FP8)

| Task | Avg Latency | Avg Tokens In | Avg Tokens Out | Quality Notes |
|------|-------------|---------------|----------------|---------------|
| email_classify | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> |
| skill_extract | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> |
| job_analyze | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> |
| profile_extract | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> |
| company_intel | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> |
| transcript_speaker_id | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> |

### Claude Provider

| Task | Avg Latency | Avg Tokens In | Avg Tokens Out | Cost Est. |
|------|-------------|---------------|----------------|-----------|
| skill_study_plan (w/ web_search) | ~31.5s | ~26,800 | ~1,600 | <!-- FILL --> |
| interview_answer_eval | ~10.8s | ~917 | ~489 | ~$0.010/q |
| interview_summary | ~13.5s | ~1,179 | ~665 | ~$0.014/session |
| interview_question_gen | ~2.8s | ~80 | ~52 | ~$0.0003/q |
| <!-- others --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> | <!-- FILL --> |

---

## Fallback Budget

| Setting | Value |
|---------|-------|
| `LLM_FALLBACK_BUDGET_PER_DAY` | 50 |
| Infra fallbacks observed in acceptance | 0 |
| Schema fails observed in acceptance | 0 |

---

## Accepted Plan Deviations (Phase 1a)

These items deviate from the original R-series plan and are accepted for Phase 1a.
Each will be revisited during Phase 1b planning.

| # | Deviation | Rationale | Phase 1b Action |
|---|-----------|-----------|-----------------|
| 1 | Embed calls not logged to `llm_calls` | No RAG in Phase 1a; 4096-float vectors would bloat the table; only one call site (smoke test) | Add embed logging when RAG lands and embed volume becomes meaningful |
| 2 | Env var renamed: `LLM_LOCAL_URL` → split into `CAREERPILOT_LLM_LOCAL_BASE_URL` (port 8000) and `CAREERPILOT_LLM_LOCAL_EMBED_BASE_URL` (port 8001) | Two separate inference processes with different hardware profiles | None — final naming |
| 3 | `llm_calls` dropped 4 columns vs plan: `prompt_tokens`, `completion_tokens` (superseded by `tokens_in`/`tokens_out`), `error_message` (merged into `fallback_reason`), `is_fallback` (derivable from `fallback_reason IS NOT NULL`) | Cleaner schema; derived columns add no information | None — accepted schema |
| 4 | Fallback budget default changed 20→50 | 20 was too aggressive for a solo developer during bring-up; 50 gives one incident + investigation runway per day | Tune down when local reliability baseline is established |
| 5 | `email_classify` env-override `=claude` bug (Unit 4.5 fix) | `CAREERPILOT_LLM_TASK_EMAIL_CLASSIFY=claude` passed literal "claude" as Anthropic model ID → `NotFoundError`. Fixed to three-way dispatch: `=local`, `=claude` (task-config model), `=<model-id>` | None — fixed |

---

## Phase 1b Promotion Candidates

Tasks to evaluate for local promotion based on Phase 1a review data:

| Task | Current | Target | Gate Criterion |
|------|---------|--------|----------------|
| `interview_question_gen` | claude-haiku | local | Qwen generates coherent, varied questions at target seniority level |
| `interview_answer_eval` | claude-sonnet | local | Eval dict fields match Sonnet quality within acceptable delta on 20-sample review |
| `email_classify` | local (already) | — | Monitor schema-fail rate; if >5%/week, tune system prompt |
| `company_intel` | local (already) | — | Monitor response quality; may need web_search claude_extra |

---

## Run Queries

### Current router stats (last 7 days)
```bash
python cli.py llm summary --days 7
```

### Per-task cost estimate (Claude rows only)
```sql
SELECT task, COUNT(*) as calls,
       SUM(tokens_in) as total_in,
       SUM(tokens_out) as total_out
FROM llm_calls
WHERE provider_used = 'claude'
  AND created_at >= datetime('now', '-7 days')
GROUP BY task
ORDER BY total_in + total_out DESC;
```

### Fallback rate by task
```sql
SELECT task,
       COUNT(*) as total,
       SUM(CASE WHEN fallback_reason IS NOT NULL AND fallback_reason NOT IN
           ('kill_switch','env_override','pii_fallback_blocked','fallback_budget_exhausted')
           THEN 1 ELSE 0 END) as infra_fallbacks,
       SUM(CASE WHEN schema_invalid = 1 THEN 1 ELSE 0 END) as schema_fails
FROM llm_calls
GROUP BY task
ORDER BY infra_fallbacks DESC, schema_fails DESC;
```
