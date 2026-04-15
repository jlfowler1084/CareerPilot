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
    def test_save_and_get_all(self, coach):
        """Saves analysis and retrieves it."""
        analysis = {"overall_score": 7, "technical_gaps": ["Docker"]}
        row_id = coach.save_analysis("test.txt", analysis, company="Acme", role="SysEng")

        assert row_id > 0

        all_analyses = coach.get_all_analyses()
        assert len(all_analyses) == 1
        assert all_analyses[0]["company"] == "Acme"
        assert all_analyses[0]["analysis"]["overall_score"] == 7

    def test_get_single_analysis(self, coach):
        """Retrieves a single analysis by ID."""
        analysis = {"overall_score": 8, "technical_gaps": []}
        row_id = coach.save_analysis("interview.txt", analysis, company="Corp", role="DevOps")

        result = coach.get_analysis(row_id)
        assert result is not None
        assert result["role"] == "DevOps"
        assert result["analysis"]["overall_score"] == 8

    def test_get_nonexistent_returns_none(self, coach):
        """Returns None for nonexistent ID."""
        result = coach.get_analysis(999)
        assert result is None

    def test_multiple_analyses_ordered(self, coach):
        """Multiple analyses returned in reverse chronological order."""
        coach.save_analysis("first.txt", {"overall_score": 5}, company="A")
        coach.save_analysis("second.txt", {"overall_score": 7}, company="B")

        all_analyses = coach.get_all_analyses()
        assert len(all_analyses) == 2
        # Most recent first
        assert all_analyses[0]["company"] == "B"
        assert all_analyses[1]["company"] == "A"


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
    def test_compare_pulls_from_db(self, coach):
        """Compare function loads analyses from SQLite when none provided."""
        coach.save_analysis("a.txt", {"overall_score": 5, "technical_gaps": ["Docker"], "top_improvements": ["A"]})
        coach.save_analysis("b.txt", {"overall_score": 7, "technical_gaps": ["CI/CD"], "top_improvements": ["B"]})

        comparison_json = json.dumps({
            "recurring_weak_topics": ["containers"],
            "improved_skills": [],
            "persistent_gaps": ["Docker"],
            "trajectory": "improving",
            "trajectory_explanation": "Getting better",
            "recommendations": ["Study more"],
        })

        mock_result = json.loads(comparison_json)
        with patch("src.llm.router.router.complete", return_value=mock_result):
            result = coach.compare_interviews()

        assert result is not None
        assert result["trajectory"] == "improving"

    def test_compare_fails_with_one_analysis(self, coach):
        """Returns None when only 1 analysis in DB."""
        coach.save_analysis("a.txt", {"overall_score": 5, "technical_gaps": []})

        result = coach.compare_interviews()
        assert result is None


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
