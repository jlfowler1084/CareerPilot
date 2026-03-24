"""Claude-powered study roadmap generation from skill gaps."""

from __future__ import annotations

import logging
import re

import anthropic

from config import settings

logger = logging.getLogger(__name__)

ROADMAP_SYSTEM = (
    "You are a practical career development advisor for an IT infrastructure "
    "professional transitioning toward cloud/DevOps roles. "
    "Create a specific, actionable study roadmap. "
    "Rules:\n"
    "- Prioritize by job market demand for Indianapolis/remote roles\n"
    "- Prefer free resources: Microsoft Learn, official docs, YouTube channels, GitHub repos\n"
    "- Include one hands-on project per skill that builds toward a portfolio\n"
    "- Give realistic time estimates\n"
    "- Be concise and practical, not motivational\n"
    "- Format with clear headers per skill"
)


class RoadmapGenerator:
    """Generates study roadmaps from skill gaps using Claude."""

    def __init__(self, anthropic_api_key=None):
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._claude_client = None

    def _get_claude_client(self):
        if self._claude_client is None:
            self._claude_client = anthropic.Anthropic(api_key=self._api_key)
        return self._claude_client

    def generate_roadmap(self, gaps, available_hours_per_week=15):
        """Generate a study roadmap from skill gaps.

        Args:
            gaps: List of dicts with name, current_level, target_level, category, gap keys.
            available_hours_per_week: Weekly study hours available.

        Returns:
            Roadmap text string, or empty string on failure.
        """
        if not gaps:
            return "No skill gaps found. All skills are at target level."

        gaps_text = self._format_gaps(gaps)

        prompt = (
            f"Available study time: {available_hours_per_week} hours per week\n\n"
            f"Skill gaps to address (sorted by priority):\n{gaps_text}\n\n"
            "Create a week-by-week study plan covering all gaps. For each skill include:\n"
            "1. Recommended learning order and why\n"
            "2. Specific free resources (URLs where possible)\n"
            "3. One hands-on project that demonstrates the skill\n"
            "4. Estimated weeks to reach target level\n"
        )

        try:
            client = self._get_claude_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=ROADMAP_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            result = response.content[0].text.strip()
            # Clean up markdown bold for terminal display
            result = re.sub(r"\*\*(.+?)\*\*", r"\1", result)
            logger.info("Roadmap generated (%d chars, %d skills)", len(result), len(gaps))
            return result
        except Exception:
            logger.error("Failed to generate roadmap", exc_info=True)
            return ""

    def _format_gaps(self, gaps):
        """Format gaps into text for Claude prompt."""
        lines = []
        for g in gaps:
            lines.append(
                f"- {g['name']} ({g['category']}): "
                f"current level {g['current_level']}/5, "
                f"target {g['target_level']}/5, "
                f"gap = {g['gap']}"
            )
        return "\n".join(lines)
