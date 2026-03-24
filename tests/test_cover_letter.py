"""Tests for cover letter generation."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from src.documents.cover_letter_generator import CoverLetterGenerator, _sanitize_filename


SAMPLE_PROFILE = {
    "personal": {
        "full_name": "Joseph Fowler",
        "email": "jlfowler1084@gmail.com",
        "phone": "443-787-6528",
        "city": "Sheridan",
        "state": "IN",
        "linkedin_url": "",
    },
    "work_history": [
        {
            "title": "Senior Systems Engineer",
            "company": "Venable LLP",
            "start_date": "2020-01",
            "end_date": "2025-03",
            "description": "Led enterprise infrastructure for 900+ users.",
        },
    ],
    "certifications": [
        {"name": "ITIL V4 Foundation", "in_progress": False},
        {"name": "Microsoft Azure Fundamentals (AZ-900)", "in_progress": True},
    ],
    "education": [],
    "references": [],
    "eeo": {},
}

SAMPLE_COVER_LETTER = """\
I am writing to express my strong interest in the DevOps Engineer position at Acme Corp.

With over 20 years of IT infrastructure experience, I bring a proven track record in \
systems engineering and automation. At Venable LLP, I led enterprise infrastructure \
operations supporting 900+ users, managed VMware environments, and automated workflows \
with PowerShell, reducing manual effort by 40%.

While my cloud-native experience is still developing, I am actively pursuing my \
Microsoft Azure Fundamentals certification and have hands-on experience with Docker \
and Kubernetes in personal projects.

I am excited about the opportunity to bring my infrastructure expertise to Acme Corp \
and would welcome the chance to discuss how my background aligns with your needs. \
I am available for interviews at your convenience."""


# --- Cover letter generation with mocked Claude ---


class TestGenerateCoverLetter:
    @patch("src.documents.cover_letter_generator.anthropic")
    def test_generates_text(self, mock_anthropic):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=SAMPLE_COVER_LETTER)]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        text = gen.generate_cover_letter(
            "Looking for DevOps Engineer with CI/CD",
            company="Acme Corp",
            role="DevOps Engineer",
        )

        assert text is not None
        assert len(text) > 100

    @patch("src.documents.cover_letter_generator.anthropic")
    def test_letter_includes_company_and_role(self, mock_anthropic):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=SAMPLE_COVER_LETTER)]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        text = gen.generate_cover_letter(
            "Job description",
            company="Acme Corp",
            role="DevOps Engineer",
        )

        assert "Acme Corp" in text
        assert "DevOps Engineer" in text

    @patch("src.documents.cover_letter_generator.anthropic")
    def test_includes_fit_analysis(self, mock_anthropic):
        """Fit analysis is passed to Claude when provided."""
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=SAMPLE_COVER_LETTER)]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        fit = {
            "match_score": 7,
            "matching_skills": ["PowerShell", "Windows Server"],
            "gap_skills": ["Kubernetes"],
        }
        text = gen.generate_cover_letter(
            "Job description", "TestCo", "SRE", fit_analysis=fit,
        )

        # Verify fit analysis was included in the API call
        call_args = mock_client.messages.create.call_args
        user_content = call_args[1]["messages"][0]["content"]
        assert "Match Score: 7/10" in user_content
        assert "Kubernetes" in user_content

    @patch("src.documents.cover_letter_generator.anthropic")
    def test_failure_returns_none(self, mock_anthropic):
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = Exception("API error")
        mock_anthropic.Anthropic.return_value = mock_client

        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        result = gen.generate_cover_letter("Desc", "Co", "Role")
        assert result is None


# --- DOCX generation ---


class TestGenerateDocx:
    def test_generates_valid_docx(self, tmp_path):
        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        output = str(tmp_path / "test_cl.docx")
        result = gen.generate_docx(SAMPLE_COVER_LETTER, "Acme Corp", "DevOps Engineer", output)

        assert result == output
        assert os.path.exists(output)
        assert os.path.getsize(output) > 0

    def test_docx_contains_letter_content(self, tmp_path):
        from docx import Document

        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        output = str(tmp_path / "test_cl.docx")
        gen.generate_docx(SAMPLE_COVER_LETTER, "Acme Corp", "DevOps Engineer", output)

        doc = Document(output)
        full_text = "\n".join(p.text for p in doc.paragraphs)
        assert "Joseph Fowler" in full_text
        assert "Dear Hiring Manager" in full_text
        assert "Sincerely" in full_text

    def test_docx_creates_parent_dirs(self, tmp_path):
        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        output = str(tmp_path / "sub" / "deep" / "cl.docx")
        result = gen.generate_docx(SAMPLE_COVER_LETTER, "Co", "Role", output)
        assert os.path.exists(result)


# --- Profile integration ---


class TestProfileIntegration:
    @patch("src.documents.cover_letter_generator.anthropic")
    def test_lazy_profile_loading(self, mock_anthropic):
        """When no profile is passed, it loads from ProfileManager."""
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=SAMPLE_COVER_LETTER)]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        with patch("src.profile.manager.ProfileManager") as MockPM:
            mock_mgr = MagicMock()
            mock_mgr.get_profile.return_value = SAMPLE_PROFILE
            MockPM.return_value = mock_mgr

            gen = CoverLetterGenerator()  # No profile passed
            text = gen.generate_cover_letter("Desc", "Co", "Role")
            assert text is not None
            mock_mgr.get_profile.assert_called_once()
            mock_mgr.close.assert_called_once()


# --- Full pipeline ---


class TestGenerateForApplication:
    @patch("src.documents.cover_letter_generator.anthropic")
    def test_full_pipeline(self, mock_anthropic, tmp_path):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=SAMPLE_COVER_LETTER)]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        gen = CoverLetterGenerator(profile=SAMPLE_PROFILE)
        output_dir = str(tmp_path / "cover_letters")

        # Mock the fit analysis import to avoid API call
        with patch("src.jobs.analyzer.JobAnalyzer") as MockAnalyzer:
            mock_analyzer = MagicMock()
            mock_analyzer.analyze_fit.return_value = {"match_score": 8}
            MockAnalyzer.return_value = mock_analyzer

            path = gen.generate_for_application(
                {"description": "DevOps role", "company": "Acme Corp", "title": "DevOps Engineer"},
                output_dir=output_dir,
            )

        assert path is not None
        assert os.path.exists(path)
        assert path.endswith(".docx")
        assert "Acme_Corp" in path
        assert "_CL.docx" in path


# --- Filename sanitization ---


class TestSanitizeFilename:
    def test_removes_special_chars(self):
        assert _sanitize_filename('Test "Company"') == "Test_Company"

    def test_truncates(self):
        assert len(_sanitize_filename("A" * 100)) <= 50
