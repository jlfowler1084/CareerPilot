"""Tests for skill gap dashboard CRUD and analysis."""

from __future__ import annotations

import json
from datetime import datetime

import pytest

from src.db import models


@pytest.fixture
def conn(tmp_path):
    """Create a test database connection with schema."""
    db_path = tmp_path / "test.db"
    c = models.get_connection(db_path)
    yield c
    c.close()


# --- Migration Tests ---


class TestMigrateApplicationsDescription:
    def test_adds_description_column(self, tmp_path):
        """Description column should be added to applications table."""
        db_path = tmp_path / "migrate.db"
        conn = models.get_connection(db_path)
        columns = [
            row[1] for row in conn.execute("PRAGMA table_info(applications)").fetchall()
        ]
        assert "description" in columns
        conn.close()

    def test_migration_idempotent(self, tmp_path):
        """Running migration twice should not fail."""
        db_path = tmp_path / "idem.db"
        conn = models.get_connection(db_path)
        # Run migration again manually
        models.migrate_applications_description(conn)
        columns = [
            row[1] for row in conn.execute("PRAGMA table_info(applications)").fetchall()
        ]
        assert columns.count("description") == 1
        conn.close()


# --- Schema Tests ---


class TestSchema:
    def test_skill_demand_table_exists(self, conn):
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_demand'"
        ).fetchone()
        assert row is not None

    def test_study_plan_table_exists(self, conn):
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='study_plan'"
        ).fetchone()
        assert row is not None

    def test_skill_application_map_table_exists(self, conn):
        row = conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='skill_application_map'"
        ).fetchone()
        assert row is not None


# --- Upsert Skill Demand Tests ---


class TestUpsertSkillDemand:
    def test_inserts_new_skill(self, conn):
        rid = models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        assert rid > 0
        demands = models.get_skill_demand(conn)
        assert len(demands) == 1
        assert demands[0]["skill_name"] == "Terraform"
        assert demands[0]["times_seen"] == 1
        assert demands[0]["required_count"] == 1

    def test_increments_on_second_call(self, conn):
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "Terraform", "devops", "preferred")
        demands = models.get_skill_demand(conn)
        assert len(demands) == 1
        assert demands[0]["times_seen"] == 2
        assert demands[0]["required_count"] == 1
        assert demands[0]["preferred_count"] == 1

    def test_tracks_last_seen_in(self, conn):
        models.upsert_skill_demand(
            conn, "Python", "scripting", "required",
            last_seen_in="SysAdmin at MISO",
        )
        demands = models.get_skill_demand(conn)
        assert demands[0]["last_seen_in"] == "SysAdmin at MISO"

    def test_multiple_skills(self, conn):
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "Python", "scripting", "preferred")
        models.upsert_skill_demand(conn, "Kubernetes", "devops", "required")
        demands = models.get_skill_demand(conn)
        assert len(demands) == 3


# --- Get Skill Demand Tests ---


class TestGetSkillDemand:
    def test_filters_by_min_count(self, conn):
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "Ansible", "devops", "preferred")

        result = models.get_skill_demand(conn, min_count=2)
        assert len(result) == 1
        assert result[0]["skill_name"] == "Terraform"

    def test_filters_by_match_level(self, conn):
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "PowerShell", "scripting", "required")
        # Set match levels manually
        conn.execute(
            "UPDATE skill_demand SET match_level = 'gap' WHERE skill_name = 'Terraform'"
        )
        conn.execute(
            "UPDATE skill_demand SET match_level = 'strong' WHERE skill_name = 'PowerShell'"
        )
        conn.commit()

        gaps = models.get_skill_demand(conn, match_level="gap")
        assert len(gaps) == 1
        assert gaps[0]["skill_name"] == "Terraform"

    def test_sorted_by_times_seen(self, conn):
        models.upsert_skill_demand(conn, "Ansible", "devops", "required")
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")

        result = models.get_skill_demand(conn)
        assert result[0]["skill_name"] == "Terraform"


# --- Update Match Levels Tests ---


class TestUpdateMatchLevels:
    def test_strong_match(self, conn):
        """Skill with current_level >= 3 should be 'strong'."""
        models.add_skill(conn, "PowerShell", "scripting", current_level=4, target_level=4)
        models.upsert_skill_demand(conn, "PowerShell", "scripting", "required")
        models.update_match_levels(conn)
        demands = models.get_skill_demand(conn)
        assert demands[0]["match_level"] == "strong"

    def test_partial_match(self, conn):
        """Skill with current_level 1-2 should be 'partial'."""
        models.add_skill(conn, "Azure", "cloud", current_level=2, target_level=4)
        models.upsert_skill_demand(conn, "Azure", "cloud", "required")
        models.update_match_levels(conn)
        demands = models.get_skill_demand(conn)
        assert demands[0]["match_level"] == "partial"

    def test_gap(self, conn):
        """Skill not in skills table should be 'gap'."""
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.update_match_levels(conn)
        demands = models.get_skill_demand(conn)
        assert demands[0]["match_level"] == "gap"

    def test_case_insensitive(self, conn):
        """Match should be case-insensitive."""
        models.add_skill(conn, "PowerShell", "scripting", current_level=4)
        models.upsert_skill_demand(conn, "powershell", "scripting", "required")
        models.update_match_levels(conn)
        demands = models.get_skill_demand(conn)
        assert demands[0]["match_level"] == "strong"


# --- Get Top Gaps Tests ---


class TestGetTopGaps:
    def test_returns_only_gaps(self, conn):
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "PowerShell", "scripting", "required")
        conn.execute(
            "UPDATE skill_demand SET match_level = 'gap' WHERE skill_name = 'Terraform'"
        )
        conn.execute(
            "UPDATE skill_demand SET match_level = 'strong' WHERE skill_name = 'PowerShell'"
        )
        conn.commit()

        gaps = models.get_top_gaps(conn)
        assert len(gaps) == 1
        assert gaps[0]["skill_name"] == "Terraform"

    def test_sorted_by_frequency(self, conn):
        models.upsert_skill_demand(conn, "Ansible", "devops", "required")
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        models.upsert_skill_demand(conn, "Terraform", "devops", "required")
        conn.execute("UPDATE skill_demand SET match_level = 'gap'")
        conn.commit()

        gaps = models.get_top_gaps(conn)
        assert gaps[0]["skill_name"] == "Terraform"
        assert gaps[0]["times_seen"] == 2

    def test_respects_limit(self, conn):
        for name in ["A", "B", "C", "D", "E"]:
            models.upsert_skill_demand(conn, name, "other", "required")
        conn.execute("UPDATE skill_demand SET match_level = 'gap'")
        conn.commit()

        gaps = models.get_top_gaps(conn, limit=3)
        assert len(gaps) == 3


# --- Study Plan Tests ---


class TestStudyPlan:
    def test_upsert_creates(self, conn):
        rid = models.upsert_study_plan(
            conn, "Terraform",
            priority_rank=1,
            target_hours=8,
            resources='[{"title": "HashiCorp Learn", "url": "https://learn.hashicorp.com"}]',
        )
        assert rid > 0
        plan = models.get_study_plan(conn)
        assert len(plan) == 1
        assert plan[0]["skill_name"] == "Terraform"
        assert plan[0]["target_hours"] == 8

    def test_upsert_updates(self, conn):
        models.upsert_study_plan(conn, "Terraform", priority_rank=1)
        models.upsert_study_plan(conn, "Terraform", priority_rank=2, target_hours=10)
        plan = models.get_study_plan(conn)
        assert len(plan) == 1
        assert plan[0]["priority_rank"] == 2
        assert plan[0]["target_hours"] == 10

    def test_excludes_completed(self, conn):
        models.upsert_study_plan(conn, "Terraform", status="completed")
        models.upsert_study_plan(conn, "Kubernetes", priority_rank=1)
        plan = models.get_study_plan(conn)
        assert len(plan) == 1
        assert plan[0]["skill_name"] == "Kubernetes"

    def test_ordered_by_priority(self, conn):
        models.upsert_study_plan(conn, "Ansible", priority_rank=3)
        models.upsert_study_plan(conn, "Terraform", priority_rank=1)
        models.upsert_study_plan(conn, "Kubernetes", priority_rank=2)
        plan = models.get_study_plan(conn)
        names = [p["skill_name"] for p in plan]
        assert names == ["Terraform", "Kubernetes", "Ansible"]


# --- Log Study Time Tests ---


class TestLogStudyTime:
    def test_increments_hours(self, conn):
        models.upsert_study_plan(conn, "Terraform", target_hours=8)
        models.log_study_time(conn, "Terraform", 2)
        models.log_study_time(conn, "Terraform", 1.5)
        plan = models.get_study_plan(conn)
        assert plan[0]["study_hours_logged"] == 3.5

    def test_sets_started_at_on_first_log(self, conn):
        models.upsert_study_plan(conn, "Terraform")
        plan_before = models.get_study_plan(conn)
        assert plan_before[0]["started_at"] is None

        models.log_study_time(conn, "Terraform", 1)
        plan_after = models.get_study_plan(conn)
        assert plan_after[0]["started_at"] is not None
        assert plan_after[0]["status"] == "in_progress"

    def test_appends_note(self, conn):
        models.upsert_study_plan(conn, "Terraform")
        models.log_study_time(conn, "Terraform", 2, "Completed intro module")
        plan = models.get_study_plan(conn)
        assert "Completed intro module" in plan[0]["notes"]

    def test_returns_false_for_missing(self, conn):
        assert models.log_study_time(conn, "NonExistent", 1) is False


# --- Skill Application Map Tests ---


class TestSkillApplicationMap:
    def test_maps_skill_to_application(self, conn):
        # Create an application
        conn.execute(
            "INSERT INTO applications (title, company, status) "
            "VALUES ('Sys Admin', 'MISO', 'found')"
        )
        conn.commit()
        app_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        models.map_skill_to_application(conn, "Terraform", app_id, "required")
        skills = models.get_skills_for_application(conn, app_id)
        assert len(skills) == 1
        assert skills[0]["skill_name"] == "Terraform"
        assert skills[0]["requirement_level"] == "required"

    def test_ignores_duplicate(self, conn):
        conn.execute(
            "INSERT INTO applications (title, company, status) "
            "VALUES ('Sys Admin', 'MISO', 'found')"
        )
        conn.commit()
        app_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        models.map_skill_to_application(conn, "Terraform", app_id, "required")
        models.map_skill_to_application(conn, "Terraform", app_id, "required")
        skills = models.get_skills_for_application(conn, app_id)
        assert len(skills) == 1

    def test_multiple_skills_per_application(self, conn):
        conn.execute(
            "INSERT INTO applications (title, company, status) "
            "VALUES ('DevOps Eng', 'Lilly', 'found')"
        )
        conn.commit()
        app_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        models.map_skill_to_application(conn, "Terraform", app_id, "required")
        models.map_skill_to_application(conn, "Python", app_id, "preferred")
        models.map_skill_to_application(conn, "Docker", app_id, "mentioned")

        skills = models.get_skills_for_application(conn, app_id)
        assert len(skills) == 3


# --- Save Job with Description ---


class TestSaveJobDescription:
    def test_saves_description(self, conn):
        from src.jobs.tracker import ApplicationTracker

        tracker = ApplicationTracker.__new__(ApplicationTracker)
        tracker._conn = conn

        job_id = tracker.save_job({
            "title": "Systems Engineer",
            "company": "MISO Energy",
            "description": "We need someone who knows Terraform and Kubernetes...",
        })

        row = conn.execute(
            "SELECT description FROM applications WHERE id = ?", (job_id,)
        ).fetchone()
        assert row["description"] is not None
        assert "Terraform" in row["description"]

    def test_saves_without_description(self, conn):
        from src.jobs.tracker import ApplicationTracker

        tracker = ApplicationTracker.__new__(ApplicationTracker)
        tracker._conn = conn

        job_id = tracker.save_job({
            "title": "Help Desk",
            "company": "Acme",
        })

        row = conn.execute(
            "SELECT description FROM applications WHERE id = ?", (job_id,)
        ).fetchone()
        assert row["description"] is None


# --- Skill Extraction (unit test with mock) ---


class TestSkillExtraction:
    def test_extract_skills_returns_list(self, monkeypatch):
        """extract_skills should return a list of skill dicts."""
        from src.intel.skill_analyzer import SkillGapAnalyzer

        mock_response = json.dumps([
            {"skill": "Terraform", "category": "devops", "level": "required"},
            {"skill": "Python", "category": "scripting", "level": "preferred"},
        ])

        class MockContent:
            def __init__(self):
                self.text = mock_response

        class MockResponse:
            def __init__(self):
                self.content = [MockContent()]

        class MockClient:
            class messages:
                @staticmethod
                def create(**kwargs):
                    return MockResponse()

        analyzer = SkillGapAnalyzer()
        monkeypatch.setattr(analyzer, "_get_client", lambda: MockClient())

        result = analyzer.extract_skills("Some job description")
        assert len(result) == 2
        assert result[0]["skill"] == "Terraform"
        assert result[1]["level"] == "preferred"

    def test_extract_skills_handles_failure(self, monkeypatch):
        """extract_skills should return empty list on API failure."""
        from src.intel.skill_analyzer import SkillGapAnalyzer

        class MockClient:
            class messages:
                @staticmethod
                def create(**kwargs):
                    raise Exception("API error")

        analyzer = SkillGapAnalyzer()
        monkeypatch.setattr(analyzer, "_get_client", lambda: MockClient())

        result = analyzer.extract_skills("Some job description")
        assert result == []
