# CAR-148 — Stream Performance Coach debrief analysis + raise maxDuration to 300s

**Model tier:** Sonnet (execution session — not Opus)
**Ticket:** https://jlfowler1084.atlassian.net/browse/CAR-148
**Project root:** `F:\Projects\CareerPilot`
**Base branch:** `feature/dashboard-v2` (this project's effective main per CLAUDE.md — NOT `master`)
**Worktree path:** `.worktrees/CAR-148-stream-coaching-analyze`
**New branch name:** `feature/CAR-148-stream-coaching-analyze`

## Before you start

- `git fetch origin && git pull origin feature/dashboard-v2` in the main working directory first so the worktree branches off fresh code.
- Verify `.worktrees/` is in `.gitignore` before creating the worktree (per global rules).
- Verify the current Vercel plan supports `maxDuration = 300`. Hobby caps at 60, Pro at 300. If the project is on Hobby, stop and escalate before touching code — this ticket assumes Pro.

## What you're doing

The "Analyze Debrief" button in the Performance Coach section of the dashboard times out on long Otter.ai transcripts (55+ min interviews, ~15-20K input tokens, up to 8K output tokens). CAR-133/134 added a friendly 504 + Retry UX but left the 90s wall in place. This ticket is the **short-term stopgap**: switch the Anthropic call to streaming SSE and raise the Vercel function ceiling to 300s so long transcripts actually complete. Routing to local Qwen is out of scope — that's a separate Phase 1b effort.

## Why this matters

Joe hit the timeout again today on a real recruiter debrief. The fix is load-bearing for the dashboard v2 branch before it ships.

## Scope — three changes

### 1. API route — streaming + extended timeout

File: [dashboard/src/app/api/coaching/analyze/route.ts](../dashboard/src/app/api/coaching/analyze/route.ts)

- Change `export const maxDuration = 90` → `export const maxDuration = 300`.
- Change the manual `AbortController` `setTimeout` from `90_000` → `300_000`.
- Update the 504 error message from "Analysis timed out after 90s..." → "Analysis timed out after 5 minutes..." (preserve the Retry-button pattern).
- Switch the Anthropic fetch call from non-streaming JSON to `stream: true` SSE. Anthropic's streaming API docs: https://docs.anthropic.com/en/api/messages-streaming.
- Proxy an SSE response back to the client. Use `ReadableStream` + `TransformStream` to forward Anthropic's `content_block_delta` events. Include a final `event: done` with the accumulated JSON payload the UI needs to re-assemble the analysis.
- Preserve the existing `stop_reason === "max_tokens"` truncation check against the final accumulated message.
- Preserve the persistence logic — only `insert` into `interview_coaching` (and `debriefs` when applicable) after a successful full stream. On abort or stream error, return a 504 with the same shape as today.
- Keep rules-based pattern analysis (`analyzeFillersAndPatterns`) pre-stream, exactly as it is today.

### 2. Hook — consume the stream

File: [dashboard/src/hooks/use-coaching.ts](../dashboard/src/hooks/use-coaching.ts)

- Replace the `fetch().then(res => res.json())` pattern in `analyzeDebrief` with a streaming consumer. Either use `EventSource` (if the SSE endpoint shape allows) or `fetch` + `response.body.getReader()` + a text decoder.
- Expose incremental state: at minimum a `streamingText` string that grows as tokens arrive. Optionally a progress percentage if it's easy to derive from Anthropic's usage events.
- On the final `done` event, parse the accumulated JSON and set the `session` / `sessions` state as today.
- On stream error or abort, surface the same error shape the component currently handles (so the existing Retry button keeps working).
- Update `useCoaching` test coverage in [dashboard/src/__tests__/hooks/use-coaching.test.ts](../dashboard/src/__tests__/hooks/use-coaching.test.ts) — add a streaming-success case and a stream-aborted case. Use mocked ReadableStream responses.

### 3. UI — show progressive output

File: [dashboard/src/components/coaching/coaching-section.tsx](../dashboard/src/components/coaching/coaching-section.tsx)

- While `analyzing` is true and `streamingText` is non-empty, render a subdued monospace block showing the latest ~30 lines of streamed text. This is live-feedback UX — not the final rendered analysis.
- When the stream completes, swap to the fully rendered analysis (no change to the rendered view — still driven by `session.ai_analysis`).
- Preserve the existing Retry button for 504 timeouts.

## Out of scope

- Any change to `/api/debriefs/analyze` — different path, not the reported bug.
- Any change to Interview Prep (working reference).
- Chunking the transcript by question/segment (evaluate after streaming ships).
- Routing to local Qwen (Phase 1b).
- Prompt, schema, or model changes — still Haiku, still max_tokens 8192.

## Execution workflow

1. **Create a worktree.** From `F:\Projects\CareerPilot`, run `git worktree add .worktrees/CAR-148-stream-coaching-analyze -b feature/CAR-148-stream-coaching-analyze feature/dashboard-v2`. Confirm `.worktrees/` is gitignored first. Work from the worktree for the rest of the session.
2. **Run `tools/regression-check.sh`** before any changes (per dashboard/CLAUDE.md session boundary rule).
3. **Implement in order: route → hook → component → tests.** Commit after each logical unit. Prefixes: `feat(CAR-148)` / `refactor(CAR-148)` / `test(CAR-148)`.
4. **After every change** run `npm run test -- --run` (vitest) and `npm run build` from the dashboard directory. Build errors block completion.
5. **Manual verification:** start `npm run dev`, paste the long Otter.ai transcript Joe mentioned (or any transcript >12K tokens) into the Performance Coach textarea, click Analyze Debrief. Confirm: streaming text appears within ~2s, final analysis renders, row persists in `interview_coaching` and `debriefs`, no console errors.
6. **Run `tools/regression-check.sh` again** at the end. Any PASS→FAIL must be fixed before pushing.

## When you're done

- All four files modified and committed
- `npm run test` passes
- `npm run build` succeeds with zero TypeScript errors
- Manual streaming verification confirmed against a long transcript
- Regression-check shows no PASS→FAIL
- Push the branch and open a PR referencing CAR-148
- Transition CAR-148 in Jira to Done (transition id 31) unless blocked
- Comment on the ticket summarizing the changes and linking the PR

## Things NOT to do

- Do not work on `feature/dashboard-v2` directly. Worktree first.
- Do not modify `/api/debriefs/analyze` or `/api/interview-prep` — out of scope.
- Do not change the model, prompt, or schema. Do not touch max_tokens.
- Do not swap to a background-job pattern. That's Phase 1b, different ticket chain.
- Do not amend commits on this branch without explicit approval. Create new commits.
- Do not force-push. Do not bypass hooks. Do not commit `.claude/settings.local.json`.
