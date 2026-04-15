"""Smoke tests for Unit 6 call-site migrations."""

from __future__ import annotations
from unittest.mock import MagicMock, patch


class TestStudyPlanMigration:
    def test_generate_study_plan_calls_router(self):
        from src.intel.skill_analyzer import SkillGapAnalyzer
        analyzer = SkillGapAnalyzer()
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = []
        gaps = [{"skill_name": "Terraform", "category": "devops", "times_seen": 5,
                 "required_count": 3, "preferred_count": 2}]
        plan_json = '[{"skill": "Terraform", "priority": 1, "target_hours": 8, "resources": [], "rationale": "High demand"}]'
        with patch("src.llm.router.router.complete", return_value=plan_json) as mock_call:
            with patch("src.intel.skill_analyzer.models.upsert_study_plan"):
                result = analyzer.generate_study_plan(mock_conn, gaps=gaps)
        mock_call.assert_called_once()
        assert "skill_study_plan" in str(mock_call.call_args)
        assert isinstance(result, list)
        assert result[0]["skill"] == "Terraform"


class TestRecruiterResponderMigration:
    def test_draft_response_calls_router(self):
        from src.gmail.responder import RecruiterResponder
        responder = RecruiterResponder.__new__(RecruiterResponder)
        responder._service = MagicMock()
        email_data = {"sender": "rec@corp.com", "subject": "SRE Role", "body": "Hi there"}
        with patch("src.gmail.responder.router.complete", return_value="Thank you for reaching out.") as mock_call:
            with patch("src.gmail.responder.format_context_block", return_value="Name: Joe"):
                result = responder.draft_response(email_data)
        mock_call.assert_called_once()
        assert "recruiter_respond" in str(mock_call.call_args)
        assert "Thank you" in result


class TestRoadmapMigration:
    def test_generate_roadmap_calls_router(self):
        from src.skills.roadmap import RoadmapGenerator
        gen = RoadmapGenerator()
        gaps = [{"name": "Terraform", "category": "devops", "current_level": 1, "target_level": 3, "gap": 2}]
        with patch("src.llm.router.router.complete", return_value="Week 1: Start with Terraform basics...") as mock_call:
            result = gen.generate_roadmap(gaps)
        mock_call.assert_called_once()
        assert "roadmap_generate" in str(mock_call.call_args)
        assert isinstance(result, str)


class TestJournalEntryMigration:
    def test_auto_tag_calls_router_and_returns_list(self):
        import tempfile, pathlib
        from src.journal.entries import JournalManager
        with tempfile.TemporaryDirectory() as d:
            mgr = JournalManager(journal_dir=pathlib.Path(d))
            with patch("src.llm.router.router.complete", return_value=["terraform", "devops", "study"]) as mock_call:
                result = mgr._auto_tag("Today I studied Terraform and learned about state management.")
        mock_call.assert_called_once()
        assert "journal_entry" in str(mock_call.call_args)
        assert "terraform" in result


class TestInsightsMigration:
    def test_weekly_summary_calls_router(self):
        from src.journal.insights import InsightsEngine
        engine = InsightsEngine()
        entries = [{"date": "2026-04-14", "type": "study", "content": "Studied Terraform", "tags": ["terraform"], "mood": ""}]
        with patch("src.llm.router.router.complete", return_value="WHAT WENT WELL: Studied Terraform.") as mock_call:
            result = engine.weekly_summary(entries)
        mock_call.assert_called_once()
        assert "journal_weekly_summary" in str(mock_call.call_args)
        assert isinstance(result, str)

    def test_momentum_check_calls_router(self):
        from src.journal.insights import InsightsEngine
        engine = InsightsEngine()
        entries = [{"date": "2026-04-14", "type": "study", "content": "Studied", "tags": [], "mood": ""}]
        with patch("src.llm.router.router.complete", return_value="steady\nGood progress this week.") as mock_call:
            result = engine.momentum_check(entries)
        mock_call.assert_called_once()
        assert "journal_momentum" in str(mock_call.call_args)
        assert result["status"] == "steady"


class TestInterviewCoachMigration:
    def test_analyze_interview_calls_router(self):
        from src.interviews.coach import InterviewCoach
        coach = InterviewCoach()
        mock_result = {
            "questions_asked": ["Tell me about yourself"],
            "response_quality": [],
            "technical_gaps": [],
            "behavioral_assessment": {},
            "overall_score": 7,
            "overall_justification": "Good",
            "top_improvements": [],
            "practice_questions": [],
        }
        turns = [{"speaker": "Interviewer", "text": "Tell me about yourself", "timestamp": None}]
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = coach.analyze_interview(turns, job_title="SRE", company="Acme")
        mock_call.assert_called_once()
        assert "interview_transcript_analyze" in str(mock_call.call_args)
        assert result["overall_score"] == 7

    def test_mock_interview_uses_three_task_ids(self):
        from src.interviews.coach import InterviewCoach
        coach = InterviewCoach()
        mock_eval = {"rating": 4, "strengths": "Good", "weaknesses": "None", "ideal_answer_points": []}
        mock_summary = {
            "overall_score": 8, "overall_justification": "Well done",
            "top_improvements": [], "practice_questions": [], "technical_gaps": [],
        }
        call_count = {"n": 0}
        def side_effect(task, prompt, **kwargs):
            call_count["n"] += 1
            if task == "interview_question_gen":
                return "What is Terraform?"
            if task == "interview_answer_eval":
                return mock_eval
            if task == "interview_summary":
                return mock_summary
            raise ValueError(f"unexpected task: {task}")
        with patch("src.llm.router.router.complete", side_effect=side_effect):
            result = coach.mock_interview(
                role_description="SRE role",
                num_questions=1,
                input_fn=lambda _: "Terraform is an IaC tool",
                output_fn=lambda _: None,
            )
        # 1 question_gen + 1 answer_eval + 1 summary = 3 calls
        assert call_count["n"] == 3
        assert result["overall_score"] == 8
        assert len(result["qa_pairs"]) == 1


class TestTranscriptLoaderMigration:
    def test_claude_identify_speakers_calls_router(self):
        from src.interviews.transcripts import TranscriptLoader
        loader = TranscriptLoader()
        with patch("src.llm.router.router.complete", return_value="Interviewer: Tell me about yourself.\nCandidate: Sure.") as mock_call:
            result = loader._claude_identify_speakers("Tell me about yourself. Sure.")
        mock_call.assert_called_once()
        assert "transcript_speaker_id" in str(mock_call.call_args)


class TestCoverLetterMigration:
    def test_generate_cover_letter_calls_router(self):
        from src.documents.cover_letter_generator import CoverLetterGenerator
        gen = CoverLetterGenerator(profile={
            "personal": {"full_name": "Joe", "email": "joe@test.com", "phone": "", "city": "Indy", "state": "IN"},
            "work_history": [],
            "certifications": [],
        })
        with patch("src.llm.router.router.complete", return_value="Dear Hiring Manager, ...") as mock_call:
            result = gen.generate_cover_letter("Senior SRE role", "Acme", "SRE")
        mock_call.assert_called_once()
        assert "cover_letter" in str(mock_call.call_args)
        assert "Dear Hiring Manager" in result


class TestResumeGeneratorMigration:
    def test_tailor_resume_calls_router(self):
        from src.documents.resume_generator import ResumeGenerator
        gen = ResumeGenerator()
        mock_result = {
            "professional_summary": "Experienced SRE",
            "core_skills": ["Terraform"],
            "experience": [],
            "education": [],
            "certifications": [],
            "technical_knowledge": {},
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = gen.tailor_resume("Senior SRE at Acme", company="Acme", role="SRE")
        mock_call.assert_called_once()
        assert "resume_generate" in str(mock_call.call_args)
        assert result["professional_summary"] == "Experienced SRE"
