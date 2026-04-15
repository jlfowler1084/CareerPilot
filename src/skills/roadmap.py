"""Claude-powered study roadmap generation from skill gaps."""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


class RoadmapGenerator:
    """Generates study roadmaps from skill gaps using the LLM router."""

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
            from src.llm.router import router
            result = router.complete(task="roadmap_generate", prompt=prompt)
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
