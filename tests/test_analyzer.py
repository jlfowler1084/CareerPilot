"""Tests for job description fit analysis."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from src.jobs.analyzer import JobAnalyzer


class TestAnalyzeFit:
    def test_returns_structured_analysis(self):
        """Returns structured fit analysis from the router."""
        analysis = {
            "match_score": 7,
            "matching_skills": ["PowerShell", "Windows Server", "Active Directory"],
            "gap_skills": ["Terraform", "Kubernetes"],
            "resume_tweaks": ["Emphasize automation experience", "Add Azure learning"],
            "red_flags": [],
        }

        analyzer = JobAnalyzer()
        with patch("src.llm.router.router.complete", return_value=analysis):
            result = analyzer.analyze_fit(
                "Senior Systems Engineer with PowerShell and Azure experience",
                resume_text="5 years PowerShell, Windows Server, AD admin",
            )

        assert result is not None
        assert result["match_score"] == 7
        assert len(result["matching_skills"]) == 3
        assert "Terraform" in result["gap_skills"]

    def test_uses_default_profile_when_no_resume(self):
        """Uses default candidate profile when resume_text is None."""
        analysis = {
            "match_score": 5,
            "matching_skills": ["Windows Server"],
            "gap_skills": ["Docker"],
            "resume_tweaks": [],
            "red_flags": [],
        }

        analyzer = JobAnalyzer()
        with patch("src.llm.router.router.complete", return_value=analysis) as mock_call:
            result = analyzer.analyze_fit("DevOps Engineer position")

        assert result is not None
        # Verify default profile was included in the prompt
        prompt_arg = mock_call.call_args[1]["prompt"]
        assert "PowerShell" in prompt_arg  # from default profile

    def test_handles_api_failure(self):
        """Returns None when router raises."""
        analyzer = JobAnalyzer()
        with patch("src.llm.router.router.complete", side_effect=Exception("API error")):
            result = analyzer.analyze_fit("Some job description")

        assert result is None

    def test_handles_router_exception(self):
        """Returns None when router raises any exception."""
        analyzer = JobAnalyzer()
        with patch("src.llm.router.router.complete", side_effect=RuntimeError("fail")):
            result = analyzer.analyze_fit("Some job description")

        assert result is None

    def test_red_flags_detected(self):
        """Red flags are included in the analysis."""
        analysis = {
            "match_score": 3,
            "matching_skills": [],
            "gap_skills": ["Everything"],
            "resume_tweaks": [],
            "red_flags": ["Unrealistic requirements", "No salary listed"],
        }

        analyzer = JobAnalyzer()
        with patch("src.llm.router.router.complete", return_value=analysis):
            result = analyzer.analyze_fit("Suspicious job posting")

        assert len(result["red_flags"]) == 2

    def test_defaults_set_for_missing_fields(self):
        """Missing fields get defaults instead of KeyError."""
        analysis = {"match_score": 5}

        analyzer = JobAnalyzer()
        with patch("src.llm.router.router.complete", return_value=analysis):
            result = analyzer.analyze_fit("Job description")

        assert result["matching_skills"] == []
        assert result["gap_skills"] == []
        assert result["resume_tweaks"] == []
        assert result["red_flags"] == []


class TestDefaultProfile:
    def test_includes_key_skills(self):
        """Default profile includes Joe's key skills."""
        profile = JobAnalyzer._default_profile()
        assert "PowerShell" in profile
        assert "Windows Server" in profile
        assert "Active Directory" in profile
        assert "VMware" in profile
        assert "Indianapolis" in profile
