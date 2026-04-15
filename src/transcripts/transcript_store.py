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
from src.transcripts.transcript_parser import CANONICAL_KINDS, TranscriptRecord, TranscriptSegment

logger = logging.getLogger(__name__)


def store_transcript(
    record: TranscriptRecord,
    application_id: Optional[int] = None,
    db_path: Optional[Path] = None,
) -> int:
    """Store a TranscriptRecord in the transcripts table. Returns the row id."""
    if record.kind not in CANONICAL_KINDS:
        raise ValueError(
            f"Invalid transcript kind {record.kind!r}. Must be one of: {', '.join(CANONICAL_KINDS)}"
        )
    conn = models.get_connection(db_path)
    try:
        segments_json = json.dumps([
            {"speaker": s.speaker, "text": s.text, "start_time": s.start_time, "end_time": s.end_time}
            for s in record.segments
        ])
        cursor = conn.execute(
            "INSERT INTO transcripts (source, full_text, segments_json, duration_seconds, "
            "language, audio_path, raw_metadata, application_id, kind) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                record.source,
                record.full_text,
                segments_json,
                record.duration_seconds,
                record.language,
                record.audio_path,
                json.dumps(record.raw_metadata),
                application_id,
                record.kind,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def list_transcripts(db_path: Optional[Path] = None) -> List[Dict]:
    """List all transcripts with summary info."""
    conn = models.get_connection(db_path)
    try:
        rows = conn.execute(
            "SELECT t.id, t.source, t.kind, t.duration_seconds, t.language, t.application_id, "
            "t.imported_at, t.analyzed_at, SUBSTR(t.full_text, 1, 80) AS preview, "
            "a.company, a.title AS app_title "
            "FROM transcripts t "
            "LEFT JOIN applications a ON t.application_id = a.id "
            "ORDER BY t.imported_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_transcript(transcript_id: int, db_path: Optional[Path] = None) -> Optional[TranscriptRecord]:
    """Retrieve a TranscriptRecord by id."""
    conn = models.get_connection(db_path)
    try:
        row = conn.execute("SELECT * FROM transcripts WHERE id = ?", (transcript_id,)).fetchone()
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
            kind=row["kind"],
        )
    finally:
        conn.close()


def update_analysis(transcript_id: int, analysis: Dict, db_path: Optional[Path] = None) -> None:
    """Store Claude analysis results on a transcript row."""
    conn = models.get_connection(db_path)
    try:
        conn.execute(
            "UPDATE transcripts SET analysis_json = ?, analyzed_at = ? WHERE id = ?",
            (json.dumps(analysis), datetime.now().isoformat(), transcript_id),
        )
        conn.commit()
    finally:
        conn.close()


def link_application(transcript_id: int, application_id: int, db_path: Optional[Path] = None) -> None:
    """Link a transcript to an application."""
    conn = models.get_connection(db_path)
    try:
        conn.execute(
            "UPDATE transcripts SET application_id = ? WHERE id = ?",
            (application_id, transcript_id),
        )
        conn.commit()
    finally:
        conn.close()


def list_transcripts_for_application(
    application_id: int,
    kinds: Optional[List[str]] = None,
    db_path: Optional[Path] = None,
) -> List[Dict]:
    """Return transcripts linked to application_id, optionally filtered by kind set.

    Used by InterviewCoach to aggregate prior context transcripts (recruiter_intro,
    recruiter_prep, debrief) when analyzing a performance-kind transcript.

    Args:
        application_id: The application to query.
        kinds: If provided, restrict to rows whose kind is in this list.
               If None or empty, return all transcripts for the application.

    Returns:
        List of dicts with keys: id, source, kind, analyzed_at, analysis_json, full_text.
        Empty list when no matching rows exist.
    """
    conn = models.get_connection(db_path)
    try:
        if kinds:
            placeholders = ",".join("?" * len(kinds))
            rows = conn.execute(
                f"SELECT id, source, kind, analyzed_at, analysis_json, full_text "
                f"FROM transcripts WHERE application_id = ? AND kind IN ({placeholders}) "
                f"ORDER BY imported_at",
                (application_id, *kinds),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, source, kind, analyzed_at, analysis_json, full_text "
                "FROM transcripts WHERE application_id = ? "
                "ORDER BY imported_at",
                (application_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def find_matching_application(text: str, db_path: Optional[Path] = None) -> Optional[int]:
    """Search applications for a company or title mentioned in the transcript text.

    Uses case-insensitive substring matching. Returns the first match's id, or None.
    """
    conn = models.get_connection(db_path)
    try:
        rows = conn.execute("SELECT id, company, title FROM applications").fetchall()
    finally:
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
