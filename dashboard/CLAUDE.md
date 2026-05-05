@AGENTS.md

## Prompt Template Standard (INFRA-96)

Every Claude Code session in this project MUST begin with a prompt that follows this format:

```
[CAR-xxx] Brief summary of work being performed
```

### Validation Rules

- **Jira ticket is mandatory** — First line must start with a CAR ticket key in brackets (e.g., `[CAR-122]`). If the user's initial prompt doesn't include one, ask: "What's the CAR ticket for this work?" before proceeding.
- **Summary line is mandatory** — One sentence on the same line as the ticket key describing what's being done.
- **Model tier declaration** — Prompts should include a `Model: Haiku|Sonnet|Opus` line. If missing, default to Sonnet for this project unless the task is clearly Haiku-level (classification, extraction, simple relay).
- **Jira closure** — Every completed session must end with:
  - A comment on the CAR ticket summarizing changes
  - Transition to Done (transition id: `31`) unless blocked

### Model Routing (CareerPilot-specific)

- **Haiku** (`claude-haiku-4-5-20251001`): Email classification, extraction, simple relay tasks, debrief analysis, fit scoring
- **Sonnet**: Multi-file code changes, investigation, UI work, API route development, bug fixes
- **Opus**: Architecture planning, multi-system integration design

Before any new Claude API call in application code: justify the model choice in a code comment and verify it can't be replaced with rules-based logic, an MCP server, or a direct API call.

## Session Boundaries

- **Start of session:** Run `tools/regression-check.sh` and verify all features pass before making changes.
- **End of session:** Run `tools/regression-check.sh` again. If any new features were added, add them to `feature-manifest.json` first.
- **Build gate:** Run `npm run build` before declaring any task done. TypeScript errors block completion.

### Worktree env bootstrap

Every new git worktree off `feature/dashboard-v2` starts with no `dashboard/.env.local`. Without it, `npm run build` fails on the static prerender of `/login`:

```
Error: @supabase/ssr: Your project's URL and API key are required
```

TypeScript compile and Next.js bundling pass; only the static export of unauthenticated pages dies (failure mode discovered in CAR-214).

**Run once after `npm ci` in any new worktree:**

```bash
bash tools/worktree-bootstrap-env.sh
```

This uses `VERCEL_TOKEN` (configured per CAR-212) to:
1. Link the worktree directory to the `career-pilot` Vercel project (`vercel link`)
2. Pull production env vars into `dashboard/.env.local` (`vercel env pull`)

Prerequisites: `VERCEL_TOKEN` must be set in the shell environment. See the [Token](#token) section below (CAR-212) if it is missing.

## Vercel Deployment Verification

**A merge to `feature/dashboard-v2` is NOT proof that production was updated.** During CAR-209/210 we discovered that GitHub's `Vercel: success` status check only reports that *some* build attempt finished — not that the build produced real output or that the production alias was updated. The cause was a misconfigured Root Directory (CAR-211); other failure modes are possible. Always verify deployments with the CLI, not the GitHub status check.

### Token

`VERCEL_TOKEN` is configured as a Windows User-scope env var. The Vercel CLI auto-picks it up from the env — no `--token` flag needed. If a session's `$env:VERCEL_TOKEN` shows empty:
- It's **almost always** a process-inheritance issue (the parent terminal launched before the env var was set)
- Read it on-demand via PowerShell: `[Environment]::GetEnvironmentVariable("VERCEL_TOKEN", "User")`
- Or restart the parent process (close & reopen the terminal / Claude Code)

### Quick reference

| Command | When |
|---|---|
| `npx vercel ls career-pilot --scope jlfowler1084s-projects` | Check recent deployments + their environment + build duration |
| `npx vercel inspect <url> --scope jlfowler1084s-projects` | Confirm a deploy has real output (look for "X output items hidden", not just `. [0ms]`) |
| `npx vercel project inspect career-pilot --scope jlfowler1084s-projects` | Verify project settings (Root Directory should be `dashboard`) |
| `npx vercel deploy --prod --yes` *(from `dashboard/`)* | Manual production deploy when auto-deploy fails |

### Post-merge verification checklist

After every PR merge to `feature/dashboard-v2`:

1. `npx vercel ls career-pilot --scope jlfowler1084s-projects | head -10` — find the new deployment
2. Confirm its **build duration > 30s** (a 3-5s build is a ghost / empty deploy)
3. `npx vercel inspect <url>` — confirm the Builds section shows real Lambda functions, not just `. [0ms]`
4. Confirm production aliases (`career-pilot-two-ivory.vercel.app` and friends) point at the new build
5. Optional but gold-standard: Playwright HTML fetch against the production URL, look for code markers from the new commit

If step 2 or 3 fails, **production is NOT updated** despite the green CI. Fall back to manual `vercel deploy --prod --yes` from `dashboard/` and investigate the auto-deploy pipeline.

### Incident reference

See `docs/solutions/best-practices/vercel-deploy-verification.md` for the CAR-209/210/211 incident write-up — green CI + 43-hour-stale production.
