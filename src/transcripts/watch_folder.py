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
