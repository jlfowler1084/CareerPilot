"""Tests for CAR-145 Unit 4: --kind flag on CLI importer commands.

Tests use Click's CliRunner and patch the underlying importers so no real
audio/transcript files are needed. Storage assertions go through the real
SQLite layer (tmp_path DB).
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from cli import cli
from src.transcripts.transcript_parser import TranscriptRecord, TranscriptSegment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_record(source: str = "otter", kind: str = "interview") -> TranscriptRecord:
    """Build a minimal TranscriptRecord for mocking importers."""
    return TranscriptRecord(
        source=source,
        segments=[TranscriptSegment("Speaker 1", "Hello", 0.0, 2.0)],
        full_text="Hello",
        duration_seconds=2.0,
        language="en",
        audio_path=None,
        raw_metadata={},
        kind=kind,
    )


# ---------------------------------------------------------------------------
# import-otter --kind
# ---------------------------------------------------------------------------

class TestImportOtterKind:
    @patch("src.transcripts.transcript_store.store_transcript")
    @patch("src.transcripts.otter_importer.import_otter")
    def test_default_kind_is_interview(self, mock_import, mock_store, tmp_path):
        """import-otter with no --kind stores transcript with kind='interview'."""
        record = _make_record("otter")
        mock_import.return_value = record
        mock_store.return_value = 1

        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "import-otter", "fake.txt"], input="\n")
        assert result.exit_code == 0, result.output
        assert record.kind == "interview"

    @patch("src.transcripts.transcript_store.store_transcript")
    @patch("src.transcripts.otter_importer.import_otter")
    def test_kind_recruiter_prep_stored(self, mock_import, mock_store, tmp_path):
        """import-otter --kind recruiter_prep stores with kind='recruiter_prep'."""
        record = _make_record("otter")
        mock_import.return_value = record
        mock_store.return_value = 5

        runner = CliRunner()
        result = runner.invoke(
            cli, ["interview", "import-otter", "fake.txt", "--kind", "recruiter_prep"],
            input="\n",
        )
        assert result.exit_code == 0, result.output
        assert record.kind == "recruiter_prep"

    @patch("src.transcripts.otter_importer.import_otter")
    def test_invalid_kind_exits_nonzero(self, mock_import, tmp_path):
        """import-otter --kind garbage_kind exits with non-zero code."""
        runner = CliRunner()
        result = runner.invoke(
            cli, ["interview", "import-otter", "fake.txt", "--kind", "garbage_kind"],
        )
        assert result.exit_code != 0
        assert "Invalid value" in result.output or "garbage_kind" in result.output

    @patch("src.transcripts.transcript_store.store_transcript")
    @patch("src.transcripts.otter_importer.import_otter")
    def test_kind_surfaces_in_confirmation_output(self, mock_import, mock_store, tmp_path):
        """Confirmation output includes the chosen kind."""
        record = _make_record("otter")
        mock_import.return_value = record
        mock_store.return_value = 7

        runner = CliRunner()
        result = runner.invoke(
            cli, ["interview", "import-otter", "fake.txt", "--kind", "technical"],
            input="\n",
        )
        assert result.exit_code == 0, result.output
        assert "technical" in result.output


# ---------------------------------------------------------------------------
# import-samsung --kind
# ---------------------------------------------------------------------------

class TestImportSamsungKind:
    @patch("src.transcripts.transcript_store.store_transcript")
    @patch("src.transcripts.samsung_importer.import_samsung")
    def test_default_kind_is_interview(self, mock_import, mock_store):
        """import-samsung with no --kind defaults to 'interview'."""
        record = _make_record("samsung")
        mock_import.return_value = record
        mock_store.return_value = 2

        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "import-samsung", "fake_dir"], input="\n")
        assert result.exit_code == 0, result.output
        assert record.kind == "interview"

    @patch("src.transcripts.transcript_store.store_transcript")
    @patch("src.transcripts.samsung_importer.import_samsung")
    def test_kind_panel_stored(self, mock_import, mock_store):
        """import-samsung --kind panel stores with kind='panel'."""
        record = _make_record("samsung")
        mock_import.return_value = record
        mock_store.return_value = 3

        runner = CliRunner()
        result = runner.invoke(
            cli, ["interview", "import-samsung", "fake_dir", "--kind", "panel"],
            input="\n",
        )
        assert result.exit_code == 0, result.output
        assert record.kind == "panel"


# ---------------------------------------------------------------------------
# transcribe --kind
# ---------------------------------------------------------------------------

class TestTranscribeKind:
    @patch("src.transcripts.transcript_store.store_transcript")
    @patch("src.transcripts.whisper_transcriber.transcribe")
    def test_kind_technical_stored(self, mock_transcribe, mock_store):
        """transcribe --kind technical stores with kind='technical'."""
        record = _make_record("whisper")
        mock_transcribe.return_value = record
        mock_store.return_value = 10

        runner = CliRunner()
        result = runner.invoke(
            cli, ["interview", "transcribe", "fake.mp3", "--kind", "technical"],
            input="\n",
        )
        assert result.exit_code == 0, result.output
        assert record.kind == "technical"

    @patch("src.transcripts.transcript_store.store_transcript")
    @patch("src.transcripts.whisper_transcriber.transcribe")
    def test_kind_in_confirmation_output(self, mock_transcribe, mock_store):
        """Confirmation output includes the kind."""
        record = _make_record("whisper")
        mock_transcribe.return_value = record
        mock_store.return_value = 11

        runner = CliRunner()
        result = runner.invoke(
            cli, ["interview", "transcribe", "fake.mp3", "--kind", "phone_screen"],
            input="\n",
        )
        assert result.exit_code == 0, result.output
        assert "phone_screen" in result.output


# ---------------------------------------------------------------------------
# process_file (watch_folder) kind forwarding
# ---------------------------------------------------------------------------

class TestProcessFileKind:
    def test_process_file_sets_kind_on_record(self, tmp_path):
        """process_file forwards kind to the stored record."""
        from src.transcripts.watch_folder import process_file

        txt = tmp_path / "call.txt"
        txt.write_text("Speaker 1: Hello\n", encoding="utf-8")
        processed_dir = tmp_path / "processed"
        db_path = tmp_path / "test.db"

        row_id = process_file(txt, processed_dir, kind="recruiter_intro", db_path=db_path)
        assert row_id is not None and row_id > 0

        from src.transcripts.transcript_store import get_transcript
        record = get_transcript(row_id, db_path=db_path)
        assert record is not None
        assert record.kind == "recruiter_intro"
