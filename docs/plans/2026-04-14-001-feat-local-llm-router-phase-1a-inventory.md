# CAR-142 Phase 1a — Call-Site Inventory
**Date:** 2026-04-14
**Audited by:** Phase 1 audit session
**Status:** DRAFT — approved by strategist before Unit 2

## Summary

- **Total files with `import anthropic`:** 15 (14 under `src/`, plus `cli.py`)
- **Total `messages.create` calls:** 21
- **Resolved task IDs:** 21 call-site + `embed_default` = **22 TASK_CONFIG keys**
  - 7 R9 structured-local task IDs
  - 14 R10 Claude-default task IDs
  - 1 embed task ID
- **Drift from plan:** +2 vs plan's expected 19 (from splitting `skill_analyzer.py` and `insights.py` — different prompts and/or models per call)

---

## R9 Structured-Local Tier (7 task IDs, 7 calls)

| Task ID | File | Call | Model (pre-migration) | max_tokens | temperature | fallback_policy | schema |
|---------|------|------|-----------------------|-----------|-------------|-----------------|--------|
| `email_classify` | `src/gmail/scanner.py` | line 264 | `MODEL_HAIKU` | 256 | (default) | `prompt` | JSON object |
| `job_analyze` | `src/jobs/analyzer.py` | line 79 | `"claude-sonnet-4-6"` | 2048 | (default) | `allow` | JSON object |
| `skill_extract` | `src/intel/skill_analyzer.py` | line 98 | `"claude-sonnet-4-6"` | 2048 | (default) | `allow` | JSON array |
| `skill_study_plan` | `src/intel/skill_analyzer.py` | line 189 | `"claude-sonnet-4-6"` | 4096 | (default) | `allow` | JSON array (web_search ref in prompt — stays Claude in Phase 1a if local lacks search) |
| `company_intel` | `src/intel/company_intel.py` | line 161 | `"claude-sonnet-4-6"` | 8192 | (default) | `prompt` | JSON object |
| `profile_extract` | `src/profile/manager.py` | line 180 | `"claude-sonnet-4-6"` (hardcoded) | 4096 | (default) | `prompt` | JSON object |
| `gmail_thread_actions` | `src/gmail/thread_actions.py` | lines 98, 223 | `"claude-sonnet-4-6"` | 512 | (default) | `allow` | None (prose reply) |

**Notes:**
- `gmail_thread_actions` has 2 calls (lines 98 and 223) using the **same** `THREAD_REPLY_SYSTEM_PROMPT` → share one task ID.
- `skill_study_plan` is R9 by structure but its prompt says "Use web_search to find CURRENT, working resource links" — in Phase 1a this stays on Claude since local vLLM has no web_search tool. Marked R9 for future Phase 2 consideration when tool-equipped local models arrive.
- `profile_extract` uses `anthropic.Anthropic()` with no API key arg (relies on env var — different from other modules).

---

## R10 Claude-Default Tier (14 task IDs, 14 calls)

| Task ID | File | Call | Model (pre-migration) | max_tokens | temperature | fallback_policy | schema |
|---------|------|------|-----------------------|-----------|-------------|-----------------|--------|
| `roadmap_generate` | `src/skills/roadmap.py` | line 67 | `"claude-sonnet-4-6"` | 4096 | (default) | `allow` | None (prose) |
| `journal_entry` | `src/journal/entries.py` | line 91 | `MODEL_HAIKU` | 128 | (default) | `allow` | JSON array (tags) |
| `journal_weekly_summary` | `src/journal/insights.py` | line 61 | `"claude-sonnet-4-6"` | 1024 | (default) | `allow` | None (prose sections) |
| `journal_momentum` | `src/journal/insights.py` | line 95 | `MODEL_HAIKU` | 256 | (default) | `allow` | None (prose status) |
| `transcript_speaker_id` | `src/interviews/transcripts.py` | line 228 | `"claude-sonnet-4-6"` | 4096 | (default) | `allow` | None (relabeled text) |
| `recruiter_respond` | `src/gmail/responder.py` | line 116 | `"claude-sonnet-4-6"` | 512 | (default) | `allow` | None (prose email) |
| `interview_transcript_analyze` | `src/interviews/coach.py` | line 174 | `MODEL_SONNET` | 4096 | (default) | `allow` | JSON object |
| `interview_compare` | `src/interviews/coach.py` | line 236 | `MODEL_SONNET` | 2048 | (default) | `allow` | JSON object |
| `interview_question_gen` | `src/interviews/coach.py` | line 296 | `MODEL_HAIKU` | 512 | (default) | `allow` | None (question text) |
| `interview_answer_eval` | `src/interviews/coach.py` | line 325 | `MODEL_SONNET` | 1024 | (default) | `allow` | JSON object |
| `interview_summary` | `src/interviews/coach.py` | line 372 | `MODEL_SONNET` | 2048 | (default) | `allow` | JSON object |
| `resume_generate` | `src/documents/resume_generator.py` | line 194 | `"claude-sonnet-4-6"` | 4096 | (default) | `allow` | JSON object |
| `cover_letter` | `src/documents/cover_letter_generator.py` | line 127 | `"claude-sonnet-4-6"` | 2048 | (default) | `allow` | None (prose) |
| `daily_summary` | `cli.py` | line 3326 | `"claude-sonnet-4-6"` | 512 | (default) | `allow` | None (prose, no system prompt) |

**Notes:**
- `insights.py` split: two calls use different system prompts (`WEEKLY_SUMMARY_SYSTEM` vs `MOMENTUM_SYSTEM`) and different models (Sonnet vs Haiku) → split into `journal_weekly_summary` + `journal_momentum`.
- `coach.py` has 5 calls across 4 methods: `analyze_interview` (line 174), `compare_interviews` (line 236), `mock_interview` q/eval/summary (lines 296/325/372) → 5 distinct task IDs.
- `daily_summary` (cli.py line 3326) has **no `system=` parameter** — the system_prompt field in TASK_CONFIG is empty string.
- `journal_entry` returns a JSON array of tags (3-5 strings) — has a schema despite being R10.
- `resume_generate` returns JSON matching the profile structure — has a schema despite being R10.
- `interview_transcript_analyze`, `interview_compare`, `interview_answer_eval`, `interview_summary` all return structured JSON — have schemas.

---

## Embed Task ID

| Task ID | Provider | Notes |
|---------|----------|-------|
| `embed_default` | Local only | qwen3-embedding-8b; no schema; no fallback_policy |

---

## Pre-Migration vs Post-Migration Parameter Diff (for Unit 5/6 assertion requirement)

For each migrated call, the router MUST receive these exact values:

### R9 Tier

**email_classify (scanner.py:264)**
- Pre: `model=settings.MODEL_HAIKU, max_tokens=256, system=CLASSIFICATION_SYSTEM_PROMPT`
- Post: `router.complete(task="email_classify", prompt=<email_body>)` → router supplies model/max_tokens/system from TASK_CONFIG

**job_analyze (analyzer.py:79)**
- Pre: `model="claude-sonnet-4-6", max_tokens=2048, system=FIT_ANALYSIS_PROMPT`
- Post: `router.complete(task="job_analyze", prompt=<user_msg>)`

**skill_extract (skill_analyzer.py:98)**
- Pre: `model="claude-sonnet-4-6", max_tokens=2048, system=SKILL_EXTRACTION_PROMPT`
- Post: `router.complete(task="skill_extract", prompt=<jd_text>)`

**skill_study_plan (skill_analyzer.py:189)**
- Pre: `model="claude-sonnet-4-6", max_tokens=4096, system=STUDY_PLAN_PROMPT`
- Post: `router.complete(task="skill_study_plan", prompt=<gaps_json>)`

**company_intel (company_intel.py:161)**
- Pre: `model="claude-sonnet-4-6", max_tokens=8192, system=<BRIEF_SYSTEM_PROMPT + addenda>`
- Post: `router.complete(task="company_intel", prompt=<query>)` — addenda are part of the user prompt, not system

**profile_extract (profile/manager.py:180)**
- Pre: `model="claude-sonnet-4-6", max_tokens=4096, system=<inline resume parser system prompt>`
- Post: `router.complete(task="profile_extract", prompt=<resume_text>)` — NOTE: pre-migration uses `anthropic.Anthropic()` with no api_key arg; post-migration the router uses `settings.ANTHROPIC_API_KEY`

**gmail_thread_actions (thread_actions.py:98 and :223)**
- Pre: `model="claude-sonnet-4-6", max_tokens=512, system=THREAD_REPLY_SYSTEM_PROMPT`
- Post: `router.complete(task="gmail_thread_actions", prompt=<thread_content>)` — both call sites use same task ID

### R10 Tier (selected critical ones)

**interview_question_gen (coach.py:296)**
- Pre: `model=MODEL_HAIKU, max_tokens=512, messages=[{"role":"user","content":MOCK_QUESTION_PROMPT.format(...)}]` — NOTE: uses formatted user content, NO separate system= arg
- Post: `router.complete(task="interview_question_gen", prompt=MOCK_QUESTION_PROMPT.format(...))` — system_prompt in TASK_CONFIG should be empty string

**interview_answer_eval (coach.py:325)**
- Pre: `model=MODEL_SONNET, max_tokens=1024, messages=[{"role":"user","content":MOCK_EVALUATE_PROMPT.format(...)}]` — no system=
- Post: `router.complete(task="interview_answer_eval", prompt=MOCK_EVALUATE_PROMPT.format(...))`

**interview_summary (coach.py:372)**
- Pre: `model=MODEL_SONNET, max_tokens=2048, messages=[{"role":"user","content":MOCK_SUMMARY_PROMPT.format(...)}]` — no system=
- Post: `router.complete(task="interview_summary", prompt=MOCK_SUMMARY_PROMPT.format(...))`

**daily_summary (cli.py:3326)**
- Pre: `model="claude-sonnet-4-6", max_tokens=512, messages=[{"role":"user","content":prompt}]` — no system=
- Post: `router.complete(task="daily_summary", prompt=prompt)`

---

## Open Questions for Unit 2 (SDK spike)

1. Verify `anthropic==0.94.1` tool-use response shape: does `response.content` contain `MessageBlock` objects with `.type == "tool_use"` as expected by Unit 2?
2. Verify `openai>=1.0.0` `extra_body={"guided_json": schema_dict}` passes through to vLLM without error — requires live endpoint (Unit 3+).
3. `company_intel` prompt includes ROLE_ANALYSIS_ADDENDUM and INTERVIEWER_PREP_ADDENDUM conditionally appended to the system prompt. Post-migration, these addenda should be passed as part of the user prompt, not the system prompt, since TASK_CONFIG holds a fixed system_prompt string.
