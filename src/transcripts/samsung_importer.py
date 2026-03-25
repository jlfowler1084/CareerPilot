"""Samsung Galaxy call recording and Voice Recorder transcript importer."""

from __future__ import annotations

import logging
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
    transcript_file = None  # type: Optional[Path]
    audio_file = None  # type: Optional[Path]
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
    segments = []  # type: List[TranscriptSegment]
    current_speaker = None  # type: Optional[str]
    current_text_parts = []  # type: List[str]
    current_time = 0.0

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Extract timestamp if present
        ts = None  # type: Optional[float]
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
    transcript_text = None  # type: Optional[str]
    audio_path = None  # type: Optional[str]

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
