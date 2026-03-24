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
@click.option("--type", "entry_type", type=click.Choice(["daily", "interview", "study", "project", "reflection"]),
              prompt="Entry type", help="Type of journal entry.")
@click.option("--mood", default=None, help="Optional mood (e.g. focused, frustrated).")
@click.option("--time", "time_spent", default=None, type=int, help="Minutes spent.")
def journal_new(entry_type, mood, time_spent):
    """Create a new journal entry."""
    from src.journal.entries import JournalManager

    console.print("[dim]Enter your journal entry (press Enter twice to finish):[/dim]")
    lines = []
    while True:
        line = console.input("")
        if line == "" and lines and lines[-1] == "":
            lines.pop()  # remove trailing blank
            break
        lines.append(line)

    content = "\n".join(lines).strip()
    if not content:
        console.print("[yellow]Empty entry, cancelled.[/yellow]")
        return

    manager = JournalManager()
    filename = manager.create_entry(entry_type, content, mood=mood, time_spent=time_spent)
    console.print(f"[green]Entry saved: {filename}[/green]")


@journal.command("list")
@click.option("--days", default=30, help="Number of days to look back.")
@click.option("--type", "entry_type", default=None, help="Filter by entry type.")
def journal_list(days, entry_type):
    """Show recent journal entries."""
    from src.journal.entries import JournalManager

    manager = JournalManager()
    entries = manager.list_entries(days_back=days, entry_type=entry_type)

    if not entries:
        console.print("[yellow]No entries found.[/yellow]")
        return

    table = Table(title=f"Journal Entries ({len(entries)} found)")
    table.add_column("Date", style="bold")
    table.add_column("Type")
    table.add_column("Tags")
    table.add_column("Mood")
    table.add_column("File", style="dim")

    for e in entries:
        tags_str = ", ".join(e["tags"]) if e["tags"] else ""
        table.add_row(e["date"], e["type"], tags_str, str(e["mood"]), e["filename"])

    console.print(table)


@journal.command("show")
@click.argument("filename")
def journal_show(filename):
    """Display a specific journal entry."""
    from rich.markdown import Markdown
    from src.journal.entries import JournalManager

    manager = JournalManager()
    entry = manager.get_entry(filename)

    if not entry:
        console.print(f"[red]Entry not found: {filename}[/red]")
        return

    header = f"[bold]{entry.get('date', '?')}[/bold] ({entry.get('type', '?')})"
    if entry.get("tags"):
        header += f"  tags: {', '.join(entry['tags'])}"
    if entry.get("mood"):
        header += f"  mood: {entry['mood']}"

    console.print(header)
    console.print()
    console.print(Markdown(entry.get("content", "")))


@journal.command("insights")
def journal_insights():
    """Run weekly summary on last 7 days of entries."""
    from src.journal.entries import JournalManager
    from src.journal.insights import InsightsEngine

    manager = JournalManager()
    entries_meta = manager.list_entries(days_back=7)

    if not entries_meta:
        console.print("[yellow]No entries in the last 7 days.[/yellow]")
        return

    # Load full content for each entry
    entries = []
    for meta in entries_meta:
        full = manager.get_entry(meta["filename"])
        if full:
            entries.append(full)

    engine = InsightsEngine()

    console.print("[bold]Weekly Summary[/bold]")
    console.print()
    summary = engine.weekly_summary(entries)
    if summary:
        console.print(Panel(summary, title="Weekly Insights", border_style="cyan"))
    else:
        console.print("[red]Failed to generate summary.[/red]")

    console.print()
    momentum = engine.momentum_check(entries)
    status_colors = {"strong": "green", "steady": "blue", "slipping": "yellow", "stalled": "red"}
    color = status_colors.get(momentum["status"], "white")
    console.print(f"Momentum: [{color}]{momentum['status'].upper()}[/{color}]")
    if momentum["explanation"]:
        console.print(f"  {momentum['explanation']}")


@journal.command("search")
@click.argument("keyword")
def journal_search(keyword):
    """Search journal entries for a keyword."""
    from src.journal.entries import JournalManager

    manager = JournalManager()
    results = manager.search_entries(keyword)

    if not results:
        console.print(f"[yellow]No entries matching '{keyword}'.[/yellow]")
        return

    table = Table(title=f"Search: '{keyword}' ({len(results)} matches)")
    table.add_column("File", style="bold")
    table.add_column("Snippet")

    for r in results:
        table.add_row(r["filename"], r["snippet"])

    console.print(table)


@cli.group(invoke_without_command=True)
@click.pass_context
def skills(ctx):
    """Show skill inventory with gap visualization."""
    if ctx.invoked_subcommand is not None:
        return

    from src.skills.tracker import SkillTracker

    tracker = SkillTracker()
    tracker.seed_defaults()
    skill_data = tracker.display_skills()
    tracker.close()

    if not skill_data:
        console.print("[yellow]No skills found.[/yellow]")
        return

    table = Table(title="Skill Inventory")
    table.add_column("Skill", style="bold")
    table.add_column("Category")
    table.add_column("Level", justify="center")
    table.add_column("Target", justify="center")
    table.add_column("Gap", justify="center")
    table.add_column("Progress")
    table.add_column("Last Practiced", style="dim")

    for s in skill_data:
        gap = s["gap"]
        if gap == 0:
            gap_str = "[green]0[/green]"
        elif gap == 1:
            gap_str = f"[yellow]{gap}[/yellow]"
        else:
            gap_str = f"[red]{gap}[/red]"

        table.add_row(
            s["name"], s["category"],
            str(s["current_level"]), str(s["target_level"]),
            gap_str, s["bar"],
            s["last_practiced"][:10] if s["last_practiced"] else "",
        )

    console.print(table)


@skills.command("update")
@click.argument("name")
@click.argument("level", type=int)
def skills_update(name, level):
    """Update a skill level (1-5)."""
    from src.skills.tracker import SkillTracker

    if not 1 <= level <= 5:
        console.print("[red]Level must be between 1 and 5.[/red]")
        return

    tracker = SkillTracker()
    tracker.seed_defaults()
    if tracker.update_skill(name, level):
        console.print(f"[green]Updated '{name}' to level {level}.[/green]")
    else:
        console.print(f"[red]Skill '{name}' not found.[/red]")
    tracker.close()


@cli.command()
@click.option("--hours", default=15, help="Available study hours per week (default 15).")
def roadmap(hours):
    """Generate a study roadmap from skill gaps via Claude."""
    from src.skills.roadmap import RoadmapGenerator
    from src.skills.tracker import SkillTracker

    tracker = SkillTracker()
    tracker.seed_defaults()
    gaps = tracker.get_gaps()
    tracker.close()

    if not gaps:
        console.print("[green]No skill gaps! All skills at target level.[/green]")
        return

    console.print(f"[dim]Generating roadmap for {len(gaps)} skill gap(s) ({hours} hrs/week)...[/dim]")

    generator = RoadmapGenerator()
    roadmap_text = generator.generate_roadmap(gaps, available_hours_per_week=hours)

    if roadmap_text:
        console.print(Panel(roadmap_text, title="Study Roadmap", border_style="cyan"))
    else:
        console.print("[red]Failed to generate roadmap. Check logs.[/red]")


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
@click.option("--job-title", default=None, help="Job title for context.")
@click.option("--company", default=None, help="Company name for context.")
def interview_analyze(filepath, job_title, company):
    """Analyze an interview transcript."""
    from src.interviews.coach import InterviewCoach
    from src.interviews.transcripts import TranscriptLoader

    loader = TranscriptLoader()
    turns = loader.load_transcript(filepath)

    if not turns:
        console.print("[red]Failed to load transcript. Check file path and format.[/red]")
        return

    console.print(f"[dim]Loaded {len(turns)} speaker turns. Analyzing...[/dim]")

    coach = InterviewCoach()
    analysis = coach.analyze_interview(turns, job_title=job_title, company=company)

    if not analysis:
        console.print("[red]Analysis failed. Check logs.[/red]")
        coach.close()
        return

    # Display results
    _display_analysis(analysis)

    # Offer to save
    save = console.input("\nSave analysis and create journal entry? [bold][y][/bold]/[bold][n][/bold]: ").strip().lower()
    if save == "y":
        analysis_id = coach.save_analysis(filepath, analysis, company=company or "", role=job_title or "")

        # Auto-create journal entry
        from src.journal.entries import JournalManager
        manager = JournalManager()
        content = (
            f"## Interview Analysis\n\n"
            f"**File:** {filepath}\n"
            f"**Company:** {company or 'N/A'}\n"
            f"**Role:** {job_title or 'N/A'}\n"
            f"**Overall Score:** {analysis.get('overall_score', '?')}/10\n\n"
            f"### Technical Gaps\n"
            + "\n".join(f"- {g}" for g in analysis.get("technical_gaps", [])) + "\n\n"
            f"### Top Improvements\n"
            + "\n".join(f"- {imp}" for imp in analysis.get("top_improvements", []))
        )
        journal_file = manager.create_entry("interview", content, tags=["interview", "analysis"])
        console.print(f"[green]Analysis saved (id={analysis_id}). Journal entry: {journal_file}[/green]")

        # Cross-reference gaps with skill tracker
        _check_skill_gaps(analysis.get("technical_gaps", []))
    else:
        console.print("[dim]Analysis not saved.[/dim]")

    coach.close()


def _display_analysis(analysis):
    """Display interview analysis with Rich formatting."""
    from rich.markdown import Markdown

    # Questions & Responses
    if analysis.get("response_quality"):
        table = Table(title="Questions & Response Quality")
        table.add_column("#", style="dim", width=3)
        table.add_column("Question")
        table.add_column("Rating", justify="center", width=8)
        table.add_column("Summary")

        for i, rq in enumerate(analysis["response_quality"], 1):
            rating = rq.get("rating", 0)
            if rating >= 4:
                rating_str = f"[green]{rating}/5[/green]"
            elif rating == 3:
                rating_str = f"[yellow]{rating}/5[/yellow]"
            else:
                rating_str = f"[red]{rating}/5[/red]"

            table.add_row(
                str(i),
                str(rq.get("question", ""))[:60],
                rating_str,
                str(rq.get("summary", ""))[:50],
            )

        console.print(table)
        console.print()

        # Detailed strengths/weaknesses for each
        for i, rq in enumerate(analysis["response_quality"], 1):
            rating = rq.get("rating", 0)
            if rating >= 4:
                border = "green"
            elif rating == 3:
                border = "yellow"
            else:
                border = "red"
            detail = (
                f"**Strengths:** {rq.get('strengths', 'N/A')}\n\n"
                f"**Weaknesses:** {rq.get('weaknesses', 'N/A')}"
            )
            console.print(Panel(
                Markdown(detail),
                title=f"Q{i}: {str(rq.get('question', ''))[:50]}",
                border_style=border,
            ))

    # Overall score
    score = analysis.get("overall_score", 0)
    if score >= 7:
        score_color = "green"
    elif score >= 5:
        score_color = "yellow"
    else:
        score_color = "red"
    console.print(f"\n[bold]Overall Score:[/bold] [{score_color}]{score}/10[/{score_color}]")
    console.print(f"  {analysis.get('overall_justification', '')}")

    # Behavioral assessment
    behavioral = analysis.get("behavioral_assessment", {})
    if behavioral:
        console.print()
        console.print(Panel(
            "\n".join(f"**{k.replace('_', ' ').title()}:** {v}" for k, v in behavioral.items()),
            title="Behavioral Assessment",
            border_style="blue",
        ))

    # Technical gaps
    gaps = analysis.get("technical_gaps", [])
    if gaps:
        console.print()
        console.print(Panel(
            "\n".join(f"- {g}" for g in gaps),
            title="Technical Gaps",
            border_style="red",
        ))

    # Top improvements
    improvements = analysis.get("top_improvements", [])
    if improvements:
        console.print()
        console.print(Panel(
            "\n".join(f"{i+1}. {imp}" for i, imp in enumerate(improvements)),
            title="Top Improvements",
            border_style="yellow",
        ))

    # Practice questions
    questions = analysis.get("practice_questions", [])
    if questions:
        console.print()
        console.print(Panel(
            "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions)),
            title="Practice Questions",
            border_style="cyan",
        ))


def _check_skill_gaps(technical_gaps):
    """Cross-reference technical gaps with skill tracker."""
    if not technical_gaps:
        return

    from src.skills.tracker import SkillTracker

    tracker = SkillTracker()
    tracker.seed_defaults()
    all_skills = tracker.get_all_skills()
    tracker.close()

    skill_names = {s["name"].lower(): s for s in all_skills}
    flagged = []
    for gap in technical_gaps:
        gap_lower = gap.lower()
        for name, skill in skill_names.items():
            if name in gap_lower or gap_lower in name:
                flagged.append((gap, skill))
                break

    if flagged:
        console.print()
        console.print("[bold]Skill Tracker Matches:[/bold]")
        for gap_text, skill in flagged:
            console.print(
                f"  [yellow]>[/yellow] '{gap_text}' matches tracked skill "
                f"'{skill['name']}' (level {skill['current_level']}/{skill['target_level']})"
            )


@interview.command("mock")
@click.option("--questions", "num_questions", default=5, help="Number of questions (default 5).")
def interview_mock(num_questions):
    """Start an interactive mock interview session."""
    from rich.markdown import Markdown

    from src.interviews.coach import InterviewCoach

    console.print(Panel(
        "Describe the target role for your mock interview.\n"
        "Include: job title, technologies, responsibilities.",
        title="Mock Interview Setup",
        border_style="cyan",
    ))

    role_desc = console.input("\nRole description: ").strip()
    if not role_desc:
        console.print("[yellow]No role description provided, cancelled.[/yellow]")
        return

    console.print(f"\n[bold]Starting mock interview ({num_questions} questions)...[/bold]")
    console.print("[dim]Answer each question as you would in a real interview.[/dim]\n")

    coach = InterviewCoach()

    def rich_output(text):
        console.print(text)

    def rich_input(prompt):
        return console.input(f"[bold]{prompt}[/bold]")

    assessment = coach.mock_interview(
        role_description=role_desc,
        num_questions=num_questions,
        input_fn=rich_input,
        output_fn=rich_output,
    )
    coach.close()

    if not assessment:
        console.print("[red]Mock interview failed. Check logs.[/red]")
        return

    # Display final assessment
    console.print("\n")
    console.rule("[bold]Final Assessment[/bold]")

    score = assessment.get("overall_score", 0)
    if score >= 7:
        score_color = "green"
    elif score >= 5:
        score_color = "yellow"
    else:
        score_color = "red"

    console.print(f"\n[bold]Overall Score:[/bold] [{score_color}]{score}/10[/{score_color}]")
    console.print(f"  {assessment.get('overall_justification', '')}")

    gaps = assessment.get("technical_gaps", [])
    if gaps:
        console.print(Panel(
            "\n".join(f"- {g}" for g in gaps),
            title="Technical Gaps",
            border_style="red",
        ))

    improvements = assessment.get("top_improvements", [])
    if improvements:
        console.print(Panel(
            "\n".join(f"{i+1}. {imp}" for i, imp in enumerate(improvements)),
            title="Top Improvements",
            border_style="yellow",
        ))

    practice = assessment.get("practice_questions", [])
    if practice:
        console.print(Panel(
            "\n".join(f"{i+1}. {q}" for i, q in enumerate(practice)),
            title="Follow-up Practice Questions",
            border_style="cyan",
        ))

    # Offer to save
    save = console.input("\nSave mock interview as journal entry? [bold][y][/bold]/[bold][n][/bold]: ").strip().lower()
    if save == "y":
        from src.journal.entries import JournalManager

        qa_text = "\n\n".join(
            f"**Q{i+1}:** {qa['question']}\n"
            f"**A:** {qa['answer']}\n"
            f"**Rating:** {qa['evaluation'].get('rating', '?')}/5"
            for i, qa in enumerate(assessment.get("qa_pairs", []))
        )
        content = (
            f"## Mock Interview\n\n"
            f"**Role:** {role_desc}\n"
            f"**Score:** {score}/10\n\n"
            f"### Q&A\n\n{qa_text}\n\n"
            f"### Technical Gaps\n"
            + "\n".join(f"- {g}" for g in gaps) + "\n\n"
            f"### Improvements\n"
            + "\n".join(f"- {imp}" for imp in improvements)
        )
        manager = JournalManager()
        filename = manager.create_entry("interview", content, tags=["mock-interview"])
        console.print(f"[green]Saved journal entry: {filename}[/green]")

        _check_skill_gaps(gaps)
    else:
        console.print("[dim]Not saved.[/dim]")


@interview.command("history")
def interview_history():
    """Show past interview analyses with scores and gaps."""
    from src.interviews.coach import InterviewCoach

    coach = InterviewCoach()
    analyses = coach.get_all_analyses()
    coach.close()

    if not analyses:
        console.print("[yellow]No interview analyses found. Run 'interview analyze' first.[/yellow]")
        return

    table = Table(title=f"Interview History ({len(analyses)} analyses)")
    table.add_column("ID", style="dim", width=4)
    table.add_column("Date", width=12)
    table.add_column("Company")
    table.add_column("Role")
    table.add_column("Score", justify="center", width=7)
    table.add_column("Top Gaps")

    for a in analyses:
        analysis = a.get("analysis", {})
        score = analysis.get("overall_score", 0)
        if score >= 7:
            score_str = f"[green]{score}/10[/green]"
        elif score >= 5:
            score_str = f"[yellow]{score}/10[/yellow]"
        else:
            score_str = f"[red]{score}/10[/red]"

        gaps = ", ".join(analysis.get("technical_gaps", [])[:3])

        table.add_row(
            str(a.get("id", "")),
            str(a.get("analyzed_at", ""))[:10],
            a.get("company", "") or "-",
            a.get("role", "") or "-",
            score_str,
            gaps[:50] if gaps else "-",
        )

    console.print(table)


@interview.command("compare")
def interview_compare():
    """Compare all stored analyses to identify trends."""
    from src.interviews.coach import InterviewCoach

    coach = InterviewCoach()
    analyses = coach.get_all_analyses()

    if len(analyses) < 2:
        console.print(f"[yellow]Need at least 2 analyses to compare (found {len(analyses)}). "
                       "Run more 'interview analyze' sessions first.[/yellow]")
        coach.close()
        return

    console.print(f"[dim]Comparing {len(analyses)} analyses...[/dim]")
    comparison = coach.compare_interviews(analyses)
    coach.close()

    if not comparison:
        console.print("[red]Comparison failed. Check logs.[/red]")
        return

    # Trajectory
    trajectory = comparison.get("trajectory", "unknown")
    traj_colors = {"improving": "green", "plateauing": "yellow", "declining": "red"}
    traj_color = traj_colors.get(trajectory, "white")
    console.print(f"\n[bold]Trajectory:[/bold] [{traj_color}]{trajectory.upper()}[/{traj_color}]")
    console.print(f"  {comparison.get('trajectory_explanation', '')}")

    # Recurring weak topics
    weak = comparison.get("recurring_weak_topics", [])
    if weak:
        console.print(Panel(
            "\n".join(f"- {w}" for w in weak),
            title="Recurring Weak Topics",
            border_style="red",
        ))

    # Improved skills
    improved = comparison.get("improved_skills", [])
    if improved:
        console.print(Panel(
            "\n".join(f"- {s}" for s in improved),
            title="Improved Skills",
            border_style="green",
        ))

    # Persistent gaps
    persistent = comparison.get("persistent_gaps", [])
    if persistent:
        console.print(Panel(
            "\n".join(f"- {g}" for g in persistent),
            title="Persistent Gaps (Need Focused Study)",
            border_style="yellow",
        ))

    # Recommendations
    recs = comparison.get("recommendations", [])
    if recs:
        console.print(Panel(
            "\n".join(f"{i+1}. {r}" for i, r in enumerate(recs)),
            title="Recommendations",
            border_style="cyan",
        ))


if __name__ == "__main__":
    cli()
