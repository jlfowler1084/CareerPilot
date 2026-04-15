"""Characterization tests for CAR-145 schema migration.

Unit 1: Add kind column to transcripts, backfill interview_analyses, drop legacy table.

Written characterization-first: these tests describe the expected post-migration state
and are expected to FAIL until the migration is implemented in src/db/models.py.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

# Pre-migration DDL for legacy transcripts (no kind column)
_OLD_TRANSCRIPTS_DDL = """
CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    full_text TEXT NOT NULL,
    segments_json TEXT NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en',
    audio_path TEXT,
    raw_metadata TEXT NOT NULL DEFAULT '{}',
    application_id INTEGER,
    analyzed_at TEXT,
    analysis_json TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""

_INTERVIEW_ANALYSES_DDL = """
CREATE TABLE IF NOT EXISTS interview_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transcript_file TEXT NOT NULL,
    analysis_json TEXT NOT NULL,
    analyzed_at TEXT NOT NULL,
    company TEXT DEFAULT '',
    role TEXT DEFAULT ''
)
"""


def _seed_legacy_db(db_path: Path) -> Path:
    """Build a pre-migration SQLite DB at db_path.

    Creates the old transcripts table (no kind column), the interview_analyses
    table, and inserts three representative legacy rows:
      - Row 1: transcript_file path resolves to a real file (full_text populated)
      - Row 2: transcript_file path is missing (full_text → empty string)
      - Row 3: empty analysis_json dict, no company/role
    Returns the readable transcript file path (for test assertions).
    """
    readable_path = db_path.parent / "transcript1.txt"
    readable_path.write_text("Hello this is a transcript.", encoding="utf-8")

    conn = sqlite3.connect(str(db_path))
    conn.execute(_OLD_TRANSCRIPTS_DDL)
    conn.execute(_INTERVIEW_ANALYSES_DDL)
    conn.executemany(
        "INSERT INTO interview_analyses (transcript_file, analysis_json, analyzed_at, company, role) "
        "VALUES (?, ?, ?, ?, ?)",
        [
            (str(readable_path), '{"overall_score": 7}', "2026-01-01T10:00:00", "Acme Corp", "SRE"),
            ("/nonexistent/path/transcript.txt", '{"overall_score": 8}', "2026-01-02T10:00:00", "Beta Co", "DevOps"),
            ("/another/missing.txt", '{}', "2026-01-03T10:00:00", "", ""),
        ],
    )
    conn.commit()
    conn.close()
    return readable_path


# ============================================================================ #
# Tests
# ============================================================================ #


class TestFreshDbKindColumn:
    """Fresh DB (no prior interview_analyses) gets kind column and constraints."""

    def test_fresh_db_has_kind_column(self, tmp_path):
        from src.db import models

        conn = models.get_connection(tmp_path / "fresh.db")
        conn.close()

        raw = sqlite3.connect(str(tmp_path / "fresh.db"))
        cols = {row[1] for row in raw.execute("PRAGMA table_info(transcripts)").fetchall()}
        raw.close()
        assert "kind" in cols

    def test_fresh_db_kind_default_is_interview(self, tmp_path):
        from src.db import models

        conn = models.get_connection(tmp_path / "fresh.db")
        conn.execute(
            "INSERT INTO transcripts (source, full_text, segments_json) VALUES ('test', 'txt', '[]')"
        )
        conn.commit()
        row = conn.execute("SELECT kind FROM transcripts WHERE id = last_insert_rowid()").fetchone()
        conn.close()
        assert row[0] == "interview"

    def test_fresh_db_check_constraint_rejects_invalid_kind(self, tmp_path):
        from src.db import models

        conn = models.get_connection(tmp_path / "fresh.db")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO transcripts (source, full_text, segments_json, kind) "
                "VALUES ('test', 'txt', '[]', 'not_a_valid_kind')"
            )
            conn.commit()
        conn.close()

    def test_fresh_db_no_interview_analyses_no_error(self, tmp_path):
        """DB that never had interview_analyses passes migration without error."""
        from src.db import models

        conn = models.get_connection(tmp_path / "fresh.db")
        count = conn.execute("SELECT COUNT(*) FROM transcripts").fetchone()[0]
        conn.close()
        assert count == 0


class TestLegacyDbBackfill:
    """Existing DB with interview_analyses rows migrates cleanly."""

    def test_all_three_legacy_rows_land_in_transcripts(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        rows = conn.execute(
            "SELECT source, application_id, kind, segments_json "
            "FROM transcripts WHERE source = 'legacy_interview_analyses'"
        ).fetchall()
        conn.close()

        assert len(rows) == 3
        for row in rows:
            assert row[0] == "legacy_interview_analyses"
            assert row[1] is None          # application_id = NULL
            assert row[2] == "interview"   # kind = 'interview' (generic default)
            assert json.loads(row[3]) == []  # segments_json = '[]'

    def test_analysis_json_preserved_verbatim(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        rows = conn.execute(
            "SELECT analysis_json FROM transcripts WHERE source = 'legacy_interview_analyses' "
            "ORDER BY analyzed_at"
        ).fetchall()
        conn.close()

        assert json.loads(rows[0][0]) == {"overall_score": 7}
        assert json.loads(rows[1][0]) == {"overall_score": 8}
        assert json.loads(rows[2][0]) == {}

    def test_readable_file_contents_in_full_text(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        readable = _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        row = conn.execute(
            "SELECT full_text FROM transcripts WHERE source = 'legacy_interview_analyses' "
            "AND analyzed_at = '2026-01-01T10:00:00'"
        ).fetchone()
        conn.close()

        assert row[0] == "Hello this is a transcript."

    def test_missing_file_becomes_empty_string(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        row = conn.execute(
            "SELECT full_text FROM transcripts WHERE source = 'legacy_interview_analyses' "
            "AND analyzed_at = '2026-01-02T10:00:00'"
        ).fetchone()
        conn.close()

        assert row[0] == ""

    def test_analyzed_at_preserved(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        rows = conn.execute(
            "SELECT analyzed_at FROM transcripts WHERE source = 'legacy_interview_analyses' "
            "ORDER BY analyzed_at"
        ).fetchall()
        conn.close()

        assert rows[0][0] == "2026-01-01T10:00:00"
        assert rows[1][0] == "2026-01-02T10:00:00"
        assert rows[2][0] == "2026-01-03T10:00:00"

    def test_segments_json_for_backfilled_rows_is_empty_list(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        rows = conn.execute(
            "SELECT segments_json FROM transcripts WHERE source = 'legacy_interview_analyses'"
        ).fetchall()
        conn.close()

        for row in rows:
            assert json.loads(row[0]) == []

    def test_interview_analyses_table_dropped(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        result = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='interview_analyses'"
        ).fetchone()
        conn.close()

        assert result[0] == 0

    def test_existing_db_gets_kind_column(self, tmp_path):
        """Existing DB without kind column gets it added via ALTER TABLE."""
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        cols = {row[1] for row in conn.execute("PRAGMA table_info(transcripts)").fetchall()}
        conn.close()

        assert "kind" in cols

    def test_integrity_check_passes_after_migration(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        conn = models.get_connection(db_path)
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        conn.close()

        assert result == "ok"


class TestMigrationIdempotency:
    """Re-running migration on an already-migrated DB is safe."""

    def test_rerun_produces_no_duplicate_rows(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        # First run
        conn = models.get_connection(db_path)
        conn.close()

        # Second run (simulates process restart after successful migration)
        conn = models.get_connection(db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM transcripts WHERE source = 'legacy_interview_analyses'"
        ).fetchone()[0]
        conn.close()

        assert count == 3  # Not 6

    def test_rerun_does_not_error(self, tmp_path):
        db_path = tmp_path / "legacy.db"
        _seed_legacy_db(db_path)

        from src.db import models

        models.get_connection(db_path).close()
        # Should not raise
        models.get_connection(db_path).close()
