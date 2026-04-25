# Subagent Delegation Contract — CAR-153

You are an implementer subagent executing CAR-153 as part of the CAR-181 pilot run of the INFRA-216 SubAgent Swarm. This is **Stream B** of 4 parallel streams.

## Your ticket

`scanner/test_gov_boards.py` fails on any machine without a live `ANTHROPIC_API_KEY`. The WorkOne scraper short-circuits when the key is unset, returning an empty list; the tests then assert job titles are present in that empty list and fail. This is a hygiene violation — unit tests should mock external dependencies, not require live API keys or network.

Affected tests:
- `TestUSAJobs::test_returns_valid_dicts`
- `TestUSAJobs::test_filters_irrelevant`
- `TestWorkOne::test_returns_valid_dicts`
- `TestWorkOne::test_filters_irrelevant`

The fix: use `unittest.mock.patch` (or equivalent) to stub the scraper HTTP calls and the Claude API calls. Provide fixture data covering both the "valid dicts" and "filters irrelevant" code paths. No real network or Anthropic API calls during test execution.

Full ticket: https://jlfowler1084.atlassian.net/browse/CAR-153

## Acceptance criteria

- [ ] `scanner/test_gov_boards.py` runs green without `ANTHROPIC_API_KEY` set.
- [ ] Tests use `unittest.mock.patch` (or equivalent) to stub the scraper HTTP / Claude calls.
- [ ] Fixture data covers both the "valid dicts" and "filters irrelevant" code paths.
- [ ] No real network or Anthropic API calls made during test execution.
- [ ] Full suite run — only `test_dashboard.py` Click failures remain (tracked separately).

## Intent summary (what success looks like)

`scanner/test_gov_boards.py` runs green without `ANTHROPIC_API_KEY` set and without network — both USAJobs and WorkOne scrapers stubbed via `unittest.mock.patch`, fixture data covers both valid-dicts and filters-irrelevant code paths.

## Your worktree

Branch: `worktree/CAR-153-mock-workone-tests`
Worktree directory: `.worktrees/worktree-CAR-153-mock-workone-tests/`

## Your file scope

You MAY modify:
- `scanner/test_gov_boards.py`

You MUST NOT modify the underlying scrapers (`scanner/usajobs.py`, `scanner/workone.py`, etc.) — the fix is test-side only. If the scraper code makes mocking impossible (e.g. internal calls aren't injectable), STOP and write `STATUS.md=EMERGENT_SCOPE_NEEDED` describing the architectural blocker.

## Checkpoint pattern

### Phase A — Checkpoint commit

1. Mock at least ONE of the four affected tests (e.g. `TestWorkOne::test_returns_valid_dicts`) using `unittest.mock.patch` so it passes without `ANTHROPIC_API_KEY`. Provide a minimal fixture for that one test.
2. Run `python -m pytest scanner/test_gov_boards.py::TestWorkOne::test_returns_valid_dicts -v` (with no API key set) — must pass.
3. `git add scanner/test_gov_boards.py`.
4. `git commit -m "test(CAR-153): mock WorkOne scraper in test_returns_valid_dicts"`.
5. Write STATUS.md:
   ```
   STATUS: AWAITING_CHECKPOINT_REVIEW
   ticket: CAR-153
   branch: worktree/CAR-153-mock-workone-tests
   commit: <SHA>
   files_touched: scanner/test_gov_boards.py
   intent_exercised: <one sentence>
   blocked: false
   ```
6. STOP and return.

### Phase B — After coordinator approval

1. Apply the same mocking pattern to the remaining three tests.
2. Run the full file: `python -m pytest scanner/test_gov_boards.py -v` with `ANTHROPIC_API_KEY` UNSET — all 4 must pass.
3. Run `python -m pytest tests/` to ensure no other tests regressed.
4. Run `gitleaks detect --no-git --source scanner/test_gov_boards.py`.
5. Push: `git push -u origin worktree/CAR-153-mock-workone-tests`.
6. Open PR via `/ship CAR-153` Phase A.
7. Update STATUS.md to `PR_OPEN`.

## Hard constraints

- **NEVER use `--no-verify`.** Hook failure → BLOCKED_HOOK_FALSE_POSITIVE, stop.
- **NEVER commit to or push to `main`.**
- **NEVER merge the PR.**
- **NEVER modify scraper source files** — your scope is the test file only.
- **NEVER spawn sub-subagents.**
- **NEVER invoke Atlassian MCP for tickets other than CAR-153.**
- **Token budget:** 80 tool-round-trips max.
- **Wall-clock ceiling:** 45 minutes.
- **No `git add .`** — stage files by name.

## Report back

STATUS.md is your report.
