"""Claude-powered journal insights — weekly summaries and momentum tracking."""

from __future__ import annotations

import logging
import re

import anthropic

from config import settings

logger = logging.getLogger(__name__)

WEEKLY_SUMMARY_SYSTEM = (
    "You are a practical career coach reviewing a job seeker's weekly journal entries. "
    "Be direct and specific. No motivational fluff. "
    "Respond in plain text with these sections:\n"
    "WHAT WENT WELL:\n"
    "NEEDS ATTENTION:\n"
    "SKILL GAPS IDENTIFIED:\n"
    "FOCUS FOR NEXT WEEK:\n"
)

MOMENTUM_SYSTEM = (
    "You are analyzing a job seeker's journal entries over the past 2 weeks. "
    "Look at entry frequency, content depth, and tone. "
    "Respond with ONLY one of these statuses on the first line: "
    "strong, steady, slipping, stalled\n"
    "Then a 1-2 sentence explanation. No motivational speeches."
)


class InsightsEngine:
    """Generates insights from journal entries using Claude."""

    def __init__(self, anthropic_api_key=None):
        self._api_key = anthropic_api_key or settings.ANTHROPIC_API_KEY
        self._claude_client = None

    def _get_claude_client(self):
        if self._claude_client is None:
            self._claude_client = anthropic.Anthropic(api_key=self._api_key)
        return self._claude_client

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
            client = self._get_claude_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=WEEKLY_SUMMARY_SYSTEM,
                messages=[{"role": "user", "content": entries_text}],
            )
            result = response.content[0].text.strip()
            # Strip markdown formatting
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
            client = self._get_claude_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=256,
                system=MOMENTUM_SYSTEM,
                messages=[{"role": "user", "content": meta + entries_text}],
            )
            raw = response.content[0].text.strip()
            lines = raw.split("\n", 1)

            status = lines[0].strip().lower()
            valid_statuses = {"strong", "steady", "slipping", "stalled"}
            if status not in valid_statuses:
                # Try to extract from the first line
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
