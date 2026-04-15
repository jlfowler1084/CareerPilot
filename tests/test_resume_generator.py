"""Tests for resume tailoring and DOCX generation."""

from __future__ import annotations

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from src.documents.resume_generator import (
    BASE_RESUME,
    ResumeGenerator,
    _sanitize_filename,
)


# --- Base resume structure ---


class TestBaseResume:
    def test_has_professional_summary(self):
        assert "professional_summary" in BASE_RESUME
        assert len(BASE_RESUME["professional_summary"]) > 50

    def test_has_core_skills(self):
        assert "core_skills" in BASE_RESUME
        assert len(BASE_RESUME["core_skills"]) >= 10

    def test_has_experience(self):
        assert "experience" in BASE_RESUME
        assert len(BASE_RESUME["experience"]) == 4
        for role in BASE_RESUME["experience"]:
            assert "company" in role
            assert "title" in role
            assert "dates" in role
            assert "bullets" in role
            assert len(role["bullets"]) >= 3

    def test_has_education(self):
        assert "education" in BASE_RESUME
        assert len(BASE_RESUME["education"]) >= 1

    def test_has_certifications(self):
        assert "certifications" in BASE_RESUME
        assert len(BASE_RESUME["certifications"]) >= 3

    def test_has_technical_knowledge(self):
        assert "technical_knowledge" in BASE_RESUME
        assert len(BASE_RESUME["technical_knowledge"]) >= 5


# --- Filename sanitization ---


class TestSanitizeFilename:
    def test_removes_special_chars(self):
        assert _sanitize_filename('Acme "Corp" <Inc>') == "Acme_Corp_Inc"

    def test_replaces_spaces(self):
        assert _sanitize_filename("Acme Corp") == "Acme_Corp"

    def test_truncates_long_names(self):
        result = _sanitize_filename("A" * 100)
        assert len(result) <= 50

    def test_empty_string(self):
        assert _sanitize_filename("") == ""


# --- Resume tailoring with mocked Claude ---


class TestTailorResume:
    def _mock_tailored_response(self):
        """Return a mock tailored resume that only reorders, never fabricates."""
        tailored = json.loads(json.dumps(BASE_RESUME))
        tailored["professional_summary"] = (
            "Infrastructure-focused Systems Engineer with deep DevOps experience..."
        )
        # Reorder bullets — first role, put automation bullet first
        exp = tailored["experience"][0]
        exp["bullets"] = [exp["bullets"][3]] + exp["bullets"][:3] + exp["bullets"][4:]
        return tailored

    def test_tailor_resume_returns_structure(self):
        with patch("src.llm.router.router.complete", return_value=self._mock_tailored_response()):
            gen = ResumeGenerator()
            result = gen.tailor_resume("DevOps Engineer needed with CI/CD experience", company="TestCo")

        assert result is not None
        assert "professional_summary" in result
        assert "core_skills" in result
        assert "experience" in result

    def test_tailored_skills_are_subset_of_base(self):
        """Output skills should be a subset of the input — no fabrication."""
        tailored = self._mock_tailored_response()
        with patch("src.llm.router.router.complete", return_value=tailored):
            gen = ResumeGenerator()
            result = gen.tailor_resume("Job description here")

        base_skills = set(BASE_RESUME["core_skills"])
        result_skills = set(result["core_skills"])
        assert result_skills.issubset(base_skills)

    def test_tailor_resume_preserves_all_keys(self):
        """Even if router omits a key, defaults fill in from base."""
        partial = {"professional_summary": "Updated summary"}
        with patch("src.llm.router.router.complete", return_value=partial):
            gen = ResumeGenerator()
            result = gen.tailor_resume("Job description")

        for key in BASE_RESUME:
            assert key in result

    def test_tailor_resume_failure_returns_none(self):
        with patch("src.llm.router.router.complete", side_effect=Exception("API error")):
            gen = ResumeGenerator()
            result = gen.tailor_resume("Job description")
        assert result is None


# --- DOCX generation ---


class TestGenerateDocx:
    def test_generates_valid_docx(self, tmp_path):
        gen = ResumeGenerator()
        output = str(tmp_path / "test_resume.docx")
        result = gen.generate_docx(BASE_RESUME, output)

        assert result == output
        assert os.path.exists(output)
        assert os.path.getsize(output) > 0

    def test_docx_contains_expected_content(self, tmp_path):
        from docx import Document

        gen = ResumeGenerator()
        output = str(tmp_path / "test_resume.docx")
        gen.generate_docx(BASE_RESUME, output)

        doc = Document(output)
        full_text = "\n".join(p.text for p in doc.paragraphs)
        assert "Joseph Fowler" in full_text
        assert "Senior Systems Engineer" in full_text
        assert "Venable LLP" in full_text

    def test_docx_creates_parent_dirs(self, tmp_path):
        gen = ResumeGenerator()
        output = str(tmp_path / "subdir" / "deep" / "resume.docx")
        result = gen.generate_docx(BASE_RESUME, output)
        assert os.path.exists(result)


# --- Full pipeline ---


class TestGenerateForApplication:
    def test_full_pipeline(self, tmp_path):
        tailored = json.loads(json.dumps(BASE_RESUME))
        gen = ResumeGenerator()
        output_dir = str(tmp_path / "resumes")
        job_data = {
            "description": "Looking for a DevOps Engineer",
            "company": "Acme Corp",
            "title": "DevOps Engineer",
        }

        with patch("src.llm.router.router.complete", return_value=tailored):
            path = gen.generate_for_application(job_data, output_dir=output_dir)
        assert path is not None
        assert os.path.exists(path)
        assert path.endswith(".docx")
        assert "Acme_Corp" in path
        assert "DevOps_Engineer" in path

    def test_pipeline_failure_returns_none(self, tmp_path):
        with patch("src.llm.router.router.complete", side_effect=Exception("API error")):
            gen = ResumeGenerator()
            path = gen.generate_for_application(
                {"description": "Test", "company": "X", "title": "Y"},
                output_dir=str(tmp_path),
            )
        assert path is None
