"""Tests for interview transcript analysis and coaching."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

from src.interviews.transcripts import TranscriptLoader
from src.interviews.coach import InterviewCoach


# --- Fixtures ---


@pytest.fixture
def tmp_transcripts(tmp_path):
    """Create a TranscriptLoader with a temp directory."""
    return TranscriptLoader(transcripts_dir=tmp_path)


@pytest.fixture
def coach(tmp_path):
    """Create an InterviewCoach with a temp database."""
    db_path = tmp_path / "test.db"
    c = InterviewCoach(db_path=db_path)
    yield c
    c.close()


def _mock_claude_response(text):
    """Create a mock Claude API response."""
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = text
    mock_response.content = [mock_content]
    return mock_response


# --- TranscriptLoader Tests ---


class TestLoadTranscript:
    def test_loads_txt_file(self, tmp_transcripts, tmp_path):
        """Loads a .txt transcript file."""
        transcript = tmp_path / "interview.txt"
        transcript.write_text("Interviewer: Tell me about yourself.\nJoe: I'm a systems engineer.", encoding="utf-8")

        turns = tmp_transcripts.load_transcript("interview.txt")
        assert turns is not None
        assert len(turns) == 2

    def test_loads_md_file(self, tmp_transcripts, tmp_path):
        """Loads a .md transcript file."""
        transcript = tmp_path / "interview.md"
        transcript.write_text("Interviewer: What's your experience?\nJoe: Five years in IT.", encoding="utf-8")

        turns = tmp_transcripts.load_transcript("interview.md")
        assert turns is not None
        assert len(turns) == 2

    def test_loads_vtt_file(self, tmp_transcripts, tmp_path):
        """Loads a .vtt transcript file."""
        vtt_content = (
            "WEBVTT\n\n"
            "00:00:01.000 --> 00:00:05.000\n"
            "Interviewer: Welcome to the interview.\n\n"
            "00:00:06.000 --> 00:00:10.000\n"
            "Joe: Thanks for having me.\n"
        )
        transcript = tmp_path / "interview.vtt"
        transcript.write_text(vtt_content, encoding="utf-8")

        turns = tmp_transcripts.load_transcript("interview.vtt")
        assert turns is not None
        assert len(turns) == 2
        assert turns[0]["timestamp"] is not None

    def test_loads_srt_file(self, tmp_transcripts, tmp_path):
        """Loads an .srt transcript file."""
        srt_content = (
            "1\n"
            "00:00:01,000 --> 00:00:05,000\n"
            "Interviewer: First question.\n\n"
            "2\n"
            "00:00:06,000 --> 00:00:10,000\n"
            "Candidate: My answer.\n"
        )
        transcript = tmp_path / "interview.srt"
        transcript.write_text(srt_content, encoding="utf-8")

        turns = tmp_transcripts.load_transcript("interview.srt")
        assert turns is not None
        assert len(turns) == 2

    def test_nonexistent_file_returns_none(self, tmp_transcripts):
        """Returns None for nonexistent files."""
        result = tmp_transcripts.load_transcript("does_not_exist.txt")
        assert result is None

    def test_unsupported_extension_returns_none(self, tmp_transcripts, tmp_path):
        """Returns None for unsupported file types."""
        bad_file = tmp_path / "interview.pdf"
        bad_file.write_text("some content", encoding="utf-8")

        result = tmp_transcripts.load_transcript("interview.pdf")
        assert result is None

    def test_empty_file_returns_none(self, tmp_transcripts, tmp_path):
        """Returns None for empty files."""
        empty = tmp_path / "empty.txt"
        empty.write_text("", encoding="utf-8")

        result = tmp_transcripts.load_transcript("empty.txt")
        assert result is None

    def test_absolute_path(self, tmp_transcripts, tmp_path):
        """Accepts absolute file paths."""
        transcript = tmp_path / "interview.txt"
        transcript.write_text("Interviewer: Hello.\nCandidate: Hi.", encoding="utf-8")

        turns = tmp_transcripts.load_transcript(str(transcript))
        assert turns is not None
        assert len(turns) == 2


class TestParseSpeakers:
    def test_labeled_speakers(self, tmp_transcripts):
        """Parses 'Speaker: text' format."""
        text = "Interviewer: What is PowerShell?\nJoe: It's a task automation framework."
        turns = tmp_transcripts.parse_speakers(text)

        assert len(turns) == 2
        assert turns[0]["speaker"] == "Interviewer"
        assert "PowerShell" in turns[0]["text"]
        assert turns[1]["speaker"] == "Joe"

    def test_various_speaker_labels(self, tmp_transcripts):
        """Parses various speaker name formats."""
        text = (
            "Speaker 1: First question.\n"
            "Speaker 2: First answer.\n"
            "Speaker 1: Second question.\n"
            "Speaker 2: Second answer."
        )
        turns = tmp_transcripts.parse_speakers(text)
        assert len(turns) == 4
        assert turns[0]["speaker"] == "Speaker 1"
        assert turns[1]["speaker"] == "Speaker 2"

    def test_vtt_with_speaker_tags(self, tmp_transcripts):
        """Parses VTT format with <v Speaker> tags."""
        text = (
            "WEBVTT\n\n"
            "00:00:01.000 --> 00:00:05.000\n"
            "<v Interviewer>Tell me about Docker.</v>\n\n"
            "00:00:06.000 --> 00:00:10.000\n"
            "<v Candidate>I have basic container experience.</v>\n"
        )
        turns = tmp_transcripts.parse_speakers(text)
        assert len(turns) == 2
        assert turns[0]["speaker"] == "Interviewer"
        assert turns[1]["speaker"] == "Candidate"

    def test_timestamped_with_labels(self, tmp_transcripts):
        """Parses timestamps with speaker labels."""
        text = (
            "00:00:01.000 --> 00:00:05.000\n"
            "Interviewer: First question.\n\n"
            "00:00:06.000 --> 00:00:10.000\n"
            "Candidate: First answer.\n"
        )
        turns = tmp_transcripts.parse_speakers(text)
        assert len(turns) == 2
        assert turns[0]["timestamp"] is not None

    def test_claude_fallback_for_unlabeled(self, tmp_transcripts):
        """Falls back to router when no speaker patterns detected."""
        unlabeled = "Hi, welcome.\nThanks, glad to be here."

        labeled_response = "Interviewer: Hi, welcome.\nCandidate: Thanks, glad to be here."

        with patch("src.llm.router.router.complete", return_value=labeled_response):
            turns = tmp_transcripts.parse_speakers(unlabeled)

        assert len(turns) == 2
        assert turns[0]["speaker"] == "Interviewer"
        assert turns[1]["speaker"] == "Candidate"

    def test_claude_fallback_on_error(self, tmp_transcripts):
        """Returns raw text as single block when router fails."""
        unlabeled = "Hi, welcome.\nThanks, glad to be here."

        with patch("src.llm.router.router.complete", side_effect=Exception("API down")):
            turns = tmp_transcripts.parse_speakers(unlabeled)

        assert len(turns) == 1
        assert turns[0]["speaker"] == "Unknown"


# --- InterviewCoach Tests ---


class TestAnalyzeInterview:
    def test_returns_structured_analysis(self, coach):
        """Returns a structured dict from the router's analysis."""
        mock_result = {
            "questions_asked": ["Tell me about yourself"],
            "response_quality": [{
                "question": "Tell me about yourself",
                "summary": "Described IT background",
                "rating": 3,
                "strengths": "Clear communication",
                "weaknesses": "Lacked specifics",
            }],
            "technical_gaps": ["Docker", "Kubernetes"],
            "behavioral_assessment": {
                "star_usage": "Minimal",
                "communication_clarity": "Good",
                "enthusiasm": "Moderate",
                "confidence": "Good",
            },
            "overall_score": 6,
            "overall_justification": "Solid fundamentals but gaps in containers",
            "top_improvements": ["Learn Docker basics", "Practice STAR format", "Research company"],
            "practice_questions": ["Describe a Docker deployment", "Tell me about a time...",
                                   "What is CI/CD?", "Explain IaC", "Kubernetes basics"],
        }

        with patch("src.llm.router.router.complete", return_value=mock_result):
            result = coach.analyze_interview(
                [{"speaker": "Interviewer", "text": "Tell me about yourself", "timestamp": None},
                 {"speaker": "Joe", "text": "I'm a systems engineer", "timestamp": None}],
                job_title="Systems Engineer",
                company="Acme Corp",
            )

        assert result is not None
        assert result["overall_score"] == 6
        assert len(result["technical_gaps"]) == 2
        assert len(result["response_quality"]) == 1
        assert len(result["practice_questions"]) == 5

    def test_handles_api_failure(self, coach):
        """Returns None when router fails."""
        with patch("src.llm.router.router.complete", side_effect=Exception("API error")):
            result = coach.analyze_interview(
                [{"speaker": "Interviewer", "text": "Hello", "timestamp": None}],
            )

        assert result is None

    def test_handles_bad_json(self, coach):
        """Returns None when router returns None."""
        with patch("src.llm.router.router.complete", return_value=None):
            result = coach.analyze_interview(
                [{"speaker": "Interviewer", "text": "Hello", "timestamp": None}],
            )

        assert result is None


class TestCompareInterviews:
    def test_compares_multiple_analyses(self, coach):
        """Returns comparison dict for multiple analyses."""
        comparison_json = json.dumps({
            "recurring_weak_topics": ["Docker", "CI/CD"],
            "improved_skills": ["PowerShell"],
            "persistent_gaps": ["Kubernetes"],
            "trajectory": "improving",
            "trajectory_explanation": "Showing steady improvement in core areas",
            "recommendations": ["Focus on containers", "Practice more", "Study IaC"],
        })

        analyses = [
            {"analysis": {"overall_score": 5, "technical_gaps": ["Docker"], "top_improvements": ["Learn Docker"]},
             "company": "Corp A", "role": "SysEng", "analyzed_at": "2026-03-01"},
            {"analysis": {"overall_score": 7, "technical_gaps": ["CI/CD"], "top_improvements": ["CI/CD pipelines"]},
             "company": "Corp B", "role": "DevOps", "analyzed_at": "2026-03-15"},
        ]

        mock_result = json.loads(comparison_json)
        with patch("src.llm.router.router.complete", return_value=mock_result):
            result = coach.compare_interviews(analyses)

        assert result is not None
        assert result["trajectory"] == "improving"
        assert len(result["recurring_weak_topics"]) == 2
        assert len(result["recommendations"]) == 3

    def test_requires_minimum_2_analyses(self, coach):
        """Returns None when fewer than 2 analyses provided."""
        result = coach.compare_interviews([{"analysis": {"overall_score": 5}}])
        assert result is None

    def test_empty_list_returns_none(self, coach):
        """Returns None for empty list."""
        result = coach.compare_interviews([])
        assert result is None


class TestMockInterview:
    def test_full_mock_flow(self, coach):
        """Runs through full mock interview with mocked I/O and router."""
        mock_eval = {
            "rating": 4,
            "strengths": "Good explanation",
            "weaknesses": "Could mention Group Policy",
            "ideal_answer_points": ["Domain services", "Group Policy", "LDAP"],
        }
        mock_summary = {
            "overall_score": 7,
            "overall_justification": "Strong fundamentals",
            "top_improvements": ["Study Group Policy in depth"],
            "practice_questions": ["Explain GPO inheritance"],
            "technical_gaps": ["Group Policy"],
        }

        def side_effect(task, prompt, **kwargs):
            if task == "interview_question_gen":
                return "What is Active Directory?"
            if task == "interview_answer_eval":
                return mock_eval
            if task == "interview_summary":
                return mock_summary
            raise ValueError(f"unexpected task: {task}")

        with patch("src.llm.router.router.complete", side_effect=side_effect):
            outputs = []
            result = coach.mock_interview(
                role_description="Systems Engineer with AD experience",
                num_questions=1,
                input_fn=lambda prompt: "AD manages users and computers in a domain",
                output_fn=lambda text: outputs.append(text),
            )

        assert result is not None
        assert result["overall_score"] == 7
        assert len(result["qa_pairs"]) == 1
        assert result["qa_pairs"][0]["answer"] == "AD manages users and computers in a domain"

    def test_handles_question_generation_failure(self, coach):
        """Returns None when question generation fails."""
        with patch("src.llm.router.router.complete", side_effect=Exception("API error")):
            result = coach.mock_interview(
                role_description="Test role",
                num_questions=1,
                input_fn=lambda prompt: "answer",
                output_fn=lambda text: None,
            )

        assert result is None


class TestSaveAndRetrieveAnalysis:
    """Rewritten for CAR-145: save_analysis now writes to transcripts.analysis_json."""

    def _store(self, coach, kind: str = "interview") -> int:
        """Store a transcript in the coach's DB and return its id."""
        from src.transcripts.transcript_store import store_transcript
        from src.transcripts.transcript_parser import TranscriptRecord
        record = TranscriptRecord(
            source="otter", segments=[], full_text="Interview text",
            duration_seconds=60, language="en", audio_path=None, raw_metadata={}, kind=kind,
        )
        return store_transcript(record, db_path=coach._db_path)

    def test_save_and_get_all(self, coach):
        """Saves analysis to transcript row and retrieves via get_all_analyses."""
        t_id = self._store(coach)
        analysis = {"overall_score": 7, "technical_gaps": ["Docker"]}
        coach.save_analysis(transcript_id=t_id, analysis=analysis)

        all_analyses = coach.get_all_analyses()
        assert len(all_analyses) == 1
        assert all_analyses[0]["analysis"]["overall_score"] == 7
        assert all_analyses[0]["id"] == t_id

    def test_get_single_analysis(self, coach):
        """Retrieves a single analysis by transcript id."""
        t_id = self._store(coach)
        analysis = {"overall_score": 8, "technical_gaps": []}
        coach.save_analysis(transcript_id=t_id, analysis=analysis)

        result = coach.get_analysis(t_id)
        assert result is not None
        assert result["analysis"]["overall_score"] == 8

    def test_get_nonexistent_returns_none(self, coach):
        """Returns None for nonexistent transcript id."""
        result = coach.get_analysis(999)
        assert result is None

    def test_multiple_analyses_ordered(self, coach):
        """Multiple analyses returned newest-analyzed first."""
        t1 = self._store(coach)
        t2 = self._store(coach)
        coach.save_analysis(transcript_id=t1, analysis={"overall_score": 5})
        coach.save_analysis(transcript_id=t2, analysis={"overall_score": 7})

        all_analyses = coach.get_all_analyses()
        assert len(all_analyses) == 2
        # Newest first (t2 was saved after t1)
        assert all_analyses[0]["analysis"]["overall_score"] == 7
        assert all_analyses[1]["analysis"]["overall_score"] == 5


class TestJournalIntegration:
    def test_journal_entry_created_after_analysis(self, coach, tmp_path):
        """Verifies journal entry creation works with analysis data."""
        from src.journal.entries import JournalManager

        journal_dir = tmp_path / "journal"
        manager = JournalManager(journal_dir=journal_dir)

        analysis = {
            "overall_score": 6,
            "technical_gaps": ["Docker", "Kubernetes"],
            "top_improvements": ["Learn containers", "Practice STAR"],
        }

        content = (
            f"## Interview Analysis\n\n"
            f"**Overall Score:** {analysis['overall_score']}/10\n\n"
            f"### Technical Gaps\n"
            + "\n".join(f"- {g}" for g in analysis["technical_gaps"]) + "\n\n"
            f"### Top Improvements\n"
            + "\n".join(f"- {imp}" for imp in analysis["top_improvements"])
        )

        filename = manager.create_entry("interview", content, tags=["interview", "analysis"])
        assert filename.endswith(".md")
        assert "interview" in filename

        entry = manager.get_entry(filename)
        assert entry is not None
        assert "Docker" in entry["content"]
        assert entry["type"] == "interview"


class TestCompareFromSQLite:
    """Rewritten for CAR-145: compare loads from transcripts.analysis_json."""

    def _save(self, coach, analysis: dict) -> int:
        from src.transcripts.transcript_store import store_transcript
        from src.transcripts.transcript_parser import TranscriptRecord
        record = TranscriptRecord(
            source="otter", segments=[], full_text="text",
            duration_seconds=60, language="en", audio_path=None, raw_metadata={},
        )
        t_id = store_transcript(record, db_path=coach._db_path)
        coach.save_analysis(transcript_id=t_id, analysis=analysis)
        return t_id

    def test_compare_pulls_from_db(self, coach):
        """Compare function loads analyses from transcripts table when none provided."""
        self._save(coach, {"overall_score": 5, "technical_gaps": ["Docker"], "top_improvements": ["A"]})
        self._save(coach, {"overall_score": 7, "technical_gaps": ["CI/CD"], "top_improvements": ["B"]})

        mock_result = {
            "recurring_weak_topics": ["containers"],
            "improved_skills": [],
            "persistent_gaps": ["Docker"],
            "trajectory": "improving",
            "trajectory_explanation": "Getting better",
            "recommendations": ["Study more"],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result):
            result = coach.compare_interviews()

        assert result is not None
        assert result["trajectory"] == "improving"

    def test_compare_fails_with_one_analysis(self, coach):
        """Returns None when only 1 analysis in DB."""
        self._save(coach, {"overall_score": 5, "technical_gaps": []})

        result = coach.compare_interviews()
        assert result is None


# ============================================================================ #
# Unit 3 — kind-aware coach (CAR-145). Written test-first.
# ============================================================================ #

_SAMPLE_TURNS = [
    {"speaker": "Interviewer", "text": "Tell me about yourself", "timestamp": "00:00:05"},
    {"speaker": "Candidate", "text": "I'm a systems engineer", "timestamp": "00:00:15"},
]


class TestAnalyzeInterviewKindBranching:
    """analyze_interview branches on kind to the right prompt path."""

    def test_context_kind_uses_extraction_prompt(self, coach):
        """recruiter_prep kind → router called with context-extraction prompt (topics_emphasized)."""
        mock_result = {
            "topics_emphasized": ["cloud migration"],
            "interviewer_style": "friendly",
            "things_to_drill": ["AWS"],
            "red_flags": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = coach.analyze_interview(_SAMPLE_TURNS, kind="recruiter_prep")
        assert mock_call.called
        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert "topics_emphasized" in prompt_arg, (
            "context-extraction prompt must mention 'topics_emphasized'"
        )

    def test_performance_kind_prompt_does_not_use_extraction_prompt(self, coach):
        """technical kind → router called without context-extraction language."""
        mock_result = {
            "overall_score": 7, "questions_asked": [], "response_quality": [],
            "technical_gaps": [], "behavioral_assessment": {}, "overall_justification": "",
            "top_improvements": [], "practice_questions": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            coach.analyze_interview(_SAMPLE_TURNS, kind="technical")
        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert "topics_emphasized" not in prompt_arg

    def test_default_kind_interview_uses_performance_path(self, coach):
        """No kind argument defaults to 'interview', uses performance path."""
        mock_result = {
            "overall_score": 6, "questions_asked": [], "response_quality": [],
            "technical_gaps": [], "behavioral_assessment": {}, "overall_justification": "",
            "top_improvements": [], "practice_questions": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = coach.analyze_interview(_SAMPLE_TURNS)
        assert result is not None
        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert "topics_emphasized" not in prompt_arg

    def test_invalid_kind_raises_value_error(self, coach):
        with pytest.raises(ValueError, match="Invalid"):
            coach.analyze_interview(_SAMPLE_TURNS, kind="garbage_kind")


class TestAnalyzeInterviewContextAggregation:
    """Performance-kind analysis pulls prior context transcripts for the same application."""

    @pytest.fixture
    def coach_with_prep_context(self, tmp_path):
        """Coach + DB seeded with a recruiter_prep transcript for app 1."""
        from src.transcripts.transcript_store import store_transcript, update_analysis
        from src.transcripts.transcript_parser import TranscriptRecord

        db_path = tmp_path / "test.db"
        from src.db import models
        conn = models.get_connection(db_path)
        conn.execute("INSERT INTO applications (id, title, company) VALUES (1, 'SRE', 'Acme')")
        conn.commit()
        conn.close()

        prep_record = TranscriptRecord(
            source="otter", segments=[], full_text="Prep call text",
            duration_seconds=300, language="en", audio_path=None, raw_metadata={},
            kind="recruiter_prep",
        )
        prep_id = store_transcript(prep_record, application_id=1, db_path=db_path)
        update_analysis(prep_id, {"topics_emphasized": ["cloud"], "things_to_drill": ["AWS"]}, db_path=db_path)

        c = InterviewCoach(db_path=db_path)
        yield c, db_path
        c.close()

    def test_prior_context_prepended_for_technical_kind(self, coach_with_prep_context):
        """technical kind with application_id → prompt includes Prior context block."""
        coach, _ = coach_with_prep_context
        mock_result = {
            "overall_score": 7, "questions_asked": [], "response_quality": [],
            "technical_gaps": [], "behavioral_assessment": {}, "overall_justification": "",
            "top_improvements": [], "practice_questions": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            coach.analyze_interview(_SAMPLE_TURNS, kind="technical", application_id=1)
        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert "Prior context" in prompt_arg

    def test_mock_kind_skips_context_query(self, coach_with_prep_context):
        """mock kind → no Prior context block (mock is self-driven, no app context)."""
        coach, _ = coach_with_prep_context
        mock_result = {
            "overall_score": 8, "questions_asked": [], "response_quality": [],
            "technical_gaps": [], "behavioral_assessment": {}, "overall_justification": "",
            "top_improvements": [], "practice_questions": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            coach.analyze_interview(_SAMPLE_TURNS, kind="mock")
        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert "Prior context" not in prompt_arg

    def test_no_prior_context_omits_context_block(self, tmp_path):
        """Performance kind with application_id but zero prior context → no context block."""
        from src.db import models
        db_path = tmp_path / "test.db"
        conn = models.get_connection(db_path)
        conn.execute("INSERT INTO applications (id, title, company) VALUES (99, 'SRE', 'Acme')")
        conn.commit()
        conn.close()

        mock_result = {
            "overall_score": 5, "questions_asked": [], "response_quality": [],
            "technical_gaps": [], "behavioral_assessment": {}, "overall_justification": "",
            "top_improvements": [], "practice_questions": [],
        }
        coach = InterviewCoach(db_path=db_path)
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            coach.analyze_interview(_SAMPLE_TURNS, kind="technical", application_id=99)
        coach.close()

        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert "Prior context" not in prompt_arg

    def test_context_truncated_to_10k_chars(self, tmp_path):
        """Combined prior context > 10k chars is truncated before prompt injection."""
        from src.transcripts.transcript_store import store_transcript, update_analysis
        from src.transcripts.transcript_parser import TranscriptRecord
        from src.db import models

        db_path = tmp_path / "test.db"
        conn = models.get_connection(db_path)
        conn.execute("INSERT INTO applications (id, title, company) VALUES (1, 'SRE', 'Acme')")
        conn.commit()
        conn.close()

        # Seed a prep transcript with a huge analysis_json
        big_analysis = {"topics_emphasized": ["x" * 11000]}
        prep_record = TranscriptRecord(
            source="otter", segments=[], full_text="",
            duration_seconds=0, language="en", audio_path=None, raw_metadata={},
            kind="recruiter_prep",
        )
        prep_id = store_transcript(prep_record, application_id=1, db_path=db_path)
        update_analysis(prep_id, big_analysis, db_path=db_path)

        mock_result = {
            "overall_score": 7, "questions_asked": [], "response_quality": [],
            "technical_gaps": [], "behavioral_assessment": {}, "overall_justification": "",
            "top_improvements": [], "practice_questions": [],
        }
        coach = InterviewCoach(db_path=db_path)
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            coach.analyze_interview(_SAMPLE_TURNS, kind="technical", application_id=1)
        coach.close()

        prompt_arg = mock_call.call_args[1].get("prompt") or mock_call.call_args[0][1]
        assert len(prompt_arg) <= 30000, "Overall prompt must respect the 30k cap"
        # Context block exists but is truncated
        assert "Prior context" in prompt_arg


class TestSaveAnalysisConsolidated:
    """save_analysis(transcript_id, analysis) writes to transcripts.analysis_json."""

    def test_save_writes_analysis_json_to_transcript(self, tmp_path):
        from src.transcripts.transcript_store import store_transcript
        from src.transcripts.transcript_parser import TranscriptRecord

        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="otter", segments=[], full_text="interview text",
            duration_seconds=60, language="en", audio_path=None, raw_metadata={},
        )
        t_id = store_transcript(record, db_path=db_path)

        coach = InterviewCoach(db_path=db_path)
        analysis = {"overall_score": 8, "technical_gaps": ["Kubernetes"]}
        coach.save_analysis(transcript_id=t_id, analysis=analysis)

        result = coach.get_analysis(t_id)
        coach.close()

        assert result is not None
        assert result["analysis"]["overall_score"] == 8
        assert result["analysis"]["technical_gaps"] == ["Kubernetes"]

    def test_get_analysis_returns_none_for_nonexistent_id(self, tmp_path):
        db_path = tmp_path / "test.db"
        coach = InterviewCoach(db_path=db_path)
        result = coach.get_analysis(999)
        coach.close()
        assert result is None

    def test_get_all_analyses_returns_analyzed_transcripts(self, tmp_path):
        from src.transcripts.transcript_store import store_transcript
        from src.transcripts.transcript_parser import TranscriptRecord

        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="otter", segments=[], full_text="text",
            duration_seconds=60, language="en", audio_path=None, raw_metadata={},
        )
        t1_id = store_transcript(record, db_path=db_path)
        t2_id = store_transcript(record, db_path=db_path)

        coach = InterviewCoach(db_path=db_path)
        coach.save_analysis(transcript_id=t1_id, analysis={"overall_score": 5})
        coach.save_analysis(transcript_id=t2_id, analysis={"overall_score": 7})

        all_analyses = coach.get_all_analyses()
        coach.close()

        assert len(all_analyses) == 2
        # Newest first
        assert all_analyses[0]["analysis"]["overall_score"] == 7

    def test_compare_interviews_works_after_consolidated_save(self, tmp_path):
        """Integration: compare_interviews still works after save_analysis refactor."""
        from src.transcripts.transcript_store import store_transcript
        from src.transcripts.transcript_parser import TranscriptRecord

        db_path = tmp_path / "test.db"
        record = TranscriptRecord(
            source="otter", segments=[], full_text="text",
            duration_seconds=60, language="en", audio_path=None, raw_metadata={},
        )
        t1_id = store_transcript(record, db_path=db_path)
        t2_id = store_transcript(record, db_path=db_path)

        coach = InterviewCoach(db_path=db_path)
        coach.save_analysis(transcript_id=t1_id, analysis={
            "overall_score": 5, "technical_gaps": ["Docker"], "top_improvements": ["A"],
        })
        coach.save_analysis(transcript_id=t2_id, analysis={
            "overall_score": 7, "technical_gaps": ["CI/CD"], "top_improvements": ["B"],
        })

        mock_result = {
            "recurring_weak_topics": [], "improved_skills": [], "persistent_gaps": [],
            "trajectory": "improving", "trajectory_explanation": "Better", "recommendations": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result):
            result = coach.compare_interviews()
        coach.close()

        assert result is not None
        assert result["trajectory"] == "improving"


class TestParseJsonResponse:
    def test_parses_clean_json(self):
        """Parses clean JSON string."""
        from src.intel.skill_analyzer import _parse_json_response
        result = _parse_json_response('{"key": "value"}')
        assert result == {"key": "value"}

    def test_strips_markdown_fences(self):
        """Strips markdown code fences."""
        from src.intel.skill_analyzer import _parse_json_response
        result = _parse_json_response('```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_returns_none_for_bad_json(self):
        """Returns None for unparseable text."""
        from src.intel.skill_analyzer import _parse_json_response
        result = _parse_json_response("not json")
        assert result is None
