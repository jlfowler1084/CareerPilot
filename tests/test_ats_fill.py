"""Tests for ATS form auto-fill module."""

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.browser.ats_profiles import (
    detect_ats_type,
    get_ats_config,
    get_field_count,
    ATS_CONFIGS,
    PROFILE_FIELDS,
)
from src.browser.form_filler import (
    generate_claude_code_prompt,
    generate_clipboard_cheatsheet,
    resolve_profile_value,
    get_profile_value_for_field,
    load_profile,
)

# ── Test Profile Data ────────────────────────────────────────────────

MOCK_PROFILE = {
    "personal": {
        "full_name": "Joseph Fowler",
        "first_name": "Joseph",
        "last_name": "Fowler",
        "email": "jlfowler1084@gmail.com",
        "phone": "443-787-6528",
        "address": {
            "street": "123 Main St",
            "city": "Sheridan",
            "state": "IN",
            "zip": "46069",
            "country": "United States",
        },
        "linkedin_url": "https://linkedin.com/in/system-administration",
        "work_authorization": "US Citizen",
    },
    "desired": {
        "salary_range": "$90,000 - $130,000",
        "start_date": "Immediately",
        "willing_to_relocate": "No",
        "remote_preference": "Remote or Hybrid",
    },
    "experience": {
        "positions": [
            {
                "title": "Systems Engineer",
                "company": "Venable LLP",
                "location": "Baltimore, MD",
                "start_date": "2021-01",
                "end_date": "2025-10",
                "description": "Led server commissioning, Windows OS migration, Azure administration",
            },
            {
                "title": "Operations Analyst",
                "company": "Venable LLP",
                "location": "Baltimore, MD",
                "start_date": "2018-01",
                "end_date": "2021-01",
                "description": "Managed 700+ server VMware environment",
            },
        ],
    },
    "education": [
        {
            "school": "Tesst College of Technology",
            "degree": "Certificate",
            "field": "Network Information Systems",
            "graduation_date": "2004",
        },
    ],
    "certifications": [
        {"name": "Security+", "issuer": "CompTIA"},
        {"name": "ITIL V4 Foundations", "issuer": "ITIL"},
        {"name": "Azure Fundamentals (AZ-900)", "issuer": "Microsoft", "in_progress": True},
    ],
    "documents": {
        "resume_path": "data/resumes/Joseph_Fowler_Resume.docx",
    },
}


def _write_mock_profile() -> str:
    """Write mock profile to temp file and return path."""
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(MOCK_PROFILE, f)
    return path


# ── ATS Detection Tests ──────────────────────────────────────────────

def test_detect_workday():
    assert detect_ats_type("https://company.wd1.myworkdayjobs.com/careers/job/123") == "workday"

def test_detect_greenhouse():
    assert detect_ats_type("https://boards.greenhouse.io/company/jobs/456") == "greenhouse"

def test_detect_lever():
    assert detect_ats_type("https://jobs.lever.co/company/789") == "lever"

def test_detect_icims():
    assert detect_ats_type("https://careers-company.icims.com/jobs/1234") == "icims"

def test_detect_unknown():
    assert detect_ats_type("https://www.linkedin.com/jobs/view/12345") is None

def test_detect_case_insensitive():
    assert detect_ats_type("https://COMPANY.WD3.MYWORKDAYJOBS.COM/en-US/External") == "workday"


# ── Config Tests ─────────────────────────────────────────────────────

def test_all_configs_have_required_keys():
    for name, config in ATS_CONFIGS.items():
        assert "name" in config, f"{name} missing 'name'"
        assert "detect_patterns" in config, f"{name} missing 'detect_patterns'"
        assert "pages" in config, f"{name} missing 'pages'"
        assert "quirks" in config, f"{name} missing 'quirks'"
        assert len(config["pages"]) > 0, f"{name} has no pages"

def test_all_fields_have_label_and_type():
    for name, config in ATS_CONFIGS.items():
        for page in config["pages"]:
            for field in page["fields"]:
                assert "label" in field, f"{name}/{page['name']} field missing 'label'"
                assert "type" in field, f"{name}/{page['name']}/{field.get('label')} missing 'type'"

def test_field_counts():
    assert get_field_count("workday") > 15  # workday is the most complex
    assert get_field_count("lever") >= 5     # lever is minimal
    assert get_field_count("nonexistent") == 0

def test_workday_has_multi_page():
    config = get_ats_config("workday")
    assert len(config["pages"]) >= 3

def test_greenhouse_single_page():
    config = get_ats_config("greenhouse")
    assert len(config["pages"]) == 1


# ── Profile Resolution Tests ─────────────────────────────────────────

def test_resolve_simple_key():
    assert resolve_profile_value(MOCK_PROFILE, "personal.email") == "jlfowler1084@gmail.com"

def test_resolve_nested_key():
    assert resolve_profile_value(MOCK_PROFILE, "personal.address.city") == "Sheridan"

def test_resolve_missing_key():
    assert resolve_profile_value(MOCK_PROFILE, "personal.nonexistent") is None

def test_resolve_list():
    positions = resolve_profile_value(MOCK_PROFILE, "experience.positions")
    assert isinstance(positions, list)
    assert len(positions) == 2

def test_get_profile_value():
    assert get_profile_value_for_field(MOCK_PROFILE, "email") == "jlfowler1084@gmail.com"
    assert get_profile_value_for_field(MOCK_PROFILE, "address_state") == "IN"
    assert get_profile_value_for_field(MOCK_PROFILE, None) is None


# ── Prompt Generation Tests ──────────────────────────────────────────

def test_workday_prompt_contains_key_info():
    path = _write_mock_profile()
    try:
        prompt = generate_claude_code_prompt(
            "https://company.wd1.myworkdayjobs.com/careers/job/123",
            profile_path=path,
        )
        assert "Workday" in prompt
        assert "Joseph" in prompt
        assert "jlfowler1084@gmail.com" in prompt
        assert "443-787-6528" in prompt
        assert "NEVER click Submit" in prompt
        assert "PAUSE" in prompt
    finally:
        os.unlink(path)

def test_greenhouse_prompt():
    path = _write_mock_profile()
    try:
        prompt = generate_claude_code_prompt(
            "https://boards.greenhouse.io/company/jobs/456",
            profile_path=path,
        )
        assert "Greenhouse" in prompt
        assert "Fowler" in prompt
    finally:
        os.unlink(path)

def test_generic_prompt_for_unknown_ats():
    path = _write_mock_profile()
    try:
        prompt = generate_claude_code_prompt(
            "https://www.randomcompany.com/careers/apply/123",
            profile_path=path,
        )
        assert "Joseph" in prompt
        assert "NEVER click Submit" in prompt
        # Should not contain ATS-specific name
        assert "Workday" not in prompt
        assert "Greenhouse" not in prompt
    finally:
        os.unlink(path)

def test_prompt_includes_work_history():
    path = _write_mock_profile()
    try:
        prompt = generate_claude_code_prompt(
            "https://company.wd1.myworkdayjobs.com/careers/job/123",
            profile_path=path,
        )
        assert "Systems Engineer" in prompt
        assert "Venable LLP" in prompt
    finally:
        os.unlink(path)

def test_prompt_includes_resume_path():
    path = _write_mock_profile()
    try:
        prompt = generate_claude_code_prompt(
            "https://company.wd1.myworkdayjobs.com/careers/job/123",
            profile_path=path,
            resume_path="data/resumes/tailored_resume.docx",
        )
        assert "tailored_resume.docx" in prompt
    finally:
        os.unlink(path)

def test_prompt_safety_rules():
    path = _write_mock_profile()
    try:
        prompt = generate_claude_code_prompt(
            "https://boards.greenhouse.io/company/jobs/456",
            profile_path=path,
        )
        assert "NEVER click Submit" in prompt
        assert "PAUSE" in prompt
        assert "Do NOT" in prompt or "do NOT" in prompt.lower()
    finally:
        os.unlink(path)


# ── Cheatsheet Tests ─────────────────────────────────────────────────

def test_cheatsheet_contains_profile_data():
    path = _write_mock_profile()
    try:
        sheet = generate_clipboard_cheatsheet(profile_path=path)
        assert "Joseph Fowler" in sheet
        assert "jlfowler1084@gmail.com" in sheet
        assert "443-787-6528" in sheet
        assert "Sheridan" in sheet
    finally:
        os.unlink(path)

def test_cheatsheet_with_ats_type():
    path = _write_mock_profile()
    try:
        sheet = generate_clipboard_cheatsheet(ats_type="workday", profile_path=path)
        assert "Workday" in sheet
    finally:
        os.unlink(path)

def test_profile_not_found():
    try:
        load_profile("/nonexistent/profile.json")
        assert False, "Should have raised FileNotFoundError"
    except FileNotFoundError:
        pass


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
