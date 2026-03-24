"""CareerPilot — Main CLI entry point."""

import sys

import click
from rich.console import Console

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

console = Console()


@click.group()
def cli():
    """CareerPilot — Personal career management platform."""
    pass


@cli.command()
def scan():
    """Scan Gmail for recruiter emails and draft responses."""
    console.print("[yellow]Coming soon — Phase 1[/yellow]")


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
