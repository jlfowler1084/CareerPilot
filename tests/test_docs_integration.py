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
def applicant(tmp_path):
    """Create a JobApplicant with temp databases."""
    db_path = tmp_path / "test_tracker.db"
    profile_db = tmp_path / "test_profile.db"
    a = JobApplicant(db_path=db_path, profile_db_path=profile_db)
    a._profile_mgr.update_personal(
        full_name="Joseph Fowler",
        email="jlfowler1084@gmail.com",
        phone="443-787-6528",
        city="Sheridan",
        state="IN",
    )
    yield a
    a.close()


class TestGenerateApplicationDocs:
    @patch("src.documents.cover_letter_generator.anthropic")
    @patch("src.documents.resume_generator.anthropic")
    def test_generates_both_files(self, mock_resume_api, mock_cl_api, applicant, tmp_path):
        # Mock resume tailoring
        tailored = json.loads(json.dumps(BASE_RESUME))
        mock_resume_response = MagicMock()
        mock_resume_response.content = [MagicMock(text=json.dumps(tailored))]
        mock_resume_client = MagicMock()
        mock_resume_client.messages.create.return_value = mock_resume_response
        mock_resume_api.Anthropic.return_value = mock_resume_client

        # Mock cover letter generation
        mock_cl_response = MagicMock()
        mock_cl_response.content = [MagicMock(text=SAMPLE_COVER_LETTER)]
        mock_cl_client = MagicMock()
        mock_cl_client.messages.create.return_value = mock_cl_response
        mock_cl_api.Anthropic.return_value = mock_cl_client

        job_data = {
            "description": "Looking for DevOps Engineer with CI/CD",
            "company": "TestCorp",
            "title": "DevOps Engineer",
        }

        # Mock the fit analysis to avoid extra API call
        with patch("src.jobs.analyzer.JobAnalyzer") as MockAnalyzer:
            mock_analyzer = MagicMock()
            mock_analyzer.analyze_fit.return_value = None
            MockAnalyzer.return_value = mock_analyzer

            result = applicant.generate_application_docs(job_data)

        assert result["resume_path"] is not None
        assert result["cover_letter_path"] is not None
        assert os.path.exists(result["resume_path"])
        assert os.path.exists(result["cover_letter_path"])

    @patch("src.documents.cover_letter_generator.anthropic")
    @patch("src.documents.resume_generator.anthropic")
    def test_resume_failure_still_generates_cover_letter(
        self, mock_resume_api, mock_cl_api, applicant,
    ):
        # Resume API fails
        mock_resume_client = MagicMock()
        mock_resume_client.messages.create.side_effect = Exception("API error")
        mock_resume_api.Anthropic.return_value = mock_resume_client

        # Cover letter succeeds
        mock_cl_response = MagicMock()
        mock_cl_response.content = [MagicMock(text=SAMPLE_COVER_LETTER)]
        mock_cl_client = MagicMock()
        mock_cl_client.messages.create.return_value = mock_cl_response
        mock_cl_api.Anthropic.return_value = mock_cl_client

        with patch("src.jobs.analyzer.JobAnalyzer") as MockAnalyzer:
            mock_analyzer = MagicMock()
            mock_analyzer.analyze_fit.return_value = None
            MockAnalyzer.return_value = mock_analyzer

            result = applicant.generate_application_docs({
                "description": "Test", "company": "X", "title": "Y",
            })

        assert result["resume_path"] is None
        assert result["cover_letter_path"] is not None

    @patch("src.documents.cover_letter_generator.anthropic")
    @patch("src.documents.resume_generator.anthropic")
    def test_cover_letter_failure_still_generates_resume(
        self, mock_resume_api, mock_cl_api, applicant, tmp_path,
    ):
        # Resume succeeds
        tailored = json.loads(json.dumps(BASE_RESUME))
        mock_resume_response = MagicMock()
        mock_resume_response.content = [MagicMock(text=json.dumps(tailored))]
        mock_resume_client = MagicMock()
        mock_resume_client.messages.create.return_value = mock_resume_response
        mock_resume_api.Anthropic.return_value = mock_resume_client

        # Cover letter API fails
        mock_cl_client = MagicMock()
        mock_cl_client.messages.create.side_effect = Exception("API error")
        mock_cl_api.Anthropic.return_value = mock_cl_client

        with patch("src.jobs.analyzer.JobAnalyzer") as MockAnalyzer:
            mock_analyzer = MagicMock()
            mock_analyzer.analyze_fit.side_effect = Exception("Analyzer error")
            MockAnalyzer.return_value = mock_analyzer

            result = applicant.generate_application_docs({
                "description": "Test", "company": "X", "title": "Y",
            })

        assert result["resume_path"] is not None
        assert result["cover_letter_path"] is None
