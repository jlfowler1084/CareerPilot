"""Company intelligence brief generation via Claude + web_search."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Dict, List, Optional

import anthropic

from config import settings

logger = logging.getLogger(__name__)

BRIEF_SYSTEM_PROMPT = """\
You are a company research analyst preparing an intelligence brief for a job seeker \
targeting IT infrastructure / systems engineering roles. Use web_search to research \
the company thoroughly, then return a single JSON object.

IMPORTANT: Return ONLY valid JSON, no markdown fences, no commentary outside the JSON.

Required sections (always include):

{
  "company_overview": {
    "description": "What they do, industry, mission",
    "headquarters": "City, State",
    "size": "Employee count range",
    "revenue_or_funding": "Revenue or funding info",
    "key_products": ["product1", "product2"],
    "recent_news": [{"headline": "...", "date": "YYYY-MM", "summary": "..."}]
  },
  "culture": {
    "glassdoor_rating": "X.X/5 or 'Not found'",
    "sentiment_summary": "Overall employee sentiment",
    "work_life_balance": "Summary",
    "remote_policy": "Remote/hybrid/onsite details",
    "pros": ["pro1", "pro2"],
    "cons": ["con1", "con2"]
  },
  "it_intelligence": {
    "tech_stack": ["technology1", "technology2"],
    "cloud_provider": "Primary cloud provider(s)",
    "infrastructure_scale": "Scale description",
    "recent_it_postings": [{"title": "Job Title", "signal": "What this hiring signals"}],
    "it_challenges": ["challenge1"]
  },
  "generated_at": "ISO 8601 timestamp",
  "sources": ["url1", "url2"]
}
"""

ROLE_ANALYSIS_ADDENDUM = """
Also include this section since a specific role was provided:

  "role_analysis": {
    "org_fit": "Where this role likely sits in the org",
    "day_to_day": "Likely daily responsibilities",
    "growth_potential": "Career growth path",
    "red_flags": ["any concerns about this role"],
    "questions_to_ask": ["smart questions for the interview"]
  }
"""

INTERVIEWER_PREP_ADDENDUM = """
Also include this section since a specific interviewer was named:

  "interviewer_prep": {
    "linkedin_summary": "Professional background summary",
    "likely_interview_style": "Expected interview approach",
    "rapport_topics": ["topic1", "topic2"]
  }
"""


def _parse_brief_json(text: str) -> Optional[Dict]:
    """Parse a JSON brief from Claude's response, stripping markdown fences."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error("Failed to parse brief JSON: %s...", text[:300])
        return None


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
    """Generate company intelligence briefs using Claude + web_search."""

    def __init__(self, anthropic_api_key: str = None):
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

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
        system = BRIEF_SYSTEM_PROMPT
        if role_title:
            system += ROLE_ANALYSIS_ADDENDUM
        if contact_name:
            system += INTERVIEWER_PREP_ADDENDUM

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
            client = self._get_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8192,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                tools=[{"type": "web_search_20250305", "name": "web_search"}],
            )

            # Extract text blocks from response (may include tool_use blocks)
            text_parts: List[str] = []
            for block in response.content:
                if hasattr(block, "text"):
                    text_parts.append(block.text)

            full_text = "\n".join(text_parts)
            brief = _parse_brief_json(full_text)
            if brief is None:
                return None

            brief = _ensure_brief_defaults(brief)
            if not brief.get("generated_at"):
                brief["generated_at"] = datetime.now().isoformat()

            return brief

        except Exception:
            logger.error("Company intel generation failed", exc_info=True)
            return None
