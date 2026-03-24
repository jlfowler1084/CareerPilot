"""ProfileManager — high-level operations for candidate profile data."""

from __future__ import annotations

import json
import logging

from src.profile import models

logger = logging.getLogger(__name__)

# Joseph Fowler's resume data for seeding
JOSEPH_RESUME_TEXT = """
Joseph Fowler
jlfowler1084@gmail.com | 443-787-6528 | Sheridan, IN
LinkedIn: linkedin.com/in/yourprofile | GitHub: github.com/jlfowler1084

PROFESSIONAL EXPERIENCE

Senior Systems Engineer, Venable LLP — Washington, DC / Remote
January 2020 - March 2025
- Led enterprise infrastructure operations supporting 900+ users across 9 offices
- Managed VMware vSphere environment (20+ ESXi hosts, 200+ VMs)
- Administered Microsoft 365, Azure AD, and hybrid identity infrastructure
- Automated routine tasks with PowerShell, reducing manual effort by 40%
- Maintained Splunk and SolarWinds monitoring platforms
- Coordinated disaster recovery testing and documentation

Systems Engineer II, Venable LLP — Washington, DC
June 2015 - December 2019
- Managed Windows Server infrastructure (2012R2/2016/2019) across data centers
- Administered Active Directory, Group Policy, DNS, DHCP for 900+ users
- Supported Citrix XenApp/XenDesktop virtual desktop environment
- Implemented SCCM for OS deployment and patch management
- Maintained network infrastructure including Cisco switches and firewalls

Systems Engineer I, Venable LLP — Washington, DC
March 2010 - May 2015
- Provided Tier 2/3 support for server and network infrastructure
- Managed backup and recovery operations using Veeam
- Supported Exchange 2010/2013 messaging environment
- Assisted with VMware vSphere administration and migrations

IT Support Specialist, Venable LLP — Washington, DC
August 2005 - February 2010
- Provided desktop and application support for attorneys and staff
- Managed hardware lifecycle including imaging, deployment, and retirement
- Supported document management and legal-specific applications
- Created technical documentation and knowledge base articles

EDUCATION

Network Information Systems Certificate
Tesst College of Technology, 2005

CERTIFICATIONS

- Microsoft Azure Fundamentals (AZ-900) — In Progress
- ITIL V4 Foundation
- CompTIA Security+

SKILLS

PowerShell, Windows Server, Active Directory, VMware vSphere, Azure, Microsoft 365,
Splunk, SolarWinds, Python, Docker, Kubernetes, Terraform, Git/GitHub, Networking,
DNS, DHCP, SCCM, Citrix, Veeam, CI/CD
"""


class ProfileManager:
    """High-level operations for candidate profile data."""

    def __init__(self, db_path=None):
        self._conn = models.get_profile_connection(db_path)

    def close(self):
        """Close the database connection."""
        self._conn.close()

    # --- Read ---

    def get_profile(self) -> dict:
        """Returns complete profile as nested dict."""
        return {
            "personal": models.get_personal(self._conn) or {},
            "work_history": models.get_all_work_history(self._conn),
            "education": models.get_all_education(self._conn),
            "certifications": models.get_all_certifications(self._conn),
            "references": models.get_all_references(self._conn),
            "eeo": models.get_eeo(self._conn) or {},
        }

    # --- Personal ---

    def update_personal(self, **kwargs) -> None:
        """Update any personal fields."""
        models.upsert_personal(self._conn, **kwargs)

    def get_personal(self) -> dict | None:
        return models.get_personal(self._conn)

    # --- Work History ---

    def add_work_history(self, company: str, title: str, **kwargs) -> int:
        return models.add_work_history(self._conn, company, title, **kwargs)

    def update_work_history(self, row_id: int, **kwargs) -> bool:
        return models.update_work_history(self._conn, row_id, **kwargs)

    def remove_work_history(self, row_id: int) -> bool:
        return models.delete_work_history(self._conn, row_id)

    def get_all_work_history(self) -> list[dict]:
        return models.get_all_work_history(self._conn)

    # --- Education ---

    def add_education(self, school: str, **kwargs) -> int:
        return models.add_education(self._conn, school, **kwargs)

    def update_education(self, row_id: int, **kwargs) -> bool:
        return models.update_education(self._conn, row_id, **kwargs)

    def remove_education(self, row_id: int) -> bool:
        return models.delete_education(self._conn, row_id)

    def get_all_education(self) -> list[dict]:
        return models.get_all_education(self._conn)

    # --- Certifications ---

    def add_certification(self, name: str, **kwargs) -> int:
        return models.add_certification(self._conn, name, **kwargs)

    def update_certification(self, row_id: int, **kwargs) -> bool:
        return models.update_certification(self._conn, row_id, **kwargs)

    def remove_certification(self, row_id: int) -> bool:
        return models.delete_certification(self._conn, row_id)

    def get_all_certifications(self) -> list[dict]:
        return models.get_all_certifications(self._conn)

    # --- References ---

    def add_reference(self, name: str, **kwargs) -> int:
        return models.add_reference(self._conn, name, **kwargs)

    def update_reference(self, row_id: int, **kwargs) -> bool:
        return models.update_reference(self._conn, row_id, **kwargs)

    def remove_reference(self, row_id: int) -> bool:
        return models.delete_reference(self._conn, row_id)

    def get_all_references(self) -> list[dict]:
        return models.get_all_references(self._conn)

    # --- EEO ---

    def update_eeo(self, **kwargs) -> None:
        models.upsert_eeo(self._conn, **kwargs)

    def get_eeo(self) -> dict | None:
        return models.get_eeo(self._conn)

    # --- Import / Export ---

    def import_from_resume(self, resume_text: str | None = None) -> dict:
        """Send resume text to Claude API to extract structured profile data.

        If resume_text is None, uses the built-in Joseph Fowler resume.
        Returns the parsed profile dict.
        """
        import anthropic

        if resume_text is None:
            resume_text = JOSEPH_RESUME_TEXT

        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=(
                "You are a resume parser. Extract structured profile data from the "
                "resume text and return ONLY valid JSON with no markdown formatting. "
                "Use this exact schema:\n"
                "{\n"
                '  "personal": {"full_name": "", "email": "", "phone": "", '
                '"street": "", "city": "", "state": "", "zip": "", '
                '"linkedin_url": "", "github_url": "", "website": ""},\n'
                '  "work_history": [{"company": "", "title": "", "location": "", '
                '"start_date": "", "end_date": null, "description": "", "is_current": false}],\n'
                '  "education": [{"school": "", "degree": "", "field_of_study": "", '
                '"graduation_date": "", "gpa": null}],\n'
                '  "certifications": [{"name": "", "issuer": "", "date_obtained": "", '
                '"expiry_date": null, "in_progress": false}]\n'
                "}\n"
                "For dates, use YYYY-MM format. For end_date, use null if current position. "
                "Set is_current=true for the most recent position if end_date is recent or blank."
            ),
            messages=[{"role": "user", "content": resume_text}],
        )

        raw = response.content[0].text
        data = json.loads(raw)
        self._apply_import_data(data)
        return data

    def seed_joseph_data(self) -> None:
        """Directly seed Joseph Fowler's profile data without calling Claude API."""
        models.upsert_personal(
            self._conn,
            full_name="Joseph Fowler",
            email="jlfowler1084@gmail.com",
            phone="443-787-6528",
            street="",
            city="Sheridan",
            state="IN",
            zip="",
            linkedin_url="",
            github_url="https://github.com/jlfowler1084",
            website="",
            work_authorization="us_citizen",
            willing_to_relocate=False,
            remote_preference="flexible",
            available_start_date="immediately",
        )

        work_entries = [
            {
                "company": "Venable LLP",
                "title": "Senior Systems Engineer",
                "location": "Washington, DC / Remote",
                "start_date": "2020-01",
                "end_date": "2025-03",
                "description": (
                    "Led enterprise infrastructure operations supporting 900+ users "
                    "across 9 offices. Managed VMware vSphere environment (20+ ESXi "
                    "hosts, 200+ VMs). Administered Microsoft 365, Azure AD, and "
                    "hybrid identity infrastructure. Automated routine tasks with "
                    "PowerShell, reducing manual effort by 40%. Maintained Splunk and "
                    "SolarWinds monitoring platforms."
                ),
                "is_current": False,
            },
            {
                "company": "Venable LLP",
                "title": "Systems Engineer II",
                "location": "Washington, DC",
                "start_date": "2015-06",
                "end_date": "2019-12",
                "description": (
                    "Managed Windows Server infrastructure (2012R2/2016/2019) across "
                    "data centers. Administered Active Directory, Group Policy, DNS, "
                    "DHCP for 900+ users. Supported Citrix XenApp/XenDesktop virtual "
                    "desktop environment. Implemented SCCM for OS deployment and "
                    "patch management."
                ),
                "is_current": False,
            },
            {
                "company": "Venable LLP",
                "title": "Systems Engineer I",
                "location": "Washington, DC",
                "start_date": "2010-03",
                "end_date": "2015-05",
                "description": (
                    "Provided Tier 2/3 support for server and network infrastructure. "
                    "Managed backup and recovery operations using Veeam. Supported "
                    "Exchange 2010/2013 messaging environment. Assisted with VMware "
                    "vSphere administration and migrations."
                ),
                "is_current": False,
            },
            {
                "company": "Venable LLP",
                "title": "IT Support Specialist",
                "location": "Washington, DC",
                "start_date": "2005-08",
                "end_date": "2010-02",
                "description": (
                    "Provided desktop and application support for attorneys and staff. "
                    "Managed hardware lifecycle including imaging, deployment, and "
                    "retirement. Supported document management and legal-specific "
                    "applications."
                ),
                "is_current": False,
            },
        ]
        for entry in work_entries:
            models.add_work_history(self._conn, **entry)

        models.add_education(
            self._conn,
            school="Tesst College of Technology",
            degree="Certificate",
            field_of_study="Network Information Systems",
            graduation_date="2005",
        )

        certs = [
            {"name": "Microsoft Azure Fundamentals (AZ-900)", "issuer": "Microsoft",
             "date_obtained": "", "in_progress": True},
            {"name": "ITIL V4 Foundation", "issuer": "Axelos",
             "date_obtained": "", "in_progress": False},
            {"name": "CompTIA Security+", "issuer": "CompTIA",
             "date_obtained": "", "in_progress": False},
        ]
        for cert in certs:
            models.add_certification(self._conn, **cert)

    def _apply_import_data(self, data: dict) -> None:
        """Apply parsed import data to all profile tables."""
        if "personal" in data:
            personal = {k: v for k, v in data["personal"].items()
                        if k in {
                            "full_name", "email", "phone", "street", "city",
                            "state", "zip", "linkedin_url", "github_url", "website",
                        } and v}
            if personal:
                models.upsert_personal(self._conn, **personal)

        if "work_history" in data:
            for entry in data["work_history"]:
                models.add_work_history(
                    self._conn,
                    company=entry.get("company", ""),
                    title=entry.get("title", ""),
                    location=entry.get("location", ""),
                    start_date=entry.get("start_date", ""),
                    end_date=entry.get("end_date"),
                    description=entry.get("description", ""),
                    is_current=entry.get("is_current", False),
                )

        if "education" in data:
            for entry in data["education"]:
                models.add_education(
                    self._conn,
                    school=entry.get("school", ""),
                    degree=entry.get("degree", ""),
                    field_of_study=entry.get("field_of_study", ""),
                    graduation_date=entry.get("graduation_date", ""),
                    gpa=entry.get("gpa"),
                )

        if "certifications" in data:
            for entry in data["certifications"]:
                models.add_certification(
                    self._conn,
                    name=entry.get("name", ""),
                    issuer=entry.get("issuer", ""),
                    date_obtained=entry.get("date_obtained", ""),
                    expiry_date=entry.get("expiry_date"),
                    in_progress=entry.get("in_progress", False),
                )

    def export_json(self) -> str:
        """Full profile as JSON string."""
        profile = self.get_profile()
        # Remove internal ids for clean export
        if "id" in profile.get("personal", {}):
            del profile["personal"]["id"]
        if "id" in profile.get("eeo", {}):
            del profile["eeo"]["id"]
        for section in ("work_history", "education", "certifications", "references"):
            for item in profile.get(section, []):
                item.pop("id", None)
        return json.dumps(profile, indent=2)

    def export_text(self) -> str:
        """Formatted plain text blob for pasting into forms."""
        p = self.get_profile()
        personal = p.get("personal", {})
        lines = []

        # Personal
        lines.append("=== PERSONAL INFORMATION ===")
        lines.append(f"Name: {personal.get('full_name', '')}")
        lines.append(f"Email: {personal.get('email', '')}")
        lines.append(f"Phone: {personal.get('phone', '')}")
        addr_parts = [personal.get("street", ""), personal.get("city", ""),
                      personal.get("state", ""), personal.get("zip", "")]
        addr = ", ".join(part for part in addr_parts if part)
        if addr:
            lines.append(f"Address: {addr}")
        if personal.get("linkedin_url"):
            lines.append(f"LinkedIn: {personal['linkedin_url']}")
        if personal.get("github_url"):
            lines.append(f"GitHub: {personal['github_url']}")
        if personal.get("website"):
            lines.append(f"Website: {personal['website']}")
        lines.append(f"Work Authorization: {personal.get('work_authorization', '')}")
        lines.append(f"Remote Preference: {personal.get('remote_preference', '')}")
        if personal.get("desired_salary_min") or personal.get("desired_salary_max"):
            sal_min = personal.get("desired_salary_min", "")
            sal_max = personal.get("desired_salary_max", "")
            lines.append(f"Desired Salary: ${sal_min} - ${sal_max}")
        if personal.get("available_start_date"):
            lines.append(f"Available: {personal['available_start_date']}")
        lines.append("")

        # Work History
        lines.append("=== WORK EXPERIENCE ===")
        for w in p.get("work_history", []):
            end = w.get("end_date") or "Present"
            lines.append(f"{w['title']} at {w['company']}")
            lines.append(f"  {w.get('location', '')} | {w.get('start_date', '')} - {end}")
            if w.get("description"):
                lines.append(f"  {w['description']}")
            lines.append("")

        # Education
        lines.append("=== EDUCATION ===")
        for e in p.get("education", []):
            lines.append(f"{e.get('degree', '')} in {e.get('field_of_study', '')}")
            lines.append(f"  {e['school']} | {e.get('graduation_date', '')}")
            if e.get("gpa"):
                lines.append(f"  GPA: {e['gpa']}")
            lines.append("")

        # Certifications
        lines.append("=== CERTIFICATIONS ===")
        for c in p.get("certifications", []):
            status = " (In Progress)" if c.get("in_progress") else ""
            lines.append(f"- {c['name']}{status}")
            if c.get("issuer"):
                lines.append(f"  Issuer: {c['issuer']}")
        lines.append("")

        # References
        refs = p.get("references", [])
        if refs:
            lines.append("=== REFERENCES ===")
            for r in refs:
                lines.append(f"- {r['name']}, {r.get('title', '')} at {r.get('company', '')}")
                if r.get("phone"):
                    lines.append(f"  Phone: {r['phone']}")
                if r.get("email"):
                    lines.append(f"  Email: {r['email']}")
                if r.get("relationship"):
                    lines.append(f"  Relationship: {r['relationship']}")
            lines.append("")

        return "\n".join(lines)

    def export_ats_fields(self) -> dict:
        """Flat dict mapping common ATS field names to values.

        Includes common field name variations for each value.
        """
        personal = models.get_personal(self._conn) or {}
        full_name = personal.get("full_name", "")
        name_parts = full_name.split(None, 1)
        first_name = name_parts[0] if name_parts else ""
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        fields = {}

        # Name variations
        for key in ("first_name", "firstName", "fname", "First Name",
                     "first", "givenName", "given_name"):
            fields[key] = first_name
        for key in ("last_name", "lastName", "lname", "Last Name",
                     "last", "familyName", "family_name", "surname"):
            fields[key] = last_name
        for key in ("full_name", "fullName", "name", "Full Name",
                     "candidate_name", "candidateName"):
            fields[key] = full_name

        # Contact
        phone = personal.get("phone", "")
        for key in ("phone", "phone_number", "phoneNumber", "Phone",
                     "Phone Number", "mobile", "cell", "telephone"):
            fields[key] = phone
        email = personal.get("email", "")
        for key in ("email", "email_address", "emailAddress", "Email",
                     "Email Address", "e-mail"):
            fields[key] = email

        # Address
        for key in ("street", "street_address", "streetAddress",
                     "address", "Address", "address_line_1", "addressLine1"):
            fields[key] = personal.get("street", "")
        for key in ("city", "City"):
            fields[key] = personal.get("city", "")
        for key in ("state", "State", "province", "region"):
            fields[key] = personal.get("state", "")
        for key in ("zip", "zip_code", "zipCode", "postal_code",
                     "postalCode", "Zip Code", "ZIP"):
            fields[key] = personal.get("zip", "")

        # URLs
        for key in ("linkedin", "linkedin_url", "linkedinUrl",
                     "LinkedIn", "LinkedIn URL"):
            fields[key] = personal.get("linkedin_url", "")
        for key in ("github", "github_url", "githubUrl", "GitHub"):
            fields[key] = personal.get("github_url", "")
        for key in ("website", "portfolio", "personal_website", "Website"):
            fields[key] = personal.get("website", "")

        # Work authorization
        work_auth = personal.get("work_authorization", "")
        auth_display = {
            "us_citizen": "US Citizen",
            "permanent_resident": "Permanent Resident",
            "require_sponsorship": "Require Sponsorship",
        }.get(work_auth, work_auth)
        for key in ("work_authorization", "workAuthorization",
                     "Work Authorization", "authorization"):
            fields[key] = auth_display

        # Preferences
        for key in ("willing_to_relocate", "willingToRelocate", "relocate"):
            fields[key] = personal.get("willing_to_relocate", False)
        for key in ("remote_preference", "remotePreference", "remote"):
            fields[key] = personal.get("remote_preference", "")
        for key in ("desired_salary_min", "salary_min", "salaryMin",
                     "minimum_salary"):
            fields[key] = personal.get("desired_salary_min") or ""
        for key in ("desired_salary_max", "salary_max", "salaryMax",
                     "maximum_salary"):
            fields[key] = personal.get("desired_salary_max") or ""
        for key in ("available_start_date", "start_date", "availability",
                     "availableDate"):
            fields[key] = personal.get("available_start_date", "")

        return fields

    def get_skills_from_tracker(self) -> list[dict]:
        """Pull current skills and levels from the existing SkillTracker."""
        from src.skills.tracker import SkillTracker

        tracker = SkillTracker(db_path=None)
        tracker.seed_defaults()
        skills = tracker.get_all_skills()
        tracker.close()
        return skills
