# Subagent Delegation Contract — CAR-141

You are an implementer subagent executing CAR-141 as part of the CAR-181 pilot run of the INFRA-216 SubAgent Swarm. This is **Stream D** of 4 parallel streams.

**CRITICAL — shared interface freeze:** `dashboard/src/app/api/contacts/auto-create/route.ts` is owned by Stream C (CAR-140) for the duration of the parallel batch. You MUST NOT touch this file in your Phase A checkpoint commit. The file appears in your Phase B scope, but only AFTER Stream C lands on `main` and the coordinator instructs you to rebase.

## Your ticket

Current contact auto-create logic fires for every email classified as `recruiter_outreach` with no filtering. Real production data shows 6 of 8 contacts are noise: LinkedIn notification wrappers (`hit-reply@linkedin.com`), Indeed bots (`donotreply@match.indeed.com`), the user's own email address (outgoing emails misclassified), and one-shot job alerts the user never replied to. User-stated desired behavior: "Contacts should only get created if I specifically replied to one in regards to a position."

Fix: a `shouldAutoCreateContact` gate helper that rejects bot/noreply local parts, blocked notification domains (LinkedIn), the user's own email, and threads with no `replied_at`. Apply the gate at the caller (`use-emails.ts`) AND server-side (`auto-create/route.ts`) for layered defense.

Full ticket: https://jlfowler1084.atlassian.net/browse/CAR-141

## Acceptance criteria

- [ ] `shouldAutoCreateContact` helper exists in `dashboard/src/lib/contacts/auto-create-gate.ts` with unit tests.
- [ ] `dashboard/src/hooks/use-emails.ts` filters through the helper before calling `/api/contacts/auto-create`.
- [ ] `/api/contacts/auto-create` re-checks the helper server-side and returns `{skipped: <reason>}` when blocked.
- [ ] A new recruiter email from a real recruiter that the user replies to creates a contact.
- [ ] A new recruiter email from a real recruiter that the user has NOT replied to does NOT create a contact.
- [ ] An inbox scan containing LinkedIn notifications, Indeed job alerts, donotreply robots, and outgoing user emails creates ZERO new contacts.
- [ ] The 6 junk contacts listed in the ticket's Reproduction table are removed from production data (one-time cleanup, can be done manually post-merge).

## Intent summary (what success looks like)

An inbox scan containing LinkedIn notifications, Indeed job alerts, donotreply robots, and outgoing user emails creates zero new contacts; only recruiter threads where the user has replied result in a contact, enforced both client-side in `use-emails.ts` and server-side in the auto-create route via a shared `shouldAutoCreateContact` gate helper.

## Your worktree

Branch: `worktree/CAR-141-tighten-contact-auto-create`
Worktree directory: `.worktrees/worktree-CAR-141-tighten-contact-auto-create/`

## Your file scope

**Phase A scope (checkpoint — MUST NOT include `auto-create/route.ts`):**
- `dashboard/src/lib/contacts/auto-create-gate.ts` (NEW)
- `dashboard/src/__tests__/lib/contacts/auto-create-gate.test.ts` (NEW)

**Phase B scope (after Stream C merge + your rebase):**
- All Phase A files PLUS:
- `dashboard/src/hooks/use-emails.ts`
- `dashboard/src/app/api/contacts/auto-create/route.ts`

You MUST NOT modify any other file. If your implementation requires a file not listed here, STOP and write `STATUS.md=EMERGENT_SCOPE_NEEDED`.

## Checkpoint pattern

### Phase A — Checkpoint commit (REDUCED SCOPE due to shared-interface freeze)

1. Create `dashboard/src/lib/contacts/auto-create-gate.ts` with the `shouldAutoCreateContact(candidate, userEmail): {allow: boolean; reason?: string}` export. Block list per the ticket: blocked local parts (`donotreply`, `noreply`, `no-reply`, `hit-reply`, `inmail-hit-reply`, `bounce`, `mailer-daemon`, `notifications`, `postmaster`); blocked domains (`linkedin.com` and subdomains); user's own email (case-insensitive); missing `replied_at`.
2. Create `dashboard/src/__tests__/lib/contacts/auto-create-gate.test.ts` with tests for: real recruiter with `replied_at` set → allow; missing `from_email` → reject; user's own email (case-insensitive) → reject; each blocked local part → reject; LinkedIn domain → reject; null `replied_at` → reject; each rejection has non-empty `reason`.
3. Run `cd dashboard && npx vitest run src/__tests__/lib/contacts/auto-create-gate.test.ts` — must pass.
4. `git add dashboard/src/lib/contacts/auto-create-gate.ts dashboard/src/__tests__/lib/contacts/auto-create-gate.test.ts`.
5. `git commit -m "feat(CAR-141): add shouldAutoCreateContact gate helper with tests"`.
6. Write STATUS.md:
   ```
   STATUS: AWAITING_CHECKPOINT_REVIEW
   ticket: CAR-141
   branch: worktree/CAR-141-tighten-contact-auto-create
   commit: <SHA>
   files_touched: dashboard/src/lib/contacts/auto-create-gate.ts, dashboard/src/__tests__/lib/contacts/auto-create-gate.test.ts
   intent_exercised: helper + passing tests prove the gating rules before any caller or server wiring
   shared_interface_freeze_respected: true (auto-create/route.ts NOT touched)
   blocked: false
   ```
7. STOP and return.

### Phase B — After coordinator approval AND Stream C lands on main

The coordinator dispatches with: "Stream C has landed. Rebase onto origin/main, then complete Phase B."

1. In your worktree: `git fetch origin && git rebase origin/main`. Resolve conflicts if any (none expected — your Phase A files don't overlap C's).
2. Update `dashboard/src/hooks/use-emails.ts`: filter `recruiterEmails` through `shouldAutoCreateContact` before the `fetch("/api/contacts/auto-create", ...)` loop. Plumb in `currentUserEmail` from the Supabase session.
3. Update `dashboard/src/app/api/contacts/auto-create/route.ts`: re-run the gate server-side after parsing the body; on rejection, return `NextResponse.json({contact: null, created: false, skipped: gate.reason})`. Note: this file now contains C's email-normalization changes from Stream C — preserve those; add your gate check above the existing logic.
4. Run `cd dashboard && npm run build && npx vitest run`. Fix failures.
5. Manual smoke test: scan an inbox containing LinkedIn / Indeed / donotreply / user-self emails — confirm zero new contacts. Capture in PR description.
6. Run `gitleaks detect --no-git --source dashboard/`.
7. Push: `git push -u origin worktree/CAR-141-tighten-contact-auto-create` (may need `--force-with-lease` after rebase — coordinator approves this exception).
8. Open PR via `/ship CAR-141` Phase A.
9. Update STATUS.md to `PR_OPEN`.

## Hard constraints

- **NEVER use `--no-verify`.** Hook failure → BLOCKED_HOOK_FALSE_POSITIVE, stop.
- **NEVER commit to or push to `main`.**
- **NEVER merge the PR.**
- **NEVER touch `dashboard/src/app/api/contacts/auto-create/route.ts` IN PHASE A.** The shared-interface freeze is the most important rule for this stream.
- **NEVER touch `dashboard/src/lib/contacts/validation.ts`** — that's Stream C's territory.
- **NEVER modify files outside your declared scope.**
- **NEVER spawn sub-subagents.**
- **NEVER invoke Atlassian MCP for tickets other than CAR-141.**
- **`--force-with-lease` IS PERMITTED on your own branch ONLY**, ONLY after rebase, ONLY in Phase B. Never on `main`.
- **Token budget:** 120 tool-round-trips max.
- **Wall-clock ceiling:** 75 minutes (split across Phase A checkpoint + Phase B post-rebase).
- **No `git add .`** — stage files by name.

## Report back

STATUS.md is your report.
