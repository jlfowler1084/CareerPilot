# SCRUM-102: Interview Transcription Pipeline (CLI)

**Date:** 2026-03-25
**Status:** Approved — **superseded in part by CAR-145 (2026-04-15)**
**Scope:** Python CLI only (dashboard upload deferred to follow-on spec)

> **Historical reference.** CAR-145 added a `kind` column to `transcripts`, backfilled and dropped the `interview_analyses` table, and replaced `update_analysis()` with `save_analysis(transcript_id, analysis)`. The current canonical patterns are documented in [`docs/solutions/workflow-issues/transcripts-kind-consolidation-2026-04-15.md`](../solutions/workflow-issues/transcripts-kind-consolidation-2026-04-15.md).

## Overview

Three-tier interview recording import pipeline for the CareerPilot CLI:
- Tier 1: Samsung Galaxy native call recording + Voice Recorder exports
- Tier 2: Otter.ai TXT/SRT transcript exports
- Tier 3: Local Whisper transcription via faster-whisper

All tiers produce a unified `TranscriptRecord` stored in a new SQLite `transcripts` table. Transcripts can be linked to applications and analyzed via the existing `InterviewCoach`.

## Data Model

All modules use `from __future__ import annotations` and `typing` imports for Python 3.8 compat.

### TranscriptSegment

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional

@dataclass
class TranscriptSegment:
    speaker: str          # "Speaker 1", "You", "Interviewer", etc.
    text: str
    start_time: float     # seconds from start
    end_time: float       # seconds from start
```

### TranscriptRecord

```python
@dataclass
class TranscriptRecord:
    source: str                        # "samsung", "otter", "whisper"
    segments: List[TranscriptSegment]
    full_text: str                     # concatenated plain text
    duration_seconds: float
    language: str                      # "en" default
    audio_path: Optional[str]          # path to audio file
    raw_metadata: Dict                 # source-specific metadata
    id: Optional[int] = None           # set after storage/retrieval
```

### SQLite Table: `transcripts`

```sql
CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    full_text TEXT NOT NULL,
    segments_json TEXT NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en',
    audio_path TEXT,
    raw_metadata TEXT NOT NULL DEFAULT '{}',
    application_id INTEGER REFERENCES applications(id),
    analyzed_at TEXT,
    analysis_json TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The `transcripts` CREATE TABLE statement is appended to the `SCHEMA_SQL` constant in `src/db/models.py`, which is executed by `get_connection()` via `executescript()`. `imported_at` defaults at insert time via SQLite `datetime('now')`.

## Module: `src/transcripts/`

### `transcript_parser.py` — Data Classes

Defines `TranscriptSegment` and `TranscriptRecord` dataclasses. Pure data, no I/O.

Helper: `to_coach_turns(record: TranscriptRecord) -> List[Dict]` — bridges to the format `InterviewCoach.analyze_interview()` expects:
```python
[{"speaker": segment.speaker, "text": segment.text, "timestamp": format_timestamp(segment.start_time)}]
```

### `samsung_importer.py` — Samsung Import

**Input:** File path (transcript .txt) or directory path (audio + transcript pair).

**Samsung transcript format** (heuristic parsing, varies by One UI version):
- Lines starting with `Speaker N:` or `Name:` = speaker label
- Timestamps in `HH:MM:SS`, `MM:SS`, or `[M:SS]` format
- If no speaker labels detected, treat entire text as single-speaker transcript

**Flow:**
1. If path is a directory: look for `.txt` file (transcript) and `.m4a`/`.3gp` file (audio)
2. If path is a file: parse it as transcript text
3. Parse speaker labels + timestamps using regex heuristics
4. If audio file found in same directory, attach as `audio_path`
5. If only audio found (no transcript text file): return `TranscriptRecord` with empty segments and a flag in `raw_metadata: {"needs_whisper": True}` — caller routes to Whisper

**Function:** `import_samsung(path: str) -> TranscriptRecord`

### `otter_importer.py` — Otter.ai Import

**Input:** File path (.txt or .srt export from Otter.ai).

**Otter TXT format:**
```
Speaker 1  0:00
Hello, thanks for calling about the systems engineer position.

Speaker 2  0:05
Hi, yes, I'm Joe Fowler, thanks for taking the time.
```

**SRT format:** Standard subtitle format with sequential numbering, `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamps.

**Flow:**
1. Detect format by content: SRT has numeric indices + `-->` arrows; TXT has speaker labels + simple timestamps
2. Parse into segments with speaker labels and timestamps
3. Extract speaker names when available (Otter sometimes uses real names vs "Speaker N")

**Function:** `import_otter(path: str) -> TranscriptRecord`

### `whisper_transcriber.py` — Local Whisper

**Dependency:** `faster-whisper` (CTranslate2 backend). Not in requirements.txt — optional install.

**Input:** Audio file path (.m4a, .mp3, .wav, .ogg, .webm, .3gp).

**Flow:**
1. Check `faster-whisper` is importable. If not, print install instructions and raise `RuntimeError`.
2. Load model: `WhisperModel(model_size, device="cpu", compute_type="int8")`
3. Transcribe: `model.transcribe(audio_path, beam_size=5)`
4. Build `TranscriptRecord` from segments with word-level timestamps
5. Set `language` from detected language info

**Function:** `transcribe(audio_path: str, model_size: str = "base") -> TranscriptRecord`

Supported model sizes: tiny, base, small, medium, large-v3, turbo.

### `transcript_store.py` — SQLite Storage

Uses the existing `src/db/models.py` connection pattern (`models.get_connection(db_path)`).

**Functions** (all use `typing` types for 3.8 compat):
- `store_transcript(record: TranscriptRecord, application_id: Optional[int] = None, db_path: Optional[Path] = None) -> int`
  - Inserts into `transcripts` table
  - `imported_at` defaults via SQLite `datetime('now')` — not passed manually
  - Returns row id
- `list_transcripts(db_path: Optional[Path] = None) -> List[Dict]`
  - Returns all transcripts with summary info (id, source, duration, application_id, first 80 chars of text, imported_at)
  - SQL: `SELECT t.*, a.company, a.title FROM transcripts t LEFT JOIN applications a ON t.application_id = a.id ORDER BY t.imported_at DESC`
- `get_transcript(transcript_id: int, db_path: Optional[Path] = None) -> Optional[TranscriptRecord]`
  - Retrieves and reconstructs a `TranscriptRecord` from the stored row, with `id` field populated
- `update_analysis(transcript_id: int, analysis: Dict, db_path: Optional[Path] = None) -> None`
  - Stores Claude analysis results on the transcript row (sets `analysis_json` and `analyzed_at`)
- `link_application(transcript_id: int, application_id: int, db_path: Optional[Path] = None) -> None`
  - Sets `application_id` on an existing transcript

**Auto-match helper:** `find_matching_application(text: str, db_path: Optional[Path] = None) -> Optional[int]`
- Searches `applications` table for company or title names mentioned in the transcript text
- Uses case-insensitive matching: `WHERE LOWER(full_text) LIKE '%' || LOWER(company) || '%'`
- Returns the best match application_id, or None

### `watch_folder.py` — Filesystem Watcher

Watches `data/transcripts/` for new files on a polling interval (2 seconds).

**Flow:**
1. Scan directory for files not in `data/transcripts/processed/`
2. Classify by extension and content:
   - `.srt` → Otter SRT parser (SRT files always contain `-->` arrow timestamps)
   - `.txt` → content-based disambiguation:
     - If file contains lines matching `Speaker N  M:SS` (speaker label + two-or-more spaces + simple timestamp on same line) → Otter TXT parser
     - Otherwise → Samsung parser (handles `Speaker N:` colon-separated labels, `[HH:MM:SS]` bracket timestamps, or unlabeled text)
   - `.m4a` / `.mp3` / `.wav` / `.ogg` / `.webm` / `.3gp` → route to Whisper transcriber
3. After processing, move file to `data/transcripts/processed/`
4. Log what was imported with Rich console output
5. Run until Ctrl+C

**Function:** `watch(transcripts_dir: Optional[Path] = None, model_size: str = "base") -> None`

Uses `time.sleep(2)` polling loop (no watchdog dependency needed for a CLI tool).

## CLI Commands

All wired into the existing `interview` command group in `cli.py`.

### `python cli.py interview import-samsung <path>`
- Calls `import_samsung(path)`
- If `raw_metadata.needs_whisper` is set, offers to run Whisper: "No transcript found. Transcribe audio with Whisper? [y/N]"
- Shows transcript summary (duration, word count, segment count)
- Prompts for application linking: shows numbered list of recent applications, or 'skip'
- Stores via `store_transcript()`

### `python cli.py interview import-otter <file>`
- Calls `import_otter(file)`
- Same summary + application linking prompt
- Stores via `store_transcript()`

### `python cli.py interview transcribe <audio_file> [--model base]`
- Calls `transcribe(audio_file, model_size)`
- Shows progress: "Transcribing with Whisper ({model} model)..."
- Prints summary: duration, word count, detected language, segment count
- Same application linking prompt
- Stores via `store_transcript()`

### `python cli.py interview watch [--model base]`
- Calls `watch(model_size=model)`
- Prints "Watching data/transcripts/ for new files... (Ctrl+C to stop)"
- Logs each processed file

### `python cli.py interview list` (extend existing `history` or add new)
- Calls `list_transcripts()`
- Rich table: ID, Date, Source, Duration, Application (company if linked), Preview (first 50 chars)

### `python cli.py interview analyze <source>` (extend existing command)
Rename the Click argument from `filepath` to `source` for disambiguation:
```python
@interview.command("analyze")
@click.argument("source")  # was "filepath"
```
- If `source.isdigit()`: numeric ID — load from `transcripts` table via `get_transcript(int(source))`
- Otherwise: treat as file path — use existing `TranscriptLoader` flow (backward compat)
- Bridge: `to_coach_turns(record)` converts TranscriptRecord to the format `InterviewCoach.analyze_interview()` expects
- Store analysis results back via `update_analysis(transcript_id, analysis)`
- Display with existing Rich formatting from the current `interview analyze` command

## Bridge Pattern

The existing `InterviewCoach.analyze_interview()` accepts `List[Dict]` with `{"speaker", "text", "timestamp"}` keys. The new `to_coach_turns()` function converts `TranscriptRecord.segments` to this format. No changes to `InterviewCoach` needed.

The existing `interview analyze <filepath>` flow continues to work unchanged. The new `interview analyze <id>` flow adds numeric ID lookup as an alternative entry point.

## Tests

### `tests/test_transcripts.py`

**Samsung importer:**
- Parse speaker-labeled transcript with timestamps
- Parse transcript without timestamps (speaker labels only)
- Handle audio-only directory (no transcript file) — verify `needs_whisper` flag
- Handle single-speaker transcript (no labels detected)

**Otter importer:**
- Parse Otter TXT format with speaker names and timestamps
- Parse standard SRT format
- Handle speaker names vs "Speaker N" labels

**Whisper transcriber:**
- Mock `faster-whisper` model, verify `TranscriptRecord` output shape
- Verify graceful error when faster-whisper not installed

**Transcript store:**
- Store and retrieve round-trip (insert, get back, verify all fields)
- List transcripts with summary
- Update analysis on existing transcript
- Auto-match application by company name in transcript text
- Link application to transcript

**Watch folder:**
- Detect file types correctly (.txt → Otter/Samsung, .m4a → Whisper)
- Process and move to `processed/` directory

**CLI commands:**
- `import-samsung` with mocked importer
- `import-otter` with mocked importer
- `transcribe` with mocked Whisper
- `list` with stored transcripts
- `analyze <id>` with mocked Claude, verify analysis stored

## Dependencies

- `faster-whisper` — optional, only needed for Whisper transcription (Tier 3). Not added to requirements.txt since it's a large install. Print install instructions when needed.
- No other new dependencies. The module uses only stdlib + existing deps (click, rich, anthropic).

## Files Created/Modified

| File | Action |
|---|---|
| `src/transcripts/__init__.py` | Create |
| `src/transcripts/transcript_parser.py` | Create |
| `src/transcripts/samsung_importer.py` | Create |
| `src/transcripts/otter_importer.py` | Create |
| `src/transcripts/whisper_transcriber.py` | Create |
| `src/transcripts/transcript_store.py` | Create |
| `src/transcripts/watch_folder.py` | Create |
| `src/db/models.py` | Modify (add `transcripts` table to schema) |
| `cli.py` | Modify (add import-samsung, import-otter, transcribe, watch, list commands; extend analyze) |
| `tests/test_transcripts.py` | Create |
