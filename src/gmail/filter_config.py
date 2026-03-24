"""CareerPilot Gmail Filter Configuration.

Label hierarchy and filter rules derived from actual inbox patterns.
Edit FILTER_RULES to add/remove sender domains or subject patterns.
"""

from __future__ import annotations

from pathlib import Path

from config import settings

# ── Label Hierarchy ──────────────────────────────────────────────────
# Gmail nested labels use "/" separator. Parent label is created first.
LABELS = {
    "parent": "CareerPilot",
    "children": {
        "Recruiters":        "CareerPilot/Recruiters",
        "Job Alerts":        "CareerPilot/Job Alerts",
        "Interviews":        "CareerPilot/Interviews",
        "Applications":      "CareerPilot/Applications",
        "Offers-Rejections": "CareerPilot/Offers-Rejections",
    }
}

# ── Filter Rules ─────────────────────────────────────────────────────
# Each rule maps to a label and defines sender domains, sender addresses,
# and/or subject patterns. Gmail filters use OR logic within a rule.
#
# "query" is auto-built from the parts at runtime.
# You can also set "archive": True to skip inbox.

FILTER_RULES = {
    # ── Job Board Notifications ──────────────────────────────────────
    "job_alerts": {
        "label": "CareerPilot/Job Alerts",
        "description": "Job board alert emails (Indeed, Dice, LinkedIn, Glassdoor, ZipRecruiter)",
        "from_addresses": [
            "jobalerts-noreply@indeed.com",
            "jobseekeralerts@indeed.com",
            "recommendations@indeed.com",
            "noreply@dice.com",
            "alerts@dice.com",
            "jobs-noreply@linkedin.com",
            "noreply@glassdoor.com",
            "noreply@ziprecruiter.com",
            "alerts@ziprecruiter.com",
        ],
        "subject_patterns": [],
        "archive": False,
    },

    # ── Application Confirmations ────────────────────────────────────
    "applications": {
        "label": "CareerPilot/Applications",
        "description": "Application submitted / received confirmations",
        "from_addresses": [
            "indeedapply@indeed.com",
        ],
        "subject_patterns": [
            "Indeed Application:",
            "application received",
            "thank you for applying",
            "your application has been",
            "application confirmation",
        ],
        "archive": False,
    },

    # ── Application Updates (Offers / Rejections) ────────────────────
    "offers_rejections": {
        "label": "CareerPilot/Offers-Rejections",
        "description": "Outcome emails -- offers, rejections, status updates from employers",
        "from_addresses": [],
        "subject_patterns": [
            "update on your application",
            "not moving forward",
            "position has been filled",
            "unfortunately",
            "offer letter",
            "congratulations on your",
            "we are pleased to offer",
            "moved to the next step",
        ],
        "archive": False,
    },

    # ── Recruiter Outreach ───────────────────────────────────────────
    "recruiters": {
        "label": "CareerPilot/Recruiters",
        "description": "Direct recruiter and staffing agency emails",
        "from_domains": [
            "teksystems.com",
            "roberthalf.com",
            "kforce.com",
            "insightglobal.com",
            "randstad.com",
            "apexsystems.com",
            "hays.com",
            "manpower.com",
            "modis.com",
            "adecco.com",
            "cybercoders.com",
            "motionrecruitment.com",
            "rht.com",
        ],
        "from_addresses": [],
        "subject_patterns": [
            "opportunity",
            "your profile",
            "your resume",
            "we found your",
            "I came across your",
            "reaching out about",
        ],
        "archive": False,
    },

    # ── Interview Scheduling ─────────────────────────────────────────
    "interviews": {
        "label": "CareerPilot/Interviews",
        "description": "Interview invites, phone screens, technical assessments",
        "from_addresses": [],
        "subject_patterns": [
            "interview",
            "phone screen",
            "technical assessment",
            "hiring manager",
            "schedule a call",
            "video interview",
            "onsite interview",
            "coding challenge",
            "next steps in the process",
        ],
        "archive": False,
    },
}

# ── User-Added Domains ───────────────────────────────────────────────
# This file is auto-updated by `cli.py filters add <domain>`.
# Domains listed here are appended to the "recruiters" filter rule.
USER_RECRUITER_DOMAINS_FILE = settings.DATA_DIR / "user_recruiter_domains.txt"


def build_gmail_query(rule: dict) -> str:
    """Build a Gmail filter query string from a rule definition."""
    parts = []

    # from: addresses
    from_addrs = rule.get("from_addresses", [])
    if from_addrs:
        from_clauses = [f"from:{addr}" for addr in from_addrs]
        parts.append("({})".format(" OR ".join(from_clauses)))

    # from: domains
    from_domains = rule.get("from_domains", [])
    if from_domains:
        domain_clauses = [f"from:@{domain}" for domain in from_domains]
        parts.append("({})".format(" OR ".join(domain_clauses)))

    # subject patterns
    subjects = rule.get("subject_patterns", [])
    if subjects:
        subj_clauses = [f'subject:"{s}"' for s in subjects]
        parts.append("({})".format(" OR ".join(subj_clauses)))

    # If we have both from and subject parts, combine with OR
    if len(parts) > 1:
        return " OR ".join(parts)
    elif len(parts) == 1:
        return parts[0]
    else:
        return ""
