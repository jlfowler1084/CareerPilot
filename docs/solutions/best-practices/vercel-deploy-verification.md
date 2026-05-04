# Vercel Deploy Verification

**Lesson from CAR-209 / CAR-210 / CAR-211 (May 4, 2026):** "merge succeeded + Vercel build status = success" is not the same as "production was updated." Always verify deploys with the Vercel CLI, not the GitHub status check.

## What happened

Two consecutive PRs (CAR-209 viewport meta, CAR-210 mobile sidebar drawer) merged to `feature/dashboard-v2`. Both showed:

- GitHub merge: clean
- Vercel status check: `success`
- Deployment dashboard: per-PR deployments at `Ready` state

Yet **neither change reached production**. The user-facing URL `career-pilot-two-ivory.vercel.app` kept serving HTML from a 43-hour-old build. The CAR-209 "validation" was meaningless — what looked like the new viewport-meta behavior was just Next.js's default `<meta name="viewport" content="width=device-width, initial-scale=1">`. The CAR-210 hamburger never appeared because none of the new component code was actually deployed.

## Root cause

The Vercel project's **Root Directory** setting was empty (which the UI displays as `.`). With no `package.json` at the repo root and the Next.js app living at `dashboard/`, every GitHub-triggered auto-build was a 0ms ghost deploy — Vercel found nothing to build, created an empty deployment shell, marked it `Ready`, and reported `success` to GitHub. The production alias never moved because Vercel's promotion logic kept the last build that actually produced output (~4 days earlier, made when the setting was correct).

## Why the GitHub status check lies

`x-vercel-id` and `Vercel: success` only mean "the deployment object reached `Ready` state." A 0ms build still reaches `Ready`. The status check has no notion of whether the build was meaningful.

## How we found it

1. Mobile validation showed the inline desktop sidebar (not the new hamburger drawer)
2. Browser cache cleared, Desktop Site mode confirmed off — symptom persisted
3. Playwright fetch of the live URL revealed:
   - `age` header: `156182` (43.4 hours)
   - HTML missing every CAR-209/210 marker (`maximum-scale=5`, `top-center`, `md:hidden`, `Open navigation menu`)
   - `viewport` meta was the Next.js default, not our custom export
4. `vercel ls` showed recent deploys at 3-5 second build durations vs the 49-second working production deploy 4 days earlier
5. `vercel inspect <recent-url>` showed `Builds: . [0ms]` with zero output items
6. `vercel project inspect` showed `Root Directory: .`
7. `dashboard/SETUP.md` Section 3.1 was emphatic: "**IMPORTANT:** Set **Root Directory** to `dashboard/`" — so the configured value didn't match documented intent

## The fix

Two-part:

1. **Immediate** — manual `vercel deploy --prod --yes` from `dashboard/` to ship CAR-209 + CAR-210 to production right away. The CLI builds remotely on Vercel using the team's stored env vars.
2. **Permanent** — `PATCH /v9/projects/career-pilot?teamId=jlfowler1084s-projects` with body `{"rootDirectory": "dashboard"}` (CAR-211). Future GitHub auto-deploys now find the Next.js app at the correct location.

## Verification pattern (gold standard)

```js
// In Playwright (or any browser) at the production URL
const res = await fetch(window.location.href, { cache: 'no-store' });
const headers = {};
res.headers.forEach((v, k) => { headers[k] = v; });
const html = await res.text();
return {
  age_seconds: parseInt(headers['age'] || '0', 10),
  // marker strings unique to the new commit:
  has_new_marker: html.includes('<some-string-only-in-new-build>'),
};
```

Combined with `npx vercel ls` to confirm build duration > 30s, this catches ghost deploys reliably.

## Why command-line beats UI here

The Vercel UI displayed `Root Directory: .` (or empty, depending on the page). That looked plausibly correct — root-relative is a common pattern. The REST API revealed the value was *literally* empty, and the CLI's `Builds: [0ms]` output made the empty-build pattern visually obvious. Mixing UI + CLI + API was what cracked this; UI alone wouldn't have.

## Generalizable rule

For any Vercel project where the app lives in a subdirectory:

- The Root Directory setting must be that subdirectory, not blank and not `.`
- Add a smoke test to the post-merge ritual: `npx vercel ls --scope <team>` and check that the latest deploy has a real build duration

This applies anywhere a monorepo or "app-in-a-folder" layout meets Vercel's auto-deploy.
