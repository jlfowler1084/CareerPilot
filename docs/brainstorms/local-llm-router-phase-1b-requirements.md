---
date: 2026-04-17
topic: local-llm-router-phase-1b
ticket: CAR-142 (Phase 1b)
predecessor: docs/brainstorms/local-llm-router-requirements.md
---

# Local LLM Router — Phase 1b (Validation Loop + First Promotion)

## Problem Frame

Phase 1a shipped the router, migrated all 21 Claude call sites in `src/` behind a single task → provider dispatch, and routed six structured-extraction tasks (R9) to local Qwen 3.5 on the Blackwell. Seventeen generative or tone-sensitive tasks (R10) stayed on Claude because schema validation was weak or absent and the risk of quiet quality regressions was too high to move them without review evidence.

Phase 1b's job is to produce that review evidence, then convert it into one promotion that proves the validation loop works. The locked target is `interview_answer_eval` (Sonnet → local Qwen) — a Phase 1a R10 task split out of the original `interview_coach` grouping, with a bounded schema (`rating`, `strengths`, `weaknesses`, `ideal_answer_points`), ~$0.010 per call on Sonnet, and per-question invocation volume that makes it the highest-leverage promotion on the candidate list.

Two Phase 1b candidates from the original brainstorm are deliberately excluded from this scope:

1. **Dashboard → local routing** (surfaced during 2026-04-17 CAR-148 triage) — the Vercel-deployed dashboard can't reach `localhost:8000` on the workstation, and the Python router doesn't help TypeScript API routes anyway. This is a separate architectural track (Supabase job queue + worker, authenticated tunnel, or flow-moves-to-CLI). Deferred to a Phase 2 brainstorm.
2. **Paired baseline shadow runs** — requires a historical-input capture phase that has no prior groundwork. Organic-review-only is Phase 1b's rigor bar; shadow runs are a Phase 1c option if organic signal turns out to be noisy for the target task.

The durable outcome of Phase 1b is: a working `careerpilot llm review` command, a working `careerpilot llm promote` command, embed calls appearing in `llm_calls`, and `interview_answer_eval` routing to local Qwen with zero perceived quality regression.

## Requirements

Requirement numbering continues from Phase 1a (R1-R13).

**Review UI**

- **R14.** Introduce a `careerpilot llm review` CLI command that renders unreviewed `llm_calls` rows in a paginated Rich-based TUI. Default filter is `reviewed_at IS NULL AND provider_used = 'local' AND is_embed = 0` (embeds are logged for auditing per R20, not for human review), ordered by `created_at ASC` (oldest-first so the organic sample isn't recency-biased). Supports flags `--task <name>`, `--since <ISO date>`, `--provider {local,claude}`, `--limit <n>`, and `--include-embeds` (default false). If the filtered result set is empty, render a single Rich panel reading "Nothing to review" with the active filters and the count of already-reviewed rows for the task, then exit 0.
- **R15.** The review UI displays one call per screen: task, model, latency, input-token/output-token counts, full prompt (paged/truncated if > terminal), full response, and any `schema_invalid=1` or `fallback_reason` indicator. Keyboard: `g` marks good, `b` marks bad, `f` marks flagged, `n` next, `p` previous, `c` opens a comment prompt (writes to a new `review_note` column), `q` quits. Good/bad/flagged verdicts write to `review_verdict` and stamp `reviewed_at` with UTC now — writes happen on keypress, there is no session-level commit or rollback. At the last call, `n` shows a queue-complete summary screen ("Queue complete: X reviewed, Y remaining unreviewed") with quit / re-filter options; at the first call, `p` is a no-op with a brief status-line flash ("Already at first item"). No wrapping. On `q`, print a one-line summary: "Session ended. X verdicts saved. Y calls remain unreviewed."
- **R16.** The review UI is strictly read-only against prompt/response content — there is no edit path. `schema_invalid=1` rows are eligible for review (so the user can see what bad-schema outputs looked like) but are rendered with a clear banner and do not count toward the promotion pass-rate numerator.

**Promotion Policy**

- **R17.** Introduce a `careerpilot llm promote --task <task>` CLI command that evaluates organic-review pass rate against a per-task threshold stored in a new `PROMOTION_POLICY` dict in `config/settings.py` (default: `{"min_reviews": 30, "min_pass_rate": 0.85}`, overridable per task). The command queries the last N **attempted** local-provider rows for the task (not just reviewed rows), computed via these explicit SQL conditions on `llm_calls`:
  - **Numerator (`good`):** rows where `provider_used = 'local' AND review_verdict = 'good' AND review_verdict NOT LIKE 'cal_%'`. Only organic-review "good" verdicts count — schema-invalid rows, infra-fallback rows, and calibration (`cal_*`) verdicts do NOT contribute to the numerator.
  - **Denominator (`good + bad + schema_invalid_local + infra_fallback_local`):** all scoreable rows — (a) reviewed organic rows (`review_verdict IN ('good','bad')`), (b) schema-invalid rows (`provider_used = 'local' AND schema_invalid = 1`), (c) infra-fallback rows (`provider_used = 'local' AND fallback_reason IS NOT NULL AND fallback_reason NOT IN ('env_override','kill_switch','pii_fallback_blocked','fallback_budget_exhausted')`). `flagged` verdicts are excluded from both numerator and denominator.
  - Schema-invalid and infra-fallback rows count as denominator failures (not numerator successes) to avoid survivorship bias: the gate measures "should we route this task to local," not "of Qwen's successes, how often was output good." Then:
  - If threshold met: prints a diff showing the proposed change to `TASK_MODEL_MAP` (task currently mapped to Claude → target local), waits for typed `y` confirmation, applies the change to `config/settings.py` on disk, and prints a one-line git-commit hint.
  - If threshold not met: prints current stats (`reviewed=X good=Y bad=Z flagged=F effective_sample=E pass_rate=W threshold=V min_required_effective=N`) and exits non-zero without writing anything. If `effective_sample < min_reviews`, the message appends "Flagged calls excluded — need E more scoreable reviews."
  - If the task is already routed to local: exits with a clear message and no action.
- **R18.** Promotion is a human-confirmed file edit, not an automatic or env-var action. The write to `config/settings.py` is the durable record of the decision; the next `git diff` surfaces the change for commit. No auto-commit.
- **R19.** Demotion uses the existing Phase 1a escape hatches with no new tooling: `CAREERPILOT_LLM_KILL_SWITCH=1` forces all tasks back to Claude, and `CAREERPILOT_LLM_TASK_<TASK>=claude` demotes a single task. The `careerpilot llm review --help` text documents these explicitly so the reader doesn't have to grep the Phase 1a brainstorm.

**Embed Logging**

- **R20.** Add an `is_embed` column to `llm_calls` (BOOLEAN, default 0) via the existing `_migrate_llm_calls` idempotent-ALTER pattern in `src/db/models.py`. Update `src/llm/router.py::embed()` to log every call with `is_embed=1`, `tokens_in = len(text)` (character count, not tokens), `tokens_out = dimension` (e.g., 4096 for `qwen3-embed`), `prompt = text` (truncated at 16 KB), `response = ""` (embeddings are vectors, not text), and the existing `model`, `latency_ms`, `fallback_reason` fields populated as for completion calls.
- **R21.** Add a `review_note` column (TEXT, nullable) to `llm_calls` via the same migration pattern. Used by R15's comment workflow.
- **R22.** `careerpilot llm summary` (already shipped in Phase 1a) is extended to surface embed-call counts separately from completion counts so the existing one-screen summary stays readable. No new command; a `--include-embeds` flag (defaults to enabled) allows suppressing embed-call rows if they clutter the summary.

**First Promotion (Target Outcome)**

- **R23.** The user accumulates 30+ organic `interview_answer_eval` calls by running mock interviews from the CLI as part of normal interview prep. No synthetic generation, no scripted replay. If real volume hasn't hit 30 within a reasonable window (two weeks post-rollout), Phase 1b ships without the promotion and the promotion moves to a Phase 1c ticket.
- **R24.** The user reviews the 30+ calls via `careerpilot llm review --task interview_answer_eval`. If pass rate meets 85%, user runs `careerpilot llm promote --task interview_answer_eval` and commits the `config/settings.py` change. Baseline doc (`docs/brainstorms/local-llm-router-baseline.md`) "Promotions" section gets a new row with date, task, previous provider, new provider, pass rate, and sample size.
- **R25.** Applies only if Phase 1b includes the promotion (R23 gate met); if Phase 1b ships tooling-only, R25 moves to the Phase 1c promotion ticket. The post-promotion observation window closes at **20 post-promotion calls OR 21 days, whichever first** — replacing a 7-day calendar window, which at this task's actual call frequency was simultaneously too sensitive on infrastructure (false positives from a single bad call) and too insensitive on quality drift (false negatives from question-type-specific regressions that wouldn't appear in one week). Three gates run in parallel during the window:
  - **Infrastructure health gate (not a quality signal):** ≥2 schema-invalid calls OR ≥2 infra-fallbacks triggers automatic demotion. Absolute-count triggers at this sample size, not rates. Schema validity and infra success are the mechanics of the task, not the correctness of the output — this gate says "Qwen can succeed at the task shape," nothing more.
  - **Quality tally (user self-report during the window):** during normal mock-interview use, the user logs any "this feedback was wrong / unhelpful / noticeably worse than Sonnet" moment to a scratch `notes.md` as it happens. ≥2 such moments in the window triggers demotion. The user is expected to log moments *as they occur*, not reconstruct them retrospectively — motivated reasoning at window close can rewrite memory.
  - **End-of-window forcing function (mandatory):** at window close, the user runs a paired blind comparison — 5 post-promotion `interview_answer_eval` Qwen responses vs 5 historical Sonnet responses on similar prompts. The 5 Sonnet rows are drawn from the same 15 calibration-batch rows sourced in R26 (reuse, no new sourcing step), which means the calibration batch also gates the forcing function: if calibration didn't run, there is no Sonnet set to compare against. Pairs are presented in randomized A/B order without labels. If the user picks Sonnet >3/5 times, demote. This is the active confirmation that replaces passive "monitor the summary" — quiet regressions escape passive checks by definition. **Skipping the forcing function defaults to auto-demote** (fail-closed).
- **Demotion mechanics:** demote via `CAREERPILOT_LLM_TASK_INTERVIEW_ANSWER_EVAL=claude` (temporary env-var override, reversible without git — no `config/settings.py` edit needed; the asymmetry is intentional per Key Decisions). Open a Phase 1c ticket capturing which gate fired and the reviewer's notes. Permanent demotion via `config/settings.py` revert happens only if Phase 1c confirms a structural problem.
- **"Keep the promotion" means:** all three gates pass. The user commits a one-line note to `docs/brainstorms/local-llm-router-baseline.md` under Promotions confirming sample size reached, gates passed, and the forcing-function vote (e.g., "Sonnet picked 1/5").

**Pre-Phase Calibration (Prerequisite for first promotion)**

- **R26.** Before the 30-call organic review sample begins, the user runs a one-time offline calibration: pick 15 real `interview_answer_eval` prompts from historical `llm_calls` rows (Phase 1a-era Sonnet output already exists for these rows because R10 has kept the task on Claude). For each prompt, temporarily route the task to local via `CAREERPILOT_LLM_TASK_INTERVIEW_ANSWER_EVAL=local`, re-run the prompt through `router.complete`, and log the Qwen response with a `calibration_batch_id` marking the Sonnet/Qwen pair. This produces 15 side-by-side Sonnet/Qwen outputs on the same prompts without ongoing shadow-run infrastructure. A new `calibration_batch_id TEXT NULL` column is added to `llm_calls` via the existing `_migrate_llm_calls` pattern (the same migration that adds `is_embed` and `review_note` per R20-R21).
- **R27.** The user reviews the 15 calibration pairs in a side-by-side TUI — an extension of R14's review UI activated via a `--calibration-batch <id>` flag. For each pair, the user records a calibration verdict (`sonnet_better`, `qwen_better`, `equivalent`) and an optional free-form note. Verdict column reused: `review_verdict` stores `cal_sonnet_better` / `cal_qwen_better` / `cal_equivalent` (prefix distinguishes calibration verdicts from organic-review verdicts); the `cal_*` rows do NOT count toward the R17 30×0.85 gate. The purpose is not to gate the promotion algorithmically — it is to build the reviewer's mental model of where Qwen diverges from Sonnet on this specific task, so the subsequent 30 organic-review verdicts (R24) are grounded in a reference rather than evaluated in isolation.
- **R28.** If the calibration shows `cal_sonnet_better` on >7/15 prompts (>46%), the promotion candidate is rejected before the organic review begins. The user opens a Phase 1c ticket to investigate prompt/model tuning for this task; the 30-call review session is not started. This is a cheap cut-your-losses gate that front-loads the quality check before ~1 hour of review time is invested in a promotion that is already failing the Sonnet-parity bar.

## Success Criteria

Ordered by what actually measures Phase 1b's value thesis (primary first):

1. **Quality gate passed:** the end-of-window forcing function (R25) runs, and the user picks Sonnet ≤3/5 times on the blind A/B comparison. This is the durable signal that the promotion was the right call. Skipping the forcing function = auto-demote, not pass.
2. **Calibration front-loaded the cut:** R26-R28 complete, and Qwen was NOT `sonnet_better` on >7/15 prompts. Front-loaded rejection protects the 30-review session from being spent on a predictable failure.
3. **Infrastructure health (not a quality signal):** during the observation window, `interview_answer_eval` sees <2 schema-invalid calls and <2 infra-fallbacks. This says Qwen can succeed at the task's mechanics, not that its output is good — the quality gate and calibration handle that separately.
4. **Machinery works:** `careerpilot llm review` reviews 30+ `interview_answer_eval` calls end-to-end. Throughput is a UX sanity check, not a validation metric — if 30-in-an-hour causes reviewer fatigue (per adversarial review), the user splits review across multiple sessions across days.
5. **Promote lands:** `careerpilot llm promote --task interview_answer_eval` applies the `config/settings.py` edit, the diff is committed, subsequent calls route to local (verified via `llm_calls.provider_used='local'` on post-promotion rows).
6. **Embed logging live:** embed calls appear in `llm_calls` with `is_embed=1` (per R20) and surface in `careerpilot llm summary`. The smoke-test caller from Phase 1a (R3) exercises this path.
7. **Demote path rehearsed:** before the observation window ends, the user exercises the env-var demote path once in dev to confirm the rollback works cleanly without application-layer disruption.

## Scope Boundaries

- **Out: dashboard → local routing.** Next.js API routes continue to call Anthropic directly. CAR-148 ships the streaming stopgap for the immediate coaching-analyze timeout. Any work to make the dashboard use local Qwen belongs in a separate Phase 2 brainstorm that also handles the reachability question (queue + worker / tunnel / flow-move-to-CLI).
- **Out: paired baseline shadow runs.** Organic review only. If organic signal is too noisy for future promotion targets, revisit in Phase 1c.
- **Out: promoting any task other than `interview_answer_eval` in Phase 1b.** `interview_question_gen`, `skill_study_plan`, `daily_summary`, `journal_*` and others remain on Claude. Each gets its own promotion ticket once review data accumulates.
- **Out: auto-promotion, scheduled demotion, regression-triggered rollback.** Human-in-the-loop for every state change.
- **Out: a web-based review UI.** CLI Rich TUI only. A future dashboard surface for reviewing `llm_calls` is a Phase 2+ item and depends on cross-project Supabase replication of the `llm_calls` table, which does not exist today.
- **Out: multi-user review workflows, shared review queues, or assignment logic.** Single user, single workstation.
- **Out: retention and pruning changes.** Existing `careerpilot llm prune` (Phase 1a) handles 90-day retention. Embed-row retention reuses the same policy.
- **Out: performance benchmarking harness or eval suites for Qwen.** Organic sample IS the benchmark.

## Key Decisions

- **Organic review + one-time offline calibration, not ongoing shadow runs.** Pure organic-review-only failed adversarial review: reviewers evaluating Qwen output in isolation cannot distinguish "acceptable" from "meaningfully worse than Sonnet" (the actual question the gate must answer). The compromise: a 15-pair offline calibration batch (R26-R28) front-loads the Sonnet-vs-Qwen comparison *before* ongoing review begins, giving the reviewer a trained reference mental model without standing up double-write infrastructure or a `shadow_pair_id` column. The 30×0.85 organic gate then runs against that calibrated judgment. Wider shadow-runs remain a Phase 1c option if calibration reveals signal the organic sample cannot capture.
- **30×0.85 threshold is a pragmatic default with a known ~[67%, 94%] 95% CI at n=30.** This CI is wide — a task with a true pass rate of 72% can pass the gate. For Phase 1b's first promotion, this is acknowledged as a soft gate. Three mechanisms compensate for the looseness: the calibration (R26-R28) that front-loads the Sonnet-parity cut, the paired end-of-window forcing function (R25) that actively confirms post-promotion, and per-task overrides in `PROMOTION_POLICY` (R17) that let Phase 1c tighten `interview_answer_eval` specifically to n=50 / 0.90 if organic signal turns out to be noisy.
- **`interview_answer_eval` only — not `interview_question_gen` or both.** The higher-value and higher-risk promotion forces the review UI's quality gate to actually work. Promoting the cheap task first would validate the mechanics without stressing them. Phase 1c picks up the easy wins after Phase 1b proves the hard one.
- **Promotion is a file edit, not a runtime toggle.** Writing to `config/settings.py` on disk makes the decision visible in git history, reviewable in PRs, and reversible by `git revert`. Env-var-only promotions hide the decision in local shell state. Demotion stays env-var-driven because demotion is a rollback, not a design decision.
- **Embed logging reuses the existing `llm_calls` table rather than a separate `embeddings` table.** The Phase 1a plan deviation that skipped embed logging cited table-bloat concerns for 4096-float vectors. R20 resolves this by logging text (not vectors) with a 16 KB truncation — the vector itself is reconstructable from the text + model + timestamp if needed, and vectors are not the thing under review anyway.
- **No automatic regression detection, but an active end-of-window forcing function.** The observation window (R25) runs three parallel gates: absolute-count infrastructure triggers, in-the-moment quality-tally triggers, and a mandatory paired A/B vote at window close. The forcing function is the core mechanism — passive "monitor the summary" alone is circular (quiet regressions, by definition, escape passive checks). Telemetry-driven alerting would be overkill for a solo workstation, but the forcing function converts the user's attention into a required step with a fail-closed default: skipping it = auto-demote. This is stricter than the original 7-day passive window, at approximately the same implementation cost.
- **Review UI is read-only against prompt/response content.** No edit path exists because editing a past prompt would break the provenance of the verdict it's attached to. If a prompt needs to change, that's a new call with new logging.
- **Prerequisite: Phase 1a baseline doc filled in before Phase 1b reviews start.** The baseline doc (`docs/brainstorms/local-llm-router-baseline.md`) still has empty FILL placeholders. Phase 1b assumes that doc gets its first-production-run numbers written in first, so promotion decisions have something to compare against.

## Dependencies / Assumptions

- **Phase 1a is live on `feature/dashboard-v2` (PR #7, merged 2026-04-15).** Router, providers, failure handling, `llm_calls` logging, `TASK_MODEL_MAP`, and `TASK_CONFIG` are all on disk and exercised. Phase 1b builds on top, no Phase 1a rework.
- **`llm_calls` already has `reviewed_at TEXT` and `review_verdict TEXT` columns** (verified in `src/db/models.py:196-197`). R21 adds `review_note`; R20 adds `is_embed`. Both via the existing `_migrate_llm_calls` idempotent pattern at `src/db/models.py:236`.
- **`interview_answer_eval` has a bounded schema and non-PII task config** (verified in `config/settings.py:536-549`): schema requires `rating`, `strengths`, `weaknesses`, `ideal_answer_points`; max_tokens 1024; fallback_policy `allow`. No PII gate complicates the organic-review sample.
- **Local Qwen is reachable and honors the existing schema-enforcement API** (R4 from Phase 1a). If `response_format={"type":"json_schema", ...}` stops working on the deployed vLLM version, Phase 1b is blocked until the local provider is fixed.
- **Mock interview volume is real.** The user needs to run enough organic mock interviews in the 2-week window to produce 30 `interview_answer_eval` calls. If the user's interview cadence doesn't produce this, the promotion moves to Phase 1c and Phase 1b ships tooling-only.
- **Rich TUI is acceptable on Windows Git Bash.** Rich runs fine in Git Bash on Windows (already used elsewhere in the CLI per project CLAUDE.md). No cross-platform ceremony needed.
- **Historical `interview_answer_eval` Sonnet rows exist in `llm_calls`.** R26's calibration depends on having 15+ Phase 1a-era Sonnet outputs for real prompts. Per Phase 1a baseline doc, `interview_answer_eval` is an R10 task still routed to Claude (Sonnet), and the task was split out in PR #7 (2026-04-15) — so rows have been accumulating since then. If fewer than 15 exist by Phase 1b start, the user runs a few mock interviews to backfill before calibration (normal Phase 1a traffic, no method change).

## Outstanding Questions

### Deferred to Planning

- [Affects R14-R16][UX] What's the exact Rich layout — single-pane scrollable, or split-pane (meta left / prompt+response right)? Planning picks the layout after a five-minute Rich mock.
- [Affects R15][UX] How does the review UI handle a 15 KB prompt/response in a 40-line terminal? Truncation with "press `o` to pager"? Full-page mode on `o`? Planning picks one; not a scope question.
- [Affects R17-R18][Technical] The `careerpilot llm promote` command needs to edit `config/settings.py` in place. The cleanest path is a regex-based line-replacement on the `TASK_MODEL_MAP` dict line for the target task. Planning picks a regex or proposes a tiny AST-based edit; either works.
- [Affects R20][Technical] Does the embed-smoke-test caller from Phase 1a R3 need updating to exercise the new logging, or does it already route through the router? Planning reads `src/llm/router.py::embed` and confirms.
- [Affects R23][Data] If the user has fewer than 30 organic calls at the 2-week mark, does Phase 1b ship without the promotion (tooling-only) or extend the window? Planning picks a concrete gate.

### Deferred to Phase 1c (Follow-on Brainstorm)

- Second promotion: `interview_question_gen` (Haiku → local, easy win on cost but low value per call).
- Paired shadow runs if organic signal turns out to be too noisy for future promotions.
- Review-workflow improvements learned from the first 30 reviews (likely: better navigation, better truncation, bulk-mark-as-reviewed).
- Promotions for `daily_summary`, `journal_*`, `skill_study_plan`, and other R10 tasks once each has 30+ organic calls logged.

### Deferred to Phase 2 Brainstorm

- Dashboard → local Qwen routing. Architecture options already surfaced during CAR-148 triage: Supabase job queue + Python worker on the Blackwell, authenticated tunnel (Tailscale / Cloudflare), or moving dashboard flows to CLI. All three need their own brainstorm and a reachability decision, not a Phase 1b scope expansion.
- RAG, semantic search, and vector storage over the embeddings that R20 now logs. Original CAR-142 scope always placed this in Phase 2.

## Next Steps

1. User fills in `docs/brainstorms/local-llm-router-baseline.md` with first-production-run numbers (five-minute task).
2. `ce:plan` this requirements doc to produce a structured implementation plan with unit breakdown.
3. Execution in a Sonnet session per the CE handoff pattern, not Opus.
4. After first successful promotion, `ce:compound` a `docs/solutions/` entry capturing the organic-review-gate pattern (specifically: when it works, when it's too noisy, when shadow is required).
