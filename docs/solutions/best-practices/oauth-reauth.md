---
title: Re-authenticating CareerPilot's Google OAuth (CAR-194)
date: 2026-04-29
last_updated: 2026-04-30
category: docs/solutions/best-practices/
module: src/google_auth
problem_type: runbook
component: auth
severity: medium
applies_when:
  - The Gmail token at data/gmail_token.json has stopped refreshing
  - LinkedIn pipeline returns 0 listings unexpectedly (dead-token symptom)
  - Scopes have been changed in .env and existing token must be rebuilt
  - The OAuth client credentials have been rotated in Cloud Console
  - First-time setup of a fresh CareerPilot checkout
related_components:
  - tooling
  - cli
tags:
  - oauth
  - gmail
  - google-auth
  - runbook
  - car-194
  - post-incident-2026-04-28
---

# Re-authenticating CareerPilot's Google OAuth (CAR-194)

## Context

CareerPilot uses a single Google OAuth refresh token (stored at `data/gmail_token.json`) for all Gmail + Calendar API access. The token auto-refreshes on every CLI run via `src/google_auth.get_google_service`. Re-auth (interactive browser flow) is only needed when the refresh chain itself breaks.

After **CAR-194** (2026-04-29) two structural changes made re-auth durable:

1. **OAuth app published to Production status** in Google Cloud Console — refresh tokens no longer expire after 7 days of inactivity. Prior to CAR-194 the app was in *Testing* mode and we hit weekly silent breakage.
2. **`flow.run_local_server(port=8080)` → `port=0`** in [src/google_auth.py:70](../../../src/google_auth.py#L70) — OAuth callback now uses an OS-assigned ephemeral port, so port-8080 collisions (zombie pytest, dev servers, anything else) can no longer break re-auth. The `google_credentials.json` redirect URI is `http://localhost` (no port), and Desktop-app OAuth clients accept any port at that hostname.

This runbook captures the full re-auth procedure that survives those changes, plus the failure modes that have actually been seen.

> **Account note (auto-memory):** CareerPilot's Gmail OAuth authenticates as `jlfowler1084@fowlerlab.dev` (Google Workspace), **not** `@gmail.com`. When the consent screen shows the account picker, choose the Workspace account.

> **CAR-198 (shipped 2026-04-30):** The CLI → dashboard token divergence has been eliminated. The dashboard now reads `data/gmail_token.json` directly (same file as the CLI). A CLI re-auth automatically propagates to the dashboard on the next request — no manual sync, no dev-server restart needed. See [`docs/solutions/integration-issues/dashboard-inbox-stale-gmail-refresh-token-expired-2026-04-30.md`](../integration-issues/dashboard-inbox-stale-gmail-refresh-token-expired-2026-04-30.md) for the full divergence postmortem.

## Quick reference

```bash
# 1. Delete the dead token (back it up first if you want)
mv data/gmail_token.json data/gmail_token.json.bak.$(date +%Y%m%d-%H%M%S)

# 2. Trigger re-auth — browser opens automatically
python -c "from src.gmail.auth import get_default_gmail_service; get_default_gmail_service()"

# 3. Confirm the new token is fresh
python -c "import json, time; from pathlib import Path; t = Path('data/gmail_token.json'); print(f'mtime: {time.ctime(t.stat().st_mtime)}'); print(f'has refresh_token: {\"refresh_token\" in json.loads(t.read_text())}')"
```

If step 2 prints `OAuth token saved to ...` without raising, you're done. The dashboard reads `data/gmail_token.json` directly (CAR-198) — no sync step, no dev-server restart needed.

## Procedure (step-by-step)

### 1. Confirm re-auth is actually needed

Before deleting anything, verify the token is genuinely broken — auto-refresh handles most cases transparently:

```bash
python -c "from src.gmail.auth import get_default_gmail_service; svc = get_default_gmail_service(); print(svc.users().getProfile(userId='me').execute()['emailAddress'])"
```

- If this prints `jlfowler1084@fowlerlab.dev`, the token works — no re-auth needed. Whatever symptom you saw is upstream of OAuth.
- If this raises `RefreshError`, `InvalidGrantError`, or `HttpError 401`, the token is dead. Continue.
- If it raises `FileNotFoundError: data/gmail_token.json`, this is a fresh checkout — skip step 2 and continue to step 3.

### 2. Delete (or back up) the dead token

```bash
mv data/gmail_token.json data/gmail_token.json.bak.$(date +%Y%m%d-%H%M%S)
```

The backup is optional but useful: if re-auth fails partway through, the old token is still on disk and you can inspect it (`jq . data/gmail_token.json.bak.*`) to confirm scopes / expiry.

### 3. Trigger the OAuth flow

```bash
python -c "from src.gmail.auth import get_default_gmail_service; get_default_gmail_service()"
```

This calls `InstalledAppFlow.run_local_server(port=0)` under the hood. The OS picks a free port (typically in the 49152–65535 range), binds a one-shot HTTP server there, opens your default browser to the consent URL, and waits.

### 4. Walk through the browser flow

Three pages in sequence (skip variations described below):

#### Page 1 — Google account picker

Choose **`jlfowler1084@fowlerlab.dev`** (Workspace), **not** any `@gmail.com` account that may also be signed in.

#### Page 2 — "Google hasn't verified this app" warning

Expected. The CareerPilot OAuth app is published to Production but not submitted for Google's verification process (verification is a separate ~10-day workflow that requires a privacy policy, demo video, and scope justification — only worth doing if you stop being the only user).

To proceed:
1. Click the small **"Advanced"** link at the bottom-left of the warning page.
2. The page expands to reveal **"Go to CareerPilot (unsafe)"** — click it.
3. You're now on the actual consent screen.

This warning is cosmetic, not a security issue: you authored the OAuth client, you control the credentials.json, and you're consenting to grant your own app access to your own account.

#### Page 3 — Permissions consent

Lists the requested scopes (configured in `.env` via `GMAIL_SCOPES` and `CALENDAR_SCOPES`, defaulted to `gmail.modify` and `calendar`). Click **"Continue"** or **"Allow"**.

After consent, the browser navigates to `http://localhost:<port>/?code=...&state=...` where `<port>` is whatever the OS picked. The local server intercepts that callback, exchanges the code for a token, and shows a final page reading **"The authentication flow has completed. You may close this window."**

### 5. Confirm the terminal output

The Python process should print (with logging at INFO level):

```
INFO:src.google_auth:Starting OAuth flow for gmail — a browser window will open
INFO:src.google_auth:OAuth authorization completed for gmail
INFO:src.google_auth:OAuth token saved to F:\Projects\CareerPilot\data\gmail_token.json
INFO:src.google_auth:gmail API service created (version v1)
```

If logging is suppressed (running outside `cli.py`), the only signal is the absence of an exception.

### 6. Verify the new token works

```bash
python -c "from src.gmail.auth import get_default_gmail_service; svc = get_default_gmail_service(); p = svc.users().getProfile(userId='me').execute(); print(f'authenticated as {p[\"emailAddress\"]} ({p[\"messagesTotal\"]} messages, {p[\"threadsTotal\"]} threads)')"
```

Expected: `authenticated as jlfowler1084@fowlerlab.dev (...)`.

If you see a different email address, you picked the wrong account in step 4 — start over from step 2.

### 7. Dashboard propagation (CAR-198 — this step is now automatic)

As of CAR-198 (shipped 2026-04-30), the dashboard reads `data/gmail_token.json` directly. Every `/api/gmail/scan` request re-reads the file at request time, so a CLI re-auth is visible to the dashboard on the next request — no sync script, no dev-server restart needed.

If the dashboard inbox was already stale before the re-auth, reset its scan cursor so the next page-load triggers a 30-day backfill instead of trying to scan forward from a cursor that's days behind:

```sql
-- run via Supabase MCP or SQL Editor
UPDATE public.user_settings SET last_email_scan = NULL WHERE user_id = '<your auth.uid>';
```

This step is unnecessary on a fresh checkout (no row in `user_settings` yet) and unnecessary if you saw the staleness within minutes of it occurring (cursor is still close enough to fetch the missed window).

## Failure modes and recovery

### Port collision (rare with `port=0`, but possible)

**Symptom:** `OSError: [WinError 10048] Only one usage of each socket address (protocol/network address/port) is normally permitted` raised inside `run_local_server`.

**With `port=0` this is functionally impossible** — would require every port in the OS dynamic range to be in use simultaneously. If it happens you have a real OS issue, not a CareerPilot issue.

**Pre-CAR-194 recovery (kept here for archival reference):** when port was hardcoded to 8080, this was triggered most often by stuck pytest processes. The 2026-04-28 incident root cause was a 13-hour-old hung `pytest` process holding port 8080 from an earlier debugging session.

```bash
# Find what's holding a port (Windows)
netstat -ano | grep :8080
# Kill by PID
taskkill /PID <pid> /F
```

After CAR-194's `port=0` change this concern is gone.

### Missing or corrupt `google_credentials.json`

**Symptom:** `FileNotFoundError: Google credentials file not found at config/google_credentials.json` (raised by our own check at [src/google_auth.py:41-47](../../../src/google_auth.py#L41-L47)) or `json.JSONDecodeError` during InstalledAppFlow construction.

**Recovery:**
1. Open https://console.cloud.google.com/auth/clients?project=careerpilot-491202
2. Click the OAuth 2.0 Client ID for CareerPilot (Desktop app type).
3. Click **Download JSON** in the top-right.
4. Save as `config/google_credentials.json` (replacing if present).
5. Verify with `python -c "import json; d = json.load(open('config/google_credentials.json')); print(list(d.keys())[0], d[list(d.keys())[0]]['project_id'])"` — should print `installed careerpilot-491202`.
6. Re-run from step 3 of the procedure above.

### Scope change

**Symptom:** Token loads, but API calls return `HttpError 403` with message about insufficient scopes; or [src/google_auth.py:53](../../../src/google_auth.py#L53) (`Credentials.from_authorized_user_file`) raises `RefreshError` because the requested scopes don't match the granted scopes.

**Cause:** `GMAIL_SCOPES` or `CALENDAR_SCOPES` in `.env` was changed (or the defaults in `config/settings.py` were edited).

**Recovery:** delete the token and re-auth (procedure step 2 onward). On the consent screen (Page 3 of the browser flow) the new scope set will be presented for re-grant.

### Token revoked externally

**Symptom:** `oauthlib.oauth2.rfc6749.errors.InvalidGrantError: Token has been expired or revoked.` raised during automatic refresh.

**Cause:** one of:
- User clicked **Revoke access** at https://myaccount.google.com/permissions for the CareerPilot app.
- Google's anti-abuse system flagged unusual activity (location change, suspicious request pattern).
- The OAuth client's secret was rotated in Cloud Console (invalidates all outstanding tokens).
- Workspace admin policy changed (e.g., new scope restriction).

**Recovery:** procedure step 2 onward. If revoke happens repeatedly, check the Cloud Console **Audit logs** for the project to identify the trigger.

### Wrong Google account selected during consent

**Symptom:** re-auth completes without error, but step 6 of the procedure prints an unexpected email address (e.g. `j.fowler@gmail.com` instead of `jlfowler1084@fowlerlab.dev`).

**Cause:** browser was signed into multiple Google accounts and the wrong one was selected on Page 1 of the consent flow.

**Recovery:** procedure step 2 onward. On Page 1, scroll the account list and choose `jlfowler1084@fowlerlab.dev` explicitly. If only the wrong account appears, click **Use another account** at the bottom of the picker.

### `Production` publishing was reverted

**Symptom:** token works for ~7 days then dies silently. Re-auth produces a fresh working token. Repeat weekly.

**Cause:** somebody (you or a Workspace admin) clicked **Back to testing** on the [Audience](https://console.cloud.google.com/auth/audience?project=careerpilot-491202) page in Cloud Console, reverting the CAR-194 publish. Testing-mode apps expire refresh tokens after 7 days of inactivity.

**Recovery:** re-publish.
1. Open https://console.cloud.google.com/auth/audience?project=careerpilot-491202
2. **Publishing status** → click **Publish App** → confirm.
3. Status flips back to **In production**.
4. Existing token continues working; no re-auth needed (unless the token itself already died, in which case do procedure step 2 onward).

## Why this matters

The 2026-04-28 incident was a one-off symptom of a chronic vulnerability: the Gmail-dependent pipelines (LinkedIn job scan, recruiter inbox classification, calendar interview slots) all share a single point of failure at `data/gmail_token.json`. When that file dies, *every* downstream feature silently produces zero results — there's no error UI, no Discord alert, no log spike outside of OAuth-internal warnings. The token was last refreshed Apr 14, dead by Apr 21, noticed Apr 28 only because the LinkedIn pipeline returned 0 listings for a week and the user happened to look.

CAR-194's two fixes harden this in different ways:
- **Production publishing** turns the *normal* failure mode (7-day token expiry) from a recurring weekly outage into a never-happens.
- **`port=0`** turns the *recovery procedure* from a coin-flip (worked if port 8080 happened to be free) into a deterministic operation (always works).

A residual gap remains: the token can still die from external events (manual revoke, Google security action, scope change, credential rotation). [CAR-196](https://jlfowler1084.atlassian.net/browse/CAR-196) (originally deferred from CAR-194 AC4) adds a daily token-health monitor — `tools/check_oauth_token.py`, scheduled by `scripts/Register-OAuthMonitorTask.ps1` — that pings Discord (`careerpilot-updates`) when `data/gmail_token.json` is stale or fails its live `users.getProfile()` ping, so the next incident surfaces in hours instead of a week.

A second residual gap surfaced 2026-04-30 ([CAR-197](https://jlfowler1084.atlassian.net/browse/CAR-197)): the CAR-196 monitor probed only `data/gmail_token.json`, but the dashboard previously read its refresh token from `dashboard/.env.local::GMAIL_REFRESH_TOKEN` — a different store. CAR-194's CLI re-auth never propagated to the dashboard env, so the dashboard inbox went silently 9 days stale while the CLI side stayed green. **CAR-198 (shipped 2026-04-30)** eliminated the divergence: the dashboard now reads `data/gmail_token.json` directly, so a CLI re-auth is visible to the dashboard on the next request. The sync script (`scripts/car_197_sync_dashboard_token.py`) was deleted as dead code. [CAR-199](https://jlfowler1084.atlassian.net/browse/CAR-199) remains open to extend the CAR-196 monitor to also probe the dashboard read path.

## When to apply

- The Gmail-dependent pipeline (LinkedIn scan, inbox triage, calendar checks) returns zero results unexpectedly.
- A CLI command raises `RefreshError`, `InvalidGrantError`, or `HttpError 401` from any `googleapiclient` call.
- `data/gmail_token.json` is missing on a fresh checkout or after a deliberate token rotation.
- Scopes were changed in `.env` and the old token's grant set no longer matches.
- Cloud Console credentials were regenerated and the old `google_credentials.json` is now stale.

## Key citations

- [src/google_auth.py:67-75](../../../src/google_auth.py#L67-L75) — the `InstalledAppFlow` block that runs during re-auth (post-CAR-194 with `port=0`)
- [src/google_auth.py:41-47](../../../src/google_auth.py#L41-L47) — credentials-file existence check (FileNotFoundError raise site)
- [src/gmail/auth.py:39-53](../../../src/gmail/auth.py#L39-L53) — `get_default_gmail_service()` — the entry point used in the procedure's one-liner
- [config/settings.py:25-37](../../../config/settings.py#L25-L37) — `GOOGLE_CREDENTIALS_FILE`, `GMAIL_TOKEN_PATH`, scopes
- [tools/generate_gmail_token.py](../../../tools/generate_gmail_token.py) — the dashboard's separate token generator (for `dashboard/.env.local`, not for CLI use)

## Related

- Jira: [CAR-194](https://jlfowler1084.atlassian.net/browse/CAR-194) — the parent ticket and incident retro
- [CAR-196](https://jlfowler1084.atlassian.net/browse/CAR-196): token-expiry monitor with Discord alerting (implements the originally-deferred CAR-194 AC4)
- [CAR-197](https://jlfowler1084.atlassian.net/browse/CAR-197): inbox token divergence and silent-fail resilience — proves this runbook is incomplete without step 7. Full postmortem at [`docs/solutions/integration-issues/dashboard-inbox-stale-gmail-refresh-token-expired-2026-04-30.md`](../integration-issues/dashboard-inbox-stale-gmail-refresh-token-expired-2026-04-30.md).
- [CAR-198](https://jlfowler1084.atlassian.net/browse/CAR-198): shipped 2026-04-30 — unified CLI + dashboard Gmail token storage; dashboard now reads `data/gmail_token.json` directly so re-auth propagates automatically.
- [CAR-199](https://jlfowler1084.atlassian.net/browse/CAR-199): planned — extend the CAR-196 OAuth monitor to also probe the dashboard read path.
- Auto memory: `gmail-oauth-fowlerlab-domain.md` — the Workspace-account distinction
- Auto memory: `dashboard-cli-gmail-token-divergence.md` — remove; CAR-198 eliminated the divergence
- Cloud Console: https://console.cloud.google.com/auth/overview?project=careerpilot-491202 — Google Auth Platform for the CareerPilot project
