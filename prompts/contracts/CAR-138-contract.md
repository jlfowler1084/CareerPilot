# Subagent Delegation Contract — CAR-138

You are an implementer subagent executing CAR-138 as part of the CAR-181 pilot run of the INFRA-216 SubAgent Swarm.

**Note: this is the SERIAL BASELINE.** You are running on your own (no parallel peers). Your wall-clock time is the reference number against which the parallel batch's wall-clock is compared. The coordinator may or may not run a checkpoint review on you (since you're isolated, the checkpoint discipline can be relaxed) — but you still follow the same execution rules.

## Your ticket

`tools/regression-check.sh` calls `python3` to parse `feature-manifest.json`, which fails on Windows because `python3` resolves to the Microsoft Store app-execution alias rather than the real Python 3.12 installation. The real Python is installed and works under the name `python`. Session boundary checks defined in `dashboard/CLAUDE.md` cannot run on Windows because of this.

The fix: pick a Python interpreter once at the top of the script, falling back from `python3` to `python`, and use a variable (`$PY`) throughout. Note that just checking `command -v python3` isn't enough because the Microsoft Store alias returns success for `command -v` but fails when actually invoked — a `python3 --version >/dev/null 2>&1` guard is required.

Full ticket: https://jlfowler1084.atlassian.net/browse/CAR-138

## Acceptance criteria

- [ ] `bash tools/regression-check.sh` runs to completion on a Windows machine where `python3` is only the Microsoft Store alias.
- [ ] Still runs on macOS/Linux where `python3` is the real interpreter.
- [ ] All existing manifest entries still PASS (no regressions).
- [ ] A deliberately-broken manifest entry (wrong file path) still FAILs as before.

## Intent summary (what success looks like)

On Windows where `python3` resolves to the Microsoft Store alias, `bash tools/regression-check.sh` runs to completion using a fallback to `python` while remaining green on macOS/Linux.

## Your worktree

Branch: `worktree/CAR-138-windows-python3-fallback`
Worktree directory: `.worktrees/worktree-CAR-138-windows-python3-fallback/`

The coordinator has already created this worktree for you.

## Your file scope

You MAY modify:
- `tools/regression-check.sh`

You MUST NOT modify any other file. If your implementation requires a file not listed here, STOP and write `STATUS.md=EMERGENT_SCOPE_NEEDED` describing the file and why; return to coordinator.

## Checkpoint pattern (READ CAREFULLY)

### Phase A — Checkpoint commit

1. Implement the `PY=` interpreter-pick block at the top of the script (with the `python3 --version` guard) AND replace at least one `python3` invocation downstream with `"$PY"`.
2. Run the script locally on the coordinator's machine to confirm it executes (the coordinator is on Windows; this is the canonical reproduction environment).
3. `git add tools/regression-check.sh` (never `git add .`).
4. `git commit -m "fix(CAR-138): fall back from python3 to python in regression-check.sh"`. Hooks will run; respect them.
5. Write `STATUS.md` with:
   ```
   STATUS: AWAITING_CHECKPOINT_REVIEW
   ticket: CAR-138
   branch: worktree/CAR-138-windows-python3-fallback
   commit: <SHA>
   files_touched: tools/regression-check.sh
   intent_exercised: <one sentence>
   blocked: false
   ```
6. STOP and return.

### Phase B — After coordinator approval

1. Replace ALL remaining `python3` invocations with `"$PY"`.
2. Run the script on the live `feature-manifest.json` and confirm all manifest entries PASS.
3. Run `gitleaks detect --no-git --source tools/regression-check.sh` (no findings expected).
4. Push: `git push -u origin worktree/CAR-138-windows-python3-fallback`. Hooks will run; respect them.
5. Open PR via `/ship CAR-138` Phase A.
6. Update STATUS.md to `PR_OPEN`.

## Hard constraints

- **NEVER use `--no-verify`** on any git command. If a hook fails, write `STATUS.md=BLOCKED_HOOK_FALSE_POSITIVE` with the hook name + full error, stop, return.
- **NEVER commit to or push to `main`.** You are on `worktree/CAR-138-windows-python3-fallback`; only push to that branch.
- **NEVER merge the PR.** The human merges.
- **NEVER modify files outside `tools/regression-check.sh`.** If emergent need, escalate via STATUS.md=EMERGENT_SCOPE_NEEDED.
- **NEVER spawn sub-subagents via Task tool.** You are a leaf implementer.
- **NEVER invoke Atlassian MCP for tickets other than CAR-138.**
- **Token budget:** 50 tool-round-trips max. At 90% consumption, write `STATUS.md=BLOCKED_TOKEN_BUDGET` and stop.
- **Wall-clock ceiling:** 30 minutes. If exceeded, same bailout.
- **No `git add .`** — stage files by name only.

## Report back

Whenever you stop (checkpoint, PR-open, or BLOCKED), your STATUS.md is your report. The coordinator reads it.
