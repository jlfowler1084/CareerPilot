"""Unified transcript data model and bridge to InterviewCoach."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

# Canonical transcript kind values (enforced at DB layer via CHECK constraint on fresh DBs,
# and at app layer via store_transcript validation + click.Choice in importer commands).
CANONICAL_KINDS = (
    "recruiter_intro",
    "recruiter_prep",
    "phone_screen",
    "technical",
    "panel",
    "debrief",
    "mock",
    "interview",
)


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
    kind: str = "interview"


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
