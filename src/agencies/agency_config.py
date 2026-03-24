"""
CareerPilot — IT Staffing Agency Configurations

Defines the target agencies, their job board search URLs, email domains,
and search profiles tuned to Joseph's target roles.
"""

from __future__ import annotations
from urllib.parse import quote_plus


AGENCIES = {
    "teksystems": {
        "name": "TEKsystems",
        "short": "TEK",
        "website": "https://www.teksystems.com",
        "job_board": "https://careers.teksystems.com/us/en/search-results",
        "search_url_template": "https://careers.teksystems.com/us/en/search-results?keywords={keywords}&location=Indianapolis%2C+IN",
        "email_domains": ["teksystems.com"],
        "specialties": ["IT staffing", "infrastructure", "help desk", "security", "cloud"],
        "hiring_models": ["contract", "contract-to-hire", "direct hire"],
        "notes": "Active relationship — David Perez (Sr. IT Recruiter, Risk & Security) presenting to MISO, Corteva, Delta roles. Allegis Group subsidiary.",
        "indy_presence": True,
    },
    "roberthalf": {
        "name": "Robert Half Technology",
        "short": "RHT",
        "website": "https://www.roberthalf.com",
        "job_board": "https://www.roberthalf.com/us/en/find-jobs",
        "search_url_template": "https://www.roberthalf.com/us/en/find-jobs#job-search-results?keyword={keywords}&location=Indianapolis%2C+IN",
        "email_domains": ["roberthalf.com", "rht.com", "rhi.com"],
        "specialties": ["IT staffing", "finance", "admin", "technology consulting"],
        "hiring_models": ["contract", "contract-to-hire", "direct hire"],
        "notes": "Global brand, large Indy office. Search their board for Systems Admin and Infrastructure roles.",
        "indy_presence": True,
    },
    "kforce": {
        "name": "Kforce",
        "short": "KF",
        "website": "https://www.kforce.com",
        "job_board": "https://www.kforce.com/find-work/search-jobs/",
        "search_url_template": "https://www.kforce.com/find-work/search-jobs/#results?k={keywords}&l=Indianapolis%2C+IN",
        "email_domains": ["kforce.com"],
        "specialties": ["technology", "finance", "accounting"],
        "hiring_models": ["contract", "contract-to-hire", "direct hire"],
        "notes": "Strong IT practice. Worth reaching out for Windows/VMware infrastructure roles.",
        "indy_presence": True,
    },
    "insightglobal": {
        "name": "Insight Global",
        "short": "IG",
        "website": "https://insightglobal.com",
        "job_board": "https://insightglobal.com/find-a-job/",
        "search_url_template": "https://insightglobal.com/find-a-job/?k={keywords}&l=Indianapolis%2C+IN",
        "email_domains": ["insightglobal.com"],
        "specialties": ["IT staffing", "engineering", "professional services"],
        "hiring_models": ["contract", "contract-to-hire", "direct hire", "managed services"],
        "notes": "Large enterprise staffing. Known for high-volume hiring programs.",
        "indy_presence": True,
    },
    "randstad": {
        "name": "Randstad Technologies",
        "short": "RAND",
        "website": "https://www.randstadusa.com",
        "job_board": "https://www.randstadusa.com/jobs/",
        "search_url_template": "https://www.randstadusa.com/jobs/s-{keywords}/l-indianapolis-in/",
        "email_domains": ["randstad.com", "randstadusa.com"],
        "specialties": ["IT staffing", "engineering", "global workforce"],
        "hiring_models": ["contract", "contract-to-hire", "direct hire"],
        "notes": "Global firm with Modis (now Akkodis) technology division.",
        "indy_presence": True,
    },
    "apexsystems": {
        "name": "Apex Systems",
        "short": "APEX",
        "website": "https://www.apexsystems.com",
        "job_board": "https://www.apexsystems.com/careers",
        "search_url_template": "https://www.apexsystems.com/careers?search={keywords}&location=Indianapolis%2C+IN",
        "email_domains": ["apexsystems.com"],
        "specialties": ["IT staffing", "IT services", "digital transformation"],
        "hiring_models": ["contract", "contract-to-hire", "direct hire"],
        "notes": "Large-scale IT staffing. Part of ASGN Incorporated.",
        "indy_presence": True,
    },
}

# Additional agencies worth monitoring
BONUS_AGENCIES = {
    "cybercoders": {
        "name": "CyberCoders",
        "email_domains": ["cybercoders.com"],
        "job_board": "https://www.cybercoders.com/search",
        "search_url_template": "https://www.cybercoders.com/search?searchterms={keywords}&searchlocation=Indianapolis%2C+IN",
    },
    "motionrecruitment": {
        "name": "Motion Recruitment",
        "email_domains": ["motionrecruitment.com"],
        "job_board": "https://motionrecruitment.com/tech-jobs",
        "search_url_template": "https://motionrecruitment.com/tech-jobs?search={keywords}&location=Indianapolis",
    },
}


# ── Search Profiles for Joseph's Target Roles ────────────────────────

AGENCY_SEARCH_KEYWORDS = [
    "systems administrator",
    "systems engineer Windows",
    "infrastructure engineer",
    "DevOps engineer Azure",
    "PowerShell automation",
    "VMware administrator",
    "Windows server engineer",
    "IT engineer",
]


def build_agency_search_url(agency_key: str, keywords: str) -> str | None:
    """Build a job search URL for a specific agency."""
    agency = AGENCIES.get(agency_key) or BONUS_AGENCIES.get(agency_key)
    if not agency or "search_url_template" not in agency:
        return None
    return agency["search_url_template"].format(keywords=quote_plus(keywords))


def get_all_email_domains() -> list[str]:
    """Get all agency email domains for Gmail filter configuration."""
    domains = []
    for agency in AGENCIES.values():
        domains.extend(agency["email_domains"])
    for agency in BONUS_AGENCIES.values():
        domains.extend(agency.get("email_domains", []))
    return sorted(set(domains))


def get_agency_by_email_domain(domain: str) -> dict | None:
    """Look up an agency by email domain."""
    domain = domain.lower()
    for agency in {**AGENCIES, **BONUS_AGENCIES}.values():
        if domain in [d.lower() for d in agency.get("email_domains", [])]:
            return agency
    return None
