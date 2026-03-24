"""Load and parse interview transcripts with speaker identification."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import List, Dict, Optional

import anthropic

from config import settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".txt", ".md", ".vtt", ".srt"}

SPEAKER_LABEL_PROMPT = (
    "Identify and label the speakers in this interview transcript. "
    "Label the interviewer as 'Interviewer' and the candidate as 'Candidate'. "
    "Return the transcript with clear speaker labels on each turn, formatted as:\n"
    "Interviewer: <text>\nCandidate: <text>\n\n"
    "Return ONLY the relabeled transcript, no commentary."
)

# Patterns for speaker detection
# "Speaker Name:" at start of line
RE_LABELED = re.compile(
    r"^(?P<speaker>[A-Za-z][A-Za-z0-9 _.\-]+?):\s+(?P<text>.+)",
    re.MULTILINE,
)

# VTT/SRT timestamp lines: 00:01:23.456 --> 00:01:30.789 or [00:01:23]
RE_TIMESTAMP = re.compile(
    r"(?P<ts>\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?)"
)

# VTT speaker tag: <v Speaker Name>text</v> or just Speaker Name after timestamp
RE_VTT_SPEAKER = re.compile(
    r"<v\s+(?P<speaker>[^>]+)>(?P<text>.+?)(?:</v>|$)"
)

# SRT sequence number line
RE_SRT_INDEX = re.compile(r"^\d+\s*$")

# Timestamp arrow line (VTT/SRT)
RE_TS_ARROW = re.compile(
    r"^\d{1,2}:\d{2}:\d{2}[.,]?\d*\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]?\d*",
    re.MULTILINE,
)


class TranscriptLoader:
    """Loads and parses interview transcripts into structured speaker turns."""

    def __init__(self, transcripts_dir: Path = None, anthropic_api_key: str = None):
        self._dir = transcripts_dir or settings.TRANSCRIPTS_DIR
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._claude_client = None

    def _get_claude_client(self):
        if self._claude_client is None:
            self._claude_client = anthropic.Anthropic(api_key=self._api_key)
        return self._claude_client

    def load_transcript(self, filepath: str) -> Optional[List[Dict]]:
        """Load a transcript file and return structured speaker turns.

        Args:
            filepath: Path to transcript file (.txt, .md, .vtt, .srt).
                      Relative paths are resolved from TRANSCRIPTS_DIR.

        Returns:
            List of dicts: [{speaker, text, timestamp (optional)}], or None on error.
        """
        path = Path(filepath)
        if not path.is_absolute():
            path = self._dir / path

        if not path.exists():
            logger.error("Transcript file not found: %s", path)
            return None

        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            logger.error(
                "Unsupported file type '%s'. Supported: %s",
                path.suffix, ", ".join(SUPPORTED_EXTENSIONS),
            )
            return None

        text = path.read_text(encoding="utf-8", errors="replace")
        if not text.strip():
            logger.error("Transcript file is empty: %s", path)
            return None

        return self.parse_speakers(text)

    def parse_speakers(self, text: str) -> List[Dict]:
        """Attempt to identify speaker turns using common patterns.

        Tries in order:
        1. VTT/SRT format with timestamps and optional speaker labels
        2. Labeled speakers ("Speaker:", "Interviewer:", etc.)
        3. Fallback: send to Claude for speaker identification

        Returns:
            List of dicts: [{speaker, text, timestamp (optional)}]
        """
        # Try VTT/SRT parsing first (if timestamps with arrows are present)
        if RE_TS_ARROW.search(text):
            turns = self._parse_vtt_srt(text)
            if turns:
                return turns

        # Try labeled speaker parsing
        turns = self._parse_labeled(text)
        if turns:
            return turns

        # Fallback: ask Claude to identify speakers
        return self._claude_identify_speakers(text)

    def _parse_vtt_srt(self, text: str) -> List[Dict]:
        """Parse VTT or SRT formatted transcripts."""
        turns = []
        lines = text.split("\n")
        current_ts = None
        current_speaker = "Unknown"
        current_text_lines = []

        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # Skip WEBVTT header
            if line.startswith("WEBVTT"):
                i += 1
                continue

            # Skip SRT index numbers
            if RE_SRT_INDEX.match(line):
                i += 1
                continue

            # Skip empty lines — flush current turn
            if not line:
                if current_text_lines:
                    turns.append({
                        "speaker": current_speaker,
                        "text": " ".join(current_text_lines).strip(),
                        "timestamp": current_ts,
                    })
                    current_text_lines = []
                    current_speaker = "Unknown"
                    current_ts = None
                i += 1
                continue

            # Timestamp arrow line
            ts_match = RE_TS_ARROW.match(line)
            if ts_match:
                ts_start = RE_TIMESTAMP.match(line)
                if ts_start:
                    current_ts = ts_start.group("ts")
                i += 1
                continue

            # Check for VTT speaker tag: <v Speaker>text</v>
            vtt_match = RE_VTT_SPEAKER.match(line)
            if vtt_match:
                current_speaker = vtt_match.group("speaker").strip()
                current_text_lines.append(vtt_match.group("text").strip())
                i += 1
                continue

            # Check for inline speaker label
            label_match = RE_LABELED.match(line)
            if label_match:
                current_speaker = label_match.group("speaker").strip()
                current_text_lines.append(label_match.group("text").strip())
                i += 1
                continue

            # Plain text line belonging to current turn
            current_text_lines.append(line)
            i += 1

        # Flush last turn
        if current_text_lines:
            turns.append({
                "speaker": current_speaker,
                "text": " ".join(current_text_lines).strip(),
                "timestamp": current_ts,
            })

        return turns if turns else []

    def _parse_labeled(self, text: str) -> List[Dict]:
        """Parse transcripts with 'Speaker: text' format."""
        matches = list(RE_LABELED.finditer(text))
        if len(matches) < 2:
            return []

        turns = []
        for i, match in enumerate(matches):
            # Get text between this match and the next
            start = match.start("text")
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            full_text = text[start:end].strip()

            # Check for timestamp in preceding context
            preceding = text[max(0, match.start() - 30):match.start()]
            ts_match = RE_TIMESTAMP.search(preceding)
            timestamp = ts_match.group("ts") if ts_match else None

            turns.append({
                "speaker": match.group("speaker").strip(),
                "text": full_text,
                "timestamp": timestamp,
            })

        return turns

    def _claude_identify_speakers(self, text: str) -> List[Dict]:
        """Send raw text to Claude to identify and label speakers."""
        try:
            client = self._get_claude_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=SPEAKER_LABEL_PROMPT,
                messages=[{"role": "user", "content": text[:15000]}],
            )
            labeled_text = response.content[0].text

            # Parse the labeled output
            turns = self._parse_labeled(labeled_text)
            if turns:
                return turns

            # If parsing still fails, return as single block
            logger.warning("Claude labeling produced unparseable output, returning raw")
            return [{"speaker": "Unknown", "text": text.strip(), "timestamp": None}]

        except Exception:
            logger.error("Claude speaker identification failed", exc_info=True)
            return [{"speaker": "Unknown", "text": text.strip(), "timestamp": None}]
