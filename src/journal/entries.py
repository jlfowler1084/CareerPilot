"""Journal entry management — create, list, search, read markdown entries."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from config import settings

logger = logging.getLogger(__name__)

VALID_ENTRY_TYPES = {"daily", "interview", "study", "project", "reflection"}


class JournalManager:
    """Manages markdown journal entries in data/journal/."""

    def __init__(self, journal_dir: Path = None):
        self._dir = journal_dir or settings.JOURNAL_DIR
        self._dir.mkdir(parents=True, exist_ok=True)

    def create_entry(self, entry_type, content, tags=None, mood=None, time_spent=None):
        """Create a new journal entry as a markdown file.

        Args:
            entry_type: One of daily, interview, study, project, reflection.
            content: The entry text.
            tags: List of tag strings, or None to auto-generate via Claude.
            mood: Optional mood string (e.g. "focused", "frustrated").
            time_spent: Optional minutes spent.

        Returns:
            The filename of the created entry.
        """
        if entry_type not in VALID_ENTRY_TYPES:
            raise ValueError(f"Invalid entry type '{entry_type}'. Must be one of: {VALID_ENTRY_TYPES}")

        today = datetime.now().strftime("%Y-%m-%d")

        # Determine sequential counter for today
        existing = list(self._dir.glob(f"{today}_{entry_type}_*.md"))
        counter = len(existing) + 1
        filename = f"{today}_{entry_type}_{counter:03d}.md"

        # Auto-generate tags if not provided
        if tags is None:
            tags = self._auto_tag(content)

        # Build YAML frontmatter
        frontmatter_lines = [
            "---",
            f"date: {today}",
            f"type: {entry_type}",
            f"tags: {json.dumps(tags)}",
        ]
        if mood:
            frontmatter_lines.append(f"mood: {mood}")
        if time_spent is not None:
            frontmatter_lines.append(f"time_spent_minutes: {time_spent}")
        frontmatter_lines.append("---")

        full_content = "\n".join(frontmatter_lines) + "\n\n" + content + "\n"

        filepath = self._dir / filename
        filepath.write_text(full_content, encoding="utf-8")
        logger.info("Journal entry created: %s", filename)
        return filename

    def _auto_tag(self, content):
        """Generate tags for content using the LLM router."""
        try:
            from src.llm.router import router
            tags = router.complete(task="journal_entry", prompt=content[:2000])
            # result is schema-validated list from the router
            if isinstance(tags, list):
                return [str(t) for t in tags[:5]]
        except Exception:
            logger.warning("Auto-tagging failed, using empty tags", exc_info=True)
        return []

    def list_entries(self, days_back=30, entry_type=None):
        """List journal entries, filtered by date and/or type.

        Returns:
            List of dicts with filename, date, type, tags, mood, sorted newest first.
        """
        cutoff = datetime.now() - timedelta(days=days_back)
        cutoff_str = cutoff.strftime("%Y-%m-%d")

        entries = []
        for f in sorted(self._dir.glob("*.md"), reverse=True):
            # Parse date from filename: YYYY-MM-DD_type_NNN.md
            parts = f.stem.split("_", 2)
            if len(parts) < 2:
                continue

            file_date = parts[0]
            file_type = parts[1] if len(parts) > 1 else ""

            if file_date < cutoff_str:
                continue
            if entry_type and file_type != entry_type:
                continue

            meta = self._parse_frontmatter(f)
            entries.append({
                "filename": f.name,
                "date": meta.get("date", file_date),
                "type": meta.get("type", file_type),
                "tags": meta.get("tags", []),
                "mood": meta.get("mood", ""),
                "time_spent_minutes": meta.get("time_spent_minutes", ""),
            })

        return entries

    def search_entries(self, keyword):
        """Full-text search across all journal entry files.

        Returns:
            List of dicts with filename and a preview snippet.
        """
        keyword_lower = keyword.lower()
        results = []

        for f in sorted(self._dir.glob("*.md"), reverse=True):
            text = f.read_text(encoding="utf-8", errors="replace")
            if keyword_lower in text.lower():
                # Find the line containing the keyword for a snippet
                for line in text.split("\n"):
                    if keyword_lower in line.lower():
                        snippet = line.strip()[:100]
                        break
                else:
                    snippet = text[:100].strip()

                results.append({"filename": f.name, "snippet": snippet})

        return results

    def get_entry(self, filename):
        """Read a specific entry's frontmatter and content.

        Returns:
            Dict with frontmatter fields + "content" key, or None if not found.
        """
        filepath = self._dir / filename
        if not filepath.exists():
            logger.warning("Entry not found: %s", filename)
            return None

        text = filepath.read_text(encoding="utf-8", errors="replace")
        meta = self._parse_frontmatter(filepath)

        # Extract content after frontmatter
        content = text
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                content = parts[2].strip()

        meta["content"] = content
        meta["filename"] = filename
        return meta

    def _parse_frontmatter(self, filepath):
        """Parse YAML frontmatter from a markdown file."""
        text = filepath.read_text(encoding="utf-8", errors="replace")
        meta = {}

        if not text.startswith("---"):
            return meta

        parts = text.split("---", 2)
        if len(parts) < 3:
            return meta

        for line in parts[1].strip().split("\n"):
            if ":" not in line:
                continue
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip()

            if key == "tags":
                try:
                    meta[key] = json.loads(value)
                except (json.JSONDecodeError, ValueError):
                    meta[key] = [t.strip() for t in value.split(",") if t.strip()]
            elif key == "time_spent_minutes":
                try:
                    meta[key] = int(value)
                except ValueError:
                    meta[key] = value
            else:
                meta[key] = value

        return meta
