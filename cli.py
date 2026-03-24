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

    # Try to set up calendar for availability (non-blocking)
    cal_scheduler = None
    try:
        from src.calendar.scheduler import CalendarScheduler
        cal_scheduler = CalendarScheduler()
        cal_scheduler.authenticate()
        console.print("[dim]Calendar connected — availability will be included in responses.[/dim]")
    except Exception:
        console.print("[dim]Calendar not available — using placeholder times in responses.[/dim]")
        cal_scheduler = None

    console.print(
        f"\n[bold]{len(actionable)} actionable email(s) found.[/bold] "
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

        # Pull availability for interested mode
        availability_text = None
        avail_slots = []
        if mode == "interested" and cal_scheduler:
            try:
                avail_slots = cal_scheduler.get_availability(days_ahead=5)
                if avail_slots:
                    availability_text = cal_scheduler.format_slots(avail_slots, max_slots=3)
                    console.print(f"  [cyan]Available slots: {availability_text}[/cyan]")
                else:
                    console.print("  [yellow]No open slots found in the next 5 days.[/yellow]")
            except Exception:
                console.print("  [dim]Could not fetch availability.[/dim]")

        _handle_draft_flow(
            responder, email_data, mode, r["message_id"],
            availability_text=availability_text,
            cal_scheduler=cal_scheduler,
            company=r.get("company", ""),
        )
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


def _handle_draft_flow(responder, email_data, mode, message_id,
                       availability_text=None, cal_scheduler=None, company=""):
    """Generate a draft, show it, and let user approve/edit/cancel."""
    draft_text = responder.draft_response(
        email_data, mode=mode, availability_text=availability_text,
    )

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

            # Offer calendar hold for interested responses
            if mode == "interested" and cal_scheduler:
                _offer_calendar_hold(cal_scheduler, company)

            return

        elif choice == "e":
            feedback = console.input("What should be different? ")
            augmented = dict(email_data)
            augmented["body"] = (
                email_data.get("body", "") +
                f"\n\n--- USER FEEDBACK ON PREVIOUS DRAFT ---\n"
                f"Previous draft:\n{draft_text}\n\n"
                f"Requested changes: {feedback}"
            )
            draft_text = responder.draft_response(
                augmented, mode=mode, availability_text=availability_text,
            )
            if not draft_text:
                console.print("[red]Failed to re-generate draft. Check logs.[/red]")
                return

        elif choice == "c":
            console.print("[yellow]Draft cancelled.[/yellow]")
            return

        else:
            console.print("[red]Invalid choice. Enter a, e, or c.[/red]")


def _offer_calendar_hold(cal_scheduler, company=""):
    """After approving an interested draft, offer to create calendar holds."""
    hold_choice = console.input(
        "Create calendar hold for suggested times? [bold][y][/bold]/[bold][n][/bold]: "
    ).strip().lower()

    if hold_choice != "y":
        return

    try:
        slots = cal_scheduler.get_availability(days_ahead=5)
        if not slots:
            console.print("[yellow]No available slots to hold.[/yellow]")
            return

        title = f"Interview — {company}" if company else "Interview Hold"
        # Create holds for up to 3 slots
        for slot in slots[:3]:
            event_id = cal_scheduler.create_hold(title, slot)
            if event_id:
                console.print(
                    f"  [green]Hold created: {slot.strftime('%A %B %#d at %#I:%M %p %Z')}[/green]"
                )
            else:
                console.print(
                    f"  [red]Failed to create hold for {slot.strftime('%A %B %#d')}[/red]"
                )
    except Exception:
        console.print("[red]Failed to create calendar holds. Check logs.[/red]")


@cli.command()
@click.option("--days", default=5, help="Number of days to look ahead (default 5).")
def calendar(days):
    """Show Google Calendar availability for the next 5 days."""
    from src.calendar.scheduler import CalendarScheduler

    scheduler = CalendarScheduler()
    try:
        scheduler.authenticate()
    except FileNotFoundError as e:
        console.print(f"[red]{e}[/red]")
        return
    except Exception:
        console.print("[red]Calendar authentication failed. Check logs for details.[/red]")
        return

    # Show existing events
    events = scheduler.get_events(days_ahead=days)
    if events:
        events_table = Table(title=f"Calendar Events (next {days} days)")
        events_table.add_column("Event", style="bold")
        events_table.add_column("Start")
        events_table.add_column("End")
        events_table.add_column("Status")

        for evt in events:
            status_color = "green" if evt["status"] == "tentative" else "white"
            events_table.add_row(
                evt["title"],
                evt["start"],
                evt["end"],
                f"[{status_color}]{evt['status']}[/{status_color}]",
            )
        console.print(events_table)
        console.print()

    # Show available slots
    slots = scheduler.get_availability(days_ahead=days)
    if slots:
        avail_table = Table(title=f"Available Interview Slots (next {days} days)")
        avail_table.add_column("Day", style="bold")
        avail_table.add_column("Time")
        avail_table.add_column("Status", style="green")

        for slot in slots:
            avail_table.add_row(
                slot.strftime("%A %B %#d"),
                slot.strftime("%#I:%M %p %Z"),
                "open",
            )
        console.print(avail_table)
        console.print(f"\n[dim]Formatted: {scheduler.format_slots(slots, max_slots=5)}[/dim]")
    else:
        console.print("[yellow]No available slots found in the next {days} days.[/yellow]")


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
