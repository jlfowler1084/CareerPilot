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
