"""Tests for IT staffing agency integration."""

import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.agencies.agency_config import (
    AGENCIES,
    BONUS_AGENCIES,
    build_agency_search_url,
    get_all_email_domains,
    get_agency_by_email_domain,
    AGENCY_SEARCH_KEYWORDS,
)
from src.agencies.recruiter_tracker import RecruiterTracker
from src.agencies.outreach_templates import OUTREACH_TEMPLATES, render_template


# ── Agency Config Tests ──────────────────────────────────────────────

def test_all_agencies_have_required_fields():
    for key, agency in AGENCIES.items():
        assert "name" in agency, f"{key} missing name"
        assert "job_board" in agency, f"{key} missing job_board"
        assert "email_domains" in agency, f"{key} missing email_domains"
        assert "search_url_template" in agency, f"{key} missing search_url_template"
        assert len(agency["email_domains"]) > 0, f"{key} has no email domains"

def test_six_target_agencies():
    expected = {"teksystems", "roberthalf", "kforce", "insightglobal", "randstad", "apexsystems"}
    assert expected == set(AGENCIES.keys())

def test_build_search_url_teksystems():
    url = build_agency_search_url("teksystems", "systems administrator")
    assert url is not None
    assert "teksystems" in url.lower()
    assert "systems" in url.lower()

def test_build_search_url_all_agencies():
    for key in AGENCIES:
        url = build_agency_search_url(key, "test")
        assert url is not None, f"Failed to build URL for {key}"

def test_build_search_url_unknown():
    assert build_agency_search_url("nonexistent", "test") is None

def test_get_all_email_domains():
    domains = get_all_email_domains()
    assert "teksystems.com" in domains
    assert "roberthalf.com" in domains
    assert "kforce.com" in domains
    assert len(domains) >= 8  # 6 agencies + bonus

def test_get_agency_by_email_domain():
    agency = get_agency_by_email_domain("teksystems.com")
    assert agency is not None
    assert agency["name"] == "TEKsystems"

def test_get_agency_by_email_domain_rht():
    agency = get_agency_by_email_domain("rht.com")
    assert agency is not None
    assert "Robert Half" in agency["name"]

def test_get_agency_by_email_domain_unknown():
    assert get_agency_by_email_domain("randomcompany.com") is None

def test_search_keywords_non_empty():
    assert len(AGENCY_SEARCH_KEYWORDS) >= 5

def test_all_agencies_have_indy_presence():
    for key, agency in AGENCIES.items():
        assert agency.get("indy_presence") is True, f"{key} missing indy_presence"


# ── Recruiter Tracker Tests ──────────────────────────────────────────

def _get_temp_tracker():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    return RecruiterTracker(db_path=path), path

def test_add_and_get_recruiter():
    tracker, path = _get_temp_tracker()
    try:
        rid = tracker.add_recruiter(
            name="David Perez",
            agency="TEKsystems",
            email="dperez@teksystems.com",
            phone="317-810-7562",
            title="Sr. IT Recruiter (Risk & Security)",
        )
        assert rid > 0
        r = tracker.get_recruiter(rid)
        assert r["name"] == "David Perez"
        assert r["agency"] == "TEKsystems"
        assert r["email"] == "dperez@teksystems.com"
    finally:
        tracker.close()
        os.unlink(path)

def test_find_recruiter_by_email():
    tracker, path = _get_temp_tracker()
    try:
        tracker.add_recruiter("Test Person", "TestCo", email="test@example.com")
        r = tracker.find_recruiter_by_email("test@example.com")
        assert r is not None
        assert r["name"] == "Test Person"
    finally:
        tracker.close()
        os.unlink(path)

def test_list_recruiters_by_agency():
    tracker, path = _get_temp_tracker()
    try:
        tracker.add_recruiter("Alice", "AgencyA")
        tracker.add_recruiter("Bob", "AgencyB")
        tracker.add_recruiter("Carol", "AgencyA")

        a_recruiters = tracker.list_recruiters(agency="AgencyA")
        assert len(a_recruiters) == 2
        all_recruiters = tracker.list_recruiters()
        assert len(all_recruiters) == 3
    finally:
        tracker.close()
        os.unlink(path)

def test_log_interaction():
    tracker, path = _get_temp_tracker()
    try:
        rid = tracker.add_recruiter("Test", "TestCo")
        iid = tracker.log_interaction(
            rid, "email", "inbound",
            subject="MISO Systems Admin",
            summary="Presented to MISO Energy for sys admin role",
            roles_discussed="MISO - Systems Admin",
        )
        assert iid > 0
        interactions = tracker.get_interactions(rid)
        assert len(interactions) == 1
        assert interactions[0]["subject"] == "MISO Systems Admin"
    finally:
        tracker.close()
        os.unlink(path)

def test_submitted_roles():
    tracker, path = _get_temp_tracker()
    try:
        rid = tracker.add_recruiter("Test Recruiter", "TestCo")
        role_id = tracker.add_submitted_role(
            rid, "MISO Energy", "Systems Administrator",
            pay_rate="$45/hr", location="Indianapolis, IN",
            role_type="contract",
        )
        assert role_id > 0

        roles = tracker.get_submitted_roles(recruiter_id=rid)
        assert len(roles) == 1
        assert roles[0]["company"] == "MISO Energy"
        assert roles[0]["status"] == "submitted"

        tracker.update_role_status(role_id, "interviewing", "Phone screen scheduled")
        roles = tracker.get_submitted_roles(status="interviewing")
        assert len(roles) == 1
        assert roles[0]["status"] == "interviewing"
    finally:
        tracker.close()
        os.unlink(path)

def test_summary():
    tracker, path = _get_temp_tracker()
    try:
        rid = tracker.add_recruiter("Test", "AgencyA")
        tracker.add_submitted_role(rid, "CompA", "Role1")
        tracker.add_submitted_role(rid, "CompB", "Role2")
        tracker.log_interaction(rid, "call", "outbound")

        summary = tracker.get_summary()
        assert summary["active_recruiters"] == 1
        assert summary["total_roles_submitted"] == 2
        assert summary["active_roles"] == 2
        assert summary["total_interactions"] == 1
        assert summary["agencies"] == 1
    finally:
        tracker.close()
        os.unlink(path)

def test_update_recruiter():
    tracker, path = _get_temp_tracker()
    try:
        rid = tracker.add_recruiter("Test", "Old Agency")
        tracker.update_recruiter(rid, agency="New Agency", notes="Updated")
        r = tracker.get_recruiter(rid)
        assert r["agency"] == "New Agency"
        assert r["notes"] == "Updated"
    finally:
        tracker.close()
        os.unlink(path)


# ── Outreach Template Tests ──────────────────────────────────────────

def test_all_templates_have_required_fields():
    for key, tmpl in OUTREACH_TEMPLATES.items():
        assert "name" in tmpl, f"{key} missing name"
        assert "subject" in tmpl, f"{key} missing subject"
        assert "body" in tmpl, f"{key} missing body"

def test_render_initial_contact():
    result = render_template(
        "initial_contact",
        recruiter_name="David Perez",
        agency_name="TEKsystems",
    )
    assert "David Perez" in result["body"]
    assert "TEKsystems" in result["body"]
    assert "subject" in result

def test_render_role_interest():
    result = render_template(
        "role_interest",
        recruiter_name="Jane Smith",
        role_title="Systems Engineer",
        company="Eli Lilly",
        match_points="- 20 years infrastructure experience\n- VMware + Azure",
        start_date="immediately",
    )
    assert "Systems Engineer" in result["subject"]
    assert "Eli Lilly" in result["body"]
    assert "20 years" in result["body"]

def test_render_unknown_template():
    try:
        render_template("nonexistent")
        assert False, "Should have raised ValueError"
    except ValueError:
        pass

def test_template_count():
    assert len(OUTREACH_TEMPLATES) >= 4


# ── Run All Tests ────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            print(f"  ✅ {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  ❌ {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ❌ {test.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
