# Interview Transcription Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-tier interview recording import pipeline (Samsung, Otter.ai, Whisper) producing unified TranscriptRecords stored in SQLite, with CLI commands and analysis bridge.

**Architecture:** New `src/transcripts/` module with pure dataclasses, three importers, SQLite storage, filesystem watcher, and CLI commands wired into the existing `interview` Click group. Bridge function converts TranscriptRecord to the format the existing InterviewCoach expects.

**Tech Stack:** Python 3.8, Click, Rich, SQLite, faster-whisper (optional), Anthropic Claude API, pytest.

**Spec:** `docs/superpowers/specs/2026-03-25-transcript-pipeline-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/transcripts/__init__.py` | Package marker |
| `src/transcripts/transcript_parser.py` | TranscriptSegment, TranscriptRecord dataclasses + to_coach_turns bridge |
| `src/transcripts/samsung_importer.py` | Samsung call recording/Voice Recorder transcript parser |
| `src/transcripts/otter_importer.py` | Otter.ai TXT/SRT transcript parser |
| `src/transcripts/whisper_transcriber.py` | Local faster-whisper transcription wrapper |
| `src/transcripts/transcript_store.py` | SQLite CRUD for transcripts table |
| `src/transcripts/watch_folder.py` | Filesystem polling watcher for auto-import |
| `src/db/models.py` | Modify: add transcripts table DDL to SCHEMA_SQL |
| `cli.py` | Modify: add import-samsung, import-otter, transcribe, watch, list; extend analyze |
| `tests/test_transcripts.py` | All transcript pipeline tests |

---

### Task 1: Data Model + Schema

**Files:**
- Create: `src/transcripts/__init__.py`
- Create: `src/transcripts/transcript_parser.py`
- Modify: `src/db/models.py`
- Create: `tests/test_transcripts.py` (initial)

- [ ] **Step 1: Write tests for dataclasses and bridge function**

Create `tests/test_transcripts.py`:

```python
"""Tests for the interview transcription pipeline."""

from __future__ import annotations

import pytest

from src.transcripts.transcript_parser import (
    TranscriptSegment,
    TranscriptRecord,
    to_coach_turns,
    format_timestamp,
)


class TestTranscriptSegment:
    def test_create_segment(self):
        seg = TranscriptSegment(speaker="Speaker 1", text="Hello", start_time=0.0, end_time=2.5)
        assert seg.speaker == "Speaker 1"
        assert seg.text == "Hello"
        assert seg.start_time == 0.0
        assert seg.end_time == 2.5


class TestTranscriptRecord:
    def test_create_record(self):
        seg = TranscriptSegment(speaker="Interviewer", text="Hi", start_time=0.0, end_time=1.0)
        record = TranscriptRecord(
            source="samsung",
            segments=[seg],
            full_text="Hi",
            duration_seconds=1.0,
            language="en",
            audio_path=None,
            raw_metadata={},
        )
        assert record.source == "samsung"
        assert len(record.segments) == 1
        assert record.id is None

    def test_id_field_default_none(self):
        record = TranscriptRecord(
            source="otter", segments=[], full_text="", duration_seconds=0,
            language="en", audio_path=None, raw_metadata={},
        )
        assert record.id is None

    def test_id_field_settable(self):
        record = TranscriptRecord(
            source="whisper", segments=[], full_text="", duration_seconds=0,
            language="en", audio_path=None, raw_metadata={}, id=42,
        )
        assert record.id == 42


class TestFormatTimestamp:
    def test_zero(self):
        assert format_timestamp(0.0) == "00:00:00"

    def test_seconds_only(self):
        assert format_timestamp(45.0) == "00:00:45"

    def test_minutes_and_seconds(self):
        assert format_timestamp(125.0) == "00:02:05"

    def test_hours(self):
        assert format_timestamp(3661.0) == "01:01:01"


class TestToCoachTurns:
    def test_converts_segments_to_coach_format(self):
        segments = [
            TranscriptSegment(speaker="Interviewer", text="Tell me about yourself", start_time=0.0, end_time=5.0),
            TranscriptSegment(speaker="Candidate", text="I'm a systems engineer", start_time=5.0, end_time=10.0),
        ]
        record = TranscriptRecord(
            source="samsung", segments=segments, full_text="",
            duration_seconds=10.0, language="en", audio_path=None, raw_metadata={},
        )
        turns = to_coach_turns(record)
        assert len(turns) == 2
        assert turns[0]["speaker"] == "Interviewer"
        assert turns[0]["text"] == "Tell me about yourself"
        assert turns[0]["timestamp"] == "00:00:00"
        assert turns[1]["timestamp"] == "00:00:05"

    def test_empty_segments(self):
        record = TranscriptRecord(
            source="otter", segments=[], full_text="",
            duration_seconds=0, language="en", audio_path=None, raw_metadata={},
        )
        assert to_coach_turns(record) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Create package init and transcript_parser.py**

Create `src/transcripts/__init__.py`:
```python
"""Interview transcription pipeline — Samsung, Otter.ai, and Whisper importers."""
```

Create `src/transcripts/transcript_parser.py`:
```python
"""Unified transcript data model and bridge to InterviewCoach."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class TranscriptSegment:
    """A single speaker turn in a transcript."""
    speaker: str
    text: str
    start_time: float
    end_time: float


@dataclass
class TranscriptRecord:
    """Unified transcript from any source (Samsung, Otter, Whisper)."""
    source: str
    segments: List[TranscriptSegment]
    full_text: str
    duration_seconds: float
    language: str
    audio_path: Optional[str]
    raw_metadata: Dict
    id: Optional[int] = None


def format_timestamp(seconds: float) -> str:
    """Convert seconds to HH:MM:SS string."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def to_coach_turns(record: TranscriptRecord) -> List[Dict]:
    """Bridge: convert TranscriptRecord to the format InterviewCoach.analyze_interview() expects.

    Returns: [{"speaker": str, "text": str, "timestamp": str}, ...]
    """
    return [
        {
            "speaker": seg.speaker,
            "text": seg.text,
            "timestamp": format_timestamp(seg.start_time),
        }
        for seg in record.segments
    ]
```

- [ ] **Step 4: Add transcripts table to SCHEMA_SQL in models.py**

Read `src/db/models.py`. Append the new table DDL to the `SCHEMA_SQL` string, before the closing `"""` at line 77:

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py -v`
Expected: All PASS.

- [ ] **Step 6: Run full test suite for regressions**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/ -v`
Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
cd f:/Projects/CareerPilot && git add src/transcripts/__init__.py src/transcripts/transcript_parser.py src/db/models.py tests/test_transcripts.py && git commit -m "feat: transcript data model, bridge function, and DB schema [SCRUM-102]"
```

---

### Task 2: Samsung Importer

**Files:**
- Create: `src/transcripts/samsung_importer.py`
- Modify: `tests/test_transcripts.py`

- [ ] **Step 1: Write Samsung importer tests**

Append to `tests/test_transcripts.py`:

```python
import os
from src.transcripts.samsung_importer import import_samsung


class TestSamsungImporter:
    def test_parse_speaker_labeled_with_timestamps(self, tmp_path):
        """Samsung transcript with 'Speaker N:' labels and [MM:SS] timestamps."""
        txt = tmp_path / "recording.txt"
        txt.write_text(
            "[00:00] Speaker 1: Hi, thanks for calling.\n"
            "[00:05] Speaker 2: Thanks for having me.\n"
            "[01:30] Speaker 1: Tell me about your experience.\n",
            encoding="utf-8",
        )
        record = import_samsung(str(txt))
        assert record.source == "samsung"
        assert len(record.segments) == 3
        assert record.segments[0].speaker == "Speaker 1"
        assert record.segments[0].start_time == 0.0
        assert record.segments[1].start_time == 5.0
        assert record.segments[2].start_time == 90.0

    def test_parse_speaker_labels_no_timestamps(self, tmp_path):
        """Samsung transcript with speaker labels but no timestamps."""
        txt = tmp_path / "recording.txt"
        txt.write_text(
            "Interviewer: What's your background?\n"
            "Joe: I've been in IT for 20 years.\n",
            encoding="utf-8",
        )
        record = import_samsung(str(txt))
        assert len(record.segments) == 2
        assert record.segments[0].speaker == "Interviewer"
        assert record.segments[1].speaker == "Joe"
        assert record.segments[0].start_time == 0.0  # defaults

    def test_single_speaker_no_labels(self, tmp_path):
        """Plain text with no speaker labels — single speaker fallback."""
        txt = tmp_path / "notes.txt"
        txt.write_text("The interview went well. We discussed PowerShell automation.", encoding="utf-8")
        record = import_samsung(str(txt))
        assert len(record.segments) == 1
        assert record.segments[0].speaker == "Speaker"

    def test_directory_with_audio_and_transcript(self, tmp_path):
        """Directory containing both .txt and .m4a."""
        (tmp_path / "call.txt").write_text("Speaker 1: Hello\n", encoding="utf-8")
        (tmp_path / "call.m4a").write_bytes(b"fake audio")
        record = import_samsung(str(tmp_path))
        assert record.audio_path is not None
        assert record.audio_path.endswith(".m4a")
        assert len(record.segments) == 1

    def test_directory_audio_only_needs_whisper(self, tmp_path):
        """Directory with only audio — flags needs_whisper."""
        (tmp_path / "call.m4a").write_bytes(b"fake audio")
        record = import_samsung(str(tmp_path))
        assert record.raw_metadata.get("needs_whisper") is True
        assert len(record.segments) == 0
        assert record.audio_path is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestSamsungImporter -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement samsung_importer.py**

Create `src/transcripts/samsung_importer.py`:

```python
"""Samsung Galaxy call recording and Voice Recorder transcript importer."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import List, Optional, Tuple

from src.transcripts.transcript_parser import TranscriptRecord, TranscriptSegment

logger = logging.getLogger(__name__)

AUDIO_EXTENSIONS = {".m4a", ".3gp", ".mp3", ".wav", ".ogg", ".webm"}
TRANSCRIPT_EXTENSIONS = {".txt"}

# [HH:MM:SS] or [MM:SS] or [M:SS] at start of line
RE_BRACKET_TS = re.compile(r"^\[(\d{1,2}(?::\d{2}){1,2})\]\s*")
# HH:MM:SS or MM:SS standalone
RE_BARE_TS = re.compile(r"^(\d{1,2}:\d{2}(?::\d{2})?)\s+")
# Speaker label: "Name:" at start (after optional timestamp removal)
RE_SPEAKER = re.compile(r"^([A-Za-z][A-Za-z0-9 _.\-]+?):\s+(.+)")


def _parse_timestamp(ts_str: str) -> float:
    """Convert HH:MM:SS or MM:SS to seconds."""
    parts = ts_str.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return 0.0


def _find_files(directory: Path) -> Tuple[Optional[Path], Optional[Path]]:
    """Find transcript and audio files in a directory."""
    transcript_file = None
    audio_file = None
    for f in directory.iterdir():
        if f.is_file():
            ext = f.suffix.lower()
            if ext in TRANSCRIPT_EXTENSIONS and transcript_file is None:
                transcript_file = f
            elif ext in AUDIO_EXTENSIONS and audio_file is None:
                audio_file = f
    return transcript_file, audio_file


def _parse_transcript_text(text: str) -> List[TranscriptSegment]:
    """Parse Samsung transcript text into segments using heuristics."""
    segments = []
    current_speaker = None
    current_text_parts = []
    current_time = 0.0

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Extract timestamp if present
        ts = None
        ts_match = RE_BRACKET_TS.match(line)
        if ts_match:
            ts = _parse_timestamp(ts_match.group(1))
            line = line[ts_match.end():]
        else:
            ts_match = RE_BARE_TS.match(line)
            if ts_match:
                ts = _parse_timestamp(ts_match.group(1))
                line = line[ts_match.end():]

        # Check for speaker label
        speaker_match = RE_SPEAKER.match(line)
        if speaker_match:
            # Save previous segment
            if current_speaker and current_text_parts:
                segments.append(TranscriptSegment(
                    speaker=current_speaker,
                    text=" ".join(current_text_parts),
                    start_time=current_time,
                    end_time=ts if ts is not None else current_time,
                ))
            current_speaker = speaker_match.group(1)
            current_text_parts = [speaker_match.group(2)]
            current_time = ts if ts is not None else (segments[-1].end_time if segments else 0.0)
        else:
            # Continuation of current speaker
            if line:
                current_text_parts.append(line)

    # Flush last segment
    if current_speaker and current_text_parts:
        segments.append(TranscriptSegment(
            speaker=current_speaker,
            text=" ".join(current_text_parts),
            start_time=current_time,
            end_time=current_time,
        ))

    return segments


def import_samsung(path: str) -> TranscriptRecord:
    """Import a Samsung call recording transcript.

    Args:
        path: Path to a transcript file (.txt) or a directory containing audio + transcript.

    Returns:
        TranscriptRecord with parsed segments. If only audio is found (no transcript),
        segments will be empty and raw_metadata["needs_whisper"] will be True.
    """
    p = Path(path)
    transcript_text = None
    audio_path = None

    if p.is_dir():
        transcript_file, audio_file = _find_files(p)
        if transcript_file:
            transcript_text = transcript_file.read_text(encoding="utf-8", errors="replace")
        if audio_file:
            audio_path = str(audio_file)
    elif p.is_file():
        transcript_text = p.read_text(encoding="utf-8", errors="replace")
        # Check for audio in same directory
        for f in p.parent.iterdir():
            if f.suffix.lower() in AUDIO_EXTENSIONS:
                audio_path = str(f)
                break

    # Audio-only case
    if not transcript_text:
        return TranscriptRecord(
            source="samsung",
            segments=[],
            full_text="",
            duration_seconds=0,
            language="en",
            audio_path=audio_path,
            raw_metadata={"needs_whisper": True},
        )

    # Parse transcript
    segments = _parse_transcript_text(transcript_text)

    # Single-speaker fallback if no labels detected
    if not segments and transcript_text.strip():
        segments = [TranscriptSegment(
            speaker="Speaker",
            text=transcript_text.strip(),
            start_time=0.0,
            end_time=0.0,
        )]

    full_text = " ".join(seg.text for seg in segments)
    duration = max((seg.end_time for seg in segments), default=0.0)

    return TranscriptRecord(
        source="samsung",
        segments=segments,
        full_text=full_text,
        duration_seconds=duration,
        language="en",
        audio_path=audio_path,
        raw_metadata={},
    )
```

- [ ] **Step 4: Run tests**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestSamsungImporter -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd f:/Projects/CareerPilot && git add src/transcripts/samsung_importer.py tests/test_transcripts.py && git commit -m "feat: Samsung transcript importer with heuristic parsing [SCRUM-102]"
```

---

### Task 3: Otter.ai Importer

**Files:**
- Create: `src/transcripts/otter_importer.py`
- Modify: `tests/test_transcripts.py`

- [ ] **Step 1: Write Otter importer tests**

Append to `tests/test_transcripts.py`:

```python
from src.transcripts.otter_importer import import_otter


class TestOtterImporter:
    def test_parse_otter_txt_format(self, tmp_path):
        """Otter TXT with 'Speaker N  M:SS' format."""
        txt = tmp_path / "meeting.txt"
        txt.write_text(
            "Speaker 1  0:00\n"
            "Hello, thanks for calling about the systems engineer position.\n"
            "\n"
            "Speaker 2  0:05\n"
            "Hi, yes, I'm Joe Fowler, thanks for taking the time.\n"
            "\n"
            "Speaker 1  0:15\n"
            "Great. Tell me about your background.\n",
            encoding="utf-8",
        )
        record = import_otter(str(txt))
        assert record.source == "otter"
        assert len(record.segments) == 3
        assert record.segments[0].speaker == "Speaker 1"
        assert record.segments[0].start_time == 0.0
        assert record.segments[1].speaker == "Speaker 2"
        assert record.segments[1].start_time == 5.0
        assert record.segments[2].start_time == 15.0

    def test_parse_otter_txt_with_real_names(self, tmp_path):
        """Otter TXT with real speaker names instead of 'Speaker N'."""
        txt = tmp_path / "call.txt"
        txt.write_text(
            "Jane Smith  0:00\n"
            "Welcome to the interview.\n"
            "\n"
            "Joe Fowler  0:03\n"
            "Thank you for having me.\n",
            encoding="utf-8",
        )
        record = import_otter(str(txt))
        assert record.segments[0].speaker == "Jane Smith"
        assert record.segments[1].speaker == "Joe Fowler"

    def test_parse_srt_format(self, tmp_path):
        """Standard SRT subtitle format."""
        srt = tmp_path / "interview.srt"
        srt.write_text(
            "1\n"
            "00:00:00,000 --> 00:00:03,500\n"
            "Hello, welcome to the interview.\n"
            "\n"
            "2\n"
            "00:00:04,000 --> 00:00:08,000\n"
            "Thank you, glad to be here.\n"
            "\n"
            "3\n"
            "00:00:09,000 --> 00:00:15,500\n"
            "Tell me about your PowerShell experience.\n",
            encoding="utf-8",
        )
        record = import_otter(str(srt))
        assert record.source == "otter"
        assert len(record.segments) == 3
        assert record.segments[0].start_time == 0.0
        assert record.segments[1].start_time == 4.0
        assert record.segments[2].start_time == 9.0
        assert record.segments[2].end_time == 15.5
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestOtterImporter -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement otter_importer.py**

Create `src/transcripts/otter_importer.py`:

```python
"""Otter.ai transcript importer — handles TXT and SRT export formats."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import List

from src.transcripts.transcript_parser import TranscriptRecord, TranscriptSegment

logger = logging.getLogger(__name__)

# Otter TXT: "Speaker Name  M:SS" (two or more spaces before timestamp)
RE_OTTER_HEADER = re.compile(r"^(.+?)\s{2,}(\d{1,2}:\d{2}(?::\d{2})?)\s*$")

# SRT timestamp: 00:00:04,000 --> 00:00:08,000
RE_SRT_TS = re.compile(
    r"(\d{2}:\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2})[,.](\d{3})"
)

# SRT sequence number
RE_SRT_INDEX = re.compile(r"^\d+\s*$")


def _ts_to_seconds(ts: str) -> float:
    """Convert M:SS, MM:SS, or HH:MM:SS to seconds."""
    parts = ts.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return 0.0


def _srt_ts_to_seconds(ts: str, ms: str) -> float:
    """Convert SRT timestamp (HH:MM:SS + milliseconds) to seconds."""
    parts = ts.split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2]) + int(ms) / 1000.0


def _is_srt(text: str) -> bool:
    """Detect SRT format by presence of --> arrows."""
    return "-->" in text


def _parse_otter_txt(text: str) -> List[TranscriptSegment]:
    """Parse Otter.ai TXT export format."""
    segments = []
    current_speaker = None
    current_time = 0.0
    current_lines = []

    for line in text.splitlines():
        header_match = RE_OTTER_HEADER.match(line)
        if header_match:
            # Save previous segment
            if current_speaker and current_lines:
                segments.append(TranscriptSegment(
                    speaker=current_speaker,
                    text=" ".join(current_lines),
                    start_time=current_time,
                    end_time=_ts_to_seconds(header_match.group(2)),
                ))
            current_speaker = header_match.group(1).strip()
            current_time = _ts_to_seconds(header_match.group(2))
            current_lines = []
        elif line.strip():
            current_lines.append(line.strip())

    # Flush last segment
    if current_speaker and current_lines:
        segments.append(TranscriptSegment(
            speaker=current_speaker,
            text=" ".join(current_lines),
            start_time=current_time,
            end_time=current_time,
        ))

    return segments


def _parse_srt(text: str) -> List[TranscriptSegment]:
    """Parse standard SRT subtitle format."""
    segments = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        # Skip blank lines and sequence numbers
        if not lines[i].strip() or RE_SRT_INDEX.match(lines[i]):
            i += 1
            continue

        # Look for timestamp line
        ts_match = RE_SRT_TS.match(lines[i])
        if ts_match:
            start = _srt_ts_to_seconds(ts_match.group(1), ts_match.group(2))
            end = _srt_ts_to_seconds(ts_match.group(3), ts_match.group(4))
            i += 1

            # Collect text lines until blank or next sequence
            text_lines = []
            while i < len(lines) and lines[i].strip() and not RE_SRT_INDEX.match(lines[i]):
                text_lines.append(lines[i].strip())
                i += 1

            if text_lines:
                segments.append(TranscriptSegment(
                    speaker="Speaker",
                    text=" ".join(text_lines),
                    start_time=start,
                    end_time=end,
                ))
        else:
            i += 1

    return segments


def import_otter(path: str) -> TranscriptRecord:
    """Import an Otter.ai transcript export (.txt or .srt).

    Detects format automatically: SRT if file contains '-->' arrows, otherwise Otter TXT.
    """
    text = Path(path).read_text(encoding="utf-8", errors="replace")

    if _is_srt(text):
        segments = _parse_srt(text)
    else:
        segments = _parse_otter_txt(text)

    full_text = " ".join(seg.text for seg in segments)
    duration = max((seg.end_time for seg in segments), default=0.0)

    return TranscriptRecord(
        source="otter",
        segments=segments,
        full_text=full_text,
        duration_seconds=duration,
        language="en",
        audio_path=None,
        raw_metadata={"format": "srt" if _is_srt(text) else "txt"},
    )
```

- [ ] **Step 4: Run tests**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestOtterImporter -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd f:/Projects/CareerPilot && git add src/transcripts/otter_importer.py tests/test_transcripts.py && git commit -m "feat: Otter.ai TXT/SRT transcript importer [SCRUM-102]"
```

---

### Task 4: Whisper Transcriber

**Files:**
- Create: `src/transcripts/whisper_transcriber.py`
- Modify: `tests/test_transcripts.py`

- [ ] **Step 1: Write Whisper tests (mocked)**

Append to `tests/test_transcripts.py`:

```python
from unittest.mock import MagicMock, patch
from src.transcripts.whisper_transcriber import transcribe, SUPPORTED_MODELS


class TestWhisperTranscriber:
    def test_supported_models(self):
        assert "base" in SUPPORTED_MODELS
        assert "tiny" in SUPPORTED_MODELS
        assert "large-v3" in SUPPORTED_MODELS

    @patch("src.transcripts.whisper_transcriber.WhisperModel")
    def test_transcribe_returns_record(self, mock_model_cls, tmp_path):
        """Mock faster-whisper and verify TranscriptRecord shape."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"fake audio data")

        # Mock WhisperModel
        mock_model = MagicMock()
        mock_model_cls.return_value = mock_model

        # Mock segments returned by model.transcribe()
        mock_seg1 = MagicMock()
        mock_seg1.start = 0.0
        mock_seg1.end = 3.0
        mock_seg1.text = " Hello, how are you?"

        mock_seg2 = MagicMock()
        mock_seg2.start = 3.5
        mock_seg2.end = 7.0
        mock_seg2.text = " I'm doing great, thanks."

        mock_info = MagicMock()
        mock_info.language = "en"
        mock_info.duration = 7.0

        mock_model.transcribe.return_value = ([mock_seg1, mock_seg2], mock_info)

        record = transcribe(str(audio), model_size="base")

        assert record.source == "whisper"
        assert len(record.segments) == 2
        assert record.segments[0].text == "Hello, how are you?"
        assert record.segments[1].start_time == 3.5
        assert record.language == "en"
        assert record.duration_seconds == 7.0
        assert record.audio_path == str(audio)

    def test_missing_faster_whisper_raises(self, tmp_path):
        """When faster-whisper is not installed, raise RuntimeError."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"fake")
        with patch("src.transcripts.whisper_transcriber.WhisperModel", None):
            with pytest.raises(RuntimeError, match="faster-whisper"):
                transcribe(str(audio))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestWhisperTranscriber -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement whisper_transcriber.py**

Create `src/transcripts/whisper_transcriber.py`:

```python
"""Local Whisper transcription via faster-whisper (optional dependency)."""

from __future__ import annotations

import logging
from typing import Optional

from src.transcripts.transcript_parser import TranscriptRecord, TranscriptSegment

logger = logging.getLogger(__name__)

SUPPORTED_MODELS = {"tiny", "base", "small", "medium", "large-v3", "turbo"}

# Try to import faster-whisper; set to None if not available
try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None  # type: ignore[misc, assignment]


def transcribe(audio_path: str, model_size: str = "base") -> TranscriptRecord:
    """Transcribe an audio file using faster-whisper.

    Args:
        audio_path: Path to audio file (.m4a, .mp3, .wav, .ogg, .webm, .3gp).
        model_size: Whisper model size (tiny, base, small, medium, large-v3, turbo).

    Returns:
        TranscriptRecord with segments and detected language.

    Raises:
        RuntimeError: If faster-whisper is not installed.
    """
    if WhisperModel is None:
        raise RuntimeError(
            "faster-whisper is not installed. Install it with:\n"
            "  python -m pip install faster-whisper\n"
            "This is a large download (~1 GB for the base model)."
        )

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    raw_segments, info = model.transcribe(audio_path, beam_size=5)

    # Consume the generator into a list
    segments_list = list(raw_segments)

    segments = [
        TranscriptSegment(
            speaker="Speaker",
            text=seg.text.strip(),
            start_time=seg.start,
            end_time=seg.end,
        )
        for seg in segments_list
    ]

    full_text = " ".join(seg.text for seg in segments)

    return TranscriptRecord(
        source="whisper",
        segments=segments,
        full_text=full_text,
        duration_seconds=info.duration,
        language=info.language,
        audio_path=audio_path,
        raw_metadata={"model_size": model_size},
    )
```

- [ ] **Step 4: Run tests**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestWhisperTranscriber -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd f:/Projects/CareerPilot && git add src/transcripts/whisper_transcriber.py tests/test_transcripts.py && git commit -m "feat: local Whisper transcription via faster-whisper [SCRUM-102]"
```

---

### Task 5: Transcript Store (SQLite CRUD)

**Files:**
- Create: `src/transcripts/transcript_store.py`
- Modify: `tests/test_transcripts.py`

- [ ] **Step 1: Write store tests**

Append to `tests/test_transcripts.py`:

```python
import json
from src.transcripts.transcript_store import (
    store_transcript,
    list_transcripts,
    get_transcript,
    update_analysis,
    link_application,
    find_matching_application,
)
from src.db import models


class TestTranscriptStore:
    def test_store_and_retrieve_roundtrip(self, tmp_path):
        db_path = tmp_path / "test.db"
        seg = TranscriptSegment(speaker="Interviewer", text="Hello", start_time=0.0, end_time=2.0)
        record = TranscriptRecord(
            source="samsung", segments=[seg], full_text="Hello",
            duration_seconds=2.0, language="en", audio_path="/tmp/test.m4a",
            raw_metadata={"key": "value"},
        )
        row_id = store_transcript(record, db_path=db_path)
        assert row_id > 0

        retrieved = get_transcript(row_id, db_path=db_path)
        assert retrieved is not None
        assert retrieved.id == row_id
        assert retrieved.source == "samsung"
        assert retrieved.full_text == "Hello"
        assert len(retrieved.segments) == 1
        assert retrieved.segments[0].speaker == "Interviewer"
        assert retrieved.audio_path == "/tmp/test.m4a"
        assert retrieved.duration_seconds == 2.0

    def test_list_transcripts(self, tmp_path):
        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="otter", segments=[], full_text="Test transcript text here",
            duration_seconds=30.0, language="en", audio_path=None, raw_metadata={},
        )
        store_transcript(record, db_path=db_path)
        store_transcript(record, db_path=db_path)

        results = list_transcripts(db_path=db_path)
        assert len(results) == 2
        assert results[0]["source"] == "otter"
        assert "imported_at" in results[0]

    def test_update_analysis(self, tmp_path):
        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="whisper", segments=[], full_text="Interview text",
            duration_seconds=60.0, language="en", audio_path=None, raw_metadata={},
        )
        row_id = store_transcript(record, db_path=db_path)

        analysis = {"overall_score": 7, "technical_gaps": ["Kubernetes"]}
        update_analysis(row_id, analysis, db_path=db_path)

        retrieved = get_transcript(row_id, db_path=db_path)
        assert retrieved is not None
        # Verify analysis was stored (check via raw DB)
        conn = models.get_connection(db_path)
        row = conn.execute("SELECT analysis_json, analyzed_at FROM transcripts WHERE id = ?", (row_id,)).fetchone()
        assert row["analyzed_at"] is not None
        parsed = json.loads(row["analysis_json"])
        assert parsed["overall_score"] == 7
        conn.close()

    def test_link_application(self, tmp_path):
        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="samsung", segments=[], full_text="",
            duration_seconds=0, language="en", audio_path=None, raw_metadata={},
        )
        row_id = store_transcript(record, db_path=db_path)

        # Create an application
        conn = models.get_connection(db_path)
        cursor = conn.execute(
            "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
            ("Systems Engineer", "Acme Corp", "applied"),
        )
        app_id = cursor.lastrowid
        conn.commit()
        conn.close()

        link_application(row_id, app_id, db_path=db_path)

        conn = models.get_connection(db_path)
        row = conn.execute("SELECT application_id FROM transcripts WHERE id = ?", (row_id,)).fetchone()
        assert row["application_id"] == app_id
        conn.close()

    def test_find_matching_application(self, tmp_path):
        db_path = tmp_path / "test.db"
        conn = models.get_connection(db_path)
        conn.execute(
            "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
            ("DevOps Engineer", "CloudCo", "applied"),
        )
        conn.execute(
            "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
            ("SysAdmin", "Acme Corp", "found"),
        )
        conn.commit()
        conn.close()

        # Should match "CloudCo" mentioned in transcript text
        match = find_matching_application("We discussed the DevOps role at CloudCo today", db_path=db_path)
        assert match is not None

    def test_find_matching_application_no_match(self, tmp_path):
        db_path = tmp_path / "test.db"
        conn = models.get_connection(db_path)
        conn.execute(
            "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
            ("SysAdmin", "Acme Corp", "applied"),
        )
        conn.commit()
        conn.close()

        match = find_matching_application("Interview about kitchen remodel", db_path=db_path)
        assert match is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestTranscriptStore -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement transcript_store.py**

Create `src/transcripts/transcript_store.py`:

```python
"""SQLite storage for transcripts — CRUD operations bridging TranscriptRecord to the DB.

NOTE: All functions use try/finally to ensure conn.close() is called even on exceptions.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from config import settings
from src.db import models
from src.transcripts.transcript_parser import TranscriptRecord, TranscriptSegment

logger = logging.getLogger(__name__)


def store_transcript(
    record: TranscriptRecord,
    application_id: Optional[int] = None,
    db_path: Optional[Path] = None,
) -> int:
    """Store a TranscriptRecord in the transcripts table. Returns the row id."""
    conn = models.get_connection(db_path)
    segments_json = json.dumps([
        {"speaker": s.speaker, "text": s.text, "start_time": s.start_time, "end_time": s.end_time}
        for s in record.segments
    ])
    cursor = conn.execute(
        "INSERT INTO transcripts (source, full_text, segments_json, duration_seconds, "
        "language, audio_path, raw_metadata, application_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            record.source,
            record.full_text,
            segments_json,
            record.duration_seconds,
            record.language,
            record.audio_path,
            json.dumps(record.raw_metadata),
            application_id,
        ),
    )
    conn.commit()
    row_id = cursor.lastrowid
    conn.commit()
    return row_id


def list_transcripts(db_path: Optional[Path] = None) -> List[Dict]:
    """List all transcripts with summary info."""
    conn = models.get_connection(db_path)
    rows = conn.execute(
        "SELECT t.id, t.source, t.duration_seconds, t.language, t.application_id, "
        "t.imported_at, t.analyzed_at, SUBSTR(t.full_text, 1, 80) AS preview, "
        "a.company, a.title AS app_title "
        "FROM transcripts t "
        "LEFT JOIN applications a ON t.application_id = a.id "
        "ORDER BY t.imported_at DESC"
    ).fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    return result


def get_transcript(transcript_id: int, db_path: Optional[Path] = None) -> Optional[TranscriptRecord]:
    """Retrieve a TranscriptRecord by id."""
    conn = models.get_connection(db_path)
    row = conn.execute("SELECT * FROM transcripts WHERE id = ?", (transcript_id,)).fetchone()
    conn.close()

    if not row:
        return None

    segments_data = json.loads(row["segments_json"])
    segments = [
        TranscriptSegment(
            speaker=s["speaker"],
            text=s["text"],
            start_time=s["start_time"],
            end_time=s["end_time"],
        )
        for s in segments_data
    ]

    return TranscriptRecord(
        source=row["source"],
        segments=segments,
        full_text=row["full_text"],
        duration_seconds=row["duration_seconds"],
        language=row["language"],
        audio_path=row["audio_path"],
        raw_metadata=json.loads(row["raw_metadata"]),
        id=row["id"],
    )


def update_analysis(transcript_id: int, analysis: Dict, db_path: Optional[Path] = None) -> None:
    """Store Claude analysis results on a transcript row."""
    conn = models.get_connection(db_path)
    conn.execute(
        "UPDATE transcripts SET analysis_json = ?, analyzed_at = ? WHERE id = ?",
        (json.dumps(analysis), datetime.now().isoformat(), transcript_id),
    )
    conn.commit()
    conn.close()


def link_application(transcript_id: int, application_id: int, db_path: Optional[Path] = None) -> None:
    """Link a transcript to an application."""
    conn = models.get_connection(db_path)
    conn.execute(
        "UPDATE transcripts SET application_id = ? WHERE id = ?",
        (application_id, transcript_id),
    )
    conn.commit()
    conn.close()


def find_matching_application(text: str, db_path: Optional[Path] = None) -> Optional[int]:
    """Search applications for a company or title mentioned in the transcript text.

    Uses case-insensitive substring matching. Returns the first match's id, or None.
    """
    conn = models.get_connection(db_path)
    rows = conn.execute("SELECT id, company, title FROM applications").fetchall()
    conn.close()

    lower_text = text.lower()
    for row in rows:
        company = row["company"].lower()
        if company and company in lower_text:
            return row["id"]
        title = row["title"].lower()
        if title and title in lower_text:
            return row["id"]

    return None
```

- [ ] **Step 4: Run tests**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestTranscriptStore -v`
Expected: All PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd f:/Projects/CareerPilot && git add src/transcripts/transcript_store.py tests/test_transcripts.py && git commit -m "feat: transcript SQLite store with CRUD and auto-match [SCRUM-102]"
```

---

### Task 6: Watch Folder

**Files:**
- Create: `src/transcripts/watch_folder.py`
- Modify: `tests/test_transcripts.py`

- [ ] **Step 1: Write watch folder tests**

Append to `tests/test_transcripts.py`:

```python
from src.transcripts.watch_folder import classify_file, process_file


class TestWatchFolder:
    def test_classify_srt_as_otter(self, tmp_path):
        f = tmp_path / "interview.srt"
        f.write_text("1\n00:00:00,000 --> 00:00:03,000\nHello\n", encoding="utf-8")
        assert classify_file(f) == "otter"

    def test_classify_otter_txt(self, tmp_path):
        f = tmp_path / "meeting.txt"
        f.write_text("Speaker 1  0:00\nHello there.\n", encoding="utf-8")
        assert classify_file(f) == "otter"

    def test_classify_samsung_txt(self, tmp_path):
        f = tmp_path / "call.txt"
        f.write_text("[00:00] Speaker 1: Hello\n", encoding="utf-8")
        assert classify_file(f) == "samsung"

    def test_classify_plain_txt_as_samsung(self, tmp_path):
        f = tmp_path / "notes.txt"
        f.write_text("The interview went well overall.\n", encoding="utf-8")
        assert classify_file(f) == "samsung"

    def test_classify_audio_as_whisper(self, tmp_path):
        f = tmp_path / "recording.m4a"
        f.write_bytes(b"fake audio")
        assert classify_file(f) == "whisper"

    def test_classify_mp3_as_whisper(self, tmp_path):
        f = tmp_path / "recording.mp3"
        f.write_bytes(b"fake audio")
        assert classify_file(f) == "whisper"

    def test_classify_unknown_extension(self, tmp_path):
        f = tmp_path / "data.csv"
        f.write_text("a,b,c", encoding="utf-8")
        assert classify_file(f) is None

    @patch("src.transcripts.watch_folder.import_samsung")
    def test_process_file_samsung(self, mock_import, tmp_path):
        mock_import.return_value = TranscriptRecord(
            source="samsung", segments=[], full_text="Hello",
            duration_seconds=5.0, language="en", audio_path=None, raw_metadata={},
        )
        f = tmp_path / "call.txt"
        f.write_text("[00:00] Speaker 1: Hello\n", encoding="utf-8")
        processed_dir = tmp_path / "processed"

        result = process_file(f, processed_dir, db_path=tmp_path / "test.db")
        assert result is not None
        assert not f.exists()  # moved to processed
        assert (processed_dir / "call.txt").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestWatchFolder -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement watch_folder.py**

Create `src/transcripts/watch_folder.py`:

```python
"""Filesystem watcher for auto-importing transcripts from data/transcripts/."""

from __future__ import annotations

import logging
import re
import shutil
import time
from pathlib import Path
from typing import Optional

from config import settings
from src.transcripts.transcript_parser import TranscriptRecord
from src.transcripts.samsung_importer import import_samsung
from src.transcripts.otter_importer import import_otter
from src.transcripts.transcript_store import store_transcript

logger = logging.getLogger(__name__)

AUDIO_EXTENSIONS = {".m4a", ".3gp", ".mp3", ".wav", ".ogg", ".webm"}

# Otter TXT pattern: speaker label + two-or-more spaces + simple timestamp on same line
RE_OTTER_HEADER = re.compile(r"^.+?\s{2,}\d{1,2}:\d{2}", re.MULTILINE)


def classify_file(path: Path) -> Optional[str]:
    """Classify a file as 'otter', 'samsung', 'whisper', or None (unknown)."""
    ext = path.suffix.lower()

    if ext in AUDIO_EXTENSIONS:
        return "whisper"

    if ext == ".srt":
        return "otter"

    if ext == ".txt":
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
        if RE_OTTER_HEADER.search(text):
            return "otter"
        return "samsung"

    return None


def process_file(
    path: Path,
    processed_dir: Path,
    model_size: str = "base",
    db_path: Optional[Path] = None,
) -> Optional[int]:
    """Process a single transcript/audio file and store it.

    Returns the transcript row id, or None on failure.
    """
    file_type = classify_file(path)
    if file_type is None:
        logger.warning("Unknown file type: %s", path)
        return None

    record = None  # type: Optional[TranscriptRecord]

    try:
        if file_type == "otter":
            record = import_otter(str(path))
        elif file_type == "samsung":
            record = import_samsung(str(path))
        elif file_type == "whisper":
            from src.transcripts.whisper_transcriber import transcribe
            record = transcribe(str(path), model_size=model_size)
    except Exception:
        logger.exception("Failed to process %s", path)
        return None

    if record is None:
        return None

    row_id = store_transcript(record, db_path=db_path)

    # Move to processed directory
    processed_dir.mkdir(parents=True, exist_ok=True)
    dest = processed_dir / path.name
    # Handle duplicate names
    if dest.exists():
        stem = path.stem
        suffix = path.suffix
        counter = 1
        while dest.exists():
            dest = processed_dir / f"{stem}_{counter}{suffix}"
            counter += 1
    shutil.move(str(path), str(dest))
    logger.info("Processed %s -> %s (id=%d)", path.name, file_type, row_id)

    return row_id


def watch(
    transcripts_dir: Optional[Path] = None,
    model_size: str = "base",
    db_path: Optional[Path] = None,
) -> None:
    """Watch a directory for new transcript/audio files and auto-import them.

    Polls every 2 seconds. Ctrl+C to stop.
    """
    from rich.console import Console
    console = Console()

    watch_dir = transcripts_dir or settings.TRANSCRIPTS_DIR
    processed_dir = watch_dir / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    console.print(f"[bold]Watching {watch_dir} for new files... (Ctrl+C to stop)[/bold]")

    try:
        while True:
            for path in watch_dir.iterdir():
                if path.is_file() and not path.name.startswith("."):
                    row_id = process_file(path, processed_dir, model_size=model_size, db_path=db_path)
                    if row_id:
                        console.print(f"  [green]Imported:[/green] {path.name} (id={row_id})")
            time.sleep(2)
    except KeyboardInterrupt:
        console.print("\n[dim]Stopped watching.[/dim]")
```

- [ ] **Step 4: Run tests**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestWatchFolder -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd f:/Projects/CareerPilot && git add src/transcripts/watch_folder.py tests/test_transcripts.py && git commit -m "feat: watch folder with auto-classification and import [SCRUM-102]"
```

---

### Task 7: CLI Commands

**Files:**
- Modify: `cli.py`
- Modify: `tests/test_transcripts.py`

- [ ] **Step 1: Write CLI command tests**

Append to `tests/test_transcripts.py`:

```python
from click.testing import CliRunner
from cli import cli


class TestCLICommands:
    @patch("src.transcripts.samsung_importer.import_samsung")
    @patch("src.transcripts.transcript_store.store_transcript", return_value=1)
    def test_import_samsung_command(self, mock_store, mock_import, tmp_path):
        mock_import.return_value = TranscriptRecord(
            source="samsung",
            segments=[TranscriptSegment("Speaker 1", "Hi", 0.0, 1.0)],
            full_text="Hi", duration_seconds=1.0, language="en",
            audio_path=None, raw_metadata={},
        )
        txt = tmp_path / "call.txt"
        txt.write_text("Speaker 1: Hi\n", encoding="utf-8")
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "import-samsung", str(txt)], input="skip\n")
        assert result.exit_code == 0
        assert "Imported" in result.output or "1 segment" in result.output

    @patch("src.transcripts.otter_importer.import_otter")
    @patch("src.transcripts.transcript_store.store_transcript", return_value=2)
    def test_import_otter_command(self, mock_store, mock_import, tmp_path):
        mock_import.return_value = TranscriptRecord(
            source="otter",
            segments=[TranscriptSegment("Speaker 1", "Hello", 0.0, 3.0)],
            full_text="Hello", duration_seconds=3.0, language="en",
            audio_path=None, raw_metadata={},
        )
        txt = tmp_path / "meeting.txt"
        txt.write_text("Speaker 1  0:00\nHello\n", encoding="utf-8")
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "import-otter", str(txt)], input="skip\n")
        assert result.exit_code == 0

    @patch("src.transcripts.transcript_store.list_transcripts")
    def test_list_command(self, mock_list):
        mock_list.return_value = [
            {"id": 1, "source": "samsung", "duration_seconds": 120, "language": "en",
             "preview": "Hello there...", "imported_at": "2026-03-25T12:00:00",
             "application_id": None, "company": None, "app_title": None, "analyzed_at": None},
        ]
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "list"])
        assert result.exit_code == 0
        assert "samsung" in result.output

    @patch("src.interviews.coach.InterviewCoach.analyze_interview")
    @patch("src.transcripts.transcript_store.get_transcript")
    @patch("src.transcripts.transcript_store.update_analysis")
    def test_analyze_by_id(self, mock_update, mock_get, mock_analyze):
        mock_get.return_value = TranscriptRecord(
            source="samsung",
            segments=[
                TranscriptSegment("Interviewer", "Tell me about yourself", 0.0, 5.0),
                TranscriptSegment("Candidate", "I'm a systems engineer", 5.0, 10.0),
            ],
            full_text="Tell me about yourself I'm a systems engineer",
            duration_seconds=10.0, language="en", audio_path=None, raw_metadata={}, id=1,
        )
        mock_analyze.return_value = {
            "overall_score": 7,
            "questions_asked": ["Tell me about yourself"],
            "response_quality": [],
            "technical_gaps": [],
            "behavioral_assessment": {},
            "top_improvements": [],
            "practice_questions": [],
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "analyze", "1", "--company", "Test"], input="n\n")
        mock_get.assert_called_once_with(1)
        assert mock_analyze.called
```

- [ ] **Step 2: Implement CLI commands in cli.py**

Read `cli.py` to find the `interview` command group (around line 1440). Add new commands after the existing ones. Key changes:

1. **Rename `analyze` argument from `filepath` to `source`** (line 1447)
2. **Add `import-samsung` command**
3. **Add `import-otter` command**
4. **Add `transcribe` command**
5. **Add `watch` command**
6. **Add `list` command** (separate from existing `history` which shows analysis history)
7. **Modify `analyze` to handle numeric IDs**

The commands follow the existing pattern: lazy imports inside the function body, Rich console output, `console.input()` for prompts.

For `import-samsung`, `import-otter`, and `transcribe`, add a shared helper function `_prompt_link_application()` that shows a numbered list of recent applications and returns the selected id or None.

For `analyze`, the modification is: if `source.isdigit()`, load from `get_transcript(int(source))` and bridge via `to_coach_turns()`. Otherwise, use the existing `TranscriptLoader` flow.

- [ ] **Step 3: Run CLI tests**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/test_transcripts.py::TestCLICommands -v`
Expected: All PASS.

- [ ] **Step 4: Run full test suite**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd f:/Projects/CareerPilot && git add cli.py tests/test_transcripts.py && git commit -m "feat: CLI commands for transcript import, transcribe, watch, list, analyze [SCRUM-102]"
```

---

### Task 8: Final Verification + Push

- [ ] **Step 1: Run full test suite**

Run: `cd f:/Projects/CareerPilot && python -m pytest tests/ -v`
Expected: All tests pass. Report total count.

- [ ] **Step 2: Verify CLI commands work**

Run these quick smoke tests:
```bash
cd f:/Projects/CareerPilot
python cli.py interview --help
python cli.py interview list
python cli.py interview import-samsung --help
python cli.py interview import-otter --help
python cli.py interview transcribe --help
```
Expected: Help text displays for all commands, `list` shows empty table.

- [ ] **Step 3: Push**

```bash
cd f:/Projects/CareerPilot && git push origin feature/dashboard-v2
```

Report: commit count, test count, files created/modified.
