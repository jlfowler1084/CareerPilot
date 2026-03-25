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
    segments = []  # type: List[TranscriptSegment]
    current_speaker = None  # type: str
    current_time = 0.0
    current_lines = []  # type: List[str]

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
    segments = []  # type: List[TranscriptSegment]
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
            text_lines = []  # type: List[str]
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
