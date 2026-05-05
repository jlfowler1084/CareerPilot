---
title: Consolidate interview_analyses into transcripts table and add transcript kind
type: refactor
status: active
date: 2026-04-15
ticket: CAR-145
---

# Consolidate interview_analyses into transcripts table and add transcript kind

## Overview

CareerPilot currently persists interview/conversation analysis in two parallel tables:

- `transcripts` (newer) — segments, `application_id` FK, `analysis_json`, populated by `src/transcripts/` importers
- `interview_analyses` (legacy) — free-text company/role + `transcript_file` path, populated by `InterviewCoach.save_analysis`

The `InterviewCoach` still writes to the legacy table, and `cli.py interview analyze` performs a dual-write when the source is a transcript ID. This plan retires `interview_analyses`, adds a `kind` column to `transcripts`, and teaches `InterviewCoach` to branch prompts on `kind` so recruiter prep calls produce *context for an upcoming interview* instead of a performance score.

The triggering use case is a recorded pre-interview prep call with a recruiter that currently has no natural home — storing it as a kind-tagged transcript linked to the same `application_id` as the upcoming interview lets the coach use it as context when generating the interview brief.

## Problem Frame

Two storage homes + no semantic kind means:

- The intelligence layer runs on whichever path the caller happens to pick; legacy analyses and new transcript analyses can't be compared as peers.
- There is no way to attach transcripts to every step of an application lifecycle (recruiter intro → prep → phone screen → technical → panel → debrief) because all transcripts look the same in the DB.
- The analyze prompt in `src/interviews/coach.py` assumes "grade the candidate" — wrong frame for a prep call, which should be treated as *context input*, not a performance to score.

Consolidating into one table with a `kind` column and a kind-aware coach closes all three gaps with one migration.

## Requirements Trace

- **R1.** Single source of truth for interview/conversation analysis — one table (`transcripts`), one FK to `applications`, one analysis column.
- **R2.** Canonical transcript kinds enforced at the DB layer: `recruiter_intro`, `recruiter_prep`, `phone_screen`, `technical`, `panel`, `debrief`, `mock`, `interview`.
- **R3.** `InterviewCoach` branches analysis prompts on `kind` — context-extraction path for `recruiter_intro` / `recruiter_prep` / `debrief`, performance-grading path for `phone_screen` / `technical` / `panel` / `mock` / `interview`.
- **R4.** When analyzing an interview (`phone_screen` / `technical` / `panel`), coach pulls prior context transcripts for the same `application_id` and feeds them to the prompt.
- **R5.** All legacy `interview_analyses` rows preserved in `transcripts` with `application_id = NULL`, `kind = 'interview'`, `source = 'legacy_interview_analyses'`.
- **R6.** `interview_analyses` table dropped after successful backfill.
- **R7.** All importer CLI commands accept `--kind` with validation against the canonical set; default `interview` when omitted.
- **R8.** All existing call sites of `InterviewCoach.save_analysis` / `get_all_analyses` / `get_analysis` updated to read/write the consolidated path.
- **R9.** Full test suite passes, including new migration and kind-aware analysis tests. Regression check shows no PASS→FAIL.

## Scope Boundaries

- No changes to importer source field semantics (`whisper`, `otter`, `samsung`, now plus `legacy_interview_analyses`). `source` stays = "where this row came from," and `kind` is new = "what conversation this was."
- No changes to the `transcripts` segment format, `analysis_json` shape, or `TranscriptRecord` dataclass beyond adding `kind`.
- No changes to the dashboard — grep at 2026-04-15 confirmed the dashboard does not read `interview_analyses`. Dashboard docs reference `coach.py` line numbers; those will drift and are acceptable.
- No rollback path for the migration. One-way, per user decision on the ticket.

### Deferred to Separate Tasks

- **Recruiter-prep "prep brief" dashboard surface** — v1 stores kind-aware analysis in `analysis_json` only. If a dashboard surface proves valuable, it becomes a separate ticket that reads from the consolidated `transcripts` table.
- **Mid-session kind morphing** — a call that starts as `recruiter_prep` and turns into a `phone_screen` is rare. v1 policy is one row per kind; if the user needs to represent both, they re-import or split the file. No schema support for multi-kind rows.
- **Migrating the LLM router task registry** — new prompt variants (context-extraction vs performance-grading) will reuse the existing `interview_transcript_analyze` task name in the router. If prompt telemetry later demands separate task names, that's a follow-up.

## Context & Research

### Relevant Code and Patterns

- **Schema and migration pattern**: [src/db/models.py](src/db/models.py) — `SCHEMA_SQL` embeds all `CREATE TABLE IF NOT EXISTS` DDL; `_migrate_applications` (line 223) and `_migrate_llm_calls` (line 241) use `_column_exists` + `ALTER TABLE ... ADD COLUMN` and are called from `get_connection()` (line 253). Match this pattern exactly.
- **CHECK constraint precedent**: [src/db/models.py:192,198,199](src/db/models.py#L192) — `llm_calls.provider_used` uses `CHECK(provider_used IN ('local', 'claude'))`. Same pattern will apply to `transcripts.kind`.
- **Transcript storage**: [src/transcripts/transcript_store.py](src/transcripts/transcript_store.py) — `store_transcript`, `list_transcripts`, `get_transcript`, `update_analysis`, `link_application`, `find_matching_application`. All need awareness of the new `kind` field.
- **Transcript dataclass**: [src/transcripts/transcript_parser.py](src/transcripts/transcript_parser.py) — `TranscriptRecord` is the shared model; `to_coach_turns` already bridges segments to the coach's expected format.
- **Coach**: [src/interviews/coach.py](src/interviews/coach.py) — `InterviewCoach.analyze_interview` (line 76), `compare_interviews` (line 124), `mock_interview` (line 178), `save_analysis` (line 308), `get_all_analyses` (line 336), `get_analysis` (line 352). `save_analysis` and `get_all_analyses` are the ones pointing at the legacy table.
- **LLM router**: [src/llm/router.py](src/llm/router.py) — `router.complete(task=..., prompt=...)`; coach already uses `task="interview_transcript_analyze"`, `interview_compare`, `interview_question_gen`, `interview_answer_eval`, `interview_summary`.
- **Importer CLI commands**:
  - [cli.py:2046](cli.py#L2046) `interview import-samsung`
  - [cli.py:2084](cli.py#L2084) `interview import-otter`
  - [cli.py:2100](cli.py#L2100) `interview transcribe` (whisper)
  - [cli.py:2123](cli.py#L2123) `interview watch` (folder watcher — inherits default kind)
  - All four call `store_transcript(record, application_id=app_id)` and need the `kind` argument threaded through.
- **Coach call sites to update**:
  - [cli.py:1814](cli.py#L1814) `interview analyze` — currently dual-writes via `save_analysis` + `update_analysis`
  - [cli.py:2169-2186](cli.py#L2169) — another coach caller (likely `interview compare` or list)
  - [cli.py:2278-2281](cli.py#L2278), [cli.py:2323-2326](cli.py#L2323), [cli.py:3292-3295](cli.py#L3292) — three readers of `get_all_analyses`
- **Existing tests**:
  - [tests/test_interviews.py:361-454](tests/test_interviews.py#L361) — `save_analysis` / `get_all_analyses` test coverage against the legacy table. Needs rewrite.
  - [tests/test_llm_unit6_migrations.py:86-110](tests/test_llm_unit6_migrations.py#L86) — `TestInterviewCoachMigration` — router migration test; confirm it still passes.
  - [tests/test_transcripts.py:509](tests/test_transcripts.py#L509) — patches `InterviewCoach.analyze_interview`; should be unaffected by the refactor if the method signature stays stable.

### Institutional Learnings

- `docs/solutions/` is empty at 2026-04-15. No prior compounded knowledge. This plan should produce a solution doc after `ce:work` if the migration surfaces anything worth preserving.
- Prior spec [docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md](docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md) built the current `transcripts` table and explicitly said "No changes to `InterviewCoach` needed." CAR-145 supersedes that decision — the coach needed to change once two storage paths had to converge.

### External References

- None. This is a bounded internal refactor with strong local patterns.

## Key Technical Decisions

- **One table, one column, one migration.** Add `kind TEXT NOT NULL DEFAULT 'interview'` to `transcripts` with a CHECK constraint listing the canonical values. Backfill legacy rows in the same migration. Drop the legacy table after backfill.
- **Enforce `kind` at the DB layer** via `CHECK(kind IN (...))` matching the `llm_calls.provider_used` precedent. Plus app-layer validation in the importer CLI flags for clean error messages before hitting the DB.
- **Two prompt branches, not seven.** `recruiter_intro` / `recruiter_prep` / `debrief` → *context-extraction* prompt ("what did this call reveal about the interviewer, the role, the things to drill, red flags"). `phone_screen` / `technical` / `panel` / `mock` / `interview` → existing performance-grading prompt. Adding per-kind prompts later is trivial once the branch exists.
- **Context aggregation at analysis time, not storage time.** When `analyze_interview` runs on a row whose `kind` is a performance kind, the coach queries `transcripts WHERE application_id = ? AND kind IN ('recruiter_intro','recruiter_prep','debrief') AND id != current_id` and prepends their `analysis_json` summaries (or raw text if no analysis) as context in the prompt. No new tables or denormalized fields.
- **Coach method signatures stay stable where possible.** `analyze_interview`, `compare_interviews`, `mock_interview` keep their public shapes. `save_analysis` / `get_all_analyses` / `get_analysis` get repointed at the `transcripts` table — they either rewrite or wrap the transcript_store helpers. Callers should not need signature changes, only semantic awareness.
- **Backfill is best-effort for `full_text`.** If the legacy `transcript_file` path still resolves on disk, read it. Otherwise store empty string. `analysis_json` is always preserved. `segments_json = '[]'`. `source = 'legacy_interview_analyses'`. `application_id = NULL`. `kind = 'interview'`.
- **Migration ordering.** Backfill happens *before* the `DROP TABLE interview_analyses`. Both run inside the idempotent migration function, protected by `_column_exists` / `_table_exists` checks so re-running the migration is a no-op.
- **Characterization-first for the migration unit.** Before touching `models.py`, write tests that seed a legacy `interview_analyses` table with representative rows and assert the post-migration shape. This is the only unit where getting the transformation wrong loses user data.

## Open Questions

### Resolved During Planning

- **Enforce `kind` via DB CHECK or app layer?** — Both. DB CHECK for correctness guarantee; importer CLI validation for error message quality. Matches the `llm_calls.provider_used` pattern.
- **How to handle a transcript that morphs mid-session between kinds?** — One row per kind. User splits the import if they need both. Not a v1 concern.
- **Should `recruiter_prep` analysis get a dedicated dashboard surface?** — Defer. v1 stores kind-aware analysis in `analysis_json` only. Future ticket if demand emerges.
- **Do new kind-aware prompts need new router task names?** — No. Reuse `interview_transcript_analyze`. If telemetry later wants per-kind breakdowns, rename is a one-line follow-up.
- **Does `interview watch` need a `--kind` flag?** — Yes, it should accept one and pass it to every auto-imported file in that session. Default `interview`. Matches the other importers.
- **Should the legacy `TranscriptLoader` file-path flow in [cli.py:1830](cli.py#L1830) survive?** — Yes. Preserve it alongside the importer-first path. `interview analyze <file_path>` continues to load via `TranscriptLoader`, analyzes as `kind='interview'` (the safe generic default), and does not write to `transcripts`. Users who want kind-aware analysis use `interview import-otter` / `import-samsung` / `transcribe` first (all of which now accept `--kind`), then `interview analyze <transcript_id>`. Both paths coexist; the ID path is the richer one.

### Deferred to Implementation

- **Exact SQL for the backfill SELECT/INSERT.** Depends on the final column list chosen and whether we add `imported_at` explicitly or let the default fire. Resolve during `ce:work`.
- **Exact shape of the context-extraction JSON output** — the prompt should return something like `{"topics_emphasized": [...], "interviewer_style": "...", "things_to_drill": [...], "red_flags": [...]}`. Final schema lives in the new prompt constant and can be iterated during `ce:work`.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Data flow before → after

```
BEFORE (2 paths):

  importers ─→ store_transcript ─→ transcripts (application_id, segments, analysis_json)
                                         │
                                         └─ analyze_interview → update_analysis → transcripts.analysis_json

  InterviewCoach.save_analysis ─→ interview_analyses (file path, free-text company/role)
                                         │
                                         └─ get_all_analyses ← readers in cli.py (3 sites)

AFTER (1 path):

  importers (--kind) ─→ store_transcript(kind=...) ─→ transcripts (application_id, kind, segments, analysis_json)
                                                              │
                                                              └─ analyze_interview
                                                                    │
                                                                    ├─ kind ∈ {recruiter_intro, recruiter_prep, debrief}
                                                                    │       └─ context-extraction prompt → analysis_json
                                                                    │
                                                                    └─ kind ∈ {phone_screen, technical, panel, mock, interview}
                                                                            │
                                                                            ├─ aggregate context from prior transcripts
                                                                            │   WHERE application_id = ? AND kind ∈ {context kinds}
                                                                            │
                                                                            └─ performance-grading prompt (with context) → analysis_json

  interview_analyses → (backfilled into transcripts, then dropped)
```

### Kind branching decision matrix

| `kind`            | Prompt path          | Context inputs                                    | Output shape               |
|-------------------|---------------------|---------------------------------------------------|----------------------------|
| `recruiter_intro` | Context extraction  | Just the transcript                               | Topics, interviewer style  |
| `recruiter_prep`  | Context extraction  | Just the transcript                               | Topics, things to drill    |
| `debrief`         | Context extraction  | Just the transcript                               | What went well / poorly    |
| `phone_screen`    | Performance grading | + all prior context transcripts for this app      | Score, gaps, improvements  |
| `technical`       | Performance grading | + all prior context transcripts for this app      | Score, gaps, improvements  |
| `panel`           | Performance grading | + all prior context transcripts for this app      | Score, gaps, improvements  |
| `mock`            | Performance grading | No app context (self-driven)                      | Score, gaps, improvements  |
| `interview`       | Performance grading | + any prior context transcripts if app_id set     | Score, gaps, improvements  |

## Implementation Units

- [ ] **Unit 1: Schema migration — add `kind` column, backfill legacy table, drop old table**

**Goal:** One-shot, idempotent migration that adds `kind` with a CHECK constraint, copies every `interview_analyses` row into `transcripts`, and drops the legacy table.

**Requirements:** R1, R2, R5, R6

**Dependencies:** None — this unit blocks every other unit.

**Files:**
- Modify: `src/db/models.py`
- Test: `tests/test_db_migrations_kind.py` (new)

**Approach:**
- Add `kind TEXT NOT NULL DEFAULT 'interview' CHECK(kind IN ('recruiter_intro','recruiter_prep','phone_screen','technical','panel','debrief','mock','interview'))` to the `transcripts` `CREATE TABLE` in `SCHEMA_SQL`. New DBs get the column from fresh schema.
- Add `_migrate_transcripts_kind(conn)` modeled on `_migrate_applications`: if `kind` column missing, `ALTER TABLE transcripts ADD COLUMN kind TEXT NOT NULL DEFAULT 'interview'`. SQLite does not allow adding CHECK constraints via `ALTER` — the CHECK only applies to newly created databases. For existing DBs, rely on app-layer validation and the `NOT NULL DEFAULT 'interview'` guarantee.
- Add `_backfill_interview_analyses(conn)`: check if `interview_analyses` table still exists via `sqlite_master`; if yes, read all rows and insert into `transcripts` with the backfill policy (see Key Decisions). Use one INSERT per row; small enough volumes that batching is unnecessary. Then `DROP TABLE interview_analyses`.
- Wire both new migration helpers into `get_connection()` after `_migrate_llm_calls`.

**Execution note:** Characterization-first. Write the test first with a seeded legacy table, assert the post-migration shape, then implement.

**Patterns to follow:**
- `_migrate_applications` and `_column_exists` in [src/db/models.py:217-238](src/db/models.py#L217)
- `llm_calls.provider_used` CHECK constraint at [src/db/models.py:192](src/db/models.py#L192)

**Test scenarios:**
- Happy path: fresh DB — `transcripts.kind` column exists with default `'interview'`, CHECK constraint visible in `PRAGMA table_info` / `sqlite_master`.
- Happy path: existing DB with three legacy `interview_analyses` rows (one with readable `transcript_file` path, one with missing path, one with empty `analysis_json`) migrates cleanly — all three land in `transcripts` with `application_id IS NULL`, `source = 'legacy_interview_analyses'`, `kind = 'interview'`, original `analysis_json` preserved, original `analyzed_at` preserved.
- Happy path: readable `transcript_file` contents land in `full_text`; missing file becomes empty string.
- Edge case: re-running the migration after a successful first run is a no-op (no duplicate rows, no error).
- Edge case: a DB that never had `interview_analyses` (fresh install after migration ships) passes through without error.
- Edge case: `segments_json` for backfilled rows is `'[]'` (valid JSON).
- Error path: invalid `kind` values rejected on INSERT into a fresh DB via CHECK constraint.
- Integration: after migration, `SELECT COUNT(*) FROM sqlite_master WHERE name='interview_analyses'` returns 0.

**Verification:**
- Fresh DB creation succeeds with `kind` column present.
- A seeded legacy DB migrates without data loss and ends with `interview_analyses` dropped.
- `PRAGMA integrity_check` returns `ok` post-migration.

---

- [ ] **Unit 2: TranscriptRecord and transcript_store kind support**

**Goal:** Thread `kind` through the `TranscriptRecord` dataclass, `store_transcript`, `get_transcript`, `list_transcripts`, and add a helper for querying transcripts by application + kind set.

**Requirements:** R1, R2, R4

**Dependencies:** Unit 1 (schema must have the column).

**Files:**
- Modify: `src/transcripts/transcript_parser.py`
- Modify: `src/transcripts/transcript_store.py`
- Test: `tests/test_transcripts.py` (extend existing)

**Approach:**
- Add `kind: str = 'interview'` as a new field on `TranscriptRecord` (defaulted so importers that don't set it still work).
- Define `CANONICAL_KINDS` as a module-level constant in `transcript_parser.py` so the CLI layer and coach can both import the single source of truth.
- Update `store_transcript` signature to accept `kind` from the record and include it in the INSERT. Validate `kind` against `CANONICAL_KINDS` before insert; raise `ValueError` on mismatch (belt + suspenders on top of DB CHECK).
- Update `get_transcript` to populate `kind` on the returned `TranscriptRecord`.
- Update `list_transcripts` to include `kind` in the returned dicts.
- Add new function `list_transcripts_for_application(application_id: int, kinds: Optional[Iterable[str]] = None) -> List[Dict]` — returns rows for a given app filtered by kind set. Used by the coach in Unit 3 for context aggregation.

**Patterns to follow:**
- Existing `store_transcript` / `list_transcripts` SQL style in [src/transcripts/transcript_store.py](src/transcripts/transcript_store.py)
- Try/finally `conn.close()` convention already in the module

**Test scenarios:**
- Happy path: store a record with `kind='recruiter_prep'` — row persists with that kind, `get_transcript` round-trips it, `list_transcripts` includes it.
- Happy path: store a record without specifying `kind` — defaults to `'interview'`.
- Happy path: `list_transcripts_for_application(app_id, kinds=['recruiter_prep','recruiter_intro'])` returns only matching rows for that app.
- Happy path: `list_transcripts_for_application(app_id)` with no kind filter returns all transcripts for that app.
- Edge case: `list_transcripts_for_application` for an app with zero transcripts returns empty list, not None.
- Error path: `store_transcript` with `kind='garbage'` raises `ValueError` before hitting the DB.

**Verification:**
- Existing `tests/test_transcripts.py` still passes (default kind behavior).
- New kind-aware tests pass.

---

- [ ] **Unit 3: InterviewCoach refactor — kind-aware prompts, consolidated storage, context aggregation**

**Goal:** Repoint `save_analysis` / `get_all_analyses` / `get_analysis` at `transcripts.analysis_json`; branch `analyze_interview` prompts on `kind`; pull prior context transcripts for the same application when analyzing a performance-kind transcript.

**Requirements:** R1, R3, R4, R8

**Dependencies:** Unit 1 (schema), Unit 2 (store helpers + `list_transcripts_for_application`)

**Files:**
- Modify: `src/interviews/coach.py`
- Test: `tests/test_interviews.py` (partial rewrite — legacy save_analysis tests must be replaced)

**Approach:**
- Add a second prompt constant `CONTEXT_EXTRACTION_PROMPT` to `coach.py` modeled on the existing analyze prompt but reframed: "extract signal about the upcoming interview — topics emphasized, interviewer style, things to drill, red flags."
- Extend `analyze_interview` signature with an optional `kind: str` parameter defaulting to `'interview'`. When `kind` is in `{recruiter_intro, recruiter_prep, debrief}`, use `CONTEXT_EXTRACTION_PROMPT`; otherwise use the existing analyze path.
- Add a new optional `application_id: Optional[int] = None` parameter. When supplied AND kind is a performance kind, call `list_transcripts_for_application(application_id, kinds=['recruiter_intro','recruiter_prep','debrief'])`, extract each row's `analysis_json` (or `full_text` fallback), and prepend a "Prior context from earlier transcripts for this application:" block to the analyze prompt. Guard with a context-size limit (e.g., truncate combined context to ~10k chars) to avoid blowing the 30k prompt cap in the existing router call.
- Replace `save_analysis(transcript_file, analysis, company, role)` with `save_analysis(transcript_id: int, analysis: Dict)` — writes to `transcripts.analysis_json` via `update_analysis`. Old positional signature is a breaking change; callers in Unit 5 get updated to match.
- Replace `get_all_analyses()` to query `SELECT id, application_id, kind, analysis_json, analyzed_at FROM transcripts WHERE analysis_json IS NOT NULL ORDER BY analyzed_at DESC`, returning the existing dict shape with `'analysis'` parsed from JSON. Join `applications` for `company` / `role` display fields.
- Replace `get_analysis(analysis_id)` similarly — keyed by `transcripts.id` now.
- Delete every reference to `interview_analyses` SQL inside `coach.py`.

**Execution note:** Test-first. Write the kind-branching test before implementing the prompt split, and the context-aggregation test before implementing the query.

**Patterns to follow:**
- Existing prompt constants and router call shape in [src/interviews/coach.py:16-61](src/interviews/coach.py#L16)
- Existing try/finally connection management in `transcript_store.py`

**Test scenarios:**
- Happy path: `analyze_interview(turns, kind='recruiter_prep')` — assert the router was called with the context-extraction prompt text (mock `router.complete`).
- Happy path: `analyze_interview(turns, kind='technical', application_id=5)` with prior recruiter_prep transcripts on app 5 — assert the prompt text includes the "Prior context" block with the prep call's analysis_json summary.
- Happy path: `analyze_interview(turns, kind='mock')` — uses performance path, does NOT query for context (mock is self-driven).
- Happy path: `analyze_interview(turns)` with no kind — defaults to `'interview'`, uses performance path, no context query when `application_id` is None.
- Happy path: `save_analysis(transcript_id=42, analysis={...})` writes `analysis_json` and `analyzed_at` on `transcripts.id=42`; readable via `get_analysis(42)`.
- Happy path: `get_all_analyses()` returns all transcripts with non-null `analysis_json`, newest first, joined with applications for company/role display.
- Edge case: `analyze_interview(turns, kind='technical', application_id=99)` where app 99 has no prior context transcripts — prompt omits the context block entirely, does not crash.
- Edge case: combined prior context exceeds the 10k character limit — truncated cleanly with an ellipsis or "[...]" marker.
- Error path: `analyze_interview(turns, kind='garbage')` raises `ValueError` before calling the router.
- Error path: `save_analysis` on a non-existent `transcript_id` raises or logs clearly without corrupting the table.
- Integration: after `analyze_interview` + `save_analysis`, a follow-up `get_analysis` returns the same shape that `compare_interviews` expects (regression for `compare_interviews` consumers).

**Verification:**
- All `tests/test_interviews.py` tests pass after rewrite.
- `tests/test_transcripts.py:509` (patches `analyze_interview`) still passes — signature change was additive, defaults preserve old behavior.

---

- [ ] **Unit 4: CLI importer `--kind` flag**

**Goal:** Add `--kind` to `interview import-samsung`, `interview import-otter`, `interview transcribe`, and `interview watch` with app-layer validation and sensible default.

**Requirements:** R7

**Dependencies:** Unit 2 (TranscriptRecord has `kind`, `store_transcript` accepts it, `CANONICAL_KINDS` exported).

**Files:**
- Modify: `cli.py` (four command functions at [cli.py:2046](cli.py#L2046), [cli.py:2084](cli.py#L2084), [cli.py:2100](cli.py#L2100), [cli.py:2123](cli.py#L2123))
- Test: `tests/test_cli_interview_kind.py` (new, using click's `CliRunner`)

**Approach:**
- Add `@click.option("--kind", type=click.Choice(CANONICAL_KINDS), default="interview", help="Transcript kind (recruiter_prep, technical, etc.)")` to each importer command. Click's `Choice` type gives free validation and a clean error message.
- After importing the record, set `record.kind = kind` before calling `store_transcript(record, application_id=app_id)`.
- For `interview watch`, add the flag and pass it through to `watch(model_size=model, kind=kind)`. Update `src/transcripts/watch_folder.py` watch function signature to accept and forward `kind` to `store_transcript` calls.
- Surface the chosen kind in the "Saved as transcript #X" output line for user confirmation: `Saved as transcript #12 (kind: recruiter_prep)`.

**Patterns to follow:**
- Existing click option usage in the same commands
- Existing `console.print` green-success message style

**Test scenarios:**
- Happy path: `interview import-otter <file> --kind recruiter_prep` stores the transcript with the right kind (verify via `get_transcript` in the test).
- Happy path: `interview import-samsung <file>` with no `--kind` defaults to `interview`.
- Happy path: `interview transcribe <audio> --kind technical` stores with the right kind.
- Error path: `interview import-otter <file> --kind garbage` exits non-zero with click's `Choice` error message.
- Integration: the chosen kind surfaces in the "Saved as transcript" confirmation output.

**Verification:**
- Each importer command accepts the flag and the stored row has the expected kind.
- Invalid kind values are rejected before hitting `store_transcript`.

---

- [ ] **Unit 5: Update CLI callers — collapse dual-write, update readers, handle analyze's kind awareness**

**Goal:** Every `cli.py` call site of `InterviewCoach` either uses the new signatures or is verified to still work after the coach refactor.

**Requirements:** R1, R8

**Dependencies:** Unit 3 (coach has new signatures).

**Files:**
- Modify: `cli.py` — [cli.py:1808-1872](cli.py#L1808) (`interview analyze`), [cli.py:2169-2186](cli.py#L2169), [cli.py:2278-2281](cli.py#L2278), [cli.py:2323-2326](cli.py#L2323), [cli.py:3292-3295](cli.py#L3292)
- Test: `tests/test_cli_interview_analyze_kind.py` (new, focused on the analyze flow)

**Approach:**
- In `interview analyze`:
  - **Transcript ID path** (source is a digit): add `--kind` option that defaults to the transcript's stored kind (read via `get_transcript`). Pass `kind` and the transcript's `application_id` to `coach.analyze_interview`. Collapse the dual-write: call `coach.save_analysis(transcript_id=..., analysis=...)` which now writes to `transcripts.analysis_json` directly. Remove the separate `update_analysis` call — they were writing to the same row anyway, now there's only one path.
  - **File path flow preserved** (source is a file path): keep the existing `TranscriptLoader` branch unchanged in shape. Force `kind='interview'` (generic default), do NOT write to `transcripts`, do NOT attempt context aggregation (no `application_id` available). Print a hint suggesting `interview import-otter` / `import-samsung` / `transcribe` as the richer alternative for kind-aware analysis. This preserves existing user workflows while making the importer path the better one.
- For the other four coach call sites: audit each, update to the new `get_all_analyses` return shape (now joined with applications). If the returned dict keys are different, update the consumer display logic. Expect minor tweaks, not rewrites.
- For [cli.py:3292](cli.py#L3292) (likely the dashboard brief generator or similar reader), confirm it still works by running it manually during `ce:work`.

**Patterns to follow:**
- Existing click option style in the same file
- The current dual-write pattern is the thing being removed, not copied

**Test scenarios:**
- Happy path: `interview analyze <transcript_id>` on a transcript with `kind='recruiter_prep'` triggers the context-extraction prompt path and writes result to `transcripts.analysis_json`.
- Happy path: `interview analyze <transcript_id>` on a `kind='technical'` transcript with an app_id triggers the performance path with context aggregation from prior recruiter_prep/recruiter_intro/debrief transcripts on the same app.
- Happy path: `interview analyze <file_path>` (file-path flow) loads via `TranscriptLoader`, analyzes as `kind='interview'`, displays results without writing to `transcripts`, and prints the import-first hint.
- Happy path: `interview analyze <transcript_id> --kind panel` explicit override takes precedence over the transcript's stored kind.
- Happy path: readers at lines 2278, 2323, 3292 still display their expected output with the new `get_all_analyses` shape.
- Error path: `interview analyze 999` on a non-existent ID exits cleanly with the existing red error message.
- Integration: after a `kind='recruiter_prep'` analyze, a subsequent `kind='technical'` analyze on the same application picks up the prep call's `analysis_json` in its prompt context (verify via mocked router capture).

**Verification:**
- `interview analyze` on a real prep-call transcript produces context-extraction output, not a performance score.
- All three readers render without KeyError or AttributeError.

---

- [ ] **Unit 6: Delete `InterviewCoach` legacy tests and retire `TestInterviewCoachMigration`**

**Goal:** Remove or rewrite `tests/test_interviews.py` cases that only exercise the legacy table, and audit `tests/test_llm_unit6_migrations.py::TestInterviewCoachMigration` for relevance.

**Requirements:** R9

**Dependencies:** Units 1, 3.

**Files:**
- Modify: `tests/test_interviews.py`
- Modify: `tests/test_llm_unit6_migrations.py`

**Approach:**
- Walk each test in `tests/test_interviews.py` that touches `save_analysis`, `get_all_analyses`, or `get_analysis`. For each: either rewrite it to use `transcripts.analysis_json` via the new signatures (keeps the test's intent), or delete if Unit 3's new test suite already covers the same behavior.
- Specifically: [tests/test_interviews.py:361-454](tests/test_interviews.py#L361) has 4+ tests exercising `save_analysis`. Most map cleanly onto new-signature tests. Preserve the assertions, swap the setup.
- `tests/test_llm_unit6_migrations.py::TestInterviewCoachMigration` — the name suggests it tests router migration behavior on the coach, which should still work. Run it; if it passes, leave it. If it breaks because it assumed the legacy table, update to use the consolidated path.
- Remove any fixtures that create `interview_analyses` seed data.

**Test scenarios:**
- None — this unit is test code hygiene, not new behavior. Verification is "full test suite passes."

**Verification:**
- `python -m pytest tests/` passes end to end.
- No test references `interview_analyses` directly.
- `regression-check` skill reports no PASS→FAIL transitions.

## System-Wide Impact

- **Interaction graph:** The `interview analyze` command currently dual-writes to two tables. Collapsing it is the highest-risk surface — if Unit 5 misses a caller, the analysis either lands in the wrong place or nowhere.
- **Error propagation:** Importer `--kind` validation happens at the click layer (best error messages), then again at the store layer (`ValueError`), then again at the DB layer (CHECK on new DBs). Three layers of defense; users see the click error first in practice.
- **State lifecycle risks:** The migration is destructive (drops `interview_analyses`). Re-running is idempotent because the backfill checks for the table's existence via `sqlite_master` before copying, and after one successful run there is nothing to copy. But if the backfill crashes mid-flight, some rows may be in `transcripts` and the legacy table may still exist — a re-run resumes cleanly because the inserts are new rows and the `DROP` is gated on the existence check. Tests must cover the interrupted-migration case.
- **API surface parity:** The coach's public methods (`analyze_interview`, `save_analysis`, `get_all_analyses`, `get_analysis`) all change. Every caller in `cli.py` and `tests/` is audited in Units 5-6. The `compare_interviews` and `mock_interview` methods are unchanged externally but `compare_interviews` consumes `get_all_analyses` internally so it picks up the new dict shape automatically.
- **Integration coverage:** Unit 3 includes an integration scenario asserting `compare_interviews` still works after the shape change. Unit 5's reader audits cover the three `get_all_analyses` readers.
- **Unchanged invariants:** `TranscriptRecord.segments` format stays the same. `analysis_json` internal structure stays the same for performance-kind transcripts (same keys the existing `_display_analysis` function reads). The router task name `interview_transcript_analyze` stays the same — the *prompt* changes based on kind but the task contract is unchanged. Dashboard code is untouched.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Migration loses legacy analysis data | Unit 1 is characterization-first — test seeds legacy rows, asserts post-migration shape, *then* implements. Backfill preserves `analysis_json` verbatim. |
| Interrupted migration leaves DB in half-migrated state | Both migration steps are idempotent. Legacy table drop is gated on post-copy check. Test covers the interrupted-then-resumed case. |
| `compare_interviews` breaks because `get_all_analyses` returns a different dict shape | Explicit integration test in Unit 3 seeds analyses, runs `compare_interviews`, asserts output. |
| `interview analyze` file-path flow regresses | File-path flow preserved with forced `kind='interview'` and a warning. Final resolution happens when touching Unit 5 (see deferred question). |
| Context aggregation blows the 30k prompt cap for performance-kind analyses with many prior context transcripts | Unit 3 enforces a 10k character truncation on the aggregated context block before prepending. Test case exercises this. |
| Dashboard docs referencing `coach.py` line numbers go stale | Acceptable — they're docs, not code. Leave a note in the `ce:compound` entry after merge. |
| CHECK constraint not enforced on pre-existing DBs (SQLite limitation) | App-layer validation in `store_transcript` and click `Choice` is the actual enforcement. DB CHECK is belt for fresh installs. |

## Documentation / Operational Notes

- After merge, update [docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md](docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md) to note that the "No changes to `InterviewCoach` needed" assertion has been superseded by CAR-145.
- Add a `docs/solutions/` entry via `ce:compound` summarizing: two-table-drift pattern, how the consolidated schema solved it, and the kind-branching pattern for future similar refactors.
- `dashboard/docs/api-cost-audit.md` references specific line numbers in `coach.py` that will drift. No action needed — accept the drift.

## Sources & References

- **Ticket:** [CAR-145](https://jlfowler1084.atlassian.net/browse/CAR-145)
- Related code: [src/interviews/coach.py](src/interviews/coach.py), [src/transcripts/transcript_store.py](src/transcripts/transcript_store.py), [src/db/models.py](src/db/models.py), [cli.py](cli.py)
- Prior plan (superseded in scope): [docs/superpowers/plans/2026-03-25-transcript-pipeline.md](docs/superpowers/plans/2026-03-25-transcript-pipeline.md)
- Prior spec (partially superseded): [docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md](docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md)
