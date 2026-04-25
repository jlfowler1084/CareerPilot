---
ticket: CAR-181
parent: INFRA-216
sister-pilot: INFRA-220
date: 2026-04-25
status: ready-for-execution
coordinator-model: sonnet
---

# CAR-181 — Parallelization Map (CAR-scoped subagent swarm pilot)

## Context

Second pilot run of the INFRA-216 SubAgent Swarm process. Produces an independent measurement against a CareerPilot bug-fix batch (Python CLI + Next.js dashboard) for cross-project comparison with the original INFRA-220 run.

This document follows the structure prescribed by `templates/parallelization-map.md` (in ClaudeInfra). It is the authoritative reference the coordinator uses for stream concurrency, shared-interface freezes, scope auditing, and checkpoint approval.

## Stream count

**5 total: 1 serial baseline + 4 parallel-eligible (concurrency cap 3, with one shared-interface freeze).**

The serial baseline (CAR-138) runs first in a throwaway worktree to establish the wall-clock reference number. The 4 parallel streams run after, with Stream D queued behind Stream C due to a shared-interface freeze on `auto-create/route.ts`.

## Streams

| Stream | Ticket | Worktree branch | Files touched (proposed) | Depends on | Merge order | Intent summary |
|---|---|---|---|---|---|---|
| Baseline | CAR-138 | `worktree/CAR-138-windows-python3-fallback` | `tools/regression-check.sh` | none | 0 (pre-batch) | On Windows where `python3` resolves to the Microsoft Store alias, `bash tools/regression-check.sh` runs to completion using a fallback to `python` while remaining green on macOS/Linux. |
| A | CAR-143 | `worktree/CAR-143-bullet-character-fix` | `dashboard/src/components/contacts/contact-delete-dialog.tsx` (sole occurrence per pre-spawn grep) | none | 1 (any) | Deleting a contact shows real bullet characters (or a properly-rendered `<ul>`) in the "What Will Happen" section, with no literal `•` strings remaining in the rendered DOM. |
| B | CAR-153 | `worktree/CAR-153-mock-workone-tests` | `scanner/test_gov_boards.py` | none | 1 (any) | `scanner/test_gov_boards.py` runs green without `ANTHROPIC_API_KEY` set and without network — both USAJobs and WorkOne scrapers stubbed via `unittest.mock.patch`, fixture data covers both valid-dicts and filters-irrelevant code paths. |
| C | CAR-140 | `worktree/CAR-140-case-insensitive-email-uniqueness` | new `dashboard/supabase/migrations/20260425000000_car_140_normalize_contacts_email.sql`; `dashboard/src/app/api/contacts/route.ts`; `dashboard/src/app/api/contacts/auto-create/route.ts`; `dashboard/src/lib/contacts/validation.ts`; `dashboard/src/__tests__/lib/contacts/validation.test.ts` | none | 2 (after A and B land) | Inserting `User@Example.com` then `user@example.com` for the same user returns the existing contact (no duplicate created), via a `normalizeContactEmail` helper plus a functional `lower(email)` unique index that replaces the case-sensitive btree, with the two real-world 2026-04-14 duplicate rows folded into one. |
| D | CAR-141 | `worktree/CAR-141-tighten-contact-auto-create` | new `dashboard/src/lib/contacts/auto-create-gate.ts`; new `dashboard/src/__tests__/lib/contacts/auto-create-gate.test.ts`; `dashboard/src/hooks/use-emails.ts`; `dashboard/src/app/api/contacts/auto-create/route.ts` (rebased onto post-C `main`) | C (shared-interface freeze) | 3 (after C lands) | An inbox scan containing LinkedIn notifications, Indeed job alerts, donotreply robots, and outgoing user emails creates zero new contacts; only recruiter threads where the user has replied result in a contact, enforced both client-side in `use-emails.ts` and server-side in the auto-create route via a shared `shouldAutoCreateContact` gate helper. |

## Shared interfaces (frozen before spawn)

**`dashboard/src/app/api/contacts/auto-create/route.ts`** — shared between Stream C (CAR-140) and Stream D (CAR-141).

- **Owner during pilot:** Stream C.
- **Why:** Both tickets need to add normalization/gating logic to this file. CAR-140 changes the email comparison semantics (case-insensitive lookup); CAR-141 adds an early-return gate. Allowing both subagents to edit it concurrently produces guaranteed merge conflict and risks drift on the file's overall shape.
- **Stream D's contract:** D must NOT touch this file in its initial checkpoint commit. After Stream C lands on `main`, the coordinator instructs D to `git pull --rebase origin main` in its worktree, then re-checkpoint with the file edits applied on top of C's version.
- **D's contract addendum:** the contract for CAR-141 carries an explicit "DO NOT TOUCH `auto-create/route.ts` IN PHASE A" instruction. The file appears in D's full Phase B scope but is excluded from the checkpoint commit.

## Pre-spawn overlap check

```
$ for f in <each ticket's declared file list>; do echo "=== $f ==="; grep -l "$f" <other tickets' files>; done
```

Coordinator runs this before spawning. Results expected:

- **Baseline ↔ A/B/C/D:** zero overlap (baseline runs in throwaway; doesn't matter)
- **A ↔ B:** zero (frontend tsx vs Python tests — different trees)
- **A ↔ C:** zero (different dashboard subtrees)
- **A ↔ D:** zero (different dashboard subtrees)
- **B ↔ C:** zero (Python vs dashboard)
- **B ↔ D:** zero (Python vs dashboard)
- **C ↔ D:** **`auto-create/route.ts` overlap** — handled by the shared-interface freeze above
- **C ↔ D bonus:** both touch `dashboard/src/lib/contacts/`. Stream C edits the existing `validation.ts`; Stream D adds new `auto-create-gate.ts`. Different files in the same directory — no overlap, no freeze needed.

If any unexpected overlap is found at runtime that wasn't caught here, that's a friction point for the learnings doc.

## Runtime overlap check

After each subagent's checkpoint commit, the coordinator runs (in the subagent's worktree):

```
git -C .worktrees/<branch_dir> diff main...HEAD --name-only
```

Output is compared against:
1. The stream's declared Files-touched list (above).
2. Other streams' actual committed paths (cumulative — query each worktree's `git diff main...HEAD --name-only`).

**Drift signals:**
- File touched that's not in the declared list → coordinator rejects checkpoint, re-dispatches with "return to scope."
- File touched that overlaps another stream's actual commits → coordinator either rebases the smaller stream onto the larger one's branch or escalates if the conflict is non-trivial.

## Merge gate

**Order:**
1. Baseline CAR-138 lands (or is left as a non-merged reference run; user decides).
2. Streams A and B run in parallel; either order on land.
3. Stream C lands on `main`.
4. Stream D coordinator dispatches a "rebase" instruction to D's worktree:
   ```
   git fetch origin && git rebase origin/main
   ```
5. D re-runs its checkpoint commit (now with C's `auto-create/route.ts` changes as its base).
6. D lands on `main` last.

**Verification between landings:**
- After C lands: coordinator runs `npm run build` + `npm test` + `tools/regression-check.sh` against `main` to confirm C didn't regress anything before allowing D to rebase.
- After D lands: same verification suite.

## Checkpoint commit (meaningful first commit) definition

Per the global INFRA-216 contract: a subagent's first commit MUST both:

1. Modify at least one production-code file in its declared Files-touched list, AND
2. Exercise the core premise of its intent summary — typically an interface + a failing test, or the smallest vertical slice that touches real behavior.

Scaffold-only commits (empty modules, test stubs, boilerplate imports without logic, file moves without content changes) do NOT satisfy the checkpoint requirement and will be rejected by the coordinator with a `SCAFFOLD_REJECT` re-dispatch.

**Per-stream concrete checkpoint expectations:**

| Stream | What a valid checkpoint looks like |
|---|---|
| Baseline | The `PY=` interpreter-pick block added at the top of `tools/regression-check.sh` AND at least one `python3` invocation replaced with `"$PY"` AND the script runs without error on the coordinator's machine. |
| A | `•` literal removed from `contact-delete-dialog.tsx`, replaced with either `•` character or a `<ul><li>` structure, AND a manual smoke-test screenshot or DOM grep confirming the bullet renders. |
| B | At least one of the four affected tests (`TestUSAJobs::test_returns_valid_dicts`, `TestUSAJobs::test_filters_irrelevant`, `TestWorkOne::test_returns_valid_dicts`, `TestWorkOne::test_filters_irrelevant`) running green via `unittest.mock.patch` with no `ANTHROPIC_API_KEY` env var set. |
| C | The new migration file present AND the `normalizeContactEmail` helper added to `validation.ts` AND a unit test for it added to `validation.test.ts` AND that test passing. (Migration application against a real DB can wait for Phase B; the helper + test is the checkpoint.) |
| D | The new `auto-create-gate.ts` module created with `shouldAutoCreateContact` exported AND `auto-create-gate.test.ts` added with at least the "rejects sender = user themselves" and "rejects donotreply local part" cases passing. NOTE: `auto-create/route.ts` MUST NOT be touched in this checkpoint per the shared-interface freeze; that wiring happens in Phase B after rebase. |

## Coordinator review protocol per checkpoint return (recap)

For each `STATUS=AWAITING_CHECKPOINT_REVIEW`:

1. **Reflog audit:** `git -C <worktree> reflog --all | head -50 | grep -i 'no-verify' || echo "clean"` — any hit, escalate.
2. **Branch audit:** `git -C <worktree> branch -a` — verify subagent stayed on its branch.
3. **Main-delta audit:** `git -C <worktree> log origin/main..HEAD --all --oneline` — verify no commits to main.
4. **Scope check:** `git -C <worktree> diff main...HEAD --name-only` against declared Files-touched.
5. **Content check:** `git -C <worktree> show --stat HEAD` — verify production-code modification + premise exercise.
6. **Decision:** APPROVED → re-dispatch Phase B. SCAFFOLD_REJECT → re-dispatch with corrective instruction. DRIFT_DETECTED → escalate.

## Time tracking (per stream)

For learnings doc:
- `T_spawn` (when Task was dispatched)
- `T_checkpoint_return` (when subagent returned with STATUS=AWAITING_CHECKPOINT_REVIEW)
- `T_approved` (when coordinator approved the checkpoint)
- `T_pr_open` (when subagent returned with STATUS=PR_OPEN)
- **`T_coordinator` per stream** = sum of coordinator review time only (steps 1–6 above for each return). This is the 15-min-threshold datapoint.

## Friction-point capture

Whenever the coordinator hits friction (rebase conflict, hook false positive, drift, scope confusion, contract ambiguity, etc.), it writes a one-paragraph entry to a running scratch file `docs/solutions/.car-pilot-friction-log.md` (gitignored or committed at end). The learnings doc draws ≥3 entries from this log at Phase 5.
