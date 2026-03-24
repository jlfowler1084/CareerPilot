"""Skill inventory tracking with SQLite persistence."""

from __future__ import annotations

import logging

from src.db import models

logger = logging.getLogger(__name__)

DEFAULT_SKILLS = [
    ("PowerShell", "automation", 4, 4),
    ("Windows Server", "infrastructure", 4, 4),
    ("Active Directory", "identity", 4, 4),
    ("VMware vSphere", "virtualization", 3, 4),
    ("Splunk", "monitoring", 3, 3),
    ("SolarWinds", "monitoring", 3, 3),
    ("Azure", "cloud", 2, 4),
    ("Python", "development", 2, 4),
    ("Docker", "containers", 1, 3),
    ("Kubernetes", "containers", 1, 3),
    ("Terraform", "iac", 1, 3),
    ("CI/CD", "devops", 1, 3),
    ("Networking DNS/DHCP", "networking", 3, 3),
    ("Git/GitHub", "devops", 3, 4),
]


class SkillTracker:
    """Manages skill inventory with SQLite persistence."""

    def __init__(self, db_path=None):
        self._conn = models.get_connection(db_path)

    def seed_defaults(self):
        """Pre-populate with default skill set. Skips existing skills."""
        added = 0
        for name, category, current, target in DEFAULT_SKILLS:
            result = models.add_skill(
                self._conn, name=name, category=category,
                current_level=current, target_level=target,
            )
            if result is not None:
                added += 1
        logger.info("Seeded %d default skills (%d already existed)", added, len(DEFAULT_SKILLS) - added)
        return added

    def update_skill(self, name, new_level, source="manual"):
        """Update a skill's current level.

        Args:
            name: Skill name (case-sensitive).
            new_level: New level (1-5).
            source: Source of the update (e.g. "manual", "journal", "interview").

        Returns:
            True if updated, False if skill not found.
        """
        if not 1 <= new_level <= 5:
            logger.error("Level must be between 1 and 5, got %d", new_level)
            return False
        return models.update_skill(self._conn, name, new_level, source)

    def get_all_skills(self):
        """Get all skills sorted by category."""
        return models.get_all_skills(self._conn)

    def get_gaps(self):
        """Get skills where current < target, sorted by gap size."""
        return models.get_gaps(self._conn)

    def get_skill(self, name):
        """Get a single skill by name."""
        return models.get_skill(self._conn, name)

    def display_skills(self):
        """Return skill data formatted for Rich display.

        Returns:
            List of dicts with name, category, current_level, target_level, gap,
            last_practiced, bar (a visual bar string).
        """
        skills = self.get_all_skills()
        result = []
        for s in skills:
            gap = s["target_level"] - s["current_level"]
            bar = self._level_bar(s["current_level"], s["target_level"])
            result.append({
                "name": s["name"],
                "category": s["category"],
                "current_level": s["current_level"],
                "target_level": s["target_level"],
                "gap": gap,
                "last_practiced": s.get("last_practiced", "") or "",
                "bar": bar,
            })
        return result

    def _level_bar(self, current, target):
        """Create a simple visual bar: filled blocks + empty blocks."""
        filled = "\u2588" * current
        empty = "\u2591" * (target - current) if target > current else ""
        remaining = "\u2591" * (5 - max(current, target))
        return filled + empty + remaining

    def close(self):
        """Close the database connection."""
        self._conn.close()
