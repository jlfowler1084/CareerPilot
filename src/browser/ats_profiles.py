"""
CareerPilot — ATS Field Mapping Configurations

Maps profile data fields to ATS form fields for Workday, Greenhouse, Lever, and iCIMS.
Each ATS config defines:
  - pages: The multi-step form pages and their fields
  - field mappings: Which profile data field fills which form field
  - selectors: Common CSS selectors / label text for field identification
  - quirks: ATS-specific behaviors Claude needs to handle
"""

from __future__ import annotations


# ── Profile Field Keys ───────────────────────────────────────────────
# These map to the SCRUM-100 candidate profile data store fields.

PROFILE_FIELDS = {
    "full_name": "personal.full_name",
    "first_name": "personal.first_name",
    "last_name": "personal.last_name",
    "email": "personal.email",
    "phone": "personal.phone",
    "address_street": "personal.address.street",
    "address_city": "personal.address.city",
    "address_state": "personal.address.state",
    "address_zip": "personal.address.zip",
    "address_country": "personal.address.country",
    "linkedin_url": "personal.linkedin_url",
    "work_authorization": "personal.work_authorization",
    "willing_to_relocate": "desired.willing_to_relocate",
    "remote_preference": "desired.remote_preference",
    "salary_range": "desired.salary_range",
    "start_date": "desired.start_date",
    "work_history": "experience.positions",
    "education": "education",
    "certifications": "certifications",
    "skills": "skills",
    "resume_file": "documents.resume_path",
}


# ── ATS Configurations ───────────────────────────────────────────────

WORKDAY_CONFIG = {
    "name": "Workday",
    "detect_patterns": [
        "myworkdayjobs.com",
        "wd1.myworkdayjobs.com",
        "wd3.myworkdayjobs.com",
        "wd5.myworkdayjobs.com",
        "workday.com/en-US/job",
    ],
    "quirks": [
        "Multi-page wizard — each section is a separate page with 'Next' button",
        "Auto-save on field blur — wait for save indicator before moving on",
        "Resume upload often triggers auto-parse that pre-fills some fields",
        "Dropdown menus use custom Workday components, not native <select>",
        "Country/State fields are cascading — select country first, then state appears",
        "Work history is entered one position at a time with 'Add Another' button",
        "'How Did You Hear About Us' dropdown is always required",
        "Education section often requires exact degree type from dropdown",
    ],
    "pages": [
        {
            "name": "My Information",
            "order": 1,
            "fields": [
                {"label": "First Name", "profile_key": "first_name", "type": "text", "required": True},
                {"label": "Last Name", "profile_key": "last_name", "type": "text", "required": True},
                {"label": "Email Address", "profile_key": "email", "type": "text", "required": True},
                {"label": "Phone Number", "profile_key": "phone", "type": "text", "required": True},
                {"label": "Address", "profile_key": "address_street", "type": "text", "required": True},
                {"label": "City", "profile_key": "address_city", "type": "text", "required": True},
                {"label": "State", "profile_key": "address_state", "type": "dropdown", "required": True},
                {"label": "Postal Code", "profile_key": "address_zip", "type": "text", "required": True},
                {"label": "Country", "profile_key": "address_country", "type": "dropdown", "required": True},
                {"label": "LinkedIn Profile URL", "profile_key": "linkedin_url", "type": "text", "required": False},
            ],
        },
        {
            "name": "My Experience",
            "order": 2,
            "fields": [
                {"label": "Resume/CV", "profile_key": "resume_file", "type": "file_upload", "required": True},
                {"label": "Work Experience", "profile_key": "work_history", "type": "repeating_group", "required": False,
                 "subfields": [
                     {"label": "Job Title", "key": "title", "type": "text"},
                     {"label": "Company", "key": "company", "type": "text"},
                     {"label": "Location", "key": "location", "type": "text"},
                     {"label": "From", "key": "start_date", "type": "date"},
                     {"label": "To", "key": "end_date", "type": "date"},
                     {"label": "Description", "key": "description", "type": "textarea"},
                 ]},
                {"label": "Education", "profile_key": "education", "type": "repeating_group", "required": False,
                 "subfields": [
                     {"label": "School or University", "key": "school", "type": "text"},
                     {"label": "Degree", "key": "degree", "type": "dropdown"},
                     {"label": "Field of Study", "key": "field", "type": "text"},
                     {"label": "Graduation Date", "key": "graduation_date", "type": "date"},
                 ]},
            ],
        },
        {
            "name": "Application Questions",
            "order": 3,
            "fields": [
                {"label": "Are you legally authorized to work in the United States?", "profile_key": "work_authorization", "type": "dropdown", "required": True},
                {"label": "Will you now or in the future require sponsorship?", "profile_key": "work_authorization", "type": "dropdown", "required": True},
                {"label": "How Did You Hear About Us?", "profile_key": None, "type": "dropdown", "required": True, "default_value": "Job Board"},
            ],
        },
        {
            "name": "Voluntary Disclosures",
            "order": 4,
            "fields": [
                {"label": "Gender", "profile_key": None, "type": "dropdown", "required": False, "default_value": "Decline to Self-Identify"},
                {"label": "Race/Ethnicity", "profile_key": None, "type": "dropdown", "required": False, "default_value": "Decline to Self-Identify"},
                {"label": "Veteran Status", "profile_key": None, "type": "dropdown", "required": False, "default_value": "I am not a protected veteran"},
                {"label": "Disability Status", "profile_key": None, "type": "dropdown", "required": False, "default_value": "I do not want to answer"},
            ],
        },
    ],
}


GREENHOUSE_CONFIG = {
    "name": "Greenhouse",
    "detect_patterns": [
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
    ],
    "quirks": [
        "Usually a single-page form — all fields visible at once",
        "Resume upload is drag-and-drop or file picker",
        "Custom questions appear at the bottom of the form",
        "LinkedIn auto-fill button may appear — skip it, fill manually",
        "Cover letter field is usually a file upload, not text",
        "Some fields use react-select dropdowns (type to search)",
    ],
    "pages": [
        {
            "name": "Application Form",
            "order": 1,
            "fields": [
                {"label": "First Name", "profile_key": "first_name", "type": "text", "required": True},
                {"label": "Last Name", "profile_key": "last_name", "type": "text", "required": True},
                {"label": "Email", "profile_key": "email", "type": "text", "required": True},
                {"label": "Phone", "profile_key": "phone", "type": "text", "required": True},
                {"label": "Resume/CV", "profile_key": "resume_file", "type": "file_upload", "required": True},
                {"label": "Cover Letter", "profile_key": None, "type": "file_upload", "required": False},
                {"label": "LinkedIn Profile", "profile_key": "linkedin_url", "type": "text", "required": False},
                {"label": "Location (City)", "profile_key": "address_city", "type": "text", "required": False},
                {"label": "Are you authorized to work in the US?", "profile_key": "work_authorization", "type": "dropdown", "required": True},
                {"label": "Do you require visa sponsorship?", "profile_key": "work_authorization", "type": "dropdown", "required": True},
            ],
        },
    ],
}


LEVER_CONFIG = {
    "name": "Lever",
    "detect_patterns": [
        "jobs.lever.co",
        "lever.co/",
    ],
    "quirks": [
        "Single-page application form",
        "Resume parsed automatically after upload — may pre-fill fields",
        "Custom questions appended at bottom",
        "LinkedIn field accepts full URL",
        "Minimal required fields — usually just name, email, resume",
        "Some employers add extensive custom question sections",
    ],
    "pages": [
        {
            "name": "Application",
            "order": 1,
            "fields": [
                {"label": "Full name", "profile_key": "full_name", "type": "text", "required": True},
                {"label": "Email", "profile_key": "email", "type": "text", "required": True},
                {"label": "Phone", "profile_key": "phone", "type": "text", "required": True},
                {"label": "Current location", "profile_key": "address_city", "type": "text", "required": False},
                {"label": "Resume/CV", "profile_key": "resume_file", "type": "file_upload", "required": True},
                {"label": "LinkedIn URL", "profile_key": "linkedin_url", "type": "text", "required": False},
                {"label": "Current company", "profile_key": None, "type": "text", "required": False, "note": "Pull from most recent work_history entry"},
                {"label": "Additional information", "profile_key": None, "type": "textarea", "required": False},
            ],
        },
    ],
}


ICIMS_CONFIG = {
    "name": "iCIMS",
    "detect_patterns": [
        "icims.com",
        ".icims.com/jobs",
    ],
    "quirks": [
        "Multi-page wizard similar to Workday",
        "Account creation often required before applying",
        "Resume upload triggers auto-parse with editable results",
        "Very detailed address fields (separate line 1, line 2)",
        "Work history often requires month/year format",
        "May require 'Agree to Terms' checkbox before submission",
    ],
    "pages": [
        {
            "name": "Personal Information",
            "order": 1,
            "fields": [
                {"label": "First Name", "profile_key": "first_name", "type": "text", "required": True},
                {"label": "Last Name", "profile_key": "last_name", "type": "text", "required": True},
                {"label": "Email", "profile_key": "email", "type": "text", "required": True},
                {"label": "Phone", "profile_key": "phone", "type": "text", "required": True},
                {"label": "Address Line 1", "profile_key": "address_street", "type": "text", "required": True},
                {"label": "City", "profile_key": "address_city", "type": "text", "required": True},
                {"label": "State/Province", "profile_key": "address_state", "type": "dropdown", "required": True},
                {"label": "Zip/Postal Code", "profile_key": "address_zip", "type": "text", "required": True},
            ],
        },
        {
            "name": "Resume & Experience",
            "order": 2,
            "fields": [
                {"label": "Upload Resume", "profile_key": "resume_file", "type": "file_upload", "required": True},
                {"label": "Work History", "profile_key": "work_history", "type": "repeating_group", "required": False},
                {"label": "Education", "profile_key": "education", "type": "repeating_group", "required": False},
            ],
        },
        {
            "name": "Questions",
            "order": 3,
            "fields": [
                {"label": "Work Authorization", "profile_key": "work_authorization", "type": "dropdown", "required": True},
                {"label": "Salary Expectations", "profile_key": "salary_range", "type": "text", "required": False},
            ],
        },
    ],
}


# ── ATS Registry ─────────────────────────────────────────────────────

ATS_CONFIGS = {
    "workday": WORKDAY_CONFIG,
    "greenhouse": GREENHOUSE_CONFIG,
    "lever": LEVER_CONFIG,
    "icims": ICIMS_CONFIG,
}


def detect_ats_type(url: str) -> str | None:
    """Detect which ATS system a URL belongs to."""
    url_lower = url.lower()
    for ats_name, config in ATS_CONFIGS.items():
        for pattern in config["detect_patterns"]:
            if pattern in url_lower:
                return ats_name
    return None


def get_ats_config(ats_name: str) -> dict | None:
    """Get the config for a specific ATS."""
    return ATS_CONFIGS.get(ats_name.lower())


def get_field_count(ats_name: str) -> int:
    """Count total fields across all pages for an ATS."""
    config = get_ats_config(ats_name)
    if not config:
        return 0
    return sum(len(page["fields"]) for page in config["pages"])
