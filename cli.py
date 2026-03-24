"""CareerPilot — Main CLI entry point."""

import logging
import sys

import click
from rich.console import Console
from rich.table import Table

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

console = Console()


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
    """Scan Gmail for recruiter emails and classify them."""
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

    # Category colors
    colors = {
        "recruiter_outreach": "green",
        "interview_request": "bright_green",
        "offer": "bright_cyan",
        "job_alert": "blue",
        "rejection": "red",
        "irrelevant": "dim",
    }

    table = Table(title=f"Gmail Scan Results ({len(results)} emails)")
    table.add_column("Category", style="bold")
    table.add_column("From")
    table.add_column("Subject")
    table.add_column("Company")
    table.add_column("Role")
    table.add_column("Urgency")
    table.add_column("Summary")

    for r in results:
        color = colors.get(r["category"], "white")
        table.add_row(
            f"[{color}]{r['category']}[/{color}]",
            r["sender"][:30],
            r["subject"][:40],
            r["company"],
            r["role"],
            r["urgency"],
            r["summary"][:50],
        )

    console.print(table)


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
