---
title: Two-Table Drift Consolidation and Kind Column Pattern
date: 2026-04-15
category: docs/solutions/workflow-issues/
module: interview
problem_type: workflow_issue
component: database
severity: medium
related_components:
  - tooling
  - assistant
applies_when:
  - "A CLI app has two parallel storage tables serving the same conceptual entity"
  - "An analysis component needs to distinguish between session types but has no discriminator column"
  - "Legacy table rows must be migrated into a unified table without lossy FK resolution"
  - "SQLite CHECK constraints cannot be added to existing tables via ALTER TABLE"
root_cause: logic_error
resolution_type: migration
tags:
  - sqlite-migration
  - schema-consolidation
  - transcript-kind
  - dual-table
  - backfill
  - prompt-routing
  - canonical-enum
  - interview-coach
---

# Two-Table Drift Consolidation and Kind Column Pattern

## Context

CareerPilot accumulated two parallel SQLite tables representing the same conceptual entity — interview/conversation transcripts:

- `transcripts` (newer, importer-driven): structured segments, `application_id` FK, `analysis_json`, `source` field
- `interview_analyses` (legacy, coach-driven): keyed by file path + free-text `company`/`role` strings, no FK to `applications`

The drift caused three concrete problems:
1. `InterviewCoach` still wrote analyses to the legacy table, so `interview analyze` results were siloed from the transcript pipeline
2. All transcript kinds (recruiter intro calls, phone screens, technical rounds) were fed to the same performance-grading prompt — recruiter prep calls scored as if they were technical interviews
3. No way to aggregate prior context (recruiter calls, debrief notes) when analyzing a performance interview, because kind wasn't modeled

The fix required three coordinated changes: consolidate storage to one table via idempotent migration, add a `kind` column to model the semantic type, and branch `InterviewCoach` behavior based on kind.

Solved in CAR-145. The original transcript pipeline spec (`docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md`) is a historical reference — it predates `interview_analyses` and the `kind` column. `update_analysis()` referenced in that spec is the deprecated predecessor of `save_analysis(transcript_id, analysis)`.

## Guidance

### 1. SQLite Idempotent Migration Pattern

SQLite does not support `ADD COLUMN IF NOT EXISTS`. Always guard `ALTER TABLE` with an existence check:

```python
# src/db/models.py
import sqlite3

def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cursor = conn.execute(f"PRAGMA table_info({table})")
    return any(row["name"] == column for row in cursor.fetchall())

def _migrate_transcripts_kind(conn: sqlite3.Connection) -> None:
    if not _column_exists(conn, "transcripts", "kind"):
        conn.execute(
            "ALTER TABLE transcripts ADD COLUMN kind TEXT NOT NULL DEFAULT 'interview'"
        )
    conn.commit()
```

Call this inside `get_connection()` after other migrations, before the rest of the application runs.

**CHECK constraints cannot be added via `ALTER TABLE` in SQLite.** Add the constraint only in the `CREATE TABLE` statement (for fresh databases):

```sql
-- In CREATE TABLE (fresh DB only)
kind TEXT NOT NULL DEFAULT 'interview' CHECK(kind IN (
    'recruiter_intro', 'recruiter_prep', 'phone_screen', 'technical',
    'panel', 'debrief', 'mock', 'interview'
))
```

For existing databases that received the column via `ALTER TABLE`, enforce at the application layer:

```python
# src/transcripts/transcript_store.py

def store_transcript(record: TranscriptRecord, db_path: Optional[Path] = None) -> int:
    if record.kind not in CANONICAL_KINDS:
        raise ValueError(
            f"Invalid transcript kind {record.kind!r}. Must be one of: {CANONICAL_KINDS}"
        )
    # ... insert logic ...
```

This gives the same safety guarantee without requiring a full table rebuild.

### 2. Legacy Table Backfill and Drop

Write the migration as an idempotent function — check for the legacy table's existence first:

```python
# src/db/models.py
import logging

def _backfill_interview_analyses(conn: sqlite3.Connection) -> None:
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='interview_analyses'"
    )
    if not cur.fetchone():
        return  # already migrated, nothing to do

    rows = conn.execute("SELECT * FROM interview_analyses").fetchall()
    for row in rows:
        try:
            full_text = Path(row["transcript_file"]).read_text(
                encoding="utf-8", errors="replace"
            ) if row["transcript_file"] else ""
        except OSError:
            logging.warning("Backfill: transcript file not found, skipping content: %s",
                            row["transcript_file"])
            full_text = ""

        # Only four columns carry real data from the legacy table;
        # the rest are defaults required by the NOT NULL schema.
        conn.execute("""
            INSERT OR IGNORE INTO transcripts
            (source, segments_json, full_text, duration_seconds, language, audio_path,
             raw_metadata_json, analysis_json, analyzed_at, application_id, kind)
            VALUES ('legacy_interview_analyses', '[]', ?, 0.0, 'en', NULL, '{}', ?, ?, NULL, 'interview')
        """, (full_text, row["analysis_json"], row["analyzed_at"]))

    conn.execute("DROP TABLE interview_analyses")
    conn.commit()
```

Key decisions embedded in this pattern:
- `application_id = NULL` on backfill — the legacy table used free-text `company`/`role` with no FK. Lossy fuzzy matching against `applications` produces phantom links that are worse than NULL.
- `source = 'legacy_interview_analyses'` — a permanent audit marker. Future queries can identify migrated rows with `WHERE source = 'legacy_interview_analyses'`.
- `INSERT OR IGNORE` — idempotent; prevents duplicate rows if called twice. Requires a unique constraint or natural key on the target table to trigger the `IGNORE`.
- File contents read best-effort — the legacy table stored a file path, not content. Files may have been deleted. `errors="replace"` handles encoding issues; `OSError` catch handles missing files. An empty `full_text` is better than aborting the migration.

### 3. CANONICAL_KINDS in a Leaf Module

Define canonical kind values as a tuple constant in a **leaf module** — one with no heavyweight imports and no risk of circular dependencies:

```python
# src/transcripts/transcript_parser.py

CANONICAL_KINDS = (
    "recruiter_intro",
    "recruiter_prep",
    "phone_screen",
    "technical",
    "panel",
    "debrief",
    "mock",
    "interview",   # generic fallback / backward-compatible default
)

@dataclass
class TranscriptRecord:
    # ... existing fields ...
    kind: str = "interview"   # backward-compatible default
```

**Why `transcript_parser.py` and not `models.py`:**

`click.Choice(CANONICAL_KINDS)` is evaluated at decoration time — when the CLI module is first imported. If `CANONICAL_KINDS` lives in `models.py`, the CLI import chain triggers a DB module import at load time, causing circular imports. `transcript_parser.py` is a leaf module (parses Otter/Whisper output into `TranscriptRecord`) with no imports from `models.py`, `coach.py`, or `cli.py`. Safe to import from anywhere.

Rule: **shared vocabulary constants belong in the lowest-level module that needs them, not the highest.**

### 4. Kind-Aware Coach Dispatch

Group kinds into semantic buckets using frozensets, then branch on them:

```python
# src/interviews/coach.py

from src.transcripts.transcript_parser import CANONICAL_KINDS

_CONTEXT_KINDS = frozenset({"recruiter_intro", "recruiter_prep", "debrief"})
_PERFORMANCE_KINDS = frozenset({"phone_screen", "technical", "panel", "mock", "interview"})

def analyze_interview(
    self,
    transcript: str,
    kind: str = "interview",
    application_id: Optional[int] = None,
) -> Dict[str, Any]:
    if kind not in CANONICAL_KINDS:
        raise ValueError(f"Invalid kind {kind!r}")

    if kind in _CONTEXT_KINDS:
        # Context extraction: topics emphasized, interviewer style, things to drill, logistics
        return self.router.complete(
            model=...,
            prompt=CONTEXT_EXTRACTION_PROMPT + transcript,
        )
    else:
        # Performance grading: STAR scoring, technical depth, communication
        context = ""
        if application_id and kind != "mock":
            context = self._build_prior_context(application_id)
        return self.router.complete(
            model=...,
            prompt=PERFORMANCE_PROMPT + context + transcript,
        )
```

Mock interviews are excluded from prior-context injection (`kind != "mock"`) — a mock is a standalone practice session unrelated to a specific application pipeline.

### 5. Prior Context Aggregation

```python
_MAX_CONTEXT_CHARS = 10_000  # ~2500 tokens; safe headroom below 30k prompt cap

def _build_prior_context(self, application_id: int) -> str:
    """Pull prior context-kind transcripts for the same application."""
    rows = list_transcripts_for_application(
        application_id,
        kinds=list(_CONTEXT_KINDS),
        db_path=self.db_path,
    )
    if not rows:
        return ""

    combined = "\n\n".join(r.full_text for r in rows if r.full_text)
    if len(combined) > _MAX_CONTEXT_CHARS:
        combined = combined[:_MAX_CONTEXT_CHARS] + "...[truncated]"

    return (
        f"Prior context from earlier transcripts for this application:\n"
        f"{combined}\n\n"
    )
```

This requires `list_transcripts_for_application()` in `transcript_store.py` to accept a `kinds` filter:

```python
def list_transcripts_for_application(
    application_id: int,
    kinds: Optional[List[str]] = None,
    db_path: Optional[Path] = None,
) -> List[TranscriptRecord]:
    conn = get_connection(db_path)
    if kinds:
        placeholders = ",".join("?" * len(kinds))
        rows = conn.execute(
            f"SELECT * FROM transcripts WHERE application_id = ? AND kind IN ({placeholders})"
            " ORDER BY analyzed_at ASC",
            (application_id, *kinds),  # tuple unpacking — safer than [id] + list
        ).fetchall()
    return [_row_to_record(r) for r in rows]
```

When `kinds` is `None` or empty the caller (coach) always passes `list(_CONTEXT_KINDS)`, so only the filtered path matters here.

### 6. Collapsing Dual-Write

**Before:**
```python
# Two writes: legacy table + transcript table (often failed silently)
coach.save_analysis(
    transcript_file="data/2024-03-15.txt",
    analysis=analysis,
    company="Acme Corp",
    role="Senior SWE",
)
```

**After:**
```python
# Single write to canonical table
coach.save_analysis(transcript_id=t_id, analysis=analysis)
```

The new `save_analysis` signature:
```python
def save_analysis(self, transcript_id: int, analysis: Dict) -> None:
    """Persist analysis_json to the canonical transcripts row."""
    self._update_analysis(transcript_id, analysis)
```

### 7. CLI Kind Flag

Import `CANONICAL_KINDS` at the top of `cli.py` (not inside a function — evaluated at module load during decoration):

```python
# cli.py — top of file, alongside other imports
# noqa: E402 only needed if the import must appear after a module-level click.group()
# definition; restructure the file to keep all imports at the top when possible.
from src.transcripts.transcript_parser import CANONICAL_KINDS

@interview.command("import-otter")
@click.argument("file_path")
@click.option(
    "--kind",
    type=click.Choice(CANONICAL_KINDS),
    default="interview",
    help="Transcript kind (default: interview)",
)
def interview_import_otter(file_path: str, kind: str) -> None:
    record = import_otter(file_path)
    record.kind = kind
    t_id = store_transcript(record, db_path=get_db_path())
    click.echo(f"Stored transcript #{t_id} (kind: {kind})")
```

`click.Choice` provides tab completion and error messaging automatically. The `"interview"` default preserves backward compatibility for existing scripts.

## Why This Matters

**Table drift is a silent correctness bug.** Two tables for the same entity don't fail loudly — writes succeed, reads succeed, but downstream logic silently operates on a partial view. In this case `interview analyze` results were invisible to the transcript pipeline for months.

**Kind columns prevent prompt misrouting.** Without a kind field, the coach can't distinguish "extract interviewer signals from this recruiter call" from "grade STAR responses in this technical panel." Feeding context calls to a performance prompt produces noise or misleading scores.

**Idempotent migrations are a prerequisite for safe iteration.** A migration that can't be re-run safely forces manual DB surgery when something goes wrong mid-run.

**Prior context aggregation is the architectural payoff.** Once kind is modeled and storage is consolidated, performance interviews can be enriched with what was learned in earlier recruiter calls — the interviewer's stated priorities, the technical stack emphasis, the role's actual scope.

## When to Apply

Apply this pattern when:
- Two or more tables hold rows representing the same domain entity (same noun, different origin paths)
- A pipeline entity needs semantic type branching (same noun, different behavior by subtype)
- A legacy table was keyed by free-text strings with no FK to parent entities
- A CLI flag needs to constrain to a fixed vocabulary also used in DB validation

Do not apply when:
- The two tables genuinely model different entities that happen to share structure (e.g., `interview_feedback` vs `recruiter_notes` are not the same thing)
- The kind vocabulary is expected to grow beyond ~10 values frequently — consider a `transcript_kinds` lookup table rather than a hardcoded tuple + CHECK constraint

## Examples

### Detecting Table Drift

Signs that two tables are modeling the same entity:
- Both have a `text`/`content`/`transcript` column
- One has a FK to a parent entity, the other uses free-text `company`/`role` strings
- One is written by an importer module, the other by an analysis/coach module
- Queries for "all items related to X" require a UNION across both tables

### Before/After: Schema

**Before (two tables, dual-write, no kind):**
```
transcripts:           id, source, segments_json, full_text, analysis_json, application_id
interview_analyses:    id, transcript_file, company, role, analysis_json, analyzed_at
```

**After (one table, single write, kind column):**
```
transcripts:   id, source, segments_json, full_text, analysis_json, application_id,
               kind CHECK(kind IN ('recruiter_intro', 'recruiter_prep', 'phone_screen',
                                   'technical', 'panel', 'debrief', 'mock', 'interview'))
```

### Before/After: CANONICAL_KINDS Import

```python
# Wrong — importing from models.py causes circular import at CLI decoration time
# (click.Choice() is evaluated at module load, before any function is called)
from src.db.models import CANONICAL_KINDS   # DON'T DO THIS

# Correct — leaf module, safe to import anywhere
from src.transcripts.transcript_parser import CANONICAL_KINDS
```

### Before/After: Coach Call Site

```python
# Before — caller provides file path + free-text company/role; writes to legacy table
analysis = coach.analyze_interview(transcript_text)
coach.save_analysis(
    transcript_file="data/2024-03-15.txt", analysis=analysis,
    company="Acme Corp", role="Senior SWE"
)

# After — caller provides kind and transcript_id; writes to canonical table
analysis = coach.analyze_interview(transcript_text, kind="technical", application_id=42)
coach.save_analysis(transcript_id=t_id, analysis=analysis)
```

## Related

- CAR-145: original ticket and implementation
- `docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md` — historical pipeline spec (predates `kind` column and `interview_analyses` table; treat as historical reference, not authoritative current API)
- `src/db/models.py` — `_migrate_transcripts_kind`, `_backfill_interview_analyses`
- `src/transcripts/transcript_parser.py` — `CANONICAL_KINDS`, `TranscriptRecord.kind`
- `src/transcripts/transcript_store.py` — `store_transcript`, `list_transcripts_for_application`
- `src/interviews/coach.py` — `analyze_interview`, `_build_prior_context`, `save_analysis`
