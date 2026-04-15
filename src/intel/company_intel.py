"""Company intelligence brief generation via Claude + web_search."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def _ensure_brief_defaults(brief: Dict) -> Dict:
    """Ensure all required top-level sections exist with defaults."""
    brief.setdefault("company_overview", {
        "description": "", "headquarters": "", "size": "",
        "revenue_or_funding": "", "key_products": [], "recent_news": [],
    })
    brief.setdefault("culture", {
        "glassdoor_rating": "", "sentiment_summary": "",
        "work_life_balance": "", "remote_policy": "",
        "pros": [], "cons": [],
    })
    brief.setdefault("it_intelligence", {
        "tech_stack": [], "cloud_provider": "", "infrastructure_scale": "",
        "recent_it_postings": [], "it_challenges": [],
    })
    brief.setdefault("generated_at", datetime.now().isoformat())
    brief.setdefault("sources", [])
    return brief


class CompanyIntelEngine:
    """Generate company intelligence briefs using the LLM router."""

    def generate_brief(
        self,
        company: str,
        role_title: str = None,
        contact_name: str = None,
        job_url: str = None,
    ) -> Optional[Dict]:
        """Generate a comprehensive company intelligence brief.

        Args:
            company: Company name to research.
            role_title: Optional role title for role_analysis section.
            contact_name: Optional interviewer name for interviewer_prep section.
            job_url: Optional job posting URL for additional context.

        Returns:
            Structured brief dict, or None on failure.
        """
        user_parts = [f'Research the company "{company}" thoroughly.']
        if role_title:
            user_parts.append(f'The candidate is applying for: "{role_title}".')
        if contact_name:
            user_parts.append(
                f'The interviewer/contact is: "{contact_name}". '
                f"Research their professional background."
            )
        if job_url:
            user_parts.append(f"Job posting URL for reference: {job_url}")

        user_msg = " ".join(user_parts)

        try:
            from src.llm.router import router
            brief = router.complete(task="company_intel", prompt=user_msg)
            if brief is None:
                return None
            brief = _ensure_brief_defaults(brief)
            if not brief.get("generated_at"):
                brief["generated_at"] = datetime.now().isoformat()
            return brief
        except Exception:
            logger.error("Company intel generation failed", exc_info=True)
            return None
