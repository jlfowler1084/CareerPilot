"""AI-powered skill gap analysis from job descriptions."""

from __future__ import annotations

import json
import logging
import re
from typing import Dict, List, Optional

import anthropic

from config import settings
from src.db import models

logger = logging.getLogger(__name__)

STUDY_PLAN_PROMPT = """\
You are a practical career development advisor for an IT infrastructure \
professional in Indianapolis transitioning toward cloud/DevOps roles.

Given these skill gaps (skills the job market demands but the candidate lacks or \
is weak in), create a prioritized study plan. Use web_search to find CURRENT, \
working resource links.

Rules:
- Prioritize by job market demand (higher times_seen = higher priority)
- Prefer free resources: Microsoft Learn, HashiCorp Learn, official docs, YouTube
- Include realistic time estimates (hours to reach conversational competency)
- Be concise and practical

Return ONLY valid JSON, no markdown fences:
[
  {
    "skill": "Terraform",
    "priority": 1,
    "target_hours": 8,
    "resources": [
      {"title": "HashiCorp Learn: Get Started", "url": "https://learn.hashicorp.com/terraform", "type": "course"},
      {"title": "TechWorld with Nana Terraform", "url": "https://youtube.com/...", "type": "video"}
    ],
    "rationale": "Mentioned in 6/12 jobs, 5 as required."
  }
]"""


def _parse_json_response(text):
    """Parse JSON from Claude response, stripping markdown fences if present."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON: %s...", text[:200])
        return None


class SkillGapAnalyzer:
    """Analyzes job descriptions to identify skill gaps and generate study plans."""

    def __init__(self, anthropic_api_key=None):
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def extract_skills(self, job_description):
        """Extract skills from a single job description.

        Returns:
            List of dicts with skill, category, level keys. Empty list on failure.
        """
        try:
            from src.llm.router import router
            result = router.complete(task="skill_extract", prompt=job_description[:15000])
            if isinstance(result, list):
                return result
            return []
        except Exception:
            logger.error("Skill extraction failed", exc_info=True)
            return []

    def scan_applications(self, conn, progress_callback=None):
        """Scan all applications with descriptions and extract skills.

        Args:
            conn: Database connection.
            progress_callback: Optional callable(current, total) for progress updates.

        Returns:
            Dict with apps_scanned, skills_found counts.
        """
        rows = conn.execute(
            "SELECT id, title, company, description FROM applications "
            "WHERE description IS NOT NULL AND description != ''"
        ).fetchall()

        apps_scanned = 0
        skills_found = 0

        for i, row in enumerate(rows):
            row = dict(row)
            label = f"{row['title']} at {row['company']}"
            skills = self.extract_skills(row["description"])

            for s in skills:
                skill_name = s.get("skill", "").strip()
                if not skill_name:
                    continue
                category = s.get("category", "other")
                level = s.get("level", "mentioned")

                models.upsert_skill_demand(
                    conn, skill_name, category, level,
                    application_id=row["id"], last_seen_in=label,
                )
                models.map_skill_to_application(
                    conn, skill_name, row["id"], level,
                )
                skills_found += 1

            apps_scanned += 1
            if progress_callback:
                progress_callback(i + 1, len(rows))

        # Recompute match levels after scan
        models.update_match_levels(conn)

        return {"apps_scanned": apps_scanned, "skills_found": skills_found}

    def compute_match_levels(self, conn):
        """Update match_level on all skill_demand rows."""
        models.update_match_levels(conn)

    def generate_study_plan(self, conn, gaps=None, max_items=5):
        """Generate a study plan for top gap skills using Claude + web_search.

        Args:
            conn: Database connection.
            gaps: List of gap skill dicts (from get_top_gaps). If None, fetches automatically.
            max_items: Max skills to include.

        Returns:
            List of plan item dicts, or empty list on failure.
        """
        if gaps is None:
            gaps = models.get_top_gaps(conn, limit=max_items)
        if not gaps:
            return []

        gaps_text = "\n".join(
            f"- {g['skill_name']} ({g.get('category', 'other')}): "
            f"seen in {g['times_seen']} jobs, {g['required_count']} required, "
            f"{g['preferred_count']} preferred"
            for g in gaps[:max_items]
        )

        try:
            client = self._get_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=STUDY_PLAN_PROMPT,
                messages=[{"role": "user", "content": f"Skill gaps to address:\n{gaps_text}"}],
                tools=[{"type": "web_search_20250305", "name": "web_search"}],
            )

            # Extract text from response blocks
            text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    text += block.text

            plan = _parse_json_response(text)
            if not isinstance(plan, list):
                return []

            # Persist to study_plan table
            for item in plan:
                skill = item.get("skill", "").strip()
                if not skill:
                    continue
                resources_json = json.dumps(
                    item.get("resources", []), ensure_ascii=False,
                )
                models.upsert_study_plan(
                    conn, skill,
                    priority_rank=item.get("priority"),
                    target_hours=item.get("target_hours"),
                    resources=resources_json,
                )

            return plan
        except Exception:
            logger.error("Study plan generation failed", exc_info=True)
            return []
