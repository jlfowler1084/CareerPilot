"""Claude-powered journal insights — weekly summaries and momentum tracking."""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


class InsightsEngine:
    """Generates insights from journal entries using the LLM router."""

    def weekly_summary(self, entries):
        """Generate a weekly summary from journal entries.

        Args:
            entries: List of dicts with date, type, content, tags keys.

        Returns:
            Summary text string, or empty string on failure.
        """
        if not entries:
            return "No entries to summarize."

        entries_text = self._format_entries_for_prompt(entries)

        try:
            from src.llm.router import router
            result = router.complete(task="journal_weekly_summary", prompt=entries_text)
            result = re.sub(r"\*\*(.+?)\*\*", r"\1", result)
            logger.info("Weekly summary generated (%d chars)", len(result))
            return result
        except Exception:
            logger.error("Failed to generate weekly summary", exc_info=True)
            return ""

    def momentum_check(self, entries):
        """Analyze entry frequency and tone over the past 2 weeks.

        Args:
            entries: List of dicts with date, type, content keys.

        Returns:
            Dict with status (strong/steady/slipping/stalled) and explanation.
        """
        default = {"status": "unknown", "explanation": "Could not analyze momentum."}

        if not entries:
            return {"status": "stalled", "explanation": "No journal entries found in the past 2 weeks."}

        entries_text = self._format_entries_for_prompt(entries)
        meta = f"Total entries: {len(entries)} over the past 2 weeks.\n\n"

        try:
            from src.llm.router import router
            raw = router.complete(task="journal_momentum", prompt=meta + entries_text)
            lines = raw.split("\n", 1)

            status = lines[0].strip().lower()
            valid_statuses = {"strong", "steady", "slipping", "stalled"}
            if status not in valid_statuses:
                for s in valid_statuses:
                    if s in status:
                        status = s
                        break
                else:
                    status = "unknown"

            explanation = lines[1].strip() if len(lines) > 1 else ""
            logger.info("Momentum check: %s", status)
            return {"status": status, "explanation": explanation}
        except Exception:
            logger.error("Failed to run momentum check", exc_info=True)
            return default

    def _format_entries_for_prompt(self, entries):
        """Format entries into a text block for Claude."""
        parts = []
        for e in entries:
            header = f"[{e.get('date', '?')}] ({e.get('type', '?')})"
            if e.get("tags"):
                header += f" tags: {', '.join(e['tags'])}"
            if e.get("mood"):
                header += f" mood: {e['mood']}"
            content = e.get("content", "")[:1000]
            parts.append(f"{header}\n{content}")
        return "\n\n---\n\n".join(parts)
