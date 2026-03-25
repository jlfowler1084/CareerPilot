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
