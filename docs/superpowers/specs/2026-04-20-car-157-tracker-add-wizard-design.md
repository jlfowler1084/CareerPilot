# CAR-157 — `tracker add` interactive wizard

**Status:** Design approved 2026-04-20
**Ticket:** https://jlfowler1084.atlassian.net/browse/CAR-157
**Sibling:** CAR-156 (`tracker import-from-email`), shipped in commit `ce7eec5`.

## Problem

Applications enter the tracker via two paths only: `search` (job-board scraping) and `tracker import-from-email`. There is no way to log a job found out-of-band — word-of-mouth, LinkedIn, a company's careers page, a referral. The only workaround is editing SQLite directly, which is not a viable user flow.

## Solution summary

Add a `tracker add` subcommand to `cli.py`. Two modes:

1. **Non-interactive**, when `--title` **and** `--company` are both provided — writes a row with the given fields and defaults, no prompts.
2. **Wizard**, when either required flag is missing and stdin is a TTY — prompts via `rich.prompt.Prompt.ask` / `Confirm.ask`, matching the existing `profile wizard/edit` idiom.

All rows from this command carry `source="manual"`. Duplicate-URL detection warns but does not block.

## Design decisions (resolved during brainstorm)

| Decision | Choice | Reason |
|---|---|---|
| Duplicate detection | URL-only, warn + confirm | Cheap, strongest signal, YAGNI on fuzzy title/company matching |
| Description field in wizard | `click.edit()` opens `$EDITOR` | Terminal multi-line input is lossy; the flag remains for scripting |
| Default status | `interested` | Manual entry implies intent to pursue; matches ticket |
| Non-interactive boundary | Both required flags → fully non-interactive (no prompts at all) | Unambiguous user signal; mirrors CAR-156 pattern |
| Code organization | Wizard inline in `cli.py`; new `ApplicationTracker.find_by_url()` for dedupe | Matches repo convention; honors ticket's "reuse tracker, no SQL in CLI" |

## Command contract

```
python cli.py tracker add [OPTIONS]
```

### Click options

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--title TEXT` | str | — | Required for non-interactive; prompted if missing |
| `--company TEXT` | str | — | Required for non-interactive; prompted if missing |
| `--location TEXT` | str | `""` | Optional |
| `--url TEXT` | str | `""` | Optional; triggers dupe check if non-empty |
| `--description TEXT` | str | `""` | Optional; wizard uses `$EDITOR` instead |
| `--status` | `click.Choice(sorted(VALID_STATUSES))` | `interested` | Validated by Click |
| `--notes TEXT` | str | `""` | Optional |

### Control flow

1. If `--title` **and** `--company` both provided → **non-interactive path**. Optional fields default, dupe-check runs, row inserts, result prints.
2. Otherwise:
   - If `sys.stdin.isatty()` is **False** → exit code 2 with `Error: --title and --company are required when not running interactively.`
   - Else → **wizard path**.
3. In both paths, before insert:
   - If `url` is non-empty and `tracker.find_by_url(url)` returns a row → print `[yellow]Possible duplicate: #{id} {title} @ {company}[/yellow]` and `Confirm.ask("Create anyway?", default=False)`. If declined, exit cleanly with no row written.
4. Insert via `tracker.save_job({...}, status=status)` with `source="manual"`.
5. Print `[green]Created application #{id}: {title} @ {company} [status={status}][/green]`.

## Wizard behavior

Triggered when `--title` or `--company` is missing and stdin is a TTY.

### Prompt sequence

```
Add a new application to the tracker.
Press Ctrl-C at any time to cancel without saving.

  Title         : Senior Platform Engineer
  Company       : Acme Corp
  Location      (optional): Indianapolis, IN
  URL           (optional): https://acme.com/careers/123
  Open editor for job description? [y/N]: y
    → click.edit() → user pastes → saves → returns string
  Status        [found/interested/...] (interested): interested
  Notes         (optional): Heard about it from Mike

Summary:
  Title:    Senior Platform Engineer
  Company:  Acme Corp
  Location: Indianapolis, IN
  URL:      https://acme.com/careers/123
  Status:   interested
  Notes:    Heard about it from Mike
  Description: 1824 chars

Create this application? [Y/n]:
```

### Field-by-field specifics

- **Title, Company** — `Prompt.ask("  Title")` with no default. Re-prompt if empty (these are the only required fields).
- **Location, URL, Notes** — `Prompt.ask("  Location (optional)", default="")`. Empty allowed.
- **Description** — `Confirm.ask("  Open editor for job description?", default=False)`. If yes, call `click.edit()`, store the returned string (or `""` if user saved empty / aborted the editor).
- **Status** — `Prompt.ask("  Status", choices=sorted(VALID_STATUSES), default="interested")`. Rich's `choices=` param handles validation and displays the list natively.

### Ctrl-C handling

- Wrap the entire wizard in `try/except KeyboardInterrupt`.
- On catch: `console.print("\n[yellow]Cancelled — no application saved.[/yellow]")` and `raise click.Abort()` — exits code 1, no row written because the insert has not yet happened.
- Key invariant: the insert occurs *after* the wizard and final-confirm step. There is no partial state to roll back.

### Final confirmation

After collecting all fields, print a summary panel and ask `Confirm.ask("Create this application?", default=True)`. If declined, exit cleanly with no row written.

## Domain-layer change

Add one method to `src/jobs/tracker.py` next to `find_application_by_message_id`:

```python
def find_by_url(self, url: str) -> Optional[Dict]:
    """Find an application by URL. Returns the first match or None.

    Used for duplicate detection in manual-entry flows.
    Empty/whitespace URLs return None without querying.
    """
    if not url or not url.strip():
        return None
    row = self._conn.execute(
        "SELECT * FROM applications WHERE url = ? LIMIT 1",
        (url.strip(),),
    ).fetchone()
    return dict(row) if row else None
```

### Why this shape

- Mirrors `find_application_by_message_id` exactly — same null-check, return type, trimming discipline.
- `LIMIT 1` because we only need to know *if* a dupe exists. Listing all duplicates is a separate method if ever needed.
- Empty/whitespace guard prevents matching every row with `url=""` (scraper and email-import paths leave URLs blank on some rows).
- No new index required — table stays in the hundreds. Adding `CREATE INDEX idx_applications_url ON applications(url)` later is trivial and non-breaking.

### What does not change

- `save_job()` signature — already accepts `source` in the dict.
- `VALID_STATUSES` — `interested` is already a member.

## Test plan

New file: `tests/test_cli_tracker_add.py`, plus additions to `tests/test_tracker.py` for the `find_by_url` unit tests. Fixture pattern mirrors `tests/test_cli_tracker_import.py` (`cli_db` fixture that points `settings.DB_PATH` at a tmp SQLite).

| Class | Test | Covers AC |
|---|---|---|
| `TestCommandRegistration` | `test_appears_in_tracker_help` | wiring |
| `TestNonInteractivePath` | `test_creates_row_with_required_flags_only` | non-interactive minimal |
| | `test_all_flags_persist_to_db` | full-flag scripting |
| | `test_source_is_manual` | `source=manual` invariant |
| | `test_default_status_is_interested` | default status |
| | `test_invalid_status_rejected` | `--status foo` → Click error, no row |
| `TestInteractivePath` | `test_wizard_prompts_when_title_missing` | wizard triggered |
| | `test_wizard_creates_row_on_confirm` | happy-path wizard |
| | `test_wizard_skips_editor_when_declined` | `click.edit()` not called on "N" |
| | `test_wizard_cancel_at_final_confirm_writes_nothing` | declined-at-summary |
| | `test_wizard_ctrl_c_writes_nothing` | KeyboardInterrupt during prompts |
| `TestNoTTY` | `test_exits_code_2_when_required_missing_and_not_a_tty` | non-TTY gate |
| `TestDuplicateDetection` | `test_warns_and_proceeds_when_user_confirms` | dupe + yes |
| | `test_aborts_when_user_declines_dupe` | dupe + no → no row |
| | `test_empty_url_skips_dupe_check` | short-circuit |
| `TestTrackerFindByUrl` (in `test_tracker.py`) | `test_returns_row_when_url_matches` | unit |
| | `test_returns_none_when_empty_url` | guard |
| | `test_returns_none_when_no_match` | basic |

### Testing techniques

- **`CliRunner`** for all CLI tests (same as `test_cli_tracker_import.py`).
- **Prompt injection:** `runner.invoke(cli, [...], input="Title\nCompany\n\n\nN\n\n\ny\n")` — newline-separated answers piped to stdin. Rich's `Prompt.ask` reads from stdin and works under `CliRunner`.
- **TTY faking:** `monkeypatch.setattr("sys.stdin.isatty", lambda: False)` for the no-TTY test.
- **`click.edit` mock:** `@patch("click.edit")` set to return the pasted string; verify `.called` / `.not_called` per test.
- **Database assertions:** open `ApplicationTracker(db_path=cli_db)` after each test and query directly — mirroring the existing test file.

## Acceptance-criteria traceability

| Ticket AC | Covered by |
|---|---|
| Wizard with no flags creates a row | `test_wizard_creates_row_on_confirm` |
| `--title --company` creates a row non-interactively | `test_creates_row_with_required_flags_only` |
| Supports `--title/--company/--location/--url/--description/--status/--notes` | `test_all_flags_persist_to_db` |
| Missing required + no TTY → exit code 2 | `test_exits_code_2_when_required_missing_and_not_a_tty` |
| `source=manual` always set | `test_source_is_manual` |
| Invalid `--status` rejected with list of valid options | `test_invalid_status_rejected` (Click's built-in message includes valid choices) |
| Ctrl-C during wizard → no partial row | `test_wizard_ctrl_c_writes_nothing` + insert-after-confirm invariant |
| Duplicate URL handling | `TestDuplicateDetection` (all three cases) |

## Out of scope (follow-up tickets)

- Bulk CSV import — separate Story when/if the need arises.
- AI-assisted field extraction from a pasted URL — separate Story.
- Adding a `url` index on `applications` — only if table growth makes it necessary.

## File-change summary

| Path | Change | Approx LOC |
|---|---|---|
| `src/jobs/tracker.py` | Add `find_by_url()` method | +15 |
| `cli.py` | Add `tracker add` command + wizard helper | +100 |
| `tests/test_cli_tracker_add.py` | New file, full suite | +260 |
| `tests/test_tracker.py` | Add three `TestTrackerFindByUrl` cases | +30 |

Net: ~405 LOC added, 0 removed. No schema migration.
