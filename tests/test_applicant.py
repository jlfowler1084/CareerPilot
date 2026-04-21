"""Tests for Dice Easy Apply automation (JobApplicant)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.jobs.applicant import JobApplicant, _try_copy_to_clipboard


def _sample_job(**overrides):
    """Create a sample job dict with defaults."""
    job = {
        "title": "DevOps Engineer",
        "company": "Acme Corp",
        "location": "Indianapolis, IN",
        "url": "https://dice.com/job/123",
        "source": "dice",
        "salary": "$90k-$110k",
        "easy_apply": True,
    }
    job.update(overrides)
    return job


@pytest.fixture
def applicant(tmp_path, fake_supabase):
    """Create a JobApplicant with a fake Supabase tracker + temp profile DB."""
    profile_db = tmp_path / "test_profile.db"
    a = JobApplicant(profile_db_path=profile_db)
    # Seed some profile data for clipboard tests
    a._profile_mgr.update_personal(
        full_name="Joe Fowler",
        email="joe@test.com",
        phone="555-1234",
        city="Indianapolis",
        state="IN",
        linkedin_url="https://linkedin.com/in/joe",
    )
    yield a
    a.close()


# --- Batch selection parsing ---


class TestBatchSelect:
    def test_select_all(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(5)]
        selected = applicant.batch_select(jobs, "all")
        assert len(selected) == 5

    def test_select_single(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(5)]
        selected = applicant.batch_select(jobs, "2")
        assert len(selected) == 1
        assert selected[0]["title"] == "Job 1"  # 0-indexed internally, 1-indexed input

    def test_select_comma_separated(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(5)]
        selected = applicant.batch_select(jobs, "1,3,5")
        assert len(selected) == 3
        assert selected[0]["title"] == "Job 0"
        assert selected[1]["title"] == "Job 2"
        assert selected[2]["title"] == "Job 4"

    def test_select_range(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(5)]
        selected = applicant.batch_select(jobs, "2-4")
        assert len(selected) == 3
        assert selected[0]["title"] == "Job 1"
        assert selected[2]["title"] == "Job 3"

    def test_select_mixed(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(5)]
        selected = applicant.batch_select(jobs, "1, 3-5")
        assert len(selected) == 4

    def test_select_out_of_range(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(3)]
        selected = applicant.batch_select(jobs, "1,5,10")
        assert len(selected) == 1  # Only job 1 is valid

    def test_select_invalid_input(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(3)]
        selected = applicant.batch_select(jobs, "abc")
        assert len(selected) == 0

    def test_select_empty_string(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(3)]
        selected = applicant.batch_select(jobs, "")
        assert len(selected) == 0

    def test_select_duplicates_deduplicated(self, applicant):
        jobs = [_sample_job(title=f"Job {i}") for i in range(3)]
        selected = applicant.batch_select(jobs, "1,1,1")
        assert len(selected) == 1


# --- Profile clipboard formatting ---


class TestClipboard:
    @patch("src.jobs.applicant.pyperclip", create=True)
    def test_copy_profile_for_ats(self, mock_pyperclip, applicant):
        text = applicant.copy_profile_for_ats()
        assert "Joe Fowler" in text
        assert "joe@test.com" in text
        assert "555-1234" in text

    def test_copy_field_name(self, applicant):
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            val = applicant.copy_field("name")
            assert val == "Joe Fowler"

    def test_copy_field_email(self, applicant):
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            val = applicant.copy_field("email")
            assert val == "joe@test.com"

    def test_copy_field_phone(self, applicant):
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            val = applicant.copy_field("phone")
            assert val == "555-1234"

    def test_copy_field_address(self, applicant):
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            val = applicant.copy_field("address")
            assert "Indianapolis" in val
            assert "IN" in val

    def test_copy_field_linkedin(self, applicant):
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            val = applicant.copy_field("linkedin")
            assert val == "https://linkedin.com/in/joe"

    def test_copy_field_invalid(self, applicant):
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            val = applicant.copy_field("nonexistent")
            assert val is None

    def test_try_copy_no_pyperclip(self):
        """Clipboard copy returns False when pyperclip is unavailable."""
        with patch.dict("sys.modules", {"pyperclip": None}):
            result = _try_copy_to_clipboard("test")
            assert result is False


# --- Tracker status updates on apply ---


class TestApplyTracking:
    @patch("webbrowser.open")
    def test_apply_dice_easy_saves_to_tracker(self, mock_open, applicant):
        job = _sample_job()
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            result = applicant.apply_dice_easy(job)
        assert result["tracker_id"] is not None
        # Post-CAR-165: tracker_id is a Supabase UUID string, not an int
        assert isinstance(result["tracker_id"], str)
        assert len(result["tracker_id"]) > 0

    @patch("webbrowser.open")
    def test_apply_dice_easy_opens_browser(self, mock_open, applicant):
        job = _sample_job()
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            result = applicant.apply_dice_easy(job)
        mock_open.assert_called_once_with("https://dice.com/job/123")
        assert result["opened"] is True

    @patch("webbrowser.open")
    def test_apply_no_url(self, mock_open, applicant):
        job = _sample_job(url="")
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            result = applicant.apply_dice_easy(job)
        mock_open.assert_not_called()
        assert result["opened"] is False

    @patch("webbrowser.open")
    def test_apply_with_resume(self, mock_open, applicant):
        job = _sample_job(easy_apply=False)
        result = applicant.apply_with_resume(job, resume_path="/path/to/resume.pdf")
        mock_open.assert_called_once()
        assert result["resume_path"] == "/path/to/resume.pdf"
        assert result["tracker_id"] is not None

    def test_mark_applied(self, applicant):
        job = _sample_job()
        job_id = applicant._tracker.save_job(job)
        success = applicant.mark_applied(job_id, method="easy_apply")
        assert success is True

        updated = applicant._tracker.get_job(job_id)
        assert updated["status"] == "applied"
        assert "Applied via easy_apply" in updated["notes"]
        assert updated["date_applied"] is not None

    @patch("webbrowser.open")
    def test_apply_reuses_existing_tracker_id(self, mock_open, applicant):
        """If job_data has an 'id', it should reuse it instead of saving again."""
        job = _sample_job()
        existing_id = applicant._tracker.save_job(job)
        job["id"] = existing_id
        with patch("src.jobs.applicant._try_copy_to_clipboard", return_value=True):
            result = applicant.apply_dice_easy(job)
        assert result["tracker_id"] == existing_id


# --- Actionable jobs and applied-today ---


class TestQueryMethods:
    def test_get_actionable_jobs(self, applicant):
        j1 = applicant._tracker.save_job(_sample_job(title="Found Job"))
        j2 = applicant._tracker.save_job(_sample_job(title="Interested Job"))
        applicant._tracker.update_status(j2, "interested")
        j3 = applicant._tracker.save_job(_sample_job(title="Applied Job"))
        applicant._tracker.update_status(j3, "applied")

        actionable = applicant.get_actionable_jobs()
        titles = [j["title"] for j in actionable]
        assert "Found Job" in titles
        assert "Interested Job" in titles
        assert "Applied Job" not in titles

    def test_get_applied_today(self, applicant):
        j1 = applicant._tracker.save_job(_sample_job(title="Today's Job"))
        applicant._tracker.update_status(j1, "applied")

        today_jobs = applicant.get_applied_today()
        assert len(today_jobs) == 1
        assert today_jobs[0]["title"] == "Today's Job"

    def test_get_applied_today_empty(self, applicant):
        applicant._tracker.save_job(_sample_job(title="Not Applied"))
        today_jobs = applicant.get_applied_today()
        assert len(today_jobs) == 0
