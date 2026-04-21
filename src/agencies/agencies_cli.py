"""
CareerPilot CLI — IT Staffing Agency Integration

Usage:
    python cli.py agencies list                       List all configured agencies
    python cli.py agencies search <keyword>           Open agency job boards in browser
    python cli.py agencies search --all               Open all agencies with all keyword profiles

    python cli.py agencies recruiter add              Add a recruiter contact (interactive)
    python cli.py agencies recruiter list              List all recruiter contacts
    python cli.py agencies recruiter show <id>         Show recruiter details + history

    python cli.py agencies interaction log <id>        Log an interaction with a contact
    python cli.py agencies role add <contact_id>       Add a submitted role
    python cli.py agencies role list                   List all submitted roles
    python cli.py agencies role update <id> <status>   Update role status

    python cli.py agencies outreach <template> <agency>  Generate outreach email
    python cli.py agencies outreach --list             List available templates
    python cli.py agencies summary                     Show dashboard summary
"""

from __future__ import annotations

import sys
import webbrowser

from src.agencies.agency_config import (
    AGENCIES,
    AGENCY_SEARCH_KEYWORDS,
    build_agency_search_url,
    get_all_email_domains,
)
from src.agencies.outreach_templates import OUTREACH_TEMPLATES, render_template
from src.db import models


def _get_contact_manager():
    from src.db.contacts import ContactManager
    return ContactManager()


def cmd_list_agencies():
    """List all configured staffing agencies."""
    print("\n Configured IT Staffing Agencies\n")
    for key, agency in AGENCIES.items():
        indy = " Indy" if agency.get("indy_presence") else ""
        hiring_models = ", ".join(agency.get("hiring_models", []))
        print(f"  [{key}] {agency['name']} {indy}")
        print(f"    Models: {hiring_models}")
        print(f"    Board:  {agency['job_board']}")
        if agency.get("notes"):
            print(f"    Notes:  {agency['notes'][:80]}")
        print()

    print(f"  Email domains for Gmail filters:")
    for domain in get_all_email_domains():
        print(f"    - {domain}")
    print()


def cmd_search(keyword: str | None = None, open_all: bool = False):
    """Open agency job board search URLs in the browser."""
    keywords_to_search = AGENCY_SEARCH_KEYWORDS if open_all else [keyword or "systems engineer"]

    print(f"\n Opening agency job boards...\n")
    count = 0
    for agency_key, agency in AGENCIES.items():
        for kw in keywords_to_search:
            url = build_agency_search_url(agency_key, kw)
            if url:
                if not open_all:
                    print(f"  {agency['name']}: \"{kw}\"")
                    webbrowser.open(url)
                    count += 1
                else:
                    count += 1

    if open_all:
        for agency_key, agency in AGENCIES.items():
            url = build_agency_search_url(agency_key, keywords_to_search[0])
            if url:
                print(f"  {agency['name']}: \"{keywords_to_search[0]}\"")
                webbrowser.open(url)

    print(f"\n  Opened {min(count, len(AGENCIES))} agency search tabs.\n")


def cmd_recruiter_add():
    """Interactive recruiter contact entry via unified contacts system."""
    print("\n Add Recruiter Contact\n")

    name = input("  Name: ").strip()
    agency = input("  Agency: ").strip()
    email = input("  Email (optional): ").strip() or None
    phone = input("  Phone (optional): ").strip() or None
    title = input("  Title (optional): ").strip() or None
    specialties = input("  Specialties (optional): ").strip() or None
    notes = input("  Notes (optional): ").strip() or None

    mgr = _get_contact_manager()
    rid = mgr.add_contact(
        name, "recruiter",
        company=agency, email=email, phone=phone, title=title,
        specialization=specialties, notes=notes, source="staffing_agency",
    )
    print(f"\n  Added recruiter {rid}: {name} at {agency}\n")


def cmd_recruiter_list():
    """List all recruiter contacts."""
    mgr = _get_contact_manager()
    recruiters = mgr.list_contacts(contact_type="recruiter")

    if not recruiters:
        print("\n  No recruiters tracked yet. Use 'contacts add' to add one.\n")
        return

    conn = models.get_connection()
    print(f"\n Recruiter Contacts ({len(recruiters)})\n")
    for r in recruiters:
        roles = models.get_submitted_roles(conn, contact_uuid=str(r["id"]))
        active = [x for x in roles if x["status"] in ("submitted", "interviewing")]
        print(f"  {r['id']} {r['name']} -- {r.get('company', 'N/A')}")
        if r.get("email"):
            print(f"     {r['email']}")
        if r.get("phone"):
            print(f"     {r['phone']}")
        if r.get("title"):
            print(f"     {r['title']}")
        print(f"     Roles: {len(roles)} total, {len(active)} active")
        lcd = r.get("last_contact_date")
        if lcd:
            print(f"     Last contact: {str(lcd)[:10]}")
        print()
    conn.close()


def cmd_recruiter_show(contact_id: str):
    """Show full contact details with interaction history."""
    mgr = _get_contact_manager()
    r = mgr.get_contact(contact_id)
    if not r:
        print(f"\n  Contact {contact_id} not found.\n")
        return

    print(f"\n {r['name']} -- {r.get('company', 'N/A')}")
    if r.get("email"):
        print(f"   {r['email']}")
    if r.get("phone"):
        print(f"   {r['phone']}")
    if r.get("title"):
        print(f"   {r['title']}")
    if r.get("notes"):
        print(f"   {r['notes']}")

    conn = models.get_connection()
    interactions = models.get_contact_interactions(conn, contact_id)
    if interactions:
        print(f"\n   Recent Interactions ({len(interactions)}):")
        for i in interactions[:10]:
            direction = "->" if i["direction"] == "outbound" else "<-"
            print(f"     {i['created_at'][:10]} {direction} {i['interaction_type']}: {i.get('subject', 'N/A')}")
            if i.get("summary"):
                print(f"       {i['summary'][:80]}")

    roles = models.get_submitted_roles(conn, contact_uuid=contact_id)
    if roles:
        print(f"\n   Submitted Roles ({len(roles)}):")
        for role in roles:
            print(f"     {role['role_title']} at {role['company']} [{role['status']}]")
            if role.get("pay_rate"):
                print(f"        Pay: {role['pay_rate']}")
    conn.close()
    print()


def cmd_interaction_log(contact_id: str):
    """Interactive interaction logging."""
    from datetime import datetime

    mgr = _get_contact_manager()
    r = mgr.get_contact(contact_id)
    if not r:
        print(f"\n  Contact {contact_id} not found.\n")
        return

    print(f"\n Log Interaction with {r['name']} ({r.get('company', 'N/A')})\n")
    itype = input("  Type (email/call/meeting/text): ").strip() or "email"
    direction = input("  Direction (inbound/outbound): ").strip() or "inbound"
    subject = input("  Subject: ").strip() or None
    summary = input("  Summary: ").strip() or None
    roles = input("  Roles discussed (optional): ").strip() or None
    follow_up = input("  Follow-up date (YYYY-MM-DD, optional): ").strip() or None

    conn = models.get_connection()
    iid = models.add_contact_interaction(
        conn, contact_id, itype, direction,
        subject=subject, summary=summary, roles_discussed=roles,
        follow_up_date=follow_up,
    )
    conn.close()

    updates: dict = {"last_contact_date": datetime.now().isoformat(), "contact_method": itype}
    if follow_up:
        updates["next_followup"] = follow_up
    mgr.update_contact(contact_id, **updates)
    print(f"\n  Logged interaction #{iid}\n")


def cmd_role_add(contact_id: str):
    """Add a submitted role."""
    mgr = _get_contact_manager()
    r = mgr.get_contact(contact_id)
    if not r:
        print(f"\n  Contact {contact_id} not found.\n")
        return

    print(f"\n Add Submitted Role via {r['name']} ({r.get('company', 'N/A')})\n")
    company = input("  Company: ").strip()
    title = input("  Role Title: ").strip()
    pay = input("  Pay Rate (optional): ").strip() or None
    location = input("  Location (optional): ").strip() or None
    rtype = input("  Type (contract/cth/direct): ").strip() or "contract"
    notes = input("  Notes (optional): ").strip() or None

    conn = models.get_connection()
    rid = models.add_submitted_role(
        conn, contact_id, company, title,
        pay_rate=pay, location=location, role_type=rtype, notes=notes,
    )
    conn.close()
    print(f"\n  Added role #{rid}: {title} at {company}\n")


def cmd_role_list():
    """List all submitted roles."""
    conn = models.get_connection()
    roles = models.get_submitted_roles(conn)
    conn.close()

    if not roles:
        print("\n  No submitted roles tracked yet.\n")
        return

    print(f"\n Submitted Roles ({len(roles)})\n")
    for role in roles:
        print(f"  #{role['id']} {role['role_title']} at {role['company']}")
        print(f"     Contact UUID: {role.get('contact_uuid', 'N/A')}")
        print(f"     Status: {role['status']} | Type: {role.get('role_type', 'N/A')}")
        if role.get("pay_rate"):
            print(f"     Pay: {role['pay_rate']}")
        print()


def cmd_role_update(role_id: int, status: str):
    """Update a role's status."""
    notes = input("  Notes (optional): ").strip() or None
    conn = models.get_connection()
    models.update_role_status(conn, role_id, status, notes)
    conn.close()
    print(f"\n  Role #{role_id} updated to '{status}'\n")


def cmd_outreach(template_key: str | None = None, agency_key: str | None = None):
    """Generate an outreach email from a template."""
    if template_key == "--list" or not template_key:
        print("\n Available Outreach Templates\n")
        for key, tmpl in OUTREACH_TEMPLATES.items():
            print(f"  [{key}] {tmpl['name']}")
        print(f"\n  Usage: python cli.py agencies outreach <template> <agency>\n")
        return

    agency = AGENCIES.get(agency_key, {})
    rendered = render_template(
        template_key,
        recruiter_name="[Recruiter Name]",
        agency_name=agency.get("name", agency_key or "[Agency]"),
        role_title="[Role Title]",
        company="[Company]",
        match_points="- [Match point 1]\n- [Match point 2]\n- [Match point 3]",
        start_date="immediately",
    )

    print(f"\n{'=' * 60}")
    print(f"  {rendered['template_name']}")
    print(f"{'=' * 60}")
    print(f"\n  Subject: {rendered['subject']}\n")
    print(rendered["body"])
    print(f"\n{'=' * 60}")

    try:
        import pyperclip
        pyperclip.copy(f"Subject: {rendered['subject']}\n\n{rendered['body']}")
        print("Copied to clipboard!")
    except ImportError:
        pass
    print()


def cmd_summary():
    """Show dashboard summary."""
    mgr = _get_contact_manager()
    all_contacts = mgr.list_contacts()
    active_contacts = sum(
        1 for c in all_contacts
        if c.get("relationship_status") in ("new", "active", "warm")
    )
    companies = len({c.get("company") for c in all_contacts if c.get("company")})

    conn = models.get_connection()
    total_roles = conn.execute("SELECT COUNT(*) FROM submitted_roles").fetchone()[0]
    active_roles = conn.execute(
        "SELECT COUNT(*) FROM submitted_roles WHERE status IN ('submitted', 'interviewing')"
    ).fetchone()[0]
    total_interactions = conn.execute("SELECT COUNT(*) FROM contact_interactions").fetchone()[0]
    conn.close()

    print("\n+==========================================+")
    print("|   Contact Relationship Dashboard         |")
    print("+==========================================+\n")
    print(f"  Active Contacts:      {active_contacts}")
    print(f"  Companies:            {companies}")
    print(f"  Roles Submitted:      {total_roles} ({active_roles} active)")
    print(f"  Total Interactions:   {total_interactions}")
    print()


# -- CLI Router (legacy, kept for backward compat) ---


def agencies_cli(args: list[str]):
    """Route agencies subcommands."""
    if not args:
        print(__doc__)
        return

    cmd = args[0]

    if cmd == "list":
        cmd_list_agencies()
    elif cmd == "search":
        if "--all" in args:
            cmd_search(open_all=True)
        elif len(args) >= 2:
            cmd_search(keyword=args[1])
        else:
            cmd_search()
    elif cmd == "recruiter":
        if len(args) < 2:
            print("  Usage: agencies recruiter [add|list|show <id>]")
            return
        subcmd = args[1]
        if subcmd == "add":
            cmd_recruiter_add()
        elif subcmd == "list":
            cmd_recruiter_list()
        elif subcmd == "show" and len(args) >= 3:
            cmd_recruiter_show(args[2])
        else:
            print(f"  Unknown: agencies recruiter {subcmd}")
    elif cmd == "interaction" and len(args) >= 3 and args[1] == "log":
        cmd_interaction_log(args[2])
    elif cmd == "role":
        if len(args) < 2:
            print("  Usage: agencies role [add <contact_id>|list|update <id> <status>]")
            return
        subcmd = args[1]
        if subcmd == "add" and len(args) >= 3:
            cmd_role_add(args[2])
        elif subcmd == "list":
            cmd_role_list()
        elif subcmd == "update" and len(args) >= 4:
            cmd_role_update(int(args[2]), args[3])
        else:
            print(f"  Unknown: agencies role {subcmd}")
    elif cmd == "outreach":
        template = args[1] if len(args) >= 2 else None
        agency = args[2] if len(args) >= 3 else None
        cmd_outreach(template, agency)
    elif cmd == "summary":
        cmd_summary()
    else:
        print(f"  Unknown command: {cmd}")
        print(__doc__)
