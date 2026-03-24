"""Tests for job description fit analysis."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from src.jobs.analyzer import JobAnalyzer


def _mock_claude_response(text):
    """Create a mock Claude API response."""
    mock_response = MagicMock()
    mock_content = MagicMock()
    mock_content.text = text
    mock_response.content = [mock_content]
    return mock_response


class TestAnalyzeFit:
    def test_returns_structured_analysis(self):
        """Returns structured fit analysis from Claude."""
        analysis_json = json.dumps({
            "match_score": 7,
            "matching_skills": ["PowerShell", "Windows Server", "Active Directory"],
            "gap_skills": ["Terraform", "Kubernetes"],
            "resume_tweaks": ["Emphasize automation experience", "Add Azure learning"],
            "red_flags": [],
        })

        analyzer = JobAnalyzer(anthropic_api_key="fake-key")
        with patch.object(analyzer, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(analysis_json)
            mock_fn.return_value = mock_client

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
        analysis_json = json.dumps({
            "match_score": 5,
            "matching_skills": ["Windows Server"],
            "gap_skills": ["Docker"],
            "resume_tweaks": [],
            "red_flags": [],
        })

        analyzer = JobAnalyzer(anthropic_api_key="fake-key")
        with patch.object(analyzer, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(analysis_json)
            mock_fn.return_value = mock_client

            result = analyzer.analyze_fit("DevOps Engineer position")

        assert result is not None
        # Verify default profile was used (check the API call content)
        call_args = mock_client.messages.create.call_args
        user_msg = call_args[1]["messages"][0]["content"]
        assert "PowerShell" in user_msg  # from default profile

    def test_handles_api_failure(self):
        """Returns None when Claude API fails."""
        analyzer = JobAnalyzer(anthropic_api_key="fake-key")
        with patch.object(analyzer, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.side_effect = Exception("API error")
            mock_fn.return_value = mock_client

            result = analyzer.analyze_fit("Some job description")

        assert result is None

    def test_handles_bad_json(self):
        """Returns None when Claude returns unparseable response."""
        analyzer = JobAnalyzer(anthropic_api_key="fake-key")
        with patch.object(analyzer, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response("not json")
            mock_fn.return_value = mock_client

            result = analyzer.analyze_fit("Some job description")

        assert result is None

    def test_red_flags_detected(self):
        """Red flags are included in the analysis."""
        analysis_json = json.dumps({
            "match_score": 3,
            "matching_skills": [],
            "gap_skills": ["Everything"],
            "resume_tweaks": [],
            "red_flags": ["Unrealistic requirements", "No salary listed"],
        })

        analyzer = JobAnalyzer(anthropic_api_key="fake-key")
        with patch.object(analyzer, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(analysis_json)
            mock_fn.return_value = mock_client

            result = analyzer.analyze_fit("Suspicious job posting")

        assert len(result["red_flags"]) == 2

    def test_defaults_set_for_missing_fields(self):
        """Missing fields get defaults instead of KeyError."""
        analysis_json = json.dumps({"match_score": 5})

        analyzer = JobAnalyzer(anthropic_api_key="fake-key")
        with patch.object(analyzer, "_get_client") as mock_fn:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = _mock_claude_response(analysis_json)
            mock_fn.return_value = mock_client

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
