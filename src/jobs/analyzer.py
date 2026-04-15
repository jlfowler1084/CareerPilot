"""Claude-powered job description analysis and fit scoring."""

from __future__ import annotations

import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class JobAnalyzer:
    """Analyze job descriptions for fit against candidate profile."""

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
            from src.llm.router import router
            result = router.complete(task="job_analyze", prompt=user_msg[:20000])
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
