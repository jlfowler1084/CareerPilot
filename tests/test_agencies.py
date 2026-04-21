"""Tests for IT staffing agency integration."""

import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.agencies.agency_config import (
    AGENCIES,
    BONUS_AGENCIES,
    build_agency_search_url,
    get_all_email_domains,
    get_agency_by_email_domain,
    AGENCY_SEARCH_KEYWORDS,
)
from src.db import models
from src.agencies.outreach_templates import OUTREACH_TEMPLATES, render_template


@pytest.fixture
def conn(tmp_path):
    """Create a test database connection with schema."""
    db_path = tmp_path / "test.db"
    c = models.get_connection(db_path)
    yield c
    c.close()


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


# ── Contacts Integration Tests (interaction/role helpers via SQLite) ──


def _seed_contact(conn, name="Test Contact", company="TestCo"):
    cursor = conn.execute(
        "INSERT INTO contacts (name, contact_type, company) VALUES (?, 'recruiter', ?)",
        (name, company),
    )
    conn.commit()
    return cursor.lastrowid


def test_log_interaction(conn):
    cid = _seed_contact(conn, "Test", "TestCo")
    iid = models.add_contact_interaction(
        conn, str(cid), "email", "inbound",
        subject="MISO Systems Admin",
        summary="Presented to MISO Energy for sys admin role",
        roles_discussed="MISO - Systems Admin",
    )
    assert iid > 0
    interactions = models.get_contact_interactions(conn, str(cid))
    assert len(interactions) == 1
    assert interactions[0]["subject"] == "MISO Systems Admin"


def test_submitted_roles(conn):
    cid = _seed_contact(conn, "Test Recruiter", "TestCo")
    role_id = models.add_submitted_role(
        conn, str(cid), "MISO Energy", "Systems Administrator",
        pay_rate="$45/hr", location="Indianapolis, IN",
        role_type="contract",
    )
    assert role_id > 0

    roles = models.get_submitted_roles(conn, contact_uuid=str(cid))
    assert len(roles) == 1
    assert roles[0]["company"] == "MISO Energy"
    assert roles[0]["status"] == "submitted"

    models.update_role_status(conn, role_id, "interviewing", "Phone screen scheduled")
    roles = models.get_submitted_roles(conn, status="interviewing")
    assert len(roles) == 1
    assert roles[0]["status"] == "interviewing"


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
