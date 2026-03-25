"""Tests for the interview transcription pipeline."""

from __future__ import annotations

import pytest

from src.transcripts.transcript_parser import (
    TranscriptSegment,
    TranscriptRecord,
    to_coach_turns,
    format_timestamp,
)


class TestTranscriptSegment:
    def test_create_segment(self):
        seg = TranscriptSegment(speaker="Speaker 1", text="Hello", start_time=0.0, end_time=2.5)
        assert seg.speaker == "Speaker 1"
        assert seg.text == "Hello"
        assert seg.start_time == 0.0
        assert seg.end_time == 2.5


class TestTranscriptRecord:
    def test_create_record(self):
        seg = TranscriptSegment(speaker="Interviewer", text="Hi", start_time=0.0, end_time=1.0)
        record = TranscriptRecord(
            source="samsung",
            segments=[seg],
            full_text="Hi",
            duration_seconds=1.0,
            language="en",
            audio_path=None,
            raw_metadata={},
        )
        assert record.source == "samsung"
        assert len(record.segments) == 1
        assert record.id is None

    def test_id_field_default_none(self):
        record = TranscriptRecord(
            source="otter", segments=[], full_text="", duration_seconds=0,
            language="en", audio_path=None, raw_metadata={},
        )
        assert record.id is None

    def test_id_field_settable(self):
        record = TranscriptRecord(
            source="whisper", segments=[], full_text="", duration_seconds=0,
            language="en", audio_path=None, raw_metadata={}, id=42,
        )
        assert record.id == 42


class TestFormatTimestamp:
    def test_zero(self):
        assert format_timestamp(0.0) == "00:00:00"

    def test_seconds_only(self):
        assert format_timestamp(45.0) == "00:00:45"

    def test_minutes_and_seconds(self):
        assert format_timestamp(125.0) == "00:02:05"

    def test_hours(self):
        assert format_timestamp(3661.0) == "01:01:01"


class TestToCoachTurns:
    def test_converts_segments_to_coach_format(self):
        segments = [
            TranscriptSegment(speaker="Interviewer", text="Tell me about yourself", start_time=0.0, end_time=5.0),
            TranscriptSegment(speaker="Candidate", text="I'm a systems engineer", start_time=5.0, end_time=10.0),
        ]
        record = TranscriptRecord(
            source="samsung", segments=segments, full_text="",
            duration_seconds=10.0, language="en", audio_path=None, raw_metadata={},
        )
        turns = to_coach_turns(record)
        assert len(turns) == 2
        assert turns[0]["speaker"] == "Interviewer"
        assert turns[0]["text"] == "Tell me about yourself"
        assert turns[0]["timestamp"] == "00:00:00"
        assert turns[1]["timestamp"] == "00:00:05"

    def test_empty_segments(self):
        record = TranscriptRecord(
            source="otter", segments=[], full_text="",
            duration_seconds=0, language="en", audio_path=None, raw_metadata={},
        )
        assert to_coach_turns(record) == []


from src.transcripts.samsung_importer import import_samsung


class TestSamsungImporter:
    def test_parse_speaker_labeled_with_timestamps(self, tmp_path):
        """Samsung transcript with 'Speaker N:' labels and [MM:SS] timestamps."""
        txt = tmp_path / "recording.txt"
        txt.write_text(
            "[00:00] Speaker 1: Hi, thanks for calling.\n"
            "[00:05] Speaker 2: Thanks for having me.\n"
            "[01:30] Speaker 1: Tell me about your experience.\n",
            encoding="utf-8",
        )
        record = import_samsung(str(txt))
        assert record.source == "samsung"
        assert len(record.segments) == 3
        assert record.segments[0].speaker == "Speaker 1"
        assert record.segments[0].start_time == 0.0
        assert record.segments[1].start_time == 5.0
        assert record.segments[2].start_time == 90.0

    def test_parse_speaker_labels_no_timestamps(self, tmp_path):
        """Samsung transcript with speaker labels but no timestamps."""
        txt = tmp_path / "recording.txt"
        txt.write_text(
            "Interviewer: What's your background?\n"
            "Joe: I've been in IT for 20 years.\n",
            encoding="utf-8",
        )
        record = import_samsung(str(txt))
        assert len(record.segments) == 2
        assert record.segments[0].speaker == "Interviewer"
        assert record.segments[1].speaker == "Joe"
        assert record.segments[0].start_time == 0.0

    def test_single_speaker_no_labels(self, tmp_path):
        """Plain text with no speaker labels — single speaker fallback."""
        txt = tmp_path / "notes.txt"
        txt.write_text("The interview went well. We discussed PowerShell automation.", encoding="utf-8")
        record = import_samsung(str(txt))
        assert len(record.segments) == 1
        assert record.segments[0].speaker == "Speaker"

    def test_directory_with_audio_and_transcript(self, tmp_path):
        """Directory containing both .txt and .m4a."""
        (tmp_path / "call.txt").write_text("Speaker 1: Hello\n", encoding="utf-8")
        (tmp_path / "call.m4a").write_bytes(b"fake audio")
        record = import_samsung(str(tmp_path))
        assert record.audio_path is not None
        assert record.audio_path.endswith(".m4a")
        assert len(record.segments) == 1

    def test_directory_audio_only_needs_whisper(self, tmp_path):
        """Directory with only audio — flags needs_whisper."""
        (tmp_path / "call.m4a").write_bytes(b"fake audio")
        record = import_samsung(str(tmp_path))
        assert record.raw_metadata.get("needs_whisper") is True
        assert len(record.segments) == 0
        assert record.audio_path is not None


from unittest.mock import MagicMock, patch
from click.testing import CliRunner
from cli import cli

from src.transcripts.otter_importer import import_otter


class TestOtterImporter:
    def test_parse_otter_txt_format(self, tmp_path):
        """Otter TXT with 'Speaker N  M:SS' format."""
        txt = tmp_path / "meeting.txt"
        txt.write_text(
            "Speaker 1  0:00\n"
            "Hello, thanks for calling about the systems engineer position.\n"
            "\n"
            "Speaker 2  0:05\n"
            "Hi, yes, I'm Joe Fowler, thanks for taking the time.\n"
            "\n"
            "Speaker 1  0:15\n"
            "Great. Tell me about your background.\n",
            encoding="utf-8",
        )
        record = import_otter(str(txt))
        assert record.source == "otter"
        assert len(record.segments) == 3
        assert record.segments[0].speaker == "Speaker 1"
        assert record.segments[0].start_time == 0.0
        assert record.segments[1].speaker == "Speaker 2"
        assert record.segments[1].start_time == 5.0
        assert record.segments[2].start_time == 15.0

    def test_parse_otter_txt_with_real_names(self, tmp_path):
        """Otter TXT with real speaker names instead of 'Speaker N'."""
        txt = tmp_path / "call.txt"
        txt.write_text(
            "Jane Smith  0:00\n"
            "Welcome to the interview.\n"
            "\n"
            "Joe Fowler  0:03\n"
            "Thank you for having me.\n",
            encoding="utf-8",
        )
        record = import_otter(str(txt))
        assert record.segments[0].speaker == "Jane Smith"
        assert record.segments[1].speaker == "Joe Fowler"

    def test_parse_srt_format(self, tmp_path):
        """Standard SRT subtitle format."""
        srt = tmp_path / "interview.srt"
        srt.write_text(
            "1\n"
            "00:00:00,000 --> 00:00:03,500\n"
            "Hello, welcome to the interview.\n"
            "\n"
            "2\n"
            "00:00:04,000 --> 00:00:08,000\n"
            "Thank you, glad to be here.\n"
            "\n"
            "3\n"
            "00:00:09,000 --> 00:00:15,500\n"
            "Tell me about your PowerShell experience.\n",
            encoding="utf-8",
        )
        record = import_otter(str(srt))
        assert record.source == "otter"
        assert len(record.segments) == 3
        assert record.segments[0].start_time == 0.0
        assert record.segments[1].start_time == 4.0
        assert record.segments[2].start_time == 9.0
        assert record.segments[2].end_time == 15.5


from src.transcripts.whisper_transcriber import transcribe, SUPPORTED_MODELS


class TestWhisperTranscriber:
    def test_supported_models(self):
        assert "base" in SUPPORTED_MODELS
        assert "tiny" in SUPPORTED_MODELS
        assert "large-v3" in SUPPORTED_MODELS

    @patch("src.transcripts.whisper_transcriber.WhisperModel")
    def test_transcribe_returns_record(self, mock_model_cls, tmp_path):
        """Mock faster-whisper and verify TranscriptRecord shape."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"fake audio data")

        mock_model = MagicMock()
        mock_model_cls.return_value = mock_model

        mock_seg1 = MagicMock()
        mock_seg1.start = 0.0
        mock_seg1.end = 3.0
        mock_seg1.text = " Hello, how are you?"

        mock_seg2 = MagicMock()
        mock_seg2.start = 3.5
        mock_seg2.end = 7.0
        mock_seg2.text = " I'm doing great, thanks."

        mock_info = MagicMock()
        mock_info.language = "en"
        mock_info.duration = 7.0

        mock_model.transcribe.return_value = ([mock_seg1, mock_seg2], mock_info)

        record = transcribe(str(audio), model_size="base")

        assert record.source == "whisper"
        assert len(record.segments) == 2
        assert record.segments[0].text == "Hello, how are you?"
        assert record.segments[1].start_time == 3.5
        assert record.language == "en"
        assert record.duration_seconds == 7.0
        assert record.audio_path == str(audio)

    def test_missing_faster_whisper_raises(self, tmp_path):
        """When faster-whisper is not installed, raise RuntimeError."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"fake")
        with patch("src.transcripts.whisper_transcriber.WhisperModel", None):
            with pytest.raises(RuntimeError, match="faster-whisper"):
                transcribe(str(audio))


import json
from src.transcripts.transcript_store import (
    store_transcript,
    list_transcripts,
    get_transcript,
    update_analysis,
    link_application,
    find_matching_application,
)
from src.db import models


class TestTranscriptStore:
    def test_store_and_retrieve_roundtrip(self, tmp_path):
        db_path = tmp_path / "test.db"
        seg = TranscriptSegment(speaker="Interviewer", text="Hello", start_time=0.0, end_time=2.0)
        record = TranscriptRecord(
            source="samsung", segments=[seg], full_text="Hello",
            duration_seconds=2.0, language="en", audio_path="/tmp/test.m4a",
            raw_metadata={"key": "value"},
        )
        row_id = store_transcript(record, db_path=db_path)
        assert row_id > 0

        retrieved = get_transcript(row_id, db_path=db_path)
        assert retrieved is not None
        assert retrieved.id == row_id
        assert retrieved.source == "samsung"
        assert retrieved.full_text == "Hello"
        assert len(retrieved.segments) == 1
        assert retrieved.segments[0].speaker == "Interviewer"
        assert retrieved.audio_path == "/tmp/test.m4a"
        assert retrieved.duration_seconds == 2.0

    def test_list_transcripts(self, tmp_path):
        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="otter", segments=[], full_text="Test transcript text here",
            duration_seconds=30.0, language="en", audio_path=None, raw_metadata={},
        )
        store_transcript(record, db_path=db_path)
        store_transcript(record, db_path=db_path)

        results = list_transcripts(db_path=db_path)
        assert len(results) == 2
        assert results[0]["source"] == "otter"
        assert "imported_at" in results[0]

    def test_update_analysis(self, tmp_path):
        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="whisper", segments=[], full_text="Interview text",
            duration_seconds=60.0, language="en", audio_path=None, raw_metadata={},
        )
        row_id = store_transcript(record, db_path=db_path)

        analysis = {"overall_score": 7, "technical_gaps": ["Kubernetes"]}
        update_analysis(row_id, analysis, db_path=db_path)

        conn = models.get_connection(db_path)
        try:
            row = conn.execute("SELECT analysis_json, analyzed_at FROM transcripts WHERE id = ?", (row_id,)).fetchone()
            assert row["analyzed_at"] is not None
            parsed = json.loads(row["analysis_json"])
            assert parsed["overall_score"] == 7
        finally:
            conn.close()

    def test_link_application(self, tmp_path):
        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="samsung", segments=[], full_text="",
            duration_seconds=0, language="en", audio_path=None, raw_metadata={},
        )
        row_id = store_transcript(record, db_path=db_path)

        conn = models.get_connection(db_path)
        try:
            cursor = conn.execute(
                "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
                ("Systems Engineer", "Acme Corp", "applied"),
            )
            app_id = cursor.lastrowid
            conn.commit()
        finally:
            conn.close()

        link_application(row_id, app_id, db_path=db_path)

        conn = models.get_connection(db_path)
        try:
            row = conn.execute("SELECT application_id FROM transcripts WHERE id = ?", (row_id,)).fetchone()
            assert row["application_id"] == app_id
        finally:
            conn.close()

    def test_find_matching_application(self, tmp_path):
        db_path = tmp_path / "test.db"
        conn = models.get_connection(db_path)
        try:
            conn.execute(
                "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
                ("DevOps Engineer", "CloudCo", "applied"),
            )
            conn.execute(
                "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
                ("SysAdmin", "Acme Corp", "found"),
            )
            conn.commit()
        finally:
            conn.close()

        match = find_matching_application("We discussed the DevOps role at CloudCo today", db_path=db_path)
        assert match is not None

    def test_find_matching_application_no_match(self, tmp_path):
        db_path = tmp_path / "test.db"
        conn = models.get_connection(db_path)
        try:
            conn.execute(
                "INSERT INTO applications (title, company, status) VALUES (?, ?, ?)",
                ("SysAdmin", "Acme Corp", "applied"),
            )
            conn.commit()
        finally:
            conn.close()

        match = find_matching_application("Interview about kitchen remodel", db_path=db_path)
        assert match is None


from src.transcripts.watch_folder import classify_file, process_file


class TestWatchFolder:
    def test_classify_srt_as_otter(self, tmp_path):
        f = tmp_path / "interview.srt"
        f.write_text("1\n00:00:00,000 --> 00:00:03,000\nHello\n", encoding="utf-8")
        assert classify_file(f) == "otter"

    def test_classify_otter_txt(self, tmp_path):
        f = tmp_path / "meeting.txt"
        f.write_text("Speaker 1  0:00\nHello there.\n", encoding="utf-8")
        assert classify_file(f) == "otter"

    def test_classify_samsung_txt(self, tmp_path):
        f = tmp_path / "call.txt"
        f.write_text("[00:00] Speaker 1: Hello\n", encoding="utf-8")
        assert classify_file(f) == "samsung"

    def test_classify_plain_txt_as_samsung(self, tmp_path):
        f = tmp_path / "notes.txt"
        f.write_text("The interview went well overall.\n", encoding="utf-8")
        assert classify_file(f) == "samsung"

    def test_classify_audio_as_whisper(self, tmp_path):
        f = tmp_path / "recording.m4a"
        f.write_bytes(b"fake audio")
        assert classify_file(f) == "whisper"

    def test_classify_mp3_as_whisper(self, tmp_path):
        f = tmp_path / "recording.mp3"
        f.write_bytes(b"fake audio")
        assert classify_file(f) == "whisper"

    def test_classify_unknown_extension(self, tmp_path):
        f = tmp_path / "data.csv"
        f.write_text("a,b,c", encoding="utf-8")
        assert classify_file(f) is None

    @patch("src.transcripts.watch_folder.import_samsung")
    def test_process_file_samsung(self, mock_import, tmp_path):
        mock_import.return_value = TranscriptRecord(
            source="samsung", segments=[], full_text="Hello",
            duration_seconds=5.0, language="en", audio_path=None, raw_metadata={},
        )
        f = tmp_path / "call.txt"
        f.write_text("[00:00] Speaker 1: Hello\n", encoding="utf-8")
        processed_dir = tmp_path / "processed"

        result = process_file(f, processed_dir, db_path=tmp_path / "test.db")
        assert result is not None
        assert not f.exists()  # moved to processed
        assert (processed_dir / "call.txt").exists()


class TestCLICommands:
    @patch("src.transcripts.samsung_importer.import_samsung")
    @patch("src.transcripts.transcript_store.store_transcript", return_value=1)
    def test_import_samsung_command(self, mock_store, mock_import, tmp_path):
        mock_import.return_value = TranscriptRecord(
            source="samsung",
            segments=[TranscriptSegment("Speaker 1", "Hi", 0.0, 1.0)],
            full_text="Hi", duration_seconds=1.0, language="en",
            audio_path=None, raw_metadata={},
        )
        txt = tmp_path / "call.txt"
        txt.write_text("Speaker 1: Hi\n", encoding="utf-8")
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "import-samsung", str(txt)], input="skip\n")
        assert result.exit_code == 0

    @patch("src.transcripts.otter_importer.import_otter")
    @patch("src.transcripts.transcript_store.store_transcript", return_value=2)
    def test_import_otter_command(self, mock_store, mock_import, tmp_path):
        mock_import.return_value = TranscriptRecord(
            source="otter",
            segments=[TranscriptSegment("Speaker 1", "Hello", 0.0, 3.0)],
            full_text="Hello", duration_seconds=3.0, language="en",
            audio_path=None, raw_metadata={},
        )
        txt = tmp_path / "meeting.txt"
        txt.write_text("Speaker 1  0:00\nHello\n", encoding="utf-8")
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "import-otter", str(txt)], input="skip\n")
        assert result.exit_code == 0

    @patch("src.transcripts.transcript_store.list_transcripts")
    def test_list_command(self, mock_list):
        mock_list.return_value = [
            {"id": 1, "source": "samsung", "duration_seconds": 120, "language": "en",
             "preview": "Hello there...", "imported_at": "2026-03-25T12:00:00",
             "application_id": None, "company": None, "app_title": None, "analyzed_at": None},
        ]
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "list"])
        assert result.exit_code == 0
        assert "samsung" in result.output

    @patch("src.interviews.coach.InterviewCoach.analyze_interview")
    @patch("src.transcripts.transcript_store.get_transcript")
    @patch("src.transcripts.transcript_store.update_analysis")
    def test_analyze_by_id(self, mock_update, mock_get, mock_analyze):
        mock_get.return_value = TranscriptRecord(
            source="samsung",
            segments=[
                TranscriptSegment("Interviewer", "Tell me about yourself", 0.0, 5.0),
                TranscriptSegment("Candidate", "I'm a systems engineer", 5.0, 10.0),
            ],
            full_text="Tell me about yourself I'm a systems engineer",
            duration_seconds=10.0, language="en", audio_path=None, raw_metadata={}, id=1,
        )
        mock_analyze.return_value = {
            "overall_score": 7,
            "questions_asked": ["Tell me about yourself"],
            "response_quality": [],
            "technical_gaps": [],
            "behavioral_assessment": {},
            "top_improvements": [],
            "practice_questions": [],
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["interview", "analyze", "1", "--company", "Test"], input="n\n")
        mock_get.assert_called_once_with(1)
        assert mock_analyze.called
