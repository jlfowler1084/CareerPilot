"""
CareerPilot — ATS Form Filler

Reads the candidate profile data store (SCRUM-100) and generates
executable prompts for Claude Code + Chrome or Claude in Chrome
to auto-fill ATS application forms.

Two output modes:
  1. Claude Code prompt — a natural language instruction that Claude Code
     executes with --chrome flag, navigating and filling the form
  2. Clipboard cheatsheet — field-by-field values for manual paste
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime

from config.settings import DATA_DIR
from src.browser.ats_profiles import (
    ATS_CONFIGS,
    detect_ats_type,
    get_ats_config,
    PROFILE_FIELDS,
)

DEFAULT_PROFILE_PATH = str(DATA_DIR / "profile.json")


# ── Profile Data Reader ──────────────────────────────────────────────

def load_profile(profile_path: str = DEFAULT_PROFILE_PATH) -> dict:
    """Load the candidate profile from the SCRUM-100 data store."""
    path = Path(profile_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Profile not found at {profile_path}. "
            "Run 'python cli.py profile setup' first."
        )
    return json.loads(path.read_text())


def resolve_profile_value(profile: dict, dotted_key: str) -> str | list | None:
    """Resolve a dotted key like 'personal.email' from the profile dict."""
    keys = dotted_key.split(".")
    value = profile
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return None
        if value is None:
            return None
    return value


def get_profile_value_for_field(profile: dict, profile_key: str) -> str | None:
    """Get the display value for a profile key."""
    if not profile_key or profile_key not in PROFILE_FIELDS:
        return None

    dotted = PROFILE_FIELDS[profile_key]
    value = resolve_profile_value(profile, dotted)

    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return value  # work history, education — handled separately
    return str(value)


# ── Claude Code Prompt Generator ─────────────────────────────────────

def generate_claude_code_prompt(
    job_url: str,
    ats_type: str | None = None,
    profile_path: str = DEFAULT_PROFILE_PATH,
    resume_path: str | None = None,
    cover_letter_path: str | None = None,
) -> str:
    """
    Generate a Claude Code + Chrome prompt for filling an ATS form.

    Returns a natural language prompt that Claude Code can execute
    with the --chrome flag to navigate and fill the application.
    """
    profile = load_profile(profile_path)

    if ats_type is None:
        ats_type = detect_ats_type(job_url)

    if ats_type is None:
        return _generate_generic_prompt(job_url, profile, resume_path, cover_letter_path)

    config = get_ats_config(ats_type)
    if not config:
        return _generate_generic_prompt(job_url, profile, resume_path, cover_letter_path)

    return _generate_ats_specific_prompt(job_url, config, profile, resume_path, cover_letter_path)


def _generate_ats_specific_prompt(
    job_url: str,
    config: dict,
    profile: dict,
    resume_path: str | None,
    cover_letter_path: str | None,
) -> str:
    """Generate an ATS-specific Claude Code prompt."""
    ats_name = config["name"]

    # Build field value mapping
    field_instructions = []
    for page in config["pages"]:
        field_instructions.append(f"\n### Page: {page['name']}")
        for field in page["fields"]:
            label = field["label"]
            profile_key = field.get("profile_key")
            field_type = field["type"]
            default = field.get("default_value")
            required = field.get("required", False)
            req_tag = " (REQUIRED)" if required else ""

            if field_type == "file_upload":
                if "resume" in label.lower() and resume_path:
                    field_instructions.append(f"- **{label}**{req_tag}: Upload file `{resume_path}`")
                elif "cover" in label.lower() and cover_letter_path:
                    field_instructions.append(f"- **{label}**: Upload file `{cover_letter_path}`")
                else:
                    field_instructions.append(f"- **{label}**{req_tag}: [File upload — pause for user]")
                continue

            if field_type == "repeating_group":
                value = get_profile_value_for_field(profile, profile_key)
                if isinstance(value, list) and value:
                    field_instructions.append(f"- **{label}**{req_tag}: Enter {len(value)} entries (see data below)")
                else:
                    field_instructions.append(f"- **{label}**: [No data in profile — skip if optional]")
                continue

            value = get_profile_value_for_field(profile, profile_key) if profile_key else default
            if value:
                field_instructions.append(f"- **{label}**{req_tag}: `{value}`")
            elif default:
                field_instructions.append(f"- **{label}**{req_tag}: `{default}`")
            elif required:
                field_instructions.append(f"- **{label}**{req_tag}: [NEEDS INPUT — pause for user]")
            else:
                field_instructions.append(f"- **{label}**: [Optional — skip]")

    fields_block = "\n".join(field_instructions)

    # Build work history block
    work_history = resolve_profile_value(profile, "experience.positions") or []
    work_block = ""
    if work_history:
        entries = []
        for pos in work_history[:5]:  # limit to most recent 5
            entries.append(
                f"  - {pos.get('title', 'N/A')} at {pos.get('company', 'N/A')} "
                f"({pos.get('start_date', '?')} – {pos.get('end_date', 'Present')}), "
                f"{pos.get('location', 'N/A')}"
            )
        work_block = "\n**Work History Data:**\n" + "\n".join(entries)

    # Build education block
    education = resolve_profile_value(profile, "education") or []
    edu_block = ""
    if education:
        entries = []
        for edu in education:
            entries.append(
                f"  - {edu.get('degree', 'N/A')} in {edu.get('field', 'N/A')} "
                f"from {edu.get('school', 'N/A')} ({edu.get('graduation_date', 'N/A')})"
            )
        edu_block = "\n**Education Data:**\n" + "\n".join(entries)

    # Quirks
    quirks_block = "\n".join(f"- {q}" for q in config.get("quirks", []))

    prompt = f"""Fill out the {ats_name} job application at this URL:
{job_url}

## Instructions
1. Navigate to the URL and click "Apply" or "Apply Now" if needed
2. Fill each field with the values below — do NOT fabricate any information
3. For dropdowns, select the closest matching option
4. For file uploads, pause and ask me to handle them manually
5. After filling all fields on a page, PAUSE and let me review before clicking Next/Submit
6. NEVER click Submit/Send Application without my explicit confirmation

## {ats_name}-Specific Notes
{quirks_block}

## Field Values
{fields_block}
{work_block}
{edu_block}

## Safety Rules
- Do NOT click Submit, Send, or any final submission button
- PAUSE after each page is filled for my review
- If a field is unclear or has no matching profile data, SKIP it and flag it for me
- If the form asks for information not in the profile data, PAUSE and ask me
"""
    return prompt.strip()


def _generate_generic_prompt(
    job_url: str,
    profile: dict,
    resume_path: str | None,
    cover_letter_path: str | None,
) -> str:
    """Generate a generic form-fill prompt when ATS type is unknown."""
    personal = profile.get("personal", {})
    address = personal.get("address", {})
    desired = profile.get("desired", {})

    prompt = f"""Fill out the job application at this URL:
{job_url}

## Instructions
1. Navigate to the URL and find the application form
2. Fill fields using the candidate data below
3. For file uploads, pause and ask me to handle them manually
4. PAUSE after filling all visible fields — let me review before proceeding
5. NEVER click Submit without my explicit confirmation

## Candidate Data
- **First Name**: `{personal.get('first_name', '[MISSING]')}`
- **Last Name**: `{personal.get('last_name', '[MISSING]')}`
- **Email**: `{personal.get('email', '[MISSING]')}`
- **Phone**: `{personal.get('phone', '[MISSING]')}`
- **Street Address**: `{address.get('street', '[MISSING]')}`
- **City**: `{address.get('city', '[MISSING]')}`
- **State**: `{address.get('state', '[MISSING]')}`
- **Zip Code**: `{address.get('zip', '[MISSING]')}`
- **Country**: `{address.get('country', 'United States')}`
- **LinkedIn**: `{personal.get('linkedin_url', '[NONE]')}`
- **Work Authorization**: `{personal.get('work_authorization', 'US Citizen')}`
- **Willing to Relocate**: `{desired.get('willing_to_relocate', 'No')}`
- **Remote Preference**: `{desired.get('remote_preference', 'Remote or Hybrid')}`
- **Salary Range**: `{desired.get('salary_range', '[Decline to state]')}`

## Safety Rules
- Do NOT click Submit, Send, or any final submission button
- PAUSE after each page for my review
- If a field is unclear, SKIP it and flag it for me
"""
    if resume_path:
        prompt += f"\n**Resume file**: `{resume_path}`"
    if cover_letter_path:
        prompt += f"\n**Cover letter file**: `{cover_letter_path}`"

    return prompt.strip()


# ── Clipboard Cheatsheet Generator ───────────────────────────────────

def generate_clipboard_cheatsheet(
    ats_type: str | None = None,
    profile_path: str = DEFAULT_PROFILE_PATH,
) -> str:
    """
    Generate a field-by-field cheatsheet for manual copy-paste.
    Useful when Claude Code + Chrome isn't available.
    """
    profile = load_profile(profile_path)
    personal = profile.get("personal", {})
    address = personal.get("address", {})
    desired = profile.get("desired", {})

    lines = [
        "╔══════════════════════════════════════════╗",
        "║   CareerPilot — Quick Fill Cheatsheet    ║",
        "╚══════════════════════════════════════════╝",
        "",
        f"  Name:         {personal.get('first_name', '')} {personal.get('last_name', '')}",
        f"  Email:        {personal.get('email', '')}",
        f"  Phone:        {personal.get('phone', '')}",
        f"  Address:      {address.get('street', '')}",
        f"  City:         {address.get('city', '')}",
        f"  State:        {address.get('state', '')}",
        f"  Zip:          {address.get('zip', '')}",
        f"  Country:      {address.get('country', 'United States')}",
        f"  LinkedIn:     {personal.get('linkedin_url', '')}",
        f"  Work Auth:    {personal.get('work_authorization', 'US Citizen')}",
        f"  Relocate:     {desired.get('willing_to_relocate', 'No')}",
        f"  Remote Pref:  {desired.get('remote_preference', '')}",
        f"  Salary:       {desired.get('salary_range', '')}",
        f"  Start Date:   {desired.get('start_date', 'Immediately')}",
    ]

    if ats_type:
        config = get_ats_config(ats_type)
        if config:
            lines.append(f"\n  ATS Detected: {config['name']}")
            lines.append(f"  Pages: {len(config['pages'])}")
            lines.append(f"  Tips:")
            for quirk in config.get("quirks", [])[:3]:
                lines.append(f"    • {quirk}")

    return "\n".join(lines)
