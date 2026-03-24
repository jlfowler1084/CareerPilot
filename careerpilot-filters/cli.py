#!/usr/bin/env python3
"""
CareerPilot CLI — Gmail Smart Filters

Usage:
    python cli.py filters setup          Create labels + filter rules + retroactively tag existing mail
    python cli.py filters list           Show current CareerPilot filter rules
    python cli.py filters add <domain>   Add a recruiter domain to the filter
    python cli.py filters remove <domain> Remove a recruiter domain
    python cli.py filters test           Dry-run: show what queries would be created (no API calls)
    python cli.py filters nuke           Remove all CareerPilot filters (labels kept)
"""

import sys
import os
from pathlib import Path

from careerpilot.filter_config import LABELS, FILTER_RULES, USER_RECRUITER_DOMAINS_FILE, build_gmail_query
from careerpilot.gmail_client import GmailFilterManager


# ── Helpers ──────────────────────────────────────────────────────────

def load_user_domains() -> list[str]:
    """Load user-added recruiter domains from file."""
    path = Path(USER_RECRUITER_DOMAINS_FILE)
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def save_user_domains(domains: list[str]):
    """Save recruiter domains to file."""
    Path(USER_RECRUITER_DOMAINS_FILE).write_text("\n".join(sorted(set(domains))) + "\n")


def get_enriched_rules() -> dict:
    """Return FILTER_RULES with user-added recruiter domains merged in."""
    import copy
    rules = copy.deepcopy(FILTER_RULES)
    user_domains = load_user_domains()
    if user_domains and "recruiters" in rules:
        existing = rules["recruiters"].get("from_domains", [])
        rules["recruiters"]["from_domains"] = list(set(existing + user_domains))
    return rules


# ── Commands ─────────────────────────────────────────────────────────

def cmd_setup():
    """Full setup: create labels, create filters, retroactively tag existing mail."""
    print("\n╔══════════════════════════════════════════╗")
    print("║   CareerPilot — Gmail Filter Setup       ║")
    print("╚══════════════════════════════════════════╝\n")

    mgr = GmailFilterManager()

    # Step 1: Create labels
    print("📁 Creating label hierarchy...")
    label_map = mgr.ensure_label_hierarchy(LABELS)
    print()

    # Step 2: Delete existing CareerPilot filters (idempotent re-run)
    print("🔄 Clearing old CareerPilot filters...")
    old_filters = mgr.get_careerpilot_filters()
    for f in old_filters:
        mgr.delete_filter(f["id"])
    if old_filters:
        print(f"   Removed {len(old_filters)} old filter(s)")
    else:
        print("   No old filters to remove")
    print()

    # Step 3: Create new filters
    print("📨 Creating filter rules...")
    rules = get_enriched_rules()
    for rule_name, rule in rules.items():
        query = build_gmail_query(rule)
        if not query:
            print(f"  ⚠️   Skipping '{rule_name}' — empty query")
            continue

        label_name = rule["label"]
        label_id = label_map.get(label_name) or mgr.get_label_id(label_name)
        if not label_id:
            print(f"  ❌  Label '{label_name}' not found, skipping")
            continue

        archive = rule.get("archive", False)
        mgr.create_filter(query, label_id, archive=archive)
        print(f"  ✅  Filter created: {rule_name} → {label_name}")
        print(f"       Query: {query[:100]}{'...' if len(query) > 100 else ''}")
    print()

    # Step 4: Retroactively label existing messages
    print("🏷️  Retroactively tagging existing messages...")
    total_tagged = 0
    for rule_name, rule in rules.items():
        query = build_gmail_query(rule)
        if not query:
            continue
        label_name = rule["label"]
        label_id = label_map.get(label_name) or mgr.get_label_id(label_name)
        if not label_id:
            continue
        count = mgr.apply_label_to_matching(query, label_id, max_results=500)
        if count > 0:
            print(f"  📌 {rule_name}: tagged {count} existing message(s)")
            total_tagged += count
    print(f"\n   Total: {total_tagged} messages retroactively tagged")

    print("\n✅ Setup complete! Check your Gmail sidebar for CareerPilot labels.\n")


def cmd_list():
    """Show current filter rules and user-added domains."""
    print("\n📋 CareerPilot Filter Rules\n")

    rules = get_enriched_rules()
    for rule_name, rule in rules.items():
        query = build_gmail_query(rule)
        print(f"  [{rule_name}]")
        print(f"    Label:  {rule['label']}")
        print(f"    Desc:   {rule.get('description', 'N/A')}")
        if rule.get("from_addresses"):
            print(f"    From:   {', '.join(rule['from_addresses'][:5])}")
            if len(rule['from_addresses']) > 5:
                print(f"            ...and {len(rule['from_addresses']) - 5} more")
        if rule.get("from_domains"):
            print(f"    Domains: {', '.join(rule['from_domains'][:5])}")
            if len(rule['from_domains']) > 5:
                print(f"             ...and {len(rule['from_domains']) - 5} more")
        if rule.get("subject_patterns"):
            print(f"    Subjects: {', '.join(rule['subject_patterns'][:4])}")
            if len(rule['subject_patterns']) > 4:
                print(f"              ...and {len(rule['subject_patterns']) - 4} more")
        print(f"    Query:  {query[:90]}{'...' if len(query) > 90 else ''}")
        print()

    # Show user domains
    user_domains = load_user_domains()
    if user_domains:
        print("  [User-Added Recruiter Domains]")
        for d in user_domains:
            print(f"    • {d}")
        print()

    # Show live Gmail filters
    try:
        mgr = GmailFilterManager()
        live_filters = mgr.get_careerpilot_filters()
        print(f"  📊 Live Gmail filters targeting CareerPilot labels: {len(live_filters)}")
    except Exception:
        print("  ⚠️  Could not connect to Gmail to check live filters")
    print()


def cmd_add(domain: str):
    """Add a recruiter domain to the filter list."""
    domain = domain.strip().lower()
    if domain.startswith("@"):
        domain = domain[1:]

    domains = load_user_domains()
    if domain in domains:
        print(f"\n⏭️   '{domain}' is already in the recruiter domain list.\n")
        return

    domains.append(domain)
    save_user_domains(domains)
    print(f"\n✅ Added '{domain}' to recruiter filter domains.")
    print(f"   Run 'python cli.py filters setup' to apply changes to Gmail.\n")


def cmd_remove(domain: str):
    """Remove a recruiter domain from the user list."""
    domain = domain.strip().lower()
    if domain.startswith("@"):
        domain = domain[1:]

    domains = load_user_domains()
    if domain not in domains:
        print(f"\n⚠️   '{domain}' is not in the user-added domain list.\n")
        return

    domains.remove(domain)
    save_user_domains(domains)
    print(f"\n✅ Removed '{domain}' from recruiter filter domains.")
    print(f"   Run 'python cli.py filters setup' to apply changes to Gmail.\n")


def cmd_test():
    """Dry-run: show what queries would be created without touching Gmail."""
    print("\n🧪 Dry Run — Filter Queries (no API calls)\n")
    rules = get_enriched_rules()
    for rule_name, rule in rules.items():
        query = build_gmail_query(rule)
        print(f"  [{rule_name}] → {rule['label']}")
        print(f"    {query}\n")


def cmd_nuke():
    """Remove all CareerPilot filters from Gmail. Labels are preserved."""
    print("\n🗑️  Removing all CareerPilot filters from Gmail...")
    mgr = GmailFilterManager()
    filters = mgr.get_careerpilot_filters()
    for f in filters:
        mgr.delete_filter(f["id"])
    print(f"   Removed {len(filters)} filter(s). Labels are preserved.\n")


# ── CLI Router ───────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if len(args) < 2 or args[0] != "filters":
        print(__doc__)
        sys.exit(1)

    command = args[1]

    if command == "setup":
        cmd_setup()
    elif command == "list":
        cmd_list()
    elif command == "add":
        if len(args) < 3:
            print("Usage: python cli.py filters add <email_or_domain>")
            sys.exit(1)
        cmd_add(args[2])
    elif command == "remove":
        if len(args) < 3:
            print("Usage: python cli.py filters remove <domain>")
            sys.exit(1)
        cmd_remove(args[2])
    elif command == "test":
        cmd_test()
    elif command == "nuke":
        confirm = input("⚠️  This will remove all CareerPilot Gmail filters. Continue? [y/N] ")
        if confirm.lower() == "y":
            cmd_nuke()
        else:
            print("Cancelled.")
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
