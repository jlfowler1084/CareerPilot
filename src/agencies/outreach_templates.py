"""
CareerPilot — Recruiter Outreach Templates

Pre-built email templates for reaching out to IT staffing agencies.
Customized for Joseph's profile and target roles.
"""

from __future__ import annotations


OUTREACH_TEMPLATES = {
    "initial_contact": {
        "name": "Initial Contact — Cold Outreach",
        "subject": "Experienced Infrastructure Engineer — Open to Contract & FTE in Indianapolis",
        "body": """Hi {recruiter_name},

I'm reaching out because I'm actively looking for my next opportunity in IT infrastructure and I'd like to connect with {agency_name}'s Indianapolis team.

Quick background: I'm a systems engineer with 20 years of experience at Venable LLP, a national law firm where I managed a 700+ server VMware environment, led Windows OS migrations, built 30+ Splunk dashboards, and automated infrastructure workflows with PowerShell. I also have hands-on experience with Azure, Active Directory, Microsoft 365 administration, and Nimble SAN storage.

I'm based in Sheridan, IN (just north of Indianapolis) and open to both contract and full-time roles in the Indy area or remote. My sweet spot is:

- Windows Server / Active Directory administration
- VMware vSphere / PowerCLI automation
- Azure / M365 / Entra ID
- PowerShell scripting & infrastructure automation
- Splunk / SolarWinds monitoring
- SCCM / patch management

I'd welcome a quick call to discuss what you're seeing in the Indy market and whether any current openings might be a fit. I've attached my resume for reference.

Best regards,
Joseph Fowler
443-787-6528
linkedin.com/in/system-administration""",
    },

    "follow_up": {
        "name": "Follow-Up — After Initial Contact",
        "subject": "Following Up — Infrastructure Engineer Open to Opportunities",
        "body": """Hi {recruiter_name},

I wanted to follow up on my previous message. I'm still actively looking for infrastructure / systems engineering roles in the Indianapolis area (or remote) and would love to connect with {agency_name}.

To save you time, here's a quick snapshot of what I bring:
- 20 years managing enterprise Windows/VMware environments
- PowerShell automation (built a modular framework hosted in GitHub)
- Azure portal, VM provisioning, Entra ID administration
- Splunk dashboards (30+ built), SolarWinds alerting optimization
- Security+ and ITIL V4 certified, AZ-900 in progress

I'm open to contract, contract-to-hire, or direct hire. Available to start immediately.

Happy to jump on a call whenever works for you.

Best,
Joseph Fowler
443-787-6528""",
    },

    "role_interest": {
        "name": "Role Interest — Responding to a Specific Listing",
        "subject": "Re: {role_title} at {company} — Interested",
        "body": """Hi {recruiter_name},

I saw the {role_title} position at {company} and I'm very interested. My background is a strong match:

{match_points}

I'm available to start {start_date} and am open to discussing compensation. I've attached my tailored resume for this role.

Would love to discuss the details — I'm available for a call anytime this week.

Best regards,
Joseph Fowler
443-787-6528""",
    },

    "check_in": {
        "name": "Check-In — Maintaining Relationship",
        "subject": "Checking In — Still Open to Opportunities",
        "body": """Hi {recruiter_name},

Just wanted to touch base and let you know I'm still actively looking. If any new infrastructure, systems engineering, or DevOps roles come across your desk in the Indy area or remote, I'd love to hear about them.

I've recently been sharpening my Azure skills (AZ-900 in progress) and building automation tooling with Python and PowerShell, so my profile is even stronger on the cloud/automation side now.

Thanks for keeping me in mind — talk soon.

Joseph Fowler
443-787-6528""",
    },
}


def render_template(template_key: str, **kwargs) -> dict:
    """
    Render an outreach template with variable substitution.

    Returns {"subject": "...", "body": "..."} with placeholders filled.
    Missing placeholders are left as-is (e.g., {role_title} if not provided).
    """
    template = OUTREACH_TEMPLATES.get(template_key)
    if not template:
        raise ValueError(f"Unknown template: {template_key}. Available: {list(OUTREACH_TEMPLATES.keys())}")

    subject = template["subject"]
    body = template["body"]

    for key, value in kwargs.items():
        subject = subject.replace(f"{{{key}}}", str(value))
        body = body.replace(f"{{{key}}}", str(value))

    return {
        "subject": subject,
        "body": body,
        "template_name": template["name"],
    }
