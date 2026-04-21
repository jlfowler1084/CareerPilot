# CAR-157 `tracker add` Interactive Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tracker add` CLI subcommand that lets a user log a job application found out-of-band (LinkedIn, referral, company careers page) via either an interactive Rich-prompt wizard or one-shot flags.

**Architecture:** Thin CLI command in `cli.py` calling existing `ApplicationTracker.save_job()` with `source="manual"`. One new domain-layer helper (`find_by_url`) supports URL-only duplicate detection. One tiny backward-compatible extension to `save_job()` lets it honor a `notes` field that was previously hard-coded to `''`.

**Tech Stack:** Python 3.8+, Click (CLI framework), Rich (prompts / console output), SQLite via `src/jobs/tracker.py` helpers, pytest + `click.testing.CliRunner` for tests.

**Spec:** [docs/superpowers/specs/2026-04-20-car-157-tracker-add-wizard-design.md](../specs/2026-04-20-car-157-tracker-add-wizard-design.md)

---

## File-change summary

| Path | Change |
|---|---|
| `src/jobs/tracker.py` | Add `find_by_url()` method; extend `save_job()` INSERT to persist `notes` from `job_data` (backward compatible — default `""`) |
| `cli.py` | Add `tracker_add` Click command and `_run_tracker_add_wizard()` helper |
| `tests/test_tracker.py` | Add `TestFindByUrl` class (3 tests) + `TestSaveJobNotes` test |
| `tests/test_cli_tracker_add.py` | New file, full CLI test suite (~14 tests) |

Net LOC: ~430 added, 1 changed. No schema migration.

---

## Task 0: Create worktree for implementation

Multi-file feature work on `feature/dashboard-v2`; per `CLAUDE.md` this must happen in a git worktree, not the main tree.

**Files:** none yet.

- [ ] **Step 1: Verify current branch and clean status**

Run: `git status && git branch --show-current`
Expected: clean tree, branch `feature/dashboard-v2`. Staged spec commit (`6174a0a`) already present.

- [ ] **Step 2: Verify `.worktrees/` is gitignored**

Run: `grep -n "^\.worktrees" .gitignore`
Expected: a line like `.worktrees/` in output. If missing, **stop** and ask user before creating a worktree.

- [ ] **Step 3: Create worktree and branch**

Run:
```bash
git worktree add .worktrees/CAR-157 -b feature/CAR-157-tracker-add-wizard feature/dashboard-v2
```
Expected: `Preparing worktree (new branch 'feature/CAR-157-tracker-add-wizard')` and `HEAD is now at 6174a0a docs(CAR-157): ...`.

- [ ] **Step 4: Switch cwd to worktree for remaining tasks**

All subsequent tasks run from `f:/Projects/CareerPilot/.worktrees/CAR-157/`. Verify: `pwd` and `git branch --show-current`.
Expected branch: `feature/CAR-157-tracker-add-wizard`.

---

## Task 1: Add `ApplicationTracker.find_by_url()` with unit tests

Domain-layer helper for duplicate detection. TDD: tests first, then ~15-line implementation.

**Files:**
- Modify: `src/jobs/tracker.py` (add method after `find_application_by_message_id` around line 82)
- Test: `tests/test_tracker.py` (append new test class)

- [ ] **Step 1: Add failing `TestFindByUrl` class to `tests/test_tracker.py`**

Append at end of file:
```python
class TestFindByUrl:
    def test_returns_row_when_url_matches(self, tracker):
        """find_by_url returns the matching row as a dict."""
        app_id = tracker.save_job(_sample_job(url="https://acme.com/job/123"))
        result = tracker.find_by_url("https://acme.com/job/123")
        assert result is not None
        assert result["id"] == app_id
        assert result["url"] == "https://acme.com/job/123"

    def test_returns_none_when_empty_url(self, tracker):
        """Empty or whitespace-only URLs short-circuit to None."""
        tracker.save_job(_sample_job(url=""))
        assert tracker.find_by_url("") is None
        assert tracker.find_by_url("   ") is None
        assert tracker.find_by_url(None) is None

    def test_returns_none_when_no_match(self, tracker):
        """Non-matching URL returns None, doesn't match on other columns."""
        tracker.save_job(_sample_job(url="https://example.com/a"))
        assert tracker.find_by_url("https://example.com/b") is None

    def test_trims_whitespace_on_lookup(self, tracker):
        """Leading/trailing whitespace on the lookup value is trimmed before matching."""
        tracker.save_job(_sample_job(url="https://acme.com/job/1"))
        result = tracker.find_by_url("  https://acme.com/job/1  ")
        assert result is not None
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `python -m pytest tests/test_tracker.py::TestFindByUrl -v`
Expected: all 4 tests FAIL with `AttributeError: 'ApplicationTracker' object has no attribute 'find_by_url'`.

- [ ] **Step 3: Implement `find_by_url()` in `src/jobs/tracker.py`**

Insert after the closing of `find_application_by_message_id` (currently ends at line 81, right before `def update_status`):

```python
    def find_by_url(self, url: str) -> Optional[Dict]:
        """Find an application by URL. Returns the first match or None.

        Used for duplicate detection in manual-entry flows. Empty or
        whitespace-only URLs return None without querying.
        """
        if not url or not str(url).strip():
            return None
        row = self._conn.execute(
            "SELECT * FROM applications WHERE url = ? LIMIT 1",
            (str(url).strip(),),
        ).fetchone()
        return dict(row) if row else None
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `python -m pytest tests/test_tracker.py::TestFindByUrl -v`
Expected: 4 PASSED.

- [ ] **Step 5: Run full tracker test suite for regression**

Run: `python -m pytest tests/test_tracker.py -v`
Expected: all pre-existing tests still PASS, plus the 4 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/tracker.py tests/test_tracker.py
git commit -m "$(cat <<'EOF'
feat(CAR-157): add ApplicationTracker.find_by_url for duplicate detection

Small domain-layer helper used by the upcoming `tracker add` CLI command
to warn users about likely duplicate applications when an existing row
already has the same URL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `save_job()` to persist `notes`

`save_job()` currently hard-codes `notes = ''` in its INSERT. `tracker add --notes "..."` must persist notes, so extend `save_job()` to honor `job_data.get("notes", "")`. Backward compatible: existing callers (`search`, `import-from-email`) don't pass notes, so they still get `""`.

**Files:**
- Modify: `src/jobs/tracker.py` (change lines 48-66)
- Test: `tests/test_tracker.py` (append a test)

- [ ] **Step 1: Add failing test**

Append to `tests/test_tracker.py`:
```python
class TestSaveJobNotes:
    def test_notes_from_job_data_persisted(self, tracker):
        """save_job honors notes from job_data and persists to DB."""
        app_id = tracker.save_job(_sample_job(notes="Referred by Jane"))
        row = tracker.get_job(app_id)
        assert row["notes"] == "Referred by Jane"

    def test_notes_default_empty_when_not_provided(self, tracker):
        """save_job defaults notes to empty string if absent from job_data (backward compat)."""
        app_id = tracker.save_job(_sample_job())
        row = tracker.get_job(app_id)
        assert row["notes"] == ""
```

- [ ] **Step 2: Run — verify first test fails, second passes**

Run: `python -m pytest tests/test_tracker.py::TestSaveJobNotes -v`
Expected: `test_notes_from_job_data_persisted` FAILS (asserts `"Referred by Jane"` but gets `""`). `test_notes_default_empty_when_not_provided` PASSES.

- [ ] **Step 3: Modify `save_job()` INSERT to include notes parameter**

In `src/jobs/tracker.py`, replace the current `self._conn.execute(...)` call in `save_job` (lines 48-66) with:

```python
        cursor = self._conn.execute(
            "INSERT INTO applications "
            "(title, company, location, url, source, salary_range, status, date_found, "
            "notes, profile_id, description, message_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                job_data.get("title", ""),
                job_data.get("company", ""),
                job_data.get("location", ""),
                job_data.get("url", ""),
                job_data.get("source", ""),
                job_data.get("salary", job_data.get("salary_range", "")),
                status,
                now,
                job_data.get("notes", ""),
                job_data.get("profile_id", ""),
                job_data.get("description"),
                job_data.get("message_id", ""),
            ),
        )
```

Only two changes: the 9th `?` replaces `''`, and `job_data.get("notes", "")` is added at the matching position in the params tuple.

- [ ] **Step 4: Run — verify both tests pass**

Run: `python -m pytest tests/test_tracker.py::TestSaveJobNotes -v`
Expected: 2 PASSED.

- [ ] **Step 5: Run full tracker test suite for regression**

Run: `python -m pytest tests/test_tracker.py -v`
Expected: all tests PASS. No previously-passing test breaks — default of `""` preserves old behavior.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/tracker.py tests/test_tracker.py
git commit -m "$(cat <<'EOF'
refactor(CAR-157): let save_job persist notes from job_data

save_job previously hard-coded notes='' in the INSERT. The upcoming
`tracker add --notes` flag needs to persist user-provided notes.
Backward-compatible: existing callers (search, import-from-email)
don't pass notes, so they continue to get the empty default.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Register `tracker add` command skeleton

Smallest possible Click command that exists in `--help` output. Subsequent tasks fill in behavior.

**Files:**
- Modify: `cli.py` (add command near `tracker_import_from_email` around line 1575)
- Create: `tests/test_cli_tracker_add.py`

- [ ] **Step 1: Create `tests/test_cli_tracker_add.py` with a help-registration test**

Write new file `tests/test_cli_tracker_add.py`:
```python
"""Tests for the `tracker add` CLI command (CAR-157)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from click.testing import CliRunner

from cli import cli
from src.db import models
from src.jobs.tracker import ApplicationTracker


@pytest.fixture
def cli_db(tmp_path, monkeypatch):
    """Point settings.DB_PATH at a temp DB so CLI commands write there."""
    db_path = tmp_path / "cli_test.db"
    monkeypatch.setattr(models.settings, "DB_PATH", db_path)
    # Pre-create schema so direct assertions can open the DB
    c = models.get_connection(db_path)
    c.close()
    return db_path


class TestCommandRegistration:
    def test_appears_in_tracker_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "--help"])
        assert result.exit_code == 0
        assert "add" in result.output

    def test_add_help_lists_flags(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add", "--help"])
        assert result.exit_code == 0
        for flag in ("--title", "--company", "--location", "--url",
                     "--description", "--status", "--notes"):
            assert flag in result.output
```

- [ ] **Step 2: Run — verify failure**

Run: `python -m pytest tests/test_cli_tracker_add.py -v`
Expected: both tests FAIL — `--help` does not yet contain an `add` command.

- [ ] **Step 3: Add command stub to `cli.py`**

Insert immediately before the `tracker_import_from_email` registration (around line 1575), add:

```python
@tracker.command("add")
@click.option("--title", default=None, help="Job title.")
@click.option("--company", default=None, help="Company name.")
@click.option("--location", default="", help="Job location.")
@click.option("--url", default="", help="Job posting URL.")
@click.option("--description", default="", help="Job description text.")
@click.option(
    "--status",
    type=click.Choice(sorted([
        "found", "interested", "applied", "phone_screen",
        "interview", "offer", "rejected", "withdrawn", "ghosted",
    ])),
    default="interested",
    show_default=True,
    help="Initial application status.",
)
@click.option("--notes", default="", help="Free-form notes.")
def tracker_add(title, company, location, url, description, status, notes):
    """Add a job application manually via wizard or flags."""
    raise click.ClickException("Not yet implemented (CAR-157 in progress)")
```

Note: the `click.Choice` list is spelled out literally (not `sorted(VALID_STATUSES)`) because Click decorators evaluate at import time and we don't want to introduce a runtime import order dependency on `src.jobs.tracker` at the `cli.py` module level. This matches the style at [cli.py:1579](cli.py#L1579) for `import-from-email`.

- [ ] **Step 4: Run — verify registration tests pass, command itself still errors**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestCommandRegistration -v`
Expected: 2 PASSED.

Smoke:
```bash
python cli.py tracker add --help
```
Expected: Click's auto-generated help showing all 7 options and the summary line "Add a job application manually via wizard or flags."

- [ ] **Step 5: Commit**

```bash
git add cli.py tests/test_cli_tracker_add.py
git commit -m "$(cat <<'EOF'
feat(CAR-157): register tracker add command stub

Command appears in `tracker --help` and accepts all the flags described
in the spec. Body raises NotImplementedError — behavior lands in the
next commits (non-interactive path, wizard, dupe check, no-TTY gate).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement non-interactive path (both required flags present)

Replace the stub body so that when `--title` and `--company` are both supplied, a row is inserted with `source="manual"` — no prompts.

**Files:**
- Modify: `cli.py` (replace the stub body of `tracker_add`)
- Test: `tests/test_cli_tracker_add.py` (new `TestNonInteractivePath` class)

- [ ] **Step 1: Append non-interactive tests**

Append to `tests/test_cli_tracker_add.py`:
```python
class TestNonInteractivePath:
    def test_creates_row_with_required_flags_only(self, cli_db):
        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "Platform Engineer",
            "--company", "Acme",
        ])
        assert result.exit_code == 0, result.output
        assert "Created application" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 1
            assert jobs[0]["title"] == "Platform Engineer"
            assert jobs[0]["company"] == "Acme"
            assert jobs[0]["source"] == "manual"
            assert jobs[0]["status"] == "interested"
        finally:
            t.close()

    def test_all_flags_persist_to_db(self, cli_db):
        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "Senior SRE",
            "--company", "Beta Inc",
            "--location", "Indianapolis, IN",
            "--url", "https://beta.com/jobs/42",
            "--description", "Full job description text.",
            "--status", "applied",
            "--notes", "Applied via recruiter email",
        ])
        assert result.exit_code == 0, result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 1
            j = jobs[0]
            assert j["title"] == "Senior SRE"
            assert j["company"] == "Beta Inc"
            assert j["location"] == "Indianapolis, IN"
            assert j["url"] == "https://beta.com/jobs/42"
            assert j["description"] == "Full job description text."
            assert j["status"] == "applied"
            assert j["notes"] == "Applied via recruiter email"
            assert j["source"] == "manual"
        finally:
            t.close()

    def test_source_is_manual(self, cli_db):
        """Regardless of other flags, source is always 'manual' for this command."""
        runner = CliRunner()
        runner.invoke(cli, ["tracker", "add", "--title", "X", "--company", "Y"])

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert t.get_all_jobs()[0]["source"] == "manual"
        finally:
            t.close()

    def test_default_status_is_interested(self, cli_db):
        runner = CliRunner()
        runner.invoke(cli, ["tracker", "add", "--title", "X", "--company", "Y"])

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert t.get_all_jobs()[0]["status"] == "interested"
        finally:
            t.close()

    def test_invalid_status_rejected(self, cli_db):
        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "X", "--company", "Y",
            "--status", "not_a_real_status",
        ])
        assert result.exit_code != 0
        # Click's Choice error lists valid options
        assert "not_a_real_status" in result.output or "Invalid value" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert len(t.get_all_jobs()) == 0
        finally:
            t.close()
```

- [ ] **Step 2: Run — verify tests fail (stub still raises)**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestNonInteractivePath -v`
Expected: happy-path tests FAIL with "Not yet implemented". `test_invalid_status_rejected` PASSES (Click rejects before the stub runs).

- [ ] **Step 3: Replace the stub body in `cli.py`**

Replace the `raise click.ClickException(...)` line in `tracker_add` with:

```python
    import sys

    from src.jobs.tracker import ApplicationTracker

    # Non-interactive path: both required flags present
    if title and company:
        fields = {
            "title": title.strip(),
            "company": company.strip(),
            "location": location,
            "url": url,
            "description": description,
            "status": status,
            "notes": notes,
        }
    else:
        # Stubs for Task 5 (no-TTY gate) and Task 6 (wizard). Fail loudly for now.
        raise click.ClickException("Wizard path not yet implemented")

    t = ApplicationTracker()
    try:
        app_id = t.save_job(
            {
                "title": fields["title"],
                "company": fields["company"],
                "location": fields["location"],
                "url": fields["url"],
                "description": fields["description"] or None,
                "source": "manual",
                "notes": fields["notes"],
            },
            status=fields["status"],
        )
        console.print(
            f"[green]Created application #{app_id}: {fields['title']} @ "
            f"{fields['company']} [status={fields['status']}][/green]"
        )
    finally:
        t.close()
```

Note the `description or None` — `save_job` treats `None` as "unset" for the `description` column; this matches how `import-from-email` calls it at [cli.py:1635](cli.py#L1635).

- [ ] **Step 4: Run — verify all 5 non-interactive tests pass**

Run: `python -m pytest tests/test_cli_tracker_add.py -v`
Expected: `TestCommandRegistration` (2) + `TestNonInteractivePath` (5) = 7 PASSED.

- [ ] **Step 5: Commit**

```bash
git add cli.py tests/test_cli_tracker_add.py
git commit -m "$(cat <<'EOF'
feat(CAR-157): implement tracker add non-interactive path

When both --title and --company are provided, tracker add writes the row
directly with source=manual and no prompts. Wizard path still raises —
next commit adds it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement no-TTY gate

If required flags are missing **and** stdin is not a TTY, exit with code 2 and a clear error — don't hang waiting for a prompt that will never arrive.

**Files:**
- Modify: `cli.py` (extend the `else` branch of the required-flags check)
- Test: `tests/test_cli_tracker_add.py` (new `TestNoTTY` class)

- [ ] **Step 1: Append no-TTY test**

Append to `tests/test_cli_tracker_add.py`:
```python
class TestNoTTY:
    def test_exits_code_2_when_required_missing_and_not_a_tty(
        self, cli_db, monkeypatch,
    ):
        """Missing required flags + no TTY => exit code 2 with clear message."""
        monkeypatch.setattr("sys.stdin.isatty", lambda: False)
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add"])
        assert result.exit_code == 2
        assert "--title" in result.output and "--company" in result.output
        assert "interactively" in result.output.lower()

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert len(t.get_all_jobs()) == 0
        finally:
            t.close()
```

- [ ] **Step 2: Run — verify test fails**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestNoTTY -v`
Expected: FAIL — current stub raises `ClickException` (exit code 1, not 2) or similar.

- [ ] **Step 3: Replace the wizard-stub branch**

In `cli.py`, replace the `else: raise click.ClickException("Wizard path not yet implemented")` branch with:

```python
    else:
        if not sys.stdin.isatty():
            console.print(
                "[red]Error: --title and --company are required "
                "when not running interactively.[/red]"
            )
            sys.exit(2)
        # Wizard path stub for Task 6.
        raise click.ClickException("Wizard path not yet implemented")
```

- [ ] **Step 4: Run — verify test passes**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestNoTTY -v`
Expected: PASS.

Full suite check:
Run: `python -m pytest tests/test_cli_tracker_add.py -v`
Expected: 8 PASSED.

- [ ] **Step 5: Commit**

```bash
git add cli.py tests/test_cli_tracker_add.py
git commit -m "$(cat <<'EOF'
feat(CAR-157): no-TTY gate on tracker add

Missing required flags combined with a non-TTY stdin now exits with
code 2 and a clear message — avoids hanging on a prompt that will
never receive input (scripts, CI, piped invocations).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Implement wizard happy path

Add the `_run_tracker_add_wizard()` helper and wire it into the wizard branch. Covers: prompt missing fields, collect optional fields, skip editor by default, final confirm, write row.

**Files:**
- Modify: `cli.py` (add wizard helper function; wire it into `tracker_add`)
- Test: `tests/test_cli_tracker_add.py` (new `TestInteractivePath` class)

- [ ] **Step 1: Append wizard happy-path tests**

Append to `tests/test_cli_tracker_add.py`:
```python
class TestInteractivePath:
    def test_wizard_prompts_when_title_missing(self, cli_db, monkeypatch):
        """No required flags => wizard runs (verified by the fact that empty stdin fails)."""
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)
        runner = CliRunner()
        # Empty input — wizard will try to read, fail with EOF on the first Prompt.ask
        result = runner.invoke(cli, ["tracker", "add"], input="")
        # Non-zero exit — the wizard attempted to prompt. Test is about
        # routing to the wizard, not successful completion.
        assert result.exit_code != 0

    def test_wizard_creates_row_on_confirm(self, cli_db, monkeypatch):
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)
        # Answers in order: title, company, location, url,
        # open editor? (N), status, notes, final confirm (Y)
        answers = "\n".join([
            "Platform Engineer",           # title
            "Acme Corp",                   # company
            "Indianapolis, IN",            # location
            "https://acme.com/job/1",      # url
            "n",                           # open editor for description?
            "interested",                  # status
            "Heard about it from Mike",    # notes
            "y",                           # final confirm
        ]) + "\n"
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add"], input=answers)
        assert result.exit_code == 0, result.output
        assert "Created application" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 1
            j = jobs[0]
            assert j["title"] == "Platform Engineer"
            assert j["company"] == "Acme Corp"
            assert j["location"] == "Indianapolis, IN"
            assert j["url"] == "https://acme.com/job/1"
            assert j["status"] == "interested"
            assert j["notes"] == "Heard about it from Mike"
            assert j["source"] == "manual"
        finally:
            t.close()

    @patch("click.edit")
    def test_wizard_skips_editor_when_declined(
        self, mock_edit, cli_db, monkeypatch,
    ):
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)
        answers = "\n".join([
            "X", "Y", "", "", "n", "interested", "", "y",
        ]) + "\n"
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add"], input=answers)
        assert result.exit_code == 0, result.output
        mock_edit.assert_not_called()

    @patch("click.edit", return_value="Pasted job description here.")
    def test_wizard_opens_editor_when_accepted(
        self, mock_edit, cli_db, monkeypatch,
    ):
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)
        answers = "\n".join([
            "X", "Y", "", "", "y", "interested", "", "y",
        ]) + "\n"
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add"], input=answers)
        assert result.exit_code == 0, result.output
        mock_edit.assert_called_once()

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert t.get_all_jobs()[0]["description"] == "Pasted job description here."
        finally:
            t.close()
```

- [ ] **Step 2: Run — verify all 4 wizard tests fail**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestInteractivePath -v`
Expected: all FAIL — wizard path still raises "not yet implemented".

- [ ] **Step 3: Add `_run_tracker_add_wizard()` helper to `cli.py`**

Insert immediately above the `tracker_add` command registration:

```python
def _run_tracker_add_wizard():
    """Interactive wizard for `tracker add`. Returns a dict of fields, or None if cancelled."""
    from rich.prompt import Confirm, Prompt

    from src.jobs.tracker import VALID_STATUSES

    console.print("\n[bold]Add a new application to the tracker.[/bold]")
    console.print("[dim]Press Ctrl-C at any time to cancel without saving.[/dim]\n")

    # Required fields — re-prompt on empty
    title = ""
    while not title.strip():
        title = Prompt.ask("  Title")
    company = ""
    while not company.strip():
        company = Prompt.ask("  Company")

    location = Prompt.ask("  Location [dim](optional)[/dim]", default="")
    url = Prompt.ask("  URL [dim](optional)[/dim]", default="")

    description = ""
    if Confirm.ask("  Open editor for job description?", default=False):
        description = click.edit() or ""

    status = Prompt.ask(
        "  Status",
        choices=sorted(VALID_STATUSES),
        default="interested",
    )
    notes = Prompt.ask("  Notes [dim](optional)[/dim]", default="")

    # Summary panel
    console.print("\n[bold]Summary:[/bold]")
    console.print(f"  Title:       {title}")
    console.print(f"  Company:     {company}")
    if location:
        console.print(f"  Location:    {location}")
    if url:
        console.print(f"  URL:         {url}")
    console.print(f"  Status:      {status}")
    if notes:
        console.print(f"  Notes:       {notes}")
    if description:
        console.print(f"  Description: {len(description)} chars")

    if not Confirm.ask("\nCreate this application?", default=True):
        return None

    return {
        "title": title.strip(),
        "company": company.strip(),
        "location": location.strip(),
        "url": url.strip(),
        "description": description,
        "status": status,
        "notes": notes.strip(),
    }
```

- [ ] **Step 4: Wire wizard into `tracker_add`**

In `tracker_add`, replace the `# Wizard path stub for Task 6.` block with:

```python
        try:
            wizard_fields = _run_tracker_add_wizard()
        except KeyboardInterrupt:
            console.print("\n[yellow]Cancelled — no application saved.[/yellow]")
            raise click.Abort()
        if wizard_fields is None:
            console.print("[yellow]Cancelled — no application saved.[/yellow]")
            return
        fields = wizard_fields
```

Note: this replaces the stub `raise click.ClickException(...)` only; the no-TTY gate above it stays intact.

- [ ] **Step 5: Run — verify wizard tests pass**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestInteractivePath -v`
Expected: 4 PASSED.

Full suite check:
Run: `python -m pytest tests/test_cli_tracker_add.py -v`
Expected: 12 PASSED.

- [ ] **Step 6: Commit**

```bash
git add cli.py tests/test_cli_tracker_add.py
git commit -m "$(cat <<'EOF'
feat(CAR-157): tracker add interactive wizard happy path

_run_tracker_add_wizard prompts for title/company (required), then
location/url/notes (optional), offers click.edit() for description,
presents a summary, and asks for final confirmation. On success the
command writes the row with source=manual.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wizard cancellation paths

Explicit tests for declining the final summary and for Ctrl-C mid-prompt. The production code paths already exist from Task 6; this task proves they work and locks them in.

**Files:**
- Modify: none (behavior already shipped in Task 6)
- Test: `tests/test_cli_tracker_add.py` (extend `TestInteractivePath`)

- [ ] **Step 1: Append cancellation tests**

Append inside `TestInteractivePath`:
```python
    def test_wizard_cancel_at_final_confirm_writes_nothing(
        self, cli_db, monkeypatch,
    ):
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)
        answers = "\n".join([
            "X", "Y", "", "", "n", "interested", "",
            "n",  # decline final confirm
        ]) + "\n"
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add"], input=answers)
        assert result.exit_code == 0, result.output
        assert "Cancelled" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert len(t.get_all_jobs()) == 0
        finally:
            t.close()

    @patch("rich.prompt.Prompt.ask", side_effect=KeyboardInterrupt)
    def test_wizard_ctrl_c_writes_nothing(
        self, _mock_prompt, cli_db, monkeypatch,
    ):
        """Ctrl-C during any prompt => no row written and clean abort."""
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)
        runner = CliRunner()
        result = runner.invoke(cli, ["tracker", "add"])
        # click.Abort() exits non-zero
        assert result.exit_code != 0
        assert "Cancelled" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            assert len(t.get_all_jobs()) == 0
        finally:
            t.close()
```

- [ ] **Step 2: Run — verify both tests pass immediately (behavior already exists)**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestInteractivePath -v`
Expected: 6 PASSED (4 from Task 6 + 2 new).

If either cancellation test fails, revisit Task 6's wiring — don't add new production code here; fix the existing branch.

- [ ] **Step 3: Commit**

```bash
git add tests/test_cli_tracker_add.py
git commit -m "$(cat <<'EOF'
test(CAR-157): lock in tracker add cancellation paths

Explicit tests for (a) declining the final summary confirm and (b)
KeyboardInterrupt mid-prompt. Guards the AC invariant that no partial
or dangling row is ever written when the user cancels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Duplicate-URL detection

Before writing the row, if `url` is non-empty and `find_by_url` returns a match, warn and ask the user to confirm. Applies to **both** non-interactive and wizard paths.

**Files:**
- Modify: `cli.py` (add dupe check before `t.save_job(...)`)
- Test: `tests/test_cli_tracker_add.py` (new `TestDuplicateDetection` class)

- [ ] **Step 1: Append duplicate-detection tests**

Append to `tests/test_cli_tracker_add.py`:
```python
class TestDuplicateDetection:
    def _seed_existing(self, cli_db, url):
        """Seed one row with the given URL."""
        t = ApplicationTracker(db_path=cli_db)
        try:
            t.save_job({
                "title": "Existing Job",
                "company": "Existing Co",
                "url": url,
                "source": "search",
            })
        finally:
            t.close()

    def test_warns_and_proceeds_when_user_confirms(self, cli_db, monkeypatch):
        self._seed_existing(cli_db, "https://dup.example.com/job/1")
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)

        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "New Listing",
            "--company", "New Co",
            "--url", "https://dup.example.com/job/1",
        ], input="y\n")  # confirm "Create anyway?"
        assert result.exit_code == 0, result.output
        assert "duplicate" in result.output.lower()
        assert "Created application" in result.output

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 2  # seeded + new
        finally:
            t.close()

    def test_aborts_when_user_declines_dupe(self, cli_db, monkeypatch):
        self._seed_existing(cli_db, "https://dup.example.com/job/2")
        monkeypatch.setattr("sys.stdin.isatty", lambda: True)

        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "New Listing",
            "--company", "New Co",
            "--url", "https://dup.example.com/job/2",
        ], input="n\n")  # decline "Create anyway?"
        assert result.exit_code == 0, result.output
        assert "duplicate" in result.output.lower()
        assert "Aborted" in result.output or "no application saved" in result.output.lower()

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 1  # only the seeded row
            assert jobs[0]["title"] == "Existing Job"
        finally:
            t.close()

    def test_empty_url_skips_dupe_check(self, cli_db, monkeypatch):
        """No URL provided => no dupe check runs, row is written normally."""
        self._seed_existing(cli_db, "")  # another row with empty URL
        runner = CliRunner()
        # Non-interactive path, no --url flag
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "Fresh Listing",
            "--company", "Fresh Co",
        ])
        assert result.exit_code == 0, result.output
        assert "duplicate" not in result.output.lower()

        t = ApplicationTracker(db_path=cli_db)
        try:
            jobs = t.get_all_jobs()
            assert len(jobs) == 2
        finally:
            t.close()

    def test_no_dupe_when_urls_differ(self, cli_db, monkeypatch):
        self._seed_existing(cli_db, "https://a.example.com/1")
        runner = CliRunner()
        result = runner.invoke(cli, [
            "tracker", "add",
            "--title", "Other",
            "--company", "Other Co",
            "--url", "https://b.example.com/2",
        ])
        assert result.exit_code == 0, result.output
        assert "duplicate" not in result.output.lower()
        assert "Created application" in result.output
```

- [ ] **Step 2: Run — verify tests fail (no dupe logic yet)**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestDuplicateDetection -v`
Expected: `test_warns_and_proceeds_when_user_confirms` FAILS (no "duplicate" in output). `test_aborts_when_user_declines_dupe` FAILS (row is written despite input "n"). `test_empty_url_skips_dupe_check` and `test_no_dupe_when_urls_differ` PASS already.

- [ ] **Step 3: Add dupe check to `tracker_add` in `cli.py`**

In `tracker_add`, insert a dupe-check block inside the `try:` immediately **before** the `app_id = t.save_job(...)` call:

```python
        if fields["url"]:
            dup = t.find_by_url(fields["url"])
            if dup:
                from rich.prompt import Confirm

                console.print(
                    f"[yellow]Possible duplicate: #{dup['id']} "
                    f"{dup.get('title') or '(untitled)'} @ "
                    f"{dup.get('company') or '(unknown)'}[/yellow]"
                )
                if not Confirm.ask("Create anyway?", default=False):
                    console.print("[yellow]Aborted — no application saved.[/yellow]")
                    return
```

- [ ] **Step 4: Run — verify all dupe tests pass**

Run: `python -m pytest tests/test_cli_tracker_add.py::TestDuplicateDetection -v`
Expected: 4 PASSED.

Full suite check:
Run: `python -m pytest tests/test_cli_tracker_add.py -v`
Expected: **18 PASSED** (2 help + 5 non-interactive + 1 no-TTY + 6 wizard + 4 dupe).

- [ ] **Step 5: Commit**

```bash
git add cli.py tests/test_cli_tracker_add.py
git commit -m "$(cat <<'EOF'
feat(CAR-157): warn on likely-duplicate URL in tracker add

Before writing the row, if --url (or wizard-entered URL) matches an
existing application, show the existing row and prompt "Create anyway?"
Default No. Applies to both non-interactive and wizard paths. Empty
URLs short-circuit the check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Full-suite verification and manual smoke test

Confirm nothing else in the project regressed, and exercise the real wizard once in a terminal before opening the PR.

**Files:** none modified.

- [ ] **Step 1: Run full project test suite**

Run: `python -m pytest tests/ -q`
Expected: all tests PASS. Note the count vs. pre-change baseline — new-file count should go up by ~16–18 (new CLI tests) plus ~5 (new tracker unit tests).

- [ ] **Step 2: Manual smoke test — non-interactive path**

Run:
```bash
python cli.py tracker add --title "Smoke Test Role" --company "Smoke Co" --url "https://smoke.example.com/1"
```
Expected: prints "Created application #N: Smoke Test Role @ Smoke Co [status=interested]".

Verify: `python cli.py tracker show` lists it under the **Interested** column.

- [ ] **Step 3: Manual smoke test — duplicate warning**

Run the exact same command again:
```bash
python cli.py tracker add --title "Smoke Test Role" --company "Smoke Co" --url "https://smoke.example.com/1"
```
Expected: prints the `[yellow]Possible duplicate:[/yellow]` line and prompts "Create anyway? [y/N]". Type `n` → prints "Aborted — no application saved."

- [ ] **Step 4: Manual smoke test — wizard**

Run: `python cli.py tracker add` (no flags).
Walk through all prompts. At "Open editor for job description?" answer `n` (skip the editor round-trip for the smoke test). At the summary, confirm `y`.
Expected: row created, appears in `tracker show`.

- [ ] **Step 5: Clean up smoke-test rows (optional but tidy)**

```bash
sqlite3 data/careerpilot.db "DELETE FROM applications WHERE company = 'Smoke Co';"
```

- [ ] **Step 6: No commit — this task is verification only**

If any test fails or a smoke test misbehaves, STOP and fix before proceeding to Task 10.

---

## Task 10: Open PR and update Jira

**Files:** none.

- [ ] **Step 1: Push the branch**

Run:
```bash
git push -u origin feature/CAR-157-tracker-add-wizard
```

- [ ] **Step 2: Open PR**

Run (single HEREDOC, not broken across shell quoting):
```bash
gh pr create --title "feat(CAR-157): tracker add interactive wizard" --body "$(cat <<'EOF'
## Summary
- Adds `tracker add` CLI command for logging applications found out-of-band (LinkedIn, referrals, etc.) — closes the third ingestion path alongside `search` and `import-from-email`.
- Interactive Rich-prompt wizard when required flags missing; one-shot non-interactive when `--title` + `--company` provided.
- URL-only duplicate detection (warn + confirm, never block).
- `click.edit()` opens `\$EDITOR` for multi-line job-description paste.

## Spec
- docs/superpowers/specs/2026-04-20-car-157-tracker-add-wizard-design.md
## Plan
- docs/superpowers/plans/2026-04-20-car-157-tracker-add-wizard.md

## Test plan
- [x] Full `pytest tests/` suite green
- [x] Manual smoke: non-interactive happy path
- [x] Manual smoke: duplicate URL warning + decline
- [x] Manual smoke: wizard happy path end-to-end
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 3: Post Jira comment linking the PR**

Use the Atlassian MCP `addCommentToJiraIssue` tool (ADF format — see CLAUDE.md). Content:

> PR opened: `{pr_url}` — `tracker add` wizard + non-interactive path + URL dedupe. All 16+ CLI tests and 5 domain tests passing. Pending review/merge before transitioning to Done.

- [ ] **Step 4: Transition CAR-157 to "In Review"**

Via the Atlassian MCP `transitionJiraIssue` tool. Verify transition id first via `getTransitionsForJiraIssue`.

---

## Self-review — spec coverage traceability

| Spec / ticket AC | Implementing task |
|---|---|
| `tracker add` with no flags launches wizard and creates a row | Task 6 (`test_wizard_creates_row_on_confirm`) |
| `tracker add --title --company` creates row non-interactively | Task 4 (`test_creates_row_with_required_flags_only`) |
| All seven flags supported (`--title/--company/--location/--url/--description/--status/--notes`) | Task 3 (help test) + Task 4 (`test_all_flags_persist_to_db`) |
| Required missing + no TTY → exit code 2 | Task 5 (`test_exits_code_2_when_required_missing_and_not_a_tty`) |
| `source=manual` always set | Task 4 (`test_source_is_manual`) |
| Invalid `--status` rejected with valid options | Task 4 (`test_invalid_status_rejected`) — Click's `Choice` enforces this |
| Ctrl-C during wizard → no partial row | Task 7 (`test_wizard_ctrl_c_writes_nothing`) |
| Duplicate URL: warn + confirm, never block | Task 8 (all four dupe tests) |
| Domain-layer change: `find_by_url` | Task 1 |
| `save_job` extension to persist notes | Task 2 |

No gaps detected.
