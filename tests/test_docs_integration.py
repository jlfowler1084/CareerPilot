"""Integration tests for document generation pipeline."""

from __future__ import annotations

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from src.documents.resume_generator import BASE_RESUME
from src.jobs.applicant import JobApplicant


SAMPLE_COVER_LETTER = (
    "I am writing to express my interest in the DevOps Engineer position.\n\n"
    "My experience at Venable LLP aligns well with your requirements.\n\n"
    "I look forward to discussing this opportunity."
)


@pytest.fixture
def applicant(tmp_path, fake_supabase):
    """Create a JobApplicant with a fake Supabase tracker + temp profile DB."""
    profile_db = tmp_path / "test_profile.db"
    a = JobApplicant(profile_db_path=profile_db)
    a._profile_mgr.update_personal(
        full_name="Joseph Fowler",
        email="jlfowler1084@gmail.com",
        phone="443-787-6528",
        city="Sheridan",
        state="IN",
    )
    yield a
    a.close()


def _make_router_side_effect(resume_result, cover_letter_result):
    """Return a side_effect function that dispatches by task name."""
    def _side_effect(task, prompt, **kwargs):
        if task == "resume_generate":
            if isinstance(resume_result, Exception):
                raise resume_result
            return resume_result
        if task == "cover_letter":
            if isinstance(cover_letter_result, Exception):
                raise cover_letter_result
            return cover_letter_result
        raise KeyError(f"Unexpected task in test: {task!r}")
    return _side_effect


class TestGenerateApplicationDocs:
    def test_generates_both_files(self, applicant, tmp_path):
        tailored = json.loads(json.dumps(BASE_RESUME))

        def _router(task, prompt, **kwargs):
            if task == "resume_generate":
                return tailored
            if task == "cover_letter":
                return SAMPLE_COVER_LETTER
            raise KeyError(task)

        job_data = {
            "description": "Looking for DevOps Engineer with CI/CD",
            "company": "TestCorp",
            "title": "DevOps Engineer",
        }

        with patch("src.llm.router.router.complete", side_effect=_router), \
             patch("src.jobs.analyzer.JobAnalyzer") as MockAnalyzer:
            mock_analyzer = MagicMock()
            mock_analyzer.analyze_fit.return_value = None
            MockAnalyzer.return_value = mock_analyzer

            result = applicant.generate_application_docs(job_data)

        assert result["resume_path"] is not None
        assert result["cover_letter_path"] is not None
        assert os.path.exists(result["resume_path"])
        assert os.path.exists(result["cover_letter_path"])

    def test_resume_failure_still_generates_cover_letter(self, applicant):
        def _router(task, prompt, **kwargs):
            if task == "resume_generate":
                raise Exception("API error")
            if task == "cover_letter":
                return SAMPLE_COVER_LETTER
            raise KeyError(task)

        with patch("src.llm.router.router.complete", side_effect=_router), \
             patch("src.jobs.analyzer.JobAnalyzer") as MockAnalyzer:
            mock_analyzer = MagicMock()
            mock_analyzer.analyze_fit.return_value = None
            MockAnalyzer.return_value = mock_analyzer

            result = applicant.generate_application_docs({
                "description": "Test", "company": "X", "title": "Y",
            })

        assert result["resume_path"] is None
        assert result["cover_letter_path"] is not None

    def test_cover_letter_failure_still_generates_resume(self, applicant, tmp_path):
        tailored = json.loads(json.dumps(BASE_RESUME))

        def _router(task, prompt, **kwargs):
            if task == "resume_generate":
                return tailored
            if task == "cover_letter":
                raise Exception("API error")
            raise KeyError(task)

        with patch("src.llm.router.router.complete", side_effect=_router), \
             patch("src.jobs.analyzer.JobAnalyzer") as MockAnalyzer:
            mock_analyzer = MagicMock()
            mock_analyzer.analyze_fit.side_effect = Exception("Analyzer error")
            MockAnalyzer.return_value = mock_analyzer

            result = applicant.generate_application_docs({
                "description": "Test", "company": "X", "title": "Y",
            })

        assert result["resume_path"] is not None
        assert result["cover_letter_path"] is None
