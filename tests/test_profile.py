"""Tests for candidate profile data store."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from src.profile import models
from src.profile.manager import ProfileManager


@pytest.fixture
def conn(tmp_path):
    """Create a profile-enabled connection with a temp database."""
    db_path = tmp_path / "test_profile.db"
    c = models.get_profile_connection(db_path)
    yield c
    c.close()


@pytest.fixture
def mgr(tmp_path):
    """Create a ProfileManager with a temp database."""
    db_path = tmp_path / "test_profile.db"
    m = ProfileManager(db_path=db_path)
    yield m
    m.close()


# ─── Personal CRUD ──────────────────────────────────────────────────


class TestPersonalCRUD:
    def test_upsert_creates_row(self, conn):
        """Upserting into empty table creates the singleton row."""
        models.upsert_personal(conn, full_name="Jane Doe", email="jane@test.com")
        row = models.get_personal(conn)
        assert row is not None
        assert row["full_name"] == "Jane Doe"
        assert row["email"] == "jane@test.com"

    def test_upsert_updates_existing(self, conn):
        """Upserting again updates rather than inserting a second row."""
        models.upsert_personal(conn, full_name="Jane Doe")
        models.upsert_personal(conn, full_name="Jane Smith", phone="555-1234")
        row = models.get_personal(conn)
        assert row["full_name"] == "Jane Smith"
        assert row["phone"] == "555-1234"

    def test_get_personal_empty(self, conn):
        """Returns None when no personal data exists."""
        assert models.get_personal(conn) is None

    def test_updated_at_set(self, conn):
        """updated_at is automatically set on upsert."""
        models.upsert_personal(conn, full_name="Test")
        row = models.get_personal(conn)
        assert row["updated_at"] != ""

    def test_work_authorization_constraint(self, conn):
        """Only valid work_authorization values are accepted."""
        models.upsert_personal(conn, work_authorization="us_citizen")
        row = models.get_personal(conn)
        assert row["work_authorization"] == "us_citizen"

    def test_remote_preference_constraint(self, conn):
        """Only valid remote_preference values are accepted."""
        models.upsert_personal(conn, remote_preference="flexible")
        row = models.get_personal(conn)
        assert row["remote_preference"] == "flexible"


# ─── Work History CRUD ──────────────────────────────────────────────


class TestWorkHistoryCRUD:
    def test_add_and_get(self, conn):
        """Add a work history entry and retrieve it."""
        row_id = models.add_work_history(conn, "Acme", "Engineer",
                                         location="NYC", start_date="2020-01")
        entry = models.get_work_history(conn, row_id)
        assert entry["company"] == "Acme"
        assert entry["title"] == "Engineer"
        assert entry["location"] == "NYC"

    def test_get_all_ordered(self, conn):
        """Work history ordered by start_date DESC."""
        models.add_work_history(conn, "A", "Jr", start_date="2015-01")
        models.add_work_history(conn, "B", "Sr", start_date="2020-01")
        all_entries = models.get_all_work_history(conn)
        assert all_entries[0]["company"] == "B"
        assert all_entries[1]["company"] == "A"

    def test_update(self, conn):
        """Update a work history entry."""
        row_id = models.add_work_history(conn, "Acme", "Engineer")
        result = models.update_work_history(conn, row_id, title="Senior Engineer")
        assert result is True
        entry = models.get_work_history(conn, row_id)
        assert entry["title"] == "Senior Engineer"

    def test_delete(self, conn):
        """Delete a work history entry."""
        row_id = models.add_work_history(conn, "Acme", "Engineer")
        result = models.delete_work_history(conn, row_id)
        assert result is True
        assert models.get_work_history(conn, row_id) is None

    def test_delete_nonexistent(self, conn):
        """Deleting nonexistent entry returns False."""
        assert models.delete_work_history(conn, 999) is False

    def test_is_current_flag(self, conn):
        """is_current flag is stored correctly."""
        row_id = models.add_work_history(conn, "Acme", "Engineer", is_current=True)
        entry = models.get_work_history(conn, row_id)
        assert entry["is_current"] == 1


# ─── Education CRUD ─────────────────────────────────────────────────


class TestEducationCRUD:
    def test_add_and_get(self, conn):
        """Add and retrieve an education entry."""
        row_id = models.add_education(conn, "MIT", degree="BS",
                                      field_of_study="CS", graduation_date="2020")
        entry = models.get_education(conn, row_id)
        assert entry["school"] == "MIT"
        assert entry["degree"] == "BS"

    def test_update(self, conn):
        """Update an education entry."""
        row_id = models.add_education(conn, "MIT", degree="BS")
        models.update_education(conn, row_id, degree="MS")
        entry = models.get_education(conn, row_id)
        assert entry["degree"] == "MS"

    def test_delete(self, conn):
        """Delete an education entry."""
        row_id = models.add_education(conn, "MIT")
        assert models.delete_education(conn, row_id) is True
        assert models.get_education(conn, row_id) is None

    def test_optional_gpa(self, conn):
        """GPA can be null."""
        row_id = models.add_education(conn, "MIT")
        entry = models.get_education(conn, row_id)
        assert entry["gpa"] is None


# ─── Certifications CRUD ────────────────────────────────────────────


class TestCertificationsCRUD:
    def test_add_and_get(self, conn):
        """Add and retrieve a certification."""
        row_id = models.add_certification(conn, "AWS SAA", issuer="Amazon",
                                          in_progress=True)
        entry = models.get_certification(conn, row_id)
        assert entry["name"] == "AWS SAA"
        assert entry["issuer"] == "Amazon"
        assert entry["in_progress"] == 1

    def test_update(self, conn):
        """Update a certification."""
        row_id = models.add_certification(conn, "AWS SAA", in_progress=True)
        models.update_certification(conn, row_id, in_progress=False)
        entry = models.get_certification(conn, row_id)
        assert entry["in_progress"] == 0

    def test_delete(self, conn):
        """Delete a certification."""
        row_id = models.add_certification(conn, "AWS SAA")
        assert models.delete_certification(conn, row_id) is True
        assert models.get_certification(conn, row_id) is None

    def test_get_all(self, conn):
        """Get all certifications."""
        models.add_certification(conn, "Cert A", date_obtained="2020-01")
        models.add_certification(conn, "Cert B", date_obtained="2022-01")
        all_certs = models.get_all_certifications(conn)
        assert len(all_certs) == 2


# ─── References CRUD ────────────────────────────────────────────────


class TestReferencesCRUD:
    def test_add_and_get(self, conn):
        """Add and retrieve a reference."""
        row_id = models.add_reference(conn, "John Smith", title="Manager",
                                      company="Acme", phone="555-1234",
                                      email="john@acme.com", relationship="Supervisor")
        entry = models.get_reference(conn, row_id)
        assert entry["name"] == "John Smith"
        assert entry["relationship"] == "Supervisor"

    def test_update(self, conn):
        """Update a reference."""
        row_id = models.add_reference(conn, "John Smith")
        models.update_reference(conn, row_id, title="Director")
        entry = models.get_reference(conn, row_id)
        assert entry["title"] == "Director"

    def test_delete(self, conn):
        """Delete a reference."""
        row_id = models.add_reference(conn, "John Smith")
        assert models.delete_reference(conn, row_id) is True
        assert models.get_reference(conn, row_id) is None


# ─── EEO CRUD ───────────────────────────────────────────────────────


class TestEEOCRUD:
    def test_upsert_creates(self, conn):
        """Upserting into empty EEO table creates the singleton row."""
        models.upsert_eeo(conn, gender="Male", veteran_status="Non-Veteran")
        row = models.get_eeo(conn)
        assert row["gender"] == "Male"
        assert row["veteran_status"] == "Non-Veteran"

    def test_upsert_updates(self, conn):
        """Upserting again updates rather than inserting a second row."""
        models.upsert_eeo(conn, gender="Male")
        models.upsert_eeo(conn, gender="Prefer not to say")
        row = models.get_eeo(conn)
        assert row["gender"] == "Prefer not to say"

    def test_get_eeo_empty(self, conn):
        """Returns None when no EEO data exists."""
        assert models.get_eeo(conn) is None


# ─── ProfileManager — Exports ───────────────────────────────────────


class TestProfileExports:
    def test_export_json(self, mgr):
        """export_json returns valid JSON with all sections."""
        mgr.update_personal(full_name="Test User", email="test@test.com")
        mgr.add_work_history("Acme", "Engineer")
        result = mgr.export_json()
        data = json.loads(result)
        assert data["personal"]["full_name"] == "Test User"
        assert len(data["work_history"]) == 1
        # Internal id should be stripped
        assert "id" not in data["personal"]
        assert "id" not in data["work_history"][0]

    def test_export_text(self, mgr):
        """export_text returns formatted string with all sections."""
        mgr.update_personal(full_name="Test User", email="test@test.com",
                            work_authorization="us_citizen")
        mgr.add_work_history("Acme", "Engineer", start_date="2020-01")
        mgr.add_education("MIT", degree="BS", field_of_study="CS")
        mgr.add_certification("AWS SAA", issuer="Amazon")
        result = mgr.export_text()
        assert "Test User" in result
        assert "PERSONAL INFORMATION" in result
        assert "WORK EXPERIENCE" in result
        assert "EDUCATION" in result
        assert "CERTIFICATIONS" in result
        assert "Acme" in result
        assert "MIT" in result

    def test_export_ats_fields(self, mgr):
        """export_ats_fields returns flat dict with field name variations."""
        mgr.update_personal(
            full_name="Joseph Fowler",
            email="joe@test.com",
            phone="555-1234",
            city="Sheridan",
            state="IN",
            work_authorization="us_citizen",
        )
        fields = mgr.export_ats_fields()

        # Verify common variations exist
        assert fields["first_name"] == "Joseph"
        assert fields["firstName"] == "Joseph"
        assert fields["fname"] == "Joseph"
        assert fields["First Name"] == "Joseph"
        assert fields["last_name"] == "Fowler"
        assert fields["lastName"] == "Fowler"
        assert fields["Last Name"] == "Fowler"
        assert fields["surname"] == "Fowler"
        assert fields["full_name"] == "Joseph Fowler"
        assert fields["name"] == "Joseph Fowler"
        assert fields["email"] == "joe@test.com"
        assert fields["Email"] == "joe@test.com"
        assert fields["phone"] == "555-1234"
        assert fields["Phone Number"] == "555-1234"
        assert fields["city"] == "Sheridan"
        assert fields["state"] == "IN"
        assert fields["work_authorization"] == "US Citizen"
        assert fields["Work Authorization"] == "US Citizen"

    def test_ats_fields_empty_profile(self, mgr):
        """export_ats_fields works with an empty profile (no crash)."""
        fields = mgr.export_ats_fields()
        assert fields["first_name"] == ""
        assert fields["email"] == ""

    def test_export_json_strips_ids(self, mgr):
        """export_json removes internal database ids."""
        mgr.update_personal(full_name="Test")
        mgr.add_work_history("Acme", "Dev")
        mgr.add_education("MIT")
        mgr.add_certification("Cert A")
        mgr.add_reference("Ref A")
        mgr.update_eeo(gender="Male")
        data = json.loads(mgr.export_json())
        assert "id" not in data["personal"]
        assert "id" not in data["eeo"]
        for section in ("work_history", "education", "certifications", "references"):
            for item in data[section]:
                assert "id" not in item


# ─── ProfileManager — Import ────────────────────────────────────────


class TestProfileImport:
    def test_import_from_resume_mocked(self, mgr):
        """import_from_resume parses Claude response and populates tables."""
        mock_response_data = {
            "personal": {
                "full_name": "Jane Doe",
                "email": "jane@example.com",
                "phone": "555-9999",
                "city": "Boston",
                "state": "MA",
            },
            "work_history": [
                {
                    "company": "TechCo",
                    "title": "Software Engineer",
                    "location": "Boston, MA",
                    "start_date": "2018-06",
                    "end_date": None,
                    "description": "Built stuff",
                    "is_current": True,
                }
            ],
            "education": [
                {
                    "school": "MIT",
                    "degree": "BS",
                    "field_of_study": "Computer Science",
                    "graduation_date": "2018",
                    "gpa": "3.8",
                }
            ],
            "certifications": [
                {
                    "name": "AWS SAA",
                    "issuer": "Amazon",
                    "date_obtained": "2021-05",
                    "expiry_date": None,
                    "in_progress": False,
                }
            ],
        }

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps(mock_response_data))]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_message

        with patch("anthropic.Anthropic", return_value=mock_client):
            data = mgr.import_from_resume("Some resume text here")

        assert data["personal"]["full_name"] == "Jane Doe"

        # Verify data was written to DB
        personal = mgr.get_personal()
        assert personal["full_name"] == "Jane Doe"
        assert personal["city"] == "Boston"

        work = mgr.get_all_work_history()
        assert len(work) == 1
        assert work[0]["company"] == "TechCo"

        edu = mgr.get_all_education()
        assert len(edu) == 1
        assert edu[0]["school"] == "MIT"

        certs = mgr.get_all_certifications()
        assert len(certs) == 1
        assert certs[0]["name"] == "AWS SAA"


# ─── ProfileManager — Seed ──────────────────────────────────────────


class TestProfileSeed:
    def test_seed_joseph_data(self, mgr):
        """seed_joseph_data populates all sections."""
        mgr.seed_joseph_data()

        personal = mgr.get_personal()
        assert personal["full_name"] == "Joseph Fowler"
        assert personal["email"] == "jlfowler1084@gmail.com"
        assert personal["phone"] == "443-787-6528"
        assert personal["city"] == "Sheridan"
        assert personal["state"] == "IN"
        assert personal["work_authorization"] == "us_citizen"
        assert personal["remote_preference"] == "flexible"

        work = mgr.get_all_work_history()
        assert len(work) == 4
        # Should be ordered by start_date DESC
        assert work[0]["title"] == "Senior Systems Engineer"
        assert work[3]["title"] == "IT Support Specialist"

        edu = mgr.get_all_education()
        assert len(edu) == 1
        assert edu[0]["school"] == "Tesst College of Technology"
        assert edu[0]["field_of_study"] == "Network Information Systems"

        certs = mgr.get_all_certifications()
        assert len(certs) == 3
        cert_names = {c["name"] for c in certs}
        assert "Microsoft Azure Fundamentals (AZ-900)" in cert_names
        assert "ITIL V4 Foundation" in cert_names
        assert "CompTIA Security+" in cert_names

        # AZ-900 should be in progress
        az900 = next(c for c in certs if "AZ-900" in c["name"])
        assert az900["in_progress"] == 1


# ─── ProfileManager — get_profile ───────────────────────────────────


class TestGetProfile:
    def test_get_profile_complete(self, mgr):
        """get_profile returns all sections as nested dict."""
        mgr.update_personal(full_name="Test")
        mgr.add_work_history("Acme", "Dev")
        mgr.add_education("MIT")
        mgr.add_certification("Cert A")
        mgr.add_reference("Ref A")
        mgr.update_eeo(gender="Male")

        profile = mgr.get_profile()
        assert "personal" in profile
        assert "work_history" in profile
        assert "education" in profile
        assert "certifications" in profile
        assert "references" in profile
        assert "eeo" in profile
        assert profile["personal"]["full_name"] == "Test"
        assert len(profile["work_history"]) == 1
        assert len(profile["education"]) == 1
        assert len(profile["certifications"]) == 1
        assert len(profile["references"]) == 1

    def test_get_profile_empty(self, mgr):
        """get_profile works on empty database."""
        profile = mgr.get_profile()
        assert profile["personal"] == {}
        assert profile["work_history"] == []
        assert profile["education"] == []
        assert profile["certifications"] == []
        assert profile["references"] == []
        assert profile["eeo"] == {}


# ─── ProfileManager — SkillTracker Integration ──────────────────────


class TestSkillTrackerIntegration:
    def test_get_skills_from_tracker(self, tmp_path):
        """get_skills_from_tracker pulls skills from SkillTracker."""
        # Use a shared db_path so both profile and skills use same DB
        db_path = tmp_path / "shared.db"
        mgr = ProfileManager(db_path=db_path)

        with patch("src.skills.tracker.SkillTracker") as MockTracker:
            mock_instance = MagicMock()
            mock_instance.get_all_skills.return_value = [
                {"name": "Python", "category": "development",
                 "current_level": 3, "target_level": 5},
                {"name": "Docker", "category": "containers",
                 "current_level": 1, "target_level": 3},
            ]
            MockTracker.return_value = mock_instance

            skills = mgr.get_skills_from_tracker()
            assert len(skills) == 2
            assert skills[0]["name"] == "Python"
            mock_instance.seed_defaults.assert_called_once()
            mock_instance.close.assert_called_once()

        mgr.close()


# ─── CLI Commands (smoke tests) ─────────────────────────────────────


class TestProfileCLI:
    def _patch_db(self, monkeypatch, db_path):
        """Point settings.DB_PATH at the test database."""
        from pathlib import Path
        import config.settings
        monkeypatch.setattr(config.settings, "DB_PATH", Path(db_path))

    def test_profile_show_empty(self, tmp_path, monkeypatch):
        """profile show handles empty profile gracefully."""
        from click.testing import CliRunner
        from cli import cli

        self._patch_db(monkeypatch, tmp_path / "test.db")
        runner = CliRunner()
        result = runner.invoke(cli, ["profile", "show"])
        assert result.exit_code == 0

    def test_profile_export_json(self, tmp_path, monkeypatch):
        """profile export --format json outputs valid JSON."""
        from click.testing import CliRunner
        from cli import cli

        db_path = tmp_path / "test.db"
        mgr = ProfileManager(db_path=db_path)
        mgr.seed_joseph_data()
        mgr.close()

        self._patch_db(monkeypatch, db_path)
        runner = CliRunner()
        result = runner.invoke(cli, ["profile", "export", "--format", "json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["personal"]["full_name"] == "Joseph Fowler"

    def test_profile_export_text(self, tmp_path, monkeypatch):
        """profile export --format text outputs formatted text."""
        from click.testing import CliRunner
        from cli import cli

        db_path = tmp_path / "test.db"
        mgr = ProfileManager(db_path=db_path)
        mgr.seed_joseph_data()
        mgr.close()

        self._patch_db(monkeypatch, db_path)
        runner = CliRunner()
        result = runner.invoke(cli, ["profile", "export", "--format", "text"])
        assert result.exit_code == 0
        assert "Joseph Fowler" in result.output
        assert "PERSONAL INFORMATION" in result.output

    def test_profile_export_ats(self, tmp_path, monkeypatch):
        """profile export --format ats outputs ATS field mapping."""
        from click.testing import CliRunner
        from cli import cli

        db_path = tmp_path / "test.db"
        mgr = ProfileManager(db_path=db_path)
        mgr.seed_joseph_data()
        mgr.close()

        self._patch_db(monkeypatch, db_path)
        runner = CliRunner()
        result = runner.invoke(cli, ["profile", "export", "--format", "ats"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["first_name"] == "Joseph"
        assert data["lastName"] == "Fowler"

    def test_profile_seed_command(self, tmp_path, monkeypatch):
        """profile seed populates data."""
        from click.testing import CliRunner
        from cli import cli

        self._patch_db(monkeypatch, tmp_path / "test.db")
        runner = CliRunner()
        result = runner.invoke(cli, ["profile", "seed"])
        assert result.exit_code == 0
        assert "seeded" in result.output.lower()

    def test_profile_setup_wizard(self, tmp_path, monkeypatch):
        """profile setup wizard runs through prompts."""
        from click.testing import CliRunner
        from cli import cli

        self._patch_db(monkeypatch, tmp_path / "test.db")
        # Simulate pressing Enter to skip all prompts
        input_text = "\n".join([
            "Test User",   # full_name
            "test@t.com",  # email
            "555-0000",    # phone
            "",            # street
            "TestCity",    # city
            "TS",          # state
            "12345",       # zip
            "",            # linkedin
            "",            # github
            "",            # website
            "1",           # work auth (US Citizen)
            "4",           # remote pref (Flexible)
            "",            # salary min
            "",            # salary max
            "n",           # willing to relocate
            "",            # available start
            "n",           # add work history?
            "n",           # add education?
            "n",           # add certification?
            "n",           # add reference?
            "n",           # set EEO?
        ])
        runner = CliRunner()
        result = runner.invoke(cli, ["profile", "setup"], input=input_text)
        assert result.exit_code == 0
        assert "complete" in result.output.lower()
