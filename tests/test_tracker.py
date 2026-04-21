"""Tests for job application tracker with SQLite persistence."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from src.jobs.tracker import ApplicationTracker, VALID_STATUSES


@pytest.fixture
def tracker(tmp_path):
    """Create an ApplicationTracker with a temp database."""
    db_path = tmp_path / "test.db"
    t = ApplicationTracker(db_path=db_path)
    yield t
    t.close()


def _sample_job(**overrides):
    """Create a sample job dict with defaults."""
    job = {
        "title": "Systems Administrator",
        "company": "Acme Corp",
        "location": "Indianapolis, IN",
        "url": "https://example.com/job/1",
        "source": "indeed",
        "salary": "$80k-$100k",
        "profile_id": "sysadmin_local",
    }
    job.update(overrides)
    return job


class TestSaveJob:
    def test_saves_and_returns_id(self, tracker):
        """Saves a job and returns a positive row ID."""
        job_id = tracker.save_job(_sample_job())
        assert job_id > 0

    def test_default_status_is_found(self, tracker):
        """New jobs default to 'found' status."""
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)
        assert job["status"] == "found"

    def test_saves_all_fields(self, tracker):
        """All fields are persisted correctly."""
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)

        assert job["title"] == "Systems Administrator"
        assert job["company"] == "Acme Corp"
        assert job["location"] == "Indianapolis, IN"
        assert job["url"] == "https://example.com/job/1"
        assert job["source"] == "indeed"
        assert job["salary_range"] == "$80k-$100k"
        assert job["profile_id"] == "sysadmin_local"

    def test_date_found_set(self, tracker):
        """date_found is set on save."""
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)
        assert job["date_found"] is not None
        assert job["date_found"].startswith(datetime.now().strftime("%Y-%m-%d"))


class TestUpdateStatus:
    def test_updates_status(self, tracker):
        """Updates job status."""
        job_id = tracker.save_job(_sample_job())
        result = tracker.update_status(job_id, "applied")
        assert result is True

        job = tracker.get_job(job_id)
        assert job["status"] == "applied"

    def test_sets_date_applied(self, tracker):
        """Sets date_applied when status changes to 'applied'."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied")

        job = tracker.get_job(job_id)
        assert job["date_applied"] is not None

    def test_sets_date_response(self, tracker):
        """Sets date_response on response statuses."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied")
        tracker.update_status(job_id, "phone_screen")

        job = tracker.get_job(job_id)
        assert job["date_response"] is not None

    def test_appends_notes(self, tracker):
        """Appends notes on status update."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied", notes="Submitted via website")

        job = tracker.get_job(job_id)
        assert "Submitted via website" in job["notes"]

    def test_multiple_notes(self, tracker):
        """Multiple note updates are appended."""
        job_id = tracker.save_job(_sample_job())
        tracker.update_status(job_id, "applied", notes="First note")
        tracker.update_status(job_id, "phone_screen", notes="Second note")

        job = tracker.get_job(job_id)
        assert "First note" in job["notes"]
        assert "Second note" in job["notes"]

    def test_invalid_status_rejected(self, tracker):
        """Rejects invalid status strings."""
        job_id = tracker.save_job(_sample_job())
        result = tracker.update_status(job_id, "invalid_status")
        assert result is False

    def test_nonexistent_job_returns_false(self, tracker):
        """Returns False for nonexistent job ID."""
        result = tracker.update_status(999, "applied")
        assert result is False

    def test_all_valid_statuses_accepted(self, tracker):
        """All valid statuses can be set."""
        for status in VALID_STATUSES:
            job_id = tracker.save_job(_sample_job(title=f"Job for {status}"))
            result = tracker.update_status(job_id, status)
            assert result is True


class TestGetPipeline:
    def test_groups_by_status(self, tracker):
        """Groups jobs by their current status."""
        id1 = tracker.save_job(_sample_job(title="Job A"))
        id2 = tracker.save_job(_sample_job(title="Job B"))
        tracker.update_status(id1, "applied")

        pipeline = tracker.get_pipeline()
        assert len(pipeline["applied"]) == 1
        assert len(pipeline["found"]) == 1

    def test_empty_pipeline(self, tracker):
        """Returns empty lists for all statuses when no jobs."""
        pipeline = tracker.get_pipeline()
        for status in VALID_STATUSES:
            assert pipeline[status] == []

    def test_all_statuses_present(self, tracker):
        """Pipeline has keys for all valid statuses."""
        pipeline = tracker.get_pipeline()
        for status in VALID_STATUSES:
            assert status in pipeline


class TestGetStats:
    def test_total_count(self, tracker):
        """Counts total tracked jobs."""
        tracker.save_job(_sample_job(title="A"))
        tracker.save_job(_sample_job(title="B"))
        tracker.save_job(_sample_job(title="C"))

        stats = tracker.get_stats()
        assert stats["total"] == 3

    def test_status_breakdown(self, tracker):
        """Breaks down counts by status."""
        id1 = tracker.save_job(_sample_job(title="A"))
        id2 = tracker.save_job(_sample_job(title="B"))
        tracker.update_status(id1, "applied")
        tracker.update_status(id2, "applied")

        stats = tracker.get_stats()
        assert stats["by_status"]["applied"] == 2
        assert stats["by_status"]["found"] == 0

    def test_response_rate(self, tracker):
        """Calculates response rate correctly."""
        id1 = tracker.save_job(_sample_job(title="A"))
        id2 = tracker.save_job(_sample_job(title="B"))
        tracker.update_status(id1, "applied")
        tracker.update_status(id2, "applied")
        tracker.update_status(id1, "phone_screen")

        stats = tracker.get_stats()
        assert stats["applied_count"] == 2
        assert stats["responded_count"] == 1
        assert stats["response_rate"] == 50.0

    def test_response_rate_no_applications(self, tracker):
        """Response rate is 0 when no applications."""
        tracker.save_job(_sample_job())
        stats = tracker.get_stats()
        assert stats["response_rate"] == 0.0

    def test_empty_stats(self, tracker):
        """Stats for empty tracker."""
        stats = tracker.get_stats()
        assert stats["total"] == 0
        assert stats["response_rate"] == 0.0
        assert stats["avg_days_to_response"] == 0.0


class TestGetJob:
    def test_returns_job(self, tracker):
        """Returns a job by ID."""
        job_id = tracker.save_job(_sample_job())
        job = tracker.get_job(job_id)
        assert job is not None
        assert job["id"] == job_id

    def test_nonexistent_returns_none(self, tracker):
        """Returns None for nonexistent ID."""
        assert tracker.get_job(999) is None


# --- CAR-156: save_job with status + message_id + find_by_message_id ---


class TestSaveJobWithStatus:
    def test_default_status_still_found(self, tracker):
        """Omitting status keeps the legacy default of 'found'."""
        job_id = tracker.save_job(_sample_job())
        assert tracker.get_job(job_id)["status"] == "found"

    def test_custom_status_persists(self, tracker):
        """Explicit status is stored on the row."""
        job_id = tracker.save_job(_sample_job(), status="interested")
        assert tracker.get_job(job_id)["status"] == "interested"

    def test_invalid_status_raises(self, tracker):
        """Unknown status values raise ValueError before insert."""
        with pytest.raises(ValueError):
            tracker.save_job(_sample_job(), status="garbage")

    def test_message_id_persists(self, tracker):
        """message_id in job_data is stored on the applications row."""
        job = _sample_job()
        job["message_id"] = "gmail_msg_abc123"
        job_id = tracker.save_job(job)
        row = tracker.get_job(job_id)
        assert row["message_id"] == "gmail_msg_abc123"

    def test_message_id_defaults_to_empty(self, tracker):
        """When message_id is absent, the column stores an empty string."""
        job_id = tracker.save_job(_sample_job())
        assert tracker.get_job(job_id)["message_id"] == ""


class TestFindApplicationByMessageId:
    def test_finds_existing(self, tracker):
        """Returns the application row that matches the given message_id."""
        job = _sample_job()
        job["message_id"] = "gmail_msg_xyz"
        job_id = tracker.save_job(job)

        result = tracker.find_application_by_message_id("gmail_msg_xyz")
        assert result is not None
        assert result["id"] == job_id

    def test_returns_none_for_missing(self, tracker):
        """Returns None when no row has the given message_id."""
        tracker.save_job(_sample_job())  # No message_id
        assert tracker.find_application_by_message_id("nonexistent") is None

    def test_returns_none_for_empty(self, tracker):
        """Empty or None message_id short-circuits to None."""
        assert tracker.find_application_by_message_id("") is None
        assert tracker.find_application_by_message_id(None) is None


class TestFindByUrl:
    def test_returns_row_when_url_matches(self, tracker):
        """find_by_url returns the matching row as a dict."""
        app_id = tracker.save_job(_sample_job(url="https://acme.com/job/123"))
        result = tracker.find_by_url("https://acme.com/job/123")
        assert result is not None
        assert result["id"] == app_id
        assert result["url"] == "https://acme.com/job/123"

    def test_returns_none_when_empty_url(self, tracker):
        """Empty or whitespace-only URLs short-circuit to None."""
        tracker.save_job(_sample_job(url=""))
        assert tracker.find_by_url("") is None
        assert tracker.find_by_url("   ") is None
        assert tracker.find_by_url(None) is None

    def test_returns_none_when_no_match(self, tracker):
        """Non-matching URL returns None, doesn't match on other columns."""
        tracker.save_job(_sample_job(url="https://example.com/a"))
        assert tracker.find_by_url("https://example.com/b") is None

    def test_trims_whitespace_on_lookup(self, tracker):
        """Leading/trailing whitespace on the lookup value is trimmed before matching."""
        tracker.save_job(_sample_job(url="https://acme.com/job/1"))
        result = tracker.find_by_url("  https://acme.com/job/1  ")
        assert result is not None
