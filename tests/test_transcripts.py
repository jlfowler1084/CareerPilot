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
