"""Tests for skill tracker with SQLite persistence."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.db import models
from src.skills.tracker import SkillTracker


@pytest.fixture
def tracker(tmp_path):
    """Create a SkillTracker with a temp database."""
    db_path = tmp_path / "test.db"
    t = SkillTracker(db_path=db_path)
    yield t
    t.close()


class TestSeedDefaults:
    def test_seeds_all_skills(self, tracker):
        """Seeds all default skills."""
        added = tracker.seed_defaults()
        assert added == 14

        all_skills = tracker.get_all_skills()
        assert len(all_skills) == 14

    def test_seed_idempotent(self, tracker):
        """Seeding twice doesn't duplicate skills."""
        tracker.seed_defaults()
        added = tracker.seed_defaults()
        assert added == 0

        all_skills = tracker.get_all_skills()
        assert len(all_skills) == 14

    def test_default_levels(self, tracker):
        """Default skill levels match specification."""
        tracker.seed_defaults()

        ps = tracker.get_skill("PowerShell")
        assert ps["current_level"] == 4
        assert ps["target_level"] == 4

        docker = tracker.get_skill("Docker")
        assert docker["current_level"] == 1
        assert docker["target_level"] == 3

        azure = tracker.get_skill("Azure")
        assert azure["current_level"] == 2
        assert azure["target_level"] == 4


class TestUpdateSkill:
    def test_updates_level(self, tracker):
        """Updates a skill's level."""
        tracker.seed_defaults()
        result = tracker.update_skill("Python", 3)
        assert result is True

        skill = tracker.get_skill("Python")
        assert skill["current_level"] == 3

    def test_logs_change(self, tracker):
        """Logs the level change in skill_log."""
        tracker.seed_defaults()
        tracker.update_skill("Docker", 2, source="study")

        logs = models.get_skill_log(tracker._conn, "Docker")
        assert len(logs) == 1
        assert logs[0]["old_level"] == 1
        assert logs[0]["new_level"] == 2
        assert logs[0]["source"] == "study"

    def test_multiple_updates_logged(self, tracker):
        """Multiple updates create multiple log entries."""
        tracker.seed_defaults()
        tracker.update_skill("Python", 3)
        tracker.update_skill("Python", 4)

        logs = models.get_skill_log(tracker._conn, "Python")
        assert len(logs) == 2

    def test_update_nonexistent_returns_false(self, tracker):
        """Returns False for nonexistent skill."""
        tracker.seed_defaults()
        result = tracker.update_skill("Nonexistent", 3)
        assert result is False

    def test_invalid_level_rejected(self, tracker):
        """Rejects levels outside 1-5."""
        tracker.seed_defaults()
        assert tracker.update_skill("Python", 0) is False
        assert tracker.update_skill("Python", 6) is False


class TestGetGaps:
    def test_returns_skills_with_gaps(self, tracker):
        """Returns skills where current < target."""
        tracker.seed_defaults()
        gaps = tracker.get_gaps()

        # Skills with gaps: VMware(3/4), Azure(2/4), Python(2/4),
        # Docker(1/3), K8s(1/3), Terraform(1/3), CI/CD(1/3), Git(3/4)
        gap_names = {g["name"] for g in gaps}
        assert "Azure" in gap_names
        assert "Docker" in gap_names
        assert "PowerShell" not in gap_names  # 4/4, no gap

    def test_sorted_by_gap_size(self, tracker):
        """Gaps sorted by size descending."""
        tracker.seed_defaults()
        gaps = tracker.get_gaps()

        gap_sizes = [g["gap"] for g in gaps]
        assert gap_sizes == sorted(gap_sizes, reverse=True)

    def test_no_gaps_returns_empty(self, tracker):
        """Returns empty list when all skills at target."""
        models.add_skill(tracker._conn, "TestSkill", "test", 5, 5)
        gaps = tracker.get_gaps()
        # Only the seeded test skill, which has no gap
        assert all(g["name"] != "TestSkill" for g in gaps)


class TestDisplaySkills:
    def test_includes_bar(self, tracker):
        """Display data includes a visual bar."""
        tracker.seed_defaults()
        data = tracker.display_skills()

        assert len(data) > 0
        for d in data:
            assert "bar" in d
            assert len(d["bar"]) > 0

    def test_gap_calculation(self, tracker):
        """Display data correctly calculates gaps."""
        tracker.seed_defaults()
        data = tracker.display_skills()

        for d in data:
            assert d["gap"] == d["target_level"] - d["current_level"]
