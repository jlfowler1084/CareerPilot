---
title: Dashboard inbox stale for 9 days — divergent Gmail OAuth token stores
date: 2026-04-30
category: integration-issues
module: dashboard
problem_type: integration_issue
component: email_processing
symptoms:
  - Dashboard /inbox displayed emails 9-10 days stale (last new email received 2026-04-21)
  - "Last scanned" timestamp advanced on every refresh click but no new emails were ingested
  - No error surfaced to UI despite every /api/gmail/scan call returning 502 invalid_grant
  - Timestamp rendered as time-only ("8:12:31 PM") so a 9-day-old cursor was visually identical to a fresh scan
  - Recurrence after CAR-194 re-auth because the fix targeted the CLI token, not the dashboard env var
root_cause: config_error
resolution_type: code_fix
severity: high
related_components:
  - authentication
tags:
  - oauth
  - gmail
  - refresh-token
  - dashboard
  - token-divergence
  - silent-failure
---

# Dashboard inbox stale for 9 days — divergent Gmail OAuth token stores

## Problem

CareerPilot's dashboard `/inbox` page silently stopped ingesting Gmail recruiter mail for 9 days while displaying a dateless "Last scanned 8:12:31 PM" timestamp that made the stale cursor indistinguishable from a fresh scan. Zero new emails surfaced between 2026-04-21 and 2026-04-30, no error toast or red banner ever appeared, and a prior session's "fix" had falsely closed the loop by verifying on the wrong surface.

## Symptoms

- Dashboard `/inbox` showed `Last scanned 8:12:31 PM` with no date — visually identical to a fresh scan despite being 9 days stale.
- Supabase `user_settings.last_email_scan` frozen at `2026-04-21 00:12:31 UTC` (= `8:12:31 PM EDT 2026-04-20`); `emails` table 7-day insert count = 0 against 3,237 historical rows.
- No error toast or red banner; only a silent `console.error` in DevTools after each 502 from `/api/gmail/scan`.
- Live probe of dashboard's `getGmailClient()` returned `400 invalid_grant — Token has been expired or revoked` while the CLI's Gmail scan continued to work.
- Yesterday's CAR-194/CAR-196 PRs were declared "fixing the inbox staleness" but the underlying ingestion never recovered.

## What Didn't Work

- **CAR-194 OAuth callback ephemeral-port fix** (shipped 2026-04-29). Solved the CLI re-auth flow. Did not touch `dashboard/.env.local`, so the dashboard's `GMAIL_REFRESH_TOKEN` stayed revoked. *Failed because the fix targeted only one of two divergent token stores.*
- **CAR-196 OAuth token-health monitor** (shipped 2026-04-29). Added daily Discord alerting for token expiry. Read the CLI token only — never probed the dashboard env path. *Failed because the monitor's coverage didn't match the failure surface.*
- **Verifying the fix on `/job-search` instead of `/inbox`** (yesterday's session). `/job-search` parses LinkedIn job-alert emails through a different code path and was working. Declaring the bug fixed without re-testing the exact surface in the user's report (`localhost:3000/inbox`) let a 9-day regression hide in plain sight. *(auto memory [claude]: `verify-on-the-users-actual-surface.md`)*
- **Trusting the dashboard's own "Last scanned" timestamp as a freshness signal.** The UI rendered `toLocaleTimeString()` only, so a 9-day-old cursor and a 30-second-old cursor displayed identically. Visual inspection could not distinguish success from silent failure.
- **Reading `console.error` in DevTools as the failure-detection channel.** The 502 responses from `/api/gmail/scan` were caught and logged but never surfaced to React state, so no toast, banner, or status pill appeared. The user's only feedback channel was a clean-looking page.

## Solution

### Immediate environment recovery

Wrote `scripts/car_197_sync_dashboard_token.py` to extract the live `refresh_token` from `data/gmail_token.json` (the CLI's working store) and rewrite the `GMAIL_REFRESH_TOKEN=` line in `dashboard/.env.local` in place. Restart the Next.js dev server so the env value is picked up. After running it, the dashboard's `getGmailClient()` probe authenticated successfully as `jlfowler1084@fowlerlab.dev` *(auto memory [claude]: `gmail-oauth-fowlerlab-domain.md` — CareerPilot Gmail authenticates as `@fowlerlab.dev`, not the global `@gmail.com`)*. Then in Supabase, `UPDATE public.user_settings SET last_email_scan = NULL WHERE user_id = …` so the next dashboard auto-scan-on-load runs the 30-day backfill.

### Durable code fix (PR #46, merge commit `7307683`)

**Capture the error and stop swallowing 502s** in `dashboard/src/hooks/use-emails.ts`:

Before:

```ts
if (data.error && !data.emails?.length) break

// ...later
if (scanSucceeded) {
  await supabase.from("user_settings").upsert(
    { user_id: user.id, last_email_scan: new Date().toISOString() },
    { onConflict: "user_id" }
  )
  setScanState((prev) => ({ ...prev, scanning: false, lastScan: new Date().toISOString() }))
}
```

After:

```ts
if (data.error && !data.emails?.length) {
  scanError = resp.status === 502
    ? `Gmail unavailable: ${data.error}`
    : `Scan failed (${resp.status}): ${data.error}`
  break
}

// ...later
if (shouldAdvanceCursor({ scanSucceeded, newInsertedCount: allNewEmails.length })) {
  // ratchet cursor only when real progress was made
  // ...
} else {
  setScanState((prev) => ({ ...prev, scanning: false, lastError: scanError }))
}
```

**Pure helper** at `dashboard/src/lib/inbox-cursor.ts` (extracted to its own file so the test doesn't drag in the Supabase client at import time):

```ts
export function shouldAdvanceCursor(args: {
  scanSucceeded: boolean
  newInsertedCount: number
}): boolean {
  return args.scanSucceeded && args.newInsertedCount > 0
}
```

**UI changes** in `dashboard/src/app/(main)/inbox/page.tsx`:

- "Last scanned" formatter: `toLocaleTimeString()` → `toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })` so a stale cursor cannot impersonate a fresh one.
- New red status line: `Scan failed — {error}` when `scanState.lastError` is populated.
- New "Backfill 30d" button that calls `forceBackfill(sinceISO)` for stuck-cursor recovery without manually editing Supabase.

### Verification

- Live re-probe of dashboard `getGmailClient()` post-sync: SUCCESS, auth as `jlfowler1084@fowlerlab.dev`, Gmail confirmed 5+ messages `newer_than:2d` waiting to ingest.
- `vitest run`: 414/414 PASS (4 new in `inbox-cursor.test.ts`).
- `npm run build`: clean.
- `tools/regression-check.sh`: 221/222 PASS, net +5/+0 (only the pre-existing CAR-182 fail; baseline unchanged).
- User confirmed `/inbox` populated with fresh email after the auto-scan-on-load fired.

## Why This Works

The deepest root cause is **divergent token stores for one logical OAuth client**: CLI reads `data/gmail_token.json`, dashboard reads `process.env.GMAIL_REFRESH_TOKEN` from `dashboard/.env.local`, both pointing at the same Google OAuth `client_id` but holding independent refresh tokens. CAR-194's CLI re-auth fixed one and left the other stale. This is the same divergence pattern that previously bit at the data layer in CAR-168 M5 *(auto memory [claude]: `cli-sqlite-vs-dashboard-supabase-split.md`)* — two surfaces, one logical resource, two physical stores, one of them silently rotting.

Two amplifiers turned a recoverable auth error into a 9-day invisible failure, and each piece of the fix addresses a distinct failure mode:

- **Token divergence → recovery script + planned unification (CAR-198).** `scripts/car_197_sync_dashboard_token.py` makes the CLI store authoritative until the unification ticket lands. It is the only piece that addresses the root cause; the rest harden against future divergences.
- **Error swallowing → `lastError` state + visible scan-failed banner.** The old `if (data.error && !data.emails?.length) break` exited the loop with no signal. Capturing `scanError` in the same break, then surfacing it through `scanState.lastError`, converts a silent 502 into a user-visible red status. The hook now refuses to claim success on failure.
- **UX impersonation → `shouldAdvanceCursor` helper + dated timestamp.** Two independent guards. First, `shouldAdvanceCursor({ scanSucceeded, newInsertedCount })` requires *both* a successful response *and* actual new rows before the Supabase cursor moves — so a 502-only loop can no longer ratchet the timestamp. Second, the formatter renders month + day + time, so even if a cursor *did* freeze, the displayed value would visibly age. Together they remove the "fresh-looking stale cursor" failure mode.

The pattern generalizes beyond Gmail: **two surfaces sharing one OAuth client but reading the refresh token from different stores will diverge silently the moment one is re-auth'd**. This applies to any future API integration in CareerPilot or elsewhere — Google Calendar, Microsoft Graph, Slack, Stripe, GitHub Apps — not just Gmail.

## Prevention

### Code-level guardrails (already shipped in PR #46)

- `shouldAdvanceCursor` helper in `dashboard/src/lib/inbox-cursor.ts` — pure function, unit-tested, single source of truth for "is it safe to ratchet the cursor". Reuse this pattern for any cursor/watermark advancement against an external API.
- `lastError` field on scan state — every fetch loop that breaks on error must capture *why* into surface-visible state, not just `console.error`. The rule: if the loop can break on a non-success, the user must be able to see that.
- Dated timestamps for any "last *X*" display — never use `toLocaleTimeString()` alone for a value that can be more than 24h stale. Always include date components so visual inspection catches freezes.

### Structural guardrails (planned follow-ups)

- **CAR-198 — unify Gmail token storage** so CLI and dashboard read the same refresh token. Eliminates the divergent-store class of bug at the source. Until CAR-198 ships, `scripts/car_197_sync_dashboard_token.py` is the bridge *(auto memory [claude]: `dashboard-cli-gmail-token-divergence.md`)*.
- **CAR-199 — extend the CAR-196 OAuth token-health monitor** to probe the dashboard env path (`getGmailClient()`) in addition to the CLI token. The monitor must cover every store the token lives in, not just the one the CLI uses.

### Process guardrails

- **Verify on the user's actual surface, not an adjacent one.** When a bug report names `/inbox`, the verification step exercises `localhost:3000/inbox`, not `/job-search` or any other route that happens to share infrastructure. Saved as the `verify-on-the-users-actual-surface.md` memory *(auto memory [claude])*. This is the single highest-leverage prevention from this incident.
- **For any OAuth-touching ticket, enumerate every refresh-token store before declaring done.** `git grep` for `refresh_token`, `GMAIL_REFRESH_TOKEN`, `getGmailClient`, and equivalent symbols across every surface the project ships. If more than one store exists, the ticket either updates all of them or explicitly defers the others with a follow-up filed.
- **For any "last scanned / last synced" UI element, ask: can this freeze without the user noticing?** If yes, the fix is dated formatting plus an error-state surface, not just a fresh-feeling label.

## Related Issues

- **PR #46** — https://github.com/jlfowler1084/CareerPilot/pull/46 (`fix(CAR-197): inbox refresh resilience`), merge commit `7307683`.
- **CAR-194** — OAuth callback ephemeral port fix (CLI side) → [`docs/solutions/best-practices/oauth-reauth.md`](../best-practices/oauth-reauth.md). **Important caveat:** the CAR-194 runbook covers CLI OAuth only. After running its re-auth flow, run `scripts/car_197_sync_dashboard_token.py` to propagate the new refresh token to `dashboard/.env.local`, then restart the dev server. Without that step, the dashboard stays in the broken state CAR-197 fixes.
- **CAR-196** — Daily OAuth token-health monitor (CLI surface only). CAR-199 extends it to the dashboard env path.
- **CAR-198** — *(planned)* Unify CLI + dashboard Gmail token storage so a single re-auth refreshes both surfaces.
- **CAR-199** — *(planned)* Extend OAuth monitor to probe `getGmailClient()` env path.
- **CAR-168 M5** — Earlier instance of the CLI/dashboard divergence pattern at the data layer (applications + contacts), unified to Supabase 2026-04-21.
