[CAR-181] Coordinate the CAR-scoped pilot run of subagent swarm (1 baseline + 4 parallel streams)

## Model Tier

**Sonnet** — coordinator role. Per the original INFRA-220 design, the coordinator MUST be Sonnet, not Opus, to preserve the experimental fidelity of the "can a normal operator model coordinate a 5-stream swarm under 15 min/stream" hypothesis. Subagents spawned via `Task` tool inherit the `implementer` agent config (also Sonnet).

If you find yourself wanting to think harder than Sonnet allows mid-run, that's a friction point — log it in the running friction file (`docs/solutions/.car-pilot-friction-log.md`) rather than escalating to Opus, so the learnings doc captures it honestly.

## Ticket

Primary: [CAR-181](https://jlfowler1084.atlassian.net/browse/CAR-181) — CAR-scoped pilot run of subagent swarm.

Pilot batch (5 child tickets, NOT subtasks of CAR-181):
- **Baseline:** [CAR-138](https://jlfowler1084.atlassian.net/browse/CAR-138) — `tools/regression-check.sh` Windows fix
- **Stream A:** [CAR-143](https://jlfowler1084.atlassian.net/browse/CAR-143) — Bullet character render fix
- **Stream B:** [CAR-153](https://jlfowler1084.atlassian.net/browse/CAR-153) — Mock WorkOne tests
- **Stream C:** [CAR-140](https://jlfowler1084.atlassian.net/browse/CAR-140) — Case-insensitive email uniqueness
- **Stream D:** [CAR-141](https://jlfowler1084.atlassian.net/browse/CAR-141) — Tighten contact auto-create (queued behind C; shared-interface freeze)

## Authoritative artifacts (read these first)

- **Parallelization Map:** `docs/plans/2026-04-25-001-car-pilot-parallelization-map.md` — stream definitions, file scopes, shared interfaces, merge order, checkpoint requirements per stream. THIS is your authoritative spec.
- **Per-stream contracts (already pre-rendered for you):**
  - `prompts/contracts/CAR-138-contract.md` (baseline)
  - `prompts/contracts/CAR-143-contract.md` (Stream A)
  - `prompts/contracts/CAR-153-contract.md` (Stream B)
  - `prompts/contracts/CAR-140-contract.md` (Stream C)
  - `prompts/contracts/CAR-141-contract.md` (Stream D)
- **Process reference (from sister pilot):** `F:\Projects\ClaudeInfra\prompts\INFRA-220-pilot-swarm-execution.md` — Phases 0–7 and review protocol. Use as the procedural template; substitute the CAR ticket batch for the original INFRA tickets.
- **Compensating-controls authority:** ADR-0033 at `F:\Projects\ClaudeInfra\docs\decisions\ADR-0033-pre-pilot-security-gates.md`.

## Your phases (adapted from INFRA-220)

### Phase 0 — Pre-flight verification

Run all checks before spawning any subagent:

1. `git checkout feature/dashboard-v2 && git pull --ff-only`
2. Verify INFRA-217/218/219 prerequisites landed (already verified by Opus prep session — no need to re-grep, but confirm `gitleaks version` works in your shell).
3. Verify the 5 pilot tickets are still in To Do status via Atlassian MCP. Any shifted (Done/In Progress/Blocked) → STOP and ask the user.
4. The Map already encodes file scope — but re-grep each declared file list against the current `feature/dashboard-v2` working tree to confirm files still exist where the Map claims they do. (Opus session ran this on 2026-04-25 — re-confirm in case anything has moved.)
5. `gitleaks detect` smoke test: `echo 'AWS="AKIAIOSFODNN7EXAMPLE"' > /tmp/gl-test.txt && gitleaks detect --no-git --source /tmp/gl-test.txt; rm /tmp/gl-test.txt`. Expect nonzero exit + findings.

### Phase 1 — Serial baseline (CAR-138)

Execute CAR-138 yourself (NOT via a subagent — you ARE the coordinator, so "yourself" means this Sonnet session's direct work):

1. Create worktree: use the `worktree-management` skill or run `git worktree add .worktrees/worktree-CAR-138-windows-python3-fallback -b worktree/CAR-138-windows-python3-fallback`.
2. Implement per `prompts/contracts/CAR-138-contract.md` (Phase A + Phase B together — no checkpoint discipline needed for the baseline since you ARE the reviewer).
3. Run the script to verify it works on this Windows machine (the canonical reproduction env).
4. Commit, push, `/ship CAR-138` Phase A to open the PR.
5. **Record wall-clock from worktree-create to PR-open. This is the serial baseline number.**
6. Do NOT merge yet; user reviews and merges.

### Phase 2 — Parallelization Map review

Open `docs/plans/2026-04-25-001-car-pilot-parallelization-map.md` and read it end to end. Confirm:
- Stream count, branch names, file scopes match your understanding of the 4 parallel tickets.
- The shared-interface freeze on `auto-create/route.ts` is internalized — you'll enforce it on Stream D's checkpoint review.

If anything in the Map looks wrong, STOP and ask the user before spawning. Do NOT edit the Map mid-run; that's a friction point worth logging instead.

### Phase 3 — (Skipped — contracts pre-rendered)

The Opus prep session already pre-rendered all 4 delegation contracts at `prompts/contracts/`. Do not re-author them. If a contract needs adjustment based on Phase 0 findings, log it as friction and ask the user.

### Phase 4 — Execute the swarm

#### 4.1 Pre-create all 4 worktrees serially

```bash
for stream in CAR-143-bullet-character-fix CAR-153-mock-workone-tests CAR-140-case-insensitive-email-uniqueness CAR-141-tighten-contact-auto-create; do
  git worktree add ".worktrees/worktree-$stream" -b "worktree/$stream"
done
```

Do NOT cd into them; the subagents will.

#### 4.2 Spawn streams A, B, C in a single turn (cap 3)

In one assistant turn, spawn 3 parallel `Task` tool_use blocks with `subagent_type=implementer`, one each for CAR-143, CAR-153, CAR-140. The prompt for each is the contents of `prompts/contracts/CAR-XXX-contract.md`.

**Stream D is queued.** Do not spawn it until Stream C lands.

#### 4.3 Process each return

When a Task returns, the subagent is at `STATUS=AWAITING_CHECKPOINT_REVIEW` (or BLOCKED). For each return, run the per-stream coordinator review protocol from the Map (steps 1–6 in the "Coordinator review protocol per checkpoint return" section):

1. **Reflog audit** — `--no-verify` grep, must be clean.
2. **Branch audit** — subagent stayed on its branch.
3. **Main-delta audit** — no commits to main.
4. **Scope check** — `git diff main...HEAD --name-only` matches declared list.
5. **Content check** — production-code modification + premise exercise.
6. **Decision** — APPROVED / SCAFFOLD_REJECT / DRIFT_DETECTED / BLOCKED_HOOK_FALSE_POSITIVE.

**Time tracking — MUST do per stream:** record `T_spawn`, `T_checkpoint_return`, `T_approved`, `T_pr_open`, and crucially `T_coordinator` (sum of YOUR review time across all returns for that stream). This is the 15-min-threshold datapoint.

#### 4.4 Stream D promotion

When Stream C reaches `PR_OPEN` AND the user merges C to `main`:
1. Coordinator runs verification on `main` (`npm run build` + `npx vitest run` + `tools/regression-check.sh`).
2. If verification passes, spawn Stream D via Task. The contract instructs D to rebase onto origin/main as its first action.
3. D's checkpoint will INCLUDE the `auto-create/route.ts` changes from C as its base; D's gate-check edits go on top.

#### 4.5 Partial-success handling

Per Map. ≥60% threshold = 3 of 4 parallel streams reach PR_OPEN, OR 2 parallel + baseline.

### Phase 5 — Write learnings doc

Create `docs/solutions/car-pilot-subagent-swarm-learnings.md`. Structure per INFRA-220 §5 template, with these CAR-specific additions:

- **Comparison section:** how do the CAR coordinator-time numbers compare to INFRA-220's? Does the swarm process generalize across project types (Python CLI + Next.js dashboard vs. infra tooling)?
- **Shared-interface freeze evaluation:** did the C→D rebase pattern work cleanly, or did D need substantial intervention? This is the first time the freeze mechanic is exercised live.

Minimum 3 friction points (phase + workaround + v1.1-proposal triplets).

### Phase 6 — v1.1 gate decision

Same logic as INFRA-220 §6. ≤15 min/stream avg → v1 sufficient. >15 min → file v1.1 ticket.

If INFRA-220 already shipped a v1.1 decision, your job is to either confirm it (CAR run agrees) or contradict it (CAR run shows different result — file a follow-up ticket explaining the divergence).

### Phase 7 — Ship CAR-181

`/ship CAR-181`:
- Phase A: commit the learnings doc + this prompt + any artifacts not already committed by the prep session.
- Phase B (after user merges): transition CAR-181 to Done with final Jira comment summarizing outcomes.

The 5 implementation tickets ship via their own subagent-opened PRs.

## Hard constraints (recap)

- `--no-verify` is forbidden. Anywhere. By anyone. Including you.
- No subagent pushes to `main`. Ever.
- No subagent merges any PR. Ever.
- No subagent spawns sub-subagents.
- No cross-project MCP calls from subagents (CAR-only for them; you can hit any project).
- Coordinator MUST run reflog audit + scope check + main-delta check per stream return.
- Serial baseline (CAR-138) is measured, not estimated.
- `T_coordinator` is recorded per stream, not aggregate.
- Stream D MUST rebase onto post-C `main` before its checkpoint commit. The contract enforces this.
- The shared-interface freeze on `auto-create/route.ts` is the highest-value process measurement of this run — protect it.

## Report back to user

End-of-run report:
- Per-stream outcomes table (with `T_coordinator` per stream).
- Batch wall-clock vs CAR-138 baseline.
- Premise-test result (15-min threshold met / exceeded).
- Any INFRA-221 bypass attempts (none expected).
- Shared-interface freeze outcome (clean / required intervention / failed).
- Learnings doc link.
- v1.1 gate decision (or confirmation of INFRA-220's prior decision).
- Any follow-up tickets filed.
- Remaining action items for user (PR merges, Jira transitions on CAR-138/143/153/140/141, CAR-181 transition).
