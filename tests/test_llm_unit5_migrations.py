"""Smoke tests for Unit 5 call-site migrations.

Verifies router.complete() is called with the correct task IDs for each
migrated module. Patches src.llm.router.router.complete directly since
the modules import the router lazily inside their methods.
"""

from __future__ import annotations
from unittest.mock import MagicMock, patch


class TestScannerClassifyEmail:
    def test_classify_email_calls_router_and_returns_dict(self):
        from src.gmail.scanner import GmailScanner
        scanner = GmailScanner.__new__(GmailScanner)
        mock_result = {
            "category": "recruiter_outreach",
            "company": "Acme",
            "role": "SRE",
            "urgency": "low",
            "summary": "SRE role",
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = scanner.classify_email(
                {"subject": "Job opp", "sender": "rec@corp.com", "body": "Hello..."}
            )
        mock_call.assert_called_once()
        assert mock_call.call_args[1]["task"] == "email_classify" or mock_call.call_args[0][0] == "email_classify"
        assert result["category"] == "recruiter_outreach"

    def test_classify_email_returns_default_on_exception(self):
        from src.gmail.scanner import GmailScanner
        scanner = GmailScanner.__new__(GmailScanner)
        with patch("src.llm.router.router.complete", side_effect=RuntimeError("fail")):
            result = scanner.classify_email({"subject": "test", "sender": "x", "body": "y"})
        assert result["category"] == "irrelevant"
        assert result["summary"] == "Classification failed"


class TestJobAnalyzerFit:
    def test_analyze_fit_calls_router_and_returns_dict(self):
        from src.jobs.analyzer import JobAnalyzer
        analyzer = JobAnalyzer()
        mock_result = {
            "match_score": 7,
            "matching_skills": ["Python"],
            "gap_skills": [],
            "resume_tweaks": [],
            "red_flags": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = analyzer.analyze_fit("Senior Python Dev needed")
        mock_call.assert_called_once()
        assert "job_analyze" in str(mock_call.call_args)
        assert result["match_score"] == 7

    def test_analyze_fit_returns_none_on_exception(self):
        from src.jobs.analyzer import JobAnalyzer
        analyzer = JobAnalyzer()
        with patch("src.llm.router.router.complete", side_effect=RuntimeError("fail")):
            result = analyzer.analyze_fit("Some job desc")
        assert result is None


class TestSkillExtract:
    def test_extract_skills_calls_router_and_returns_list(self):
        from src.intel.skill_analyzer import SkillGapAnalyzer
        analyzer = SkillGapAnalyzer()
        mock_result = [{"skill": "Terraform", "category": "devops", "level": "required"}]
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = analyzer.extract_skills("We need Terraform expertise")
        mock_call.assert_called_once()
        assert "skill_extract" in str(mock_call.call_args)
        assert result[0]["skill"] == "Terraform"

    def test_extract_skills_returns_empty_on_exception(self):
        from src.intel.skill_analyzer import SkillGapAnalyzer
        analyzer = SkillGapAnalyzer()
        with patch("src.llm.router.router.complete", side_effect=RuntimeError("fail")):
            result = analyzer.extract_skills("job desc")
        assert result == []


class TestCompanyIntelBrief:
    def test_generate_brief_calls_router_and_returns_dict(self):
        from src.intel.company_intel import CompanyIntelEngine
        engine = CompanyIntelEngine()
        mock_result = {
            "company_overview": {
                "description": "Tech co",
                "headquarters": "Indianapolis, IN",
                "size": "100-500",
                "revenue_or_funding": "",
                "key_products": [],
                "recent_news": [],
            },
            "culture": {
                "glassdoor_rating": "4.0/5",
                "sentiment_summary": "Positive",
                "work_life_balance": "Good",
                "remote_policy": "Hybrid",
                "pros": [],
                "cons": [],
            },
            "it_intelligence": {
                "tech_stack": ["Python"],
                "cloud_provider": "AWS",
                "infrastructure_scale": "Medium",
                "recent_it_postings": [],
                "it_challenges": [],
            },
            "generated_at": "2026-04-14T10:00:00",
            "sources": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            result = engine.generate_brief("Acme Corp")
        mock_call.assert_called_once()
        assert "company_intel" in str(mock_call.call_args)
        assert result["company_overview"]["description"] == "Tech co"

    def test_generate_brief_returns_none_on_exception(self):
        from src.intel.company_intel import CompanyIntelEngine
        engine = CompanyIntelEngine()
        with patch("src.llm.router.router.complete", side_effect=RuntimeError("fail")):
            result = engine.generate_brief("Acme Corp")
        assert result is None


class TestProfileExtract:
    def test_import_from_resume_calls_router_and_applies_data(self):
        from src.profile.manager import ProfileManager
        manager = ProfileManager.__new__(ProfileManager)
        manager._conn = MagicMock()
        mock_result = {
            "personal": {"full_name": "Joe Test", "email": "joe@test.com"},
            "work_history": [],
            "education": [],
            "certifications": [],
        }
        with patch("src.llm.router.router.complete", return_value=mock_result) as mock_call:
            with patch.object(manager, "_apply_import_data") as mock_apply:
                result = manager.import_from_resume("Joe Test\njoe@test.com\n...")
        mock_call.assert_called_once()
        assert "profile_extract" in str(mock_call.call_args)
        mock_apply.assert_called_once_with(mock_result)
        assert result == mock_result


class TestThreadActionsReply:
    def test_reply_calls_router_and_returns_string(self):
        from src.gmail.thread_actions import ThreadActions
        ta = ThreadActions.__new__(ThreadActions)
        ta._dashboard = MagicMock()
        ta._dashboard.get_thread_messages.return_value = [
            {
                "is_from_me": False,
                "sender": "rec@corp.com",
                "date": "2026-04-14",
                "body": "Hello!",
            }
        ]
        with patch("src.llm.router.router.complete", return_value="Thank you for reaching out.") as mock_call:
            with patch("src.gmail.thread_actions.format_context_block", return_value="Name: Joe"):
                result = ta.reply("thread123", mode="interested")
        mock_call.assert_called_once()
        assert "gmail_thread_actions" in str(mock_call.call_args)
        assert isinstance(result, str)
        assert "Thank you" in result

    def test_reply_returns_empty_string_on_exception(self):
        from src.gmail.thread_actions import ThreadActions
        ta = ThreadActions.__new__(ThreadActions)
        ta._dashboard = MagicMock()
        ta._dashboard.get_thread_messages.return_value = [
            {"is_from_me": False, "sender": "x@x.com", "date": "2026-04-14", "body": "Hi"}
        ]
        with patch("src.llm.router.router.complete", side_effect=RuntimeError("fail")):
            with patch("src.gmail.thread_actions.format_context_block", return_value="Name: Joe"):
                result = ta.reply("thread123")
        assert result == ""
