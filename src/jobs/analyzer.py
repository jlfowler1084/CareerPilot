"""Claude-powered job description analysis and fit scoring."""

from __future__ import annotations

import json
import logging
import re
from typing import Dict, Optional

import anthropic

from config import settings

logger = logging.getLogger(__name__)

FIT_ANALYSIS_PROMPT = """\
You are a career advisor analyzing job fit. Compare the job description against the candidate's resume/skills and return a JSON object with exactly these keys:

{
  "match_score": 7,
  "matching_skills": ["skill 1", "skill 2"],
  "gap_skills": ["skill the job wants that the candidate lacks"],
  "resume_tweaks": ["specific bullet points to emphasize for this application"],
  "red_flags": ["anything suspicious about the posting - fake listings, unrealistic requirements, etc."]
}

match_score is 1-10. Return ONLY valid JSON, no markdown fences, no commentary."""


def _parse_json_response(text: str) -> Optional[Dict]:
    """Parse a JSON response, stripping markdown fences if present."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error("Failed to parse analysis JSON: %s...", text[:200])
        return None


class JobAnalyzer:
    """Analyze job descriptions for fit against candidate profile."""

    def __init__(self, anthropic_api_key: str = None):
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def analyze_fit(
        self,
        job_description: str,
        resume_text: str = None,
    ) -> Optional[Dict]:
        """Analyze how well a job description matches the candidate.

        Args:
            job_description: Full job description text.
            resume_text: Candidate's resume/skills text. If None, uses default profile.

        Returns:
            Structured dict with match_score, matching_skills, gap_skills,
            resume_tweaks, red_flags. Or None on failure.
        """
        if resume_text is None:
            resume_text = self._default_profile()

        user_msg = (
            f"## Job Description\n{job_description}\n\n"
            f"## Candidate Resume/Skills\n{resume_text}"
        )

        try:
            client = self._get_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=FIT_ANALYSIS_PROMPT,
                messages=[{"role": "user", "content": user_msg[:20000]}],
            )
            result = _parse_json_response(response.content[0].text)
            if result:
                result.setdefault("match_score", 0)
                result.setdefault("matching_skills", [])
                result.setdefault("gap_skills", [])
                result.setdefault("resume_tweaks", [])
                result.setdefault("red_flags", [])
            return result
        except Exception:
            logger.error("Fit analysis failed", exc_info=True)
            return None

    @staticmethod
    def _default_profile() -> str:
        """Default candidate profile based on Joe's skill set."""
        return (
            "Systems Engineer / IT Infrastructure professional with experience in:\n"
            "- Windows Server administration and Active Directory\n"
            "- PowerShell automation and scripting (advanced)\n"
            "- VMware vSphere virtualization\n"
            "- SolarWinds and Splunk monitoring\n"
            "- Networking (DNS, DHCP, TCP/IP)\n"
            "- Git/GitHub version control\n"
            "- Python scripting (intermediate)\n"
            "- Learning: Azure cloud, Docker, Kubernetes, Terraform, CI/CD\n"
            "- Location: Indianapolis, IN\n"
            "- Open to: hybrid, remote, or on-site positions"
        )
