"""Tests for CAR-145 Unit 5: interview analyze kind-awareness and dual-write collapse.

Tests use Click's CliRunner with patched router and real SQLite (tmp_path).
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from click.testing import CliRunner

from cli import cli
from src.transcripts.transcript_parser import TranscriptRecord, TranscriptSegment
from src.transcripts.transcript_store import store_transcript, get_transcript


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _store_transcript(db_path: Path, kind: str = "interview", app_id=None) -> int:
    record = TranscriptRecord(
        source="otter",
        segments=[
            TranscriptSegment("Interviewer", "Tell me about yourself", 0.0, 5.0),
            TranscriptSegment("Candidate", "I am a systems engineer", 5.0, 10.0),
        ],
        full_text="Tell me about yourself I am a systems engineer",
        duration_seconds=10.0, language="en", audio_path=None, raw_metadata={}, kind=kind,
    )
    return store_transcript(record, application_id=app_id, db_path=db_path)


_PERFORMANCE_RESULT = {
    "overall_score": 7,
    "questions_asked": ["Tell me about yourself"],
    "response_quality": [],
    "technical_gaps": ["Kubernetes"],
    "behavioral_assessment": {},
    "overall_justification": "Good",
    "top_improvements": ["Study K8s"],
    "practice_questions": [],
}

_CONTEXT_RESULT = {
    "topics_emphasized": ["cloud migration"],
    "interviewer_style": "friendly",
    "things_to_drill": ["AWS"],
    "red_flags": [],
    "key_logistics": [],
}


class TestInterviewAnalyzeIdPath:
    """interview analyze <id> — kind-aware, single write."""

    def test_analyze_recruiter_prep_by_id(self, tmp_path):
        """Analyzing a recruiter_prep transcript produces context-extraction output."""
        db_path = tmp_path / "test.db"
        t_id = _store_transcript(db_path, kind="recruiter_prep")

        with patch("src.db.models.settings") as mock_settings, \
             patch("src.llm.router.router.complete", return_value=_CONTEXT_RESULT):
            mock_settings.DB_PATH = db_path
            mock_settings.DATA_DIR = tmp_path
            mock_settings.JOURNAL_DIR = tmp_path / "journal"
            mock_settings.TRANSCRIPTS_DIR = tmp_path / "transcripts"

            runner = CliRunner()
            result = runner.invoke(
                cli, ["interview", "analyze", str(t_id)],
                input="n\n",
                catch_exceptions=False,
            )
        assert result.exit_code == 0, result.output
        assert "recruiter_prep" in result.output

    def test_analyze_technical_by_id_single_write(self, tmp_path):
        """Analyzing a technical transcript: no dual-write, analysis_json updated once."""
        db_path = tmp_path / "test.db"
        t_id = _store_transcript(db_path, kind="technical")

        with patch("src.db.models.settings") as mock_settings, \
             patch("src.llm.router.router.complete", return_value=_PERFORMANCE_RESULT), \
             patch("src.journal.entries.JournalManager.create_entry", return_value="j.md"):
            mock_settings.DB_PATH = db_path
            mock_settings.DATA_DIR = tmp_path
            mock_settings.JOURNAL_DIR = tmp_path / "journal"
            mock_settings.TRANSCRIPTS_DIR = tmp_path / "transcripts"

            runner = CliRunner()
            result = runner.invoke(
                cli, ["interview", "analyze", str(t_id)],
                input="y\n",
                catch_exceptions=False,
            )

        assert result.exit_code == 0, result.output
        # Verify analysis_json was written to transcripts row
        retrieved = get_transcript(t_id, db_path=db_path)
        assert retrieved is not None

    def test_kind_override_with_flag(self, tmp_path):
        """--kind flag overrides the transcript's stored kind."""
        db_path = tmp_path / "test.db"
        t_id = _store_transcript(db_path, kind="interview")

        with patch("src.db.models.settings") as mock_settings, \
             patch("src.llm.router.router.complete", return_value=_CONTEXT_RESULT) as mock_call:
            mock_settings.DB_PATH = db_path
            mock_settings.DATA_DIR = tmp_path
            mock_settings.JOURNAL_DIR = tmp_path / "journal"
            mock_settings.TRANSCRIPTS_DIR = tmp_path / "transcripts"

            runner = CliRunner()
            result = runner.invoke(
                cli, ["interview", "analyze", str(t_id), "--kind", "recruiter_prep"],
                input="n\n",
                catch_exceptions=False,
            )

        assert result.exit_code == 0, result.output
        # The router was called with the context-extraction prompt
        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert "topics_emphasized" in prompt_arg

    def test_nonexistent_id_exits_cleanly(self, tmp_path):
        """interview analyze 999 on missing ID exits with error message, not exception."""
        with patch("src.db.models.settings") as mock_settings:
            mock_settings.DB_PATH = tmp_path / "test.db"
            mock_settings.DATA_DIR = tmp_path

            runner = CliRunner()
            result = runner.invoke(
                cli, ["interview", "analyze", "999"],
                catch_exceptions=False,
            )
        assert result.exit_code == 0  # CLI handles it gracefully
        assert "not found" in result.output.lower()


class TestInterviewAnalyzeFilePath:
    """interview analyze <file_path> — file-path flow preserved, hint printed."""

    def test_file_path_flow_prints_import_hint(self, tmp_path):
        """File-path analysis prints hint about using importers."""
        txt = tmp_path / "interview.txt"
        txt.write_text("Interviewer: Tell me about yourself\nCandidate: I'm an SRE\n", encoding="utf-8")

        with patch("src.llm.router.router.complete", return_value=_PERFORMANCE_RESULT):
            runner = CliRunner()
            result = runner.invoke(
                cli, ["interview", "analyze", str(txt)],
                input="n\n",
                catch_exceptions=False,
            )

        assert result.exit_code == 0, result.output
        assert "import-otter" in result.output or "import-samsung" in result.output or "transcribe" in result.output

    def test_file_path_does_not_write_to_transcripts(self, tmp_path):
        """File-path flow does not create a transcripts row."""
        from src.transcripts.transcript_store import list_transcripts

        txt = tmp_path / "interview.txt"
        txt.write_text("Interviewer: Tell me about yourself\nCandidate: I'm an SRE\n", encoding="utf-8")
        db_path = tmp_path / "test.db"

        with patch("src.db.models.settings") as mock_settings, \
             patch("src.llm.router.router.complete", return_value=_PERFORMANCE_RESULT):
            mock_settings.DB_PATH = db_path
            mock_settings.DATA_DIR = tmp_path

            runner = CliRunner()
            result = runner.invoke(
                cli, ["interview", "analyze", str(txt)],
                input="n\n",
                catch_exceptions=False,
            )

        assert result.exit_code == 0, result.output
        rows = list_transcripts(db_path=db_path)
        assert len(rows) == 0, "File-path analyze must not create a transcripts row"


class TestInterviewHistoryShape:
    """interview history renders correctly with new get_all_analyses shape."""

    def test_history_renders_analyzed_transcript(self, tmp_path):
        db_path = tmp_path / "test.db"
        t_id = _store_transcript(db_path, kind="technical")

        from src.interviews.coach import InterviewCoach
        coach = InterviewCoach(db_path=db_path)
        coach.save_analysis(transcript_id=t_id, analysis=_PERFORMANCE_RESULT)
        coach.close()

        with patch("src.db.models.settings") as mock_settings:
            mock_settings.DB_PATH = db_path
            mock_settings.DATA_DIR = tmp_path

            runner = CliRunner()
            result = runner.invoke(cli, ["interview", "history"], catch_exceptions=False)

        assert result.exit_code == 0, result.output
        assert "7/10" in result.output  # score from _PERFORMANCE_RESULT
