# [CAR-157] Add `tracker add` interactive wizard for manual application entry

**Ticket**: https://jlfowler1084.atlassian.net/browse/CAR-157
**Model tier**: Sonnet (TDD execution of an already-approved plan — no design decisions remain)
**Workflow**: Execute pre-written plan via `superpowers:executing-plans`, then `/ship` Phase A to open PR
**Target project**: CareerPilot (`F:\Projects\CareerPilot`)
**Starting branch**: `feature/dashboard-v2` (spec + plan already committed here at `6174a0a` and `38d6284`)
**Worktree to create**: `F:\Projects\CareerPilot\.worktrees\CAR-157` on branch `feature/CAR-157-tracker-add-wizard`

## Goal

Add a `tracker add` CLI subcommand to CareerPilot. Lets the user log a job application found out-of-band (word-of-mouth, LinkedIn, referral, company careers page) via either (a) an interactive Rich-prompt wizard or (b) one-shot flags for scripting. Closes the third ingestion path alongside `search` and the already-shipped CAR-156 `tracker import-from-email`.

## What's already done (do NOT redo)

The brainstorm and plan phases are complete. Your job is **implementation only**. Do not re-ask clarifying questions, re-propose approaches, or rewrite the spec. If something in the plan looks wrong, flag it and ask before deviating.

- **Spec** (all design decisions locked): [docs/superpowers/specs/2026-04-20-car-157-tracker-add-wizard-design.md](../docs/superpowers/specs/2026-04-20-car-157-tracker-add-wizard-design.md)
- **Implementation plan** (TDD, 10 tasks, complete code in every step): [docs/superpowers/plans/2026-04-20-car-157-tracker-add-wizard.md](../docs/superpowers/plans/2026-04-20-car-157-tracker-add-wizard.md)

### Locked design decisions (do not revisit)

| Decision | Choice | Do not re-debate |
|---|---|---|
| Duplicate detection | URL-only, warn + confirm | Not fuzzy, not (title,company) |
| Description in wizard | `click.edit()` opens `$EDITOR` | Not multi-line prompt |
| Default status | `interested` | Not `found` |
| Non-interactive boundary | Both `--title` + `--company` → no prompts at all | Not partial-wizard |
| Code organization | Wizard inline in `cli.py`; `find_by_url` in `tracker.py` | Do not extract to a new module |

## Execution workflow

Use the `superpowers:executing-plans` skill. Work the plan **strictly in order**, task-by-task:

1. **Task 0** — create the worktree (cd into it for all subsequent work)
2. **Task 1** — `ApplicationTracker.find_by_url()` + 4 unit tests
3. **Task 2** — `save_job()` extension to persist `notes` + 2 unit tests
4. **Task 3** — register `tracker add` Click command skeleton + 2 help tests
5. **Task 4** — non-interactive path + 5 tests
6. **Task 5** — no-TTY gate + 1 test
7. **Task 6** — wizard happy path (`_run_tracker_add_wizard`) + 4 tests
8. **Task 7** — wizard cancellation paths + 2 tests (tests-only; code already ships in Task 6)
9. **Task 8** — URL duplicate detection + 4 tests
10. **Task 9** — full-suite `pytest tests/` + manual smoke tests (non-interactive, dupe warning, wizard)
11. **Task 10** — push, open PR, comment on Jira, transition to In Review

**Between each task**: commit per the plan's git commit blocks (HEREDOC format, Co-Authored-By trailer included).

**TDD discipline**: for every task that has test code, run the tests RED first (step labeled "Run — verify failure"), then implement, then run GREEN. Do not skip the RED verification — it's the cheapest way to catch "the test I wrote doesn't actually exercise the code I wrote".

## Critical context the plan assumes you know

- **Rich prompts under `CliRunner`**: `Prompt.ask` / `Confirm.ask` read from stdin, and `runner.invoke(cli, [...], input="line1\nline2\n")` feeds them correctly. Verified pattern at [tests/test_profile.py:612](../tests/test_profile.py#L612). No extra setup needed.
- **TTY faking in tests**: `monkeypatch.setattr("sys.stdin.isatty", lambda: True)` (or `lambda: False` for the no-TTY test). Needed because `CliRunner` defaults stdin to non-TTY.
- **`click.edit` mocking**: `@patch("click.edit", return_value="pasted text")` intercepts the editor round-trip — the real `$EDITOR` never launches during tests.
- **Ctrl-C simulation**: `@patch("rich.prompt.Prompt.ask", side_effect=KeyboardInterrupt)` fires the exception on the first prompt call, matching what a real Ctrl-C would do mid-wizard.
- **`cli_db` fixture pattern**: already used by [tests/test_cli_tracker_import.py:15](../tests/test_cli_tracker_import.py#L15) — the plan's new test file duplicates it verbatim (self-contained, no conftest needed).
- **`save_job` currently hard-codes `notes = ''`** at [src/jobs/tracker.py:52](../src/jobs/tracker.py#L52). Task 2 fixes this in a backward-compatible way. Don't merge Task 2 into Task 1.

## Expected commit sequence

Each commit is atomic and TDD-shaped. Expected history after the branch is complete:

```
feat(CAR-157): add ApplicationTracker.find_by_url for duplicate detection
refactor(CAR-157): let save_job persist notes from job_data
feat(CAR-157): register tracker add command stub
feat(CAR-157): implement tracker add non-interactive path
feat(CAR-157): no-TTY gate on tracker add
feat(CAR-157): tracker add interactive wizard happy path
test(CAR-157): lock in tracker add cancellation paths
feat(CAR-157): warn on likely-duplicate URL in tracker add
```

Eight commits, ~430 LOC added net. If you find yourself writing a 9th commit inside the feature branch before push, stop and check whether you've scope-crept beyond the plan.

## Acceptance criteria (from Jira, mapped to tests)

| Ticket AC | Plan task → test |
|---|---|
| `tracker add` with no flags launches wizard + creates row | Task 6 → `test_wizard_creates_row_on_confirm` |
| `tracker add --title "..." --company "..."` creates row non-interactively | Task 4 → `test_creates_row_with_required_flags_only` |
| Supported flags: `--title/--company/--location/--url/--description/--status/--notes` | Task 3 → `test_add_help_lists_flags` |
| Required missing + no TTY → exit code 2, clear error | Task 5 → `test_exits_code_2_when_required_missing_and_not_a_tty` |
| `source=manual` always set | Task 4 → `test_source_is_manual` |
| Invalid `--status` rejected with valid options | Task 4 → `test_invalid_status_rejected` (Click's `Choice` enforces) |
| Ctrl-C during wizard → no partial row | Task 7 → `test_wizard_ctrl_c_writes_nothing` |
| Duplicate URL handling | Task 8 → all 4 `TestDuplicateDetection` cases |

## Constraints

- **Scope**: `cli.py`, `src/jobs/tracker.py`, `tests/test_tracker.py`, `tests/test_cli_tracker_add.py` — nothing else. No unrelated refactors, no wandering into neighboring commands.
- **No new dependencies**: Rich, Click, SQLite are all already in `requirements.txt`.
- **Python compatibility**: module headers keep `from __future__ import annotations` — the project is 3.8+ and `list[str]` native syntax fails.
- **No schema migration**: `applications` table already has every column needed. Don't touch `src/db/models.py` or migration files.
- **Branch hygiene**: all work happens in the `.worktrees/CAR-157` worktree, never in the main tree.
- **Commit style**: follow the plan's HEREDOC commit blocks verbatim — message prefix + blank line + body + `Co-Authored-By` trailer.

## When you get stuck

If any of these happen, **pause and ask** — don't improvise:

- A test doesn't fail when it should (RED step skipped) — means the test isn't exercising the code; the plan's test code is wrong
- Rich prompt behavior under `CliRunner` differs from expected (test hangs or misroutes input)
- `click.edit()` behaves differently under `CliRunner` than the plan assumes
- Full-suite regression: anything outside `tests/test_tracker.py` / `tests/test_cli_tracker_add.py` goes red

If a test needs tweaking (e.g., a minor assertion detail), make the smallest possible change and proceed. If a production code block needs changing, stop — a plan deviation is architectural, not editorial.

## After merge (handled by Opus/user, not you)

- Phase B of `/ship` posts close-out comment on CAR-157 and transitions to Done
- Close-out mentions the PR URL + any follow-up tickets discovered mid-implementation (e.g., the `url` index if perf ever matters)

## Ready check before you start

- [ ] Current branch is `feature/dashboard-v2` with clean working tree (`git status`)
- [ ] Spec `2026-04-20-car-157-tracker-add-wizard-design.md` exists under `docs/superpowers/specs/`
- [ ] Plan `2026-04-20-car-157-tracker-add-wizard.md` exists under `docs/superpowers/plans/`
- [ ] `.worktrees/` is in `.gitignore`
- [ ] `python -m pytest tests/ -q` passes **before** you start (establish baseline)

If any of the above is not true, stop and report — don't proceed.
