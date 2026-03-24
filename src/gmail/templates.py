"""Response templates and personal context for recruiter email drafting."""

CANDIDATE_CONTEXT = {
    "name": "Joseph Fowler",
    "location": "Sheridan, IN — open to Indianapolis metro + remote",
    "target_roles": [
        "Systems Engineer",
        "Infrastructure Engineer",
        "DevOps Engineer",
        "Cloud Engineer",
        "Platform Engineer",
    ],
    "availability": "Full-time, contract, remote, hybrid within Indy metro",
    "strengths": (
        "20 years IT infrastructure, PowerShell automation, VMware vSphere, "
        "Windows Server, Active Directory, M365/Azure administration, "
        "Splunk/SolarWinds monitoring, GitHub"
    ),
    "interview_hours": "Weekdays 9am-5pm EST",
}


def format_context_block():
    """Format candidate context as a text block for Claude prompts."""
    ctx = CANDIDATE_CONTEXT
    roles = ", ".join(ctx["target_roles"])
    return (
        f"Candidate name: {ctx['name']}\n"
        f"Location: {ctx['location']}\n"
        f"Target roles: {roles}\n"
        f"Availability: {ctx['availability']}\n"
        f"Key strengths: {ctx['strengths']}\n"
        f"Interview hours: {ctx['interview_hours']}"
    )
