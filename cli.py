"""CareerPilot — Main CLI entry point."""

import logging
import sys

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

console = Console()

# Categories that support interactive response
ACTIONABLE_CATEGORIES = {"recruiter_outreach", "interview_request", "offer"}

# Category display colors
CATEGORY_COLORS = {
    "recruiter_outreach": "green",
    "interview_request": "bright_green",
    "offer": "bright_cyan",
    "job_alert": "blue",
    "rejection": "red",
    "irrelevant": "dim",
}


@click.group()
@click.option("--debug", is_flag=True, help="Enable debug logging.")
def cli(debug):
    """CareerPilot — Personal career management platform."""
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )


@cli.command()
@click.option("--days", default=7, help="Number of days to look back (default 7).")
def scan(days):
    """Scan Gmail for recruiter emails, classify, and draft responses."""
    from src.gmail.responder import RecruiterResponder
    from src.gmail.scanner import GmailScanner

    scanner = GmailScanner()
    try:
        scanner.authenticate()
    except FileNotFoundError as e:
        console.print(f"[red]{e}[/red]")
        return
    except Exception:
        console.print("[red]Gmail authentication failed. Check logs for details.[/red]")
        return

    results = scanner.scan_inbox(days_back=days)

    if not results:
        console.print("[yellow]No recruiter emails found.[/yellow]")
        return

    # Display results table
    table = Table(title=f"Gmail Scan Results ({len(results)} emails)")
    table.add_column("#", style="dim")
    table.add_column("Category", style="bold")
    table.add_column("From")
    table.add_column("Subject")
    table.add_column("Company")
    table.add_column("Role")
    table.add_column("Urgency")
    table.add_column("Summary")

    for i, r in enumerate(results, 1):
        color = CATEGORY_COLORS.get(r["category"], "white")
        table.add_row(
            str(i),
            f"[{color}]{r['category']}[/{color}]",
            r["sender"][:30],
            r["subject"][:40],
            r["company"],
            r["role"],
            r["urgency"],
            r["summary"][:50],
        )

    console.print(table)
    console.print()

    # Interactive response flow for actionable emails
    actionable = [r for r in results if r["category"] in ACTIONABLE_CATEGORIES]
    if not actionable:
        console.print("[dim]No actionable emails (recruiter_outreach/interview_request/offer) found.[/dim]")
        return

    # Create responder using scanner's authenticated service
    responder = RecruiterResponder(scanner._service)

    console.print(
        f"[bold]{len(actionable)} actionable email(s) found.[/bold] "
        "Drafts are saved to Gmail — [bold]nothing is sent[/bold] without your approval.\n"
    )

    for r in actionable:
        console.rule(f"[bold]{r['subject'][:60]}[/bold]")
        console.print(f"  From: {r['sender']}")
        console.print(f"  Company: {r['company']}  |  Role: {r['role']}  |  Urgency: {r['urgency']}")
        console.print(f"  {r['summary']}")
        console.print()

        action = _prompt_action()
        if action == "q":
            console.print("[yellow]Quitting scan.[/yellow]")
            return
        if action == "s":
            continue

        mode_map = {"r": "interested", "d": "not_interested", "m": "more_info"}
        mode = mode_map[action]

        # Fetch full email for drafting
        email_data = scanner.get_email_details(r["message_id"])
        if not email_data:
            console.print("[red]Failed to fetch email details, skipping.[/red]")
            continue

        _handle_draft_flow(responder, email_data, mode, r["message_id"])
        console.print()


def _prompt_action():
    """Prompt user for action on an email. Returns r/d/m/s/q."""
    while True:
        choice = console.input(
            "[bold][r][/bold]espond interested  "
            "[bold][d][/bold]ecline  "
            "[bold][m][/bold]ore info  "
            "[bold][s][/bold]kip  "
            "[bold][q][/bold]uit: "
        ).strip().lower()
        if choice in ("r", "d", "m", "s", "q"):
            return choice
        console.print("[red]Invalid choice. Enter r, d, m, s, or q.[/red]")


def _handle_draft_flow(responder, email_data, mode, message_id):
    """Generate a draft, show it, and let user approve/edit/cancel."""
    draft_text = responder.draft_response(email_data, mode=mode)

    if not draft_text:
        console.print("[red]Failed to generate draft. Check logs.[/red]")
        return

    while True:
        console.print()
        console.print(Panel(
            draft_text,
            title=f"Draft Reply ({mode})",
            border_style="cyan",
        ))

        choice = console.input(
            "[bold][a][/bold]pprove (save as draft)  "
            "[bold][e][/bold]dit (re-generate with feedback)  "
            "[bold][c][/bold]ancel: "
        ).strip().lower()

        if choice == "a":
            draft_id = responder.save_draft(message_id, draft_text)
            if draft_id:
                console.print(f"[green]Draft saved to Gmail (draft_id={draft_id}). NOT sent.[/green]")
            else:
                console.print("[red]Failed to save draft. Check logs.[/red]")
            return

        elif choice == "e":
            feedback = console.input("What should be different? ")
            # Re-generate with feedback appended
            augmented = dict(email_data)
            augmented["body"] = (
                email_data.get("body", "") +
                f"\n\n--- USER FEEDBACK ON PREVIOUS DRAFT ---\n"
                f"Previous draft:\n{draft_text}\n\n"
                f"Requested changes: {feedback}"
            )
            draft_text = responder.draft_response(augmented, mode=mode)
            if not draft_text:
                console.print("[red]Failed to re-generate draft. Check logs.[/red]")
                return
            # Loop back to show the new draft

        elif choice == "c":
            console.print("[yellow]Draft cancelled.[/yellow]")
            return

        else:
            console.print("[red]Invalid choice. Enter a, e, or c.[/red]")


@cli.command()
def calendar():
    """Show Google Calendar availability for the next 5 days."""
    console.print("[yellow]Coming soon — Phase 2[/yellow]")


@cli.group()
def journal():
    """Manage journal entries and insights."""
    pass


@journal.command("new")
def journal_new():
    """Create a new journal entry."""
    console.print("[yellow]Coming soon — Phase 3[/yellow]")


@journal.command("list")
def journal_list():
    """Show recent journal entries."""
    console.print("[yellow]Coming soon — Phase 3[/yellow]")


@journal.command("insights")
def journal_insights():
    """Run weekly summary via Claude."""
    console.print("[yellow]Coming soon — Phase 3[/yellow]")


@cli.command()
def skills():
    """Show skill inventory with gap visualization."""
    console.print("[yellow]Coming soon — Phase 3[/yellow]")


@cli.command()
def roadmap():
    """Generate study roadmap via Claude."""
    console.print("[yellow]Coming soon — Phase 3[/yellow]")


@cli.command()
def search():
    """Run job search profiles across Indeed and Dice."""
    console.print("[yellow]Coming soon — Phase 5[/yellow]")


@cli.group()
def tracker():
    """Manage job application pipeline."""
    pass


@tracker.command("show")
def tracker_show():
    """Show application pipeline (kanban view)."""
    console.print("[yellow]Coming soon — Phase 5[/yellow]")


@tracker.command("stats")
def tracker_stats():
    """Show search and application analytics."""
    console.print("[yellow]Coming soon — Phase 5[/yellow]")


@tracker.command("update")
@click.argument("job_id")
def tracker_update(job_id):
    """Update application status for a job."""
    console.print(f"[yellow]Coming soon — Phase 5 (job {job_id})[/yellow]")


@cli.group()
def interview():
    """Interview transcript analysis and coaching."""
    pass


@interview.command("analyze")
@click.argument("filepath")
def interview_analyze(filepath):
    """Analyze an interview transcript."""
    console.print(f"[yellow]Coming soon — Phase 4 ({filepath})[/yellow]")


@interview.command("mock")
def interview_mock():
    """Start an interactive mock interview session."""
    console.print("[yellow]Coming soon — Phase 4[/yellow]")


@interview.command("history")
def interview_history():
    """Show past interview analyses with trend summary."""
    console.print("[yellow]Coming soon — Phase 4[/yellow]")


if __name__ == "__main__":
    cli()
