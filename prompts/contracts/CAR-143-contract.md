# Subagent Delegation Contract — CAR-143

You are an implementer subagent executing CAR-143 as part of the CAR-181 pilot run of the INFRA-216 SubAgent Swarm. This is **Stream A** of 4 parallel streams.

## Your ticket

The Delete Contact confirmation dialog displays the literal escape sequence `•` in front of each "What Will Happen" bullet point, instead of an actual bullet character `•`. Discovered during CAR-116 Tier 3 verification on 2026-04-14.

The source code almost certainly contains `"•"` written as a literal 6-character string inside a JSX text node, rather than the decoded Unicode character `•` or a properly JS-escaped string literal. Most likely location: `dashboard/src/components/contacts/contact-delete-dialog.tsx` (confirmed by pre-spawn grep — sole occurrence in `dashboard/src/components/contacts/`).

The cleanest fix is replacing the literal `•` with a proper React `<ul><li>` structure (idiomatic HTML; CSS renders the bullet via `list-style-type: disc`). Alternatives: literal `•` Unicode character, or `{"•"}` JSX expression wrapper.

Full ticket: https://jlfowler1084.atlassian.net/browse/CAR-143

## Acceptance criteria

- [ ] Deleting a contact shows real bullet characters (or a properly-rendered `<ul>`) in the "What Will Happen" section.
- [ ] No `•` strings remain in the rendered DOM.
- [ ] Audit `dashboard/src/components/contacts/` for any other `•` occurrences (pre-spawn grep already confirmed only `contact-delete-dialog.tsx` has it; if this changes, escalate).

## Intent summary (what success looks like)

Deleting a contact shows real bullet characters (or a properly-rendered `<ul>`) in the "What Will Happen" section, with no literal `•` strings remaining in the rendered DOM.

## Your worktree

Branch: `worktree/CAR-143-bullet-character-fix`
Worktree directory: `.worktrees/worktree-CAR-143-bullet-character-fix/`

The coordinator has already created this worktree for you.

## Your file scope

You MAY modify:
- `dashboard/src/components/contacts/contact-delete-dialog.tsx`

You MUST NOT modify any other file in this checkpoint. If the audit reveals `•` in another file, STOP and write `STATUS.md=EMERGENT_SCOPE_NEEDED` — the coordinator decides whether to widen scope or file a separate ticket.

## Checkpoint pattern

### Phase A — Checkpoint commit

1. Replace the `•` literals in `contact-delete-dialog.tsx` with the chosen fix (recommendation: `<ul><li>` structure).
2. Verify the change locally — either visually in the running dashboard, or via a DOM grep / React rendering test confirming `•` is gone.
3. `git add dashboard/src/components/contacts/contact-delete-dialog.tsx`.
4. `git commit -m "fix(CAR-143): render real bullets in contact delete dialog"`. Hooks will run.
5. Write `STATUS.md`:
   ```
   STATUS: AWAITING_CHECKPOINT_REVIEW
   ticket: CAR-143
   branch: worktree/CAR-143-bullet-character-fix
   commit: <SHA>
   files_touched: dashboard/src/components/contacts/contact-delete-dialog.tsx
   intent_exercised: <one sentence>
   blocked: false
   ```
6. STOP and return.

### Phase B — After coordinator approval

1. Run `npm run build` and `npm run lint` in `dashboard/`. Fix any failures.
2. If component tests exist for `contact-delete-dialog.tsx`, run them.
3. Run `gitleaks detect --no-git --source dashboard/src/components/contacts/contact-delete-dialog.tsx`.
4. Push: `git push -u origin worktree/CAR-143-bullet-character-fix`.
5. Open PR via `/ship CAR-143` Phase A.
6. Update STATUS.md to `PR_OPEN`.

## Hard constraints

- **NEVER use `--no-verify`** on any git command. Hook failure → `STATUS.md=BLOCKED_HOOK_FALSE_POSITIVE`, stop, return.
- **NEVER commit to or push to `main`.**
- **NEVER merge the PR.**
- **NEVER modify files outside your declared scope.**
- **NEVER spawn sub-subagents.**
- **NEVER invoke Atlassian MCP for tickets other than CAR-143.**
- **Token budget:** 50 tool-round-trips max.
- **Wall-clock ceiling:** 30 minutes.
- **No `git add .`** — stage files by name.

## Report back

STATUS.md is your report.
