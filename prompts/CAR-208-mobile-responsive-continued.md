[CAR-208] Continue mobile responsive work — phase 3 onward (data views, forms, polish)

## Model Tier

**Sonnet** — multi-file UI work with TypeScript checks. Per `dashboard/CLAUDE.md` model routing, Sonnet is the default for "Multi-file code changes, investigation, UI work, API route development, bug fixes." Don't escalate to Opus unless you hit an architecture decision; the implementation patterns from CAR-209 and CAR-210 are well-established now.

## Ticket

**Parent:** [CAR-208](https://jlfowler1084.atlassian.net/browse/CAR-208) — *Make dashboard usable on mobile browsers (responsive design)*. Currently In Progress. Phases 1 (audit) and 2 (layout shell) shipped via:
- [CAR-209](https://jlfowler1084.atlassian.net/browse/CAR-209) — viewport meta + Toaster position (PR #51)
- [CAR-210](https://jlfowler1084.atlassian.net/browse/CAR-210) — sidebar drawer + header reflow (PR #52)

**Authoritative spec:** Read the audit comment on [CAR-208](https://jlfowler1084.atlassian.net/browse/CAR-208) first. It contains 14 findings classified P0/P1/P2 with `file:line` references and concrete fix strategies. The audit is the single source of truth for what's left.

## Status snapshot (as of CAR-212 merge)

Already done:
- ✅ P0 #1 (viewport meta) — `dashboard/src/app/layout.tsx` exports `viewport: Viewport` with `width: "device-width", initialScale: 1, maximumScale: 5`
- ✅ P0 #2 (sidebar → drawer) — `dashboard/src/components/layout/sidebar.tsx` renders `DesktopSidebar` (`hidden md:flex`) + `MobileSidebarDrawer` (Sheet `side="left"`); state via `dashboard/src/contexts/sidebar-context.tsx`
- ✅ P0 #3 (header reflow) — hamburger button + `flex-wrap` + shorter date format on small screens
- ✅ #10 (Toaster) — moved from `bottom-right` to `top-center`

Still open from the audit:
| Item | File(s) | Audit priority | Notes |
|---|---|---|---|
| **#4 Application row mobile layout** | `dashboard/src/components/applications/application-row.tsx` | **P1 — recommended next** | Highest-impact remaining data view. Right column of 5 action buttons (Tailor, Cover Letter, Prep Pack, Schedule, Delete) consumes ~140px and squeezes title to ~190px at 375px viewport. Touch targets `text-[10px] px-2 py-1` are ~24-28px (sub-44px). Plan: stack right column below title block under `md:`, collapse Tailor/Cover Letter/Prep Pack into a `dropdown-menu` overflow menu on mobile, bump button heights to `min-h-[36px]`. |
| #5 Tabs touch sizes inside expanded row | `application-row.tsx:417-432` | P1 | `TabsList` triggers `h-7` (~28px). Bump to `h-11` on mobile. |
| #6 Search page tab nav | `dashboard/src/app/(main)/search/page.tsx:489-516` | P1 | 3 tabs with badges in a non-wrapping flex row. Either `flex-wrap` or `overflow-x-auto`. |
| #7 Page-header action rows don't wrap | contacts, inbox, search pages | P1 | `flex items-center justify-between` without `flex-wrap`. ~5 files, mostly mechanical. |
| #8 Dialog → bottom-sheet on mobile | `dashboard/src/components/ui/dialog.tsx` | P1 | Centered modal feels cramped on phone. Use `Sheet side="bottom"` pattern under `sm:`, branch on viewport. The Sheet primitive already supports `side` (added in CAR-210). |
| #9 Inbox loading skeleton breaks at mobile | `dashboard/src/app/(main)/inbox/page.tsx:207` | P1 | Hardcoded `w-[420px]`. Mirror the live UI's `w-full md:w-[420px]` pattern. |
| #11 Settings page tables | `dashboard/src/app/(main)/settings/page.tsx:330,388` | P2 | Real `<table>` elements horizontal-scroll on mobile. Defer if low-priority. |
| #12 Sort/filter input touch sizes | many pages | P2 | `py-1.5`/`py-2` gives ~28-36px. Borderline. |
| #13 Status select inside application row | `application-row.tsx:278` | P2 | `min-h-[28px]` — explicit sub-44px. Folds into #4. |
| #14 Recharts | overview, analytics, dashboard | P2 — **verify only** | `ResponsiveContainer` already adapts. Tick fonts at `fontSize: 10` may look tiny but render. Verify by eye, no fix needed. |

**Recommended next ticket:** Create CAR-214 (or whatever next number) for **#4 Application Row mobile layout**. It's the single change with the biggest perceived improvement on phone — every applications-list interaction routes through these rows. Once #4 lands, #5 and #13 fold in naturally as the row already has tab nav + status select inside it.

## Working conventions established this round

These are now non-negotiable. Documented at `dashboard/CLAUDE.md` and `docs/solutions/best-practices/vercel-deploy-verification.md`.

### Worktree pattern

Per `.claude/worktree-policy.json`, `feature/dashboard-v2` is protected. Every code change lands via:
```bash
git worktree add .worktrees/<TICKET>-<slug> -b worktree/<TICKET>-<slug> origin/feature/dashboard-v2
cd .worktrees/<TICKET>-<slug>/dashboard
npm ci
# ... make changes ...
```
PR base is `feature/dashboard-v2`, not `main` or `master`. Worktree branch deletes on merge.

### Vercel deployment verification

**Critical:** A merge to `feature/dashboard-v2` is NOT proof that production was updated. Verify every merge with:
```bash
npx vercel ls career-pilot --scope jlfowler1084s-projects | head -10
# Find the new deployment. Check that:
#   - Build duration > 30s (3-5s = ghost build, broken)
#   - target column = production (empty/preview = production-branch issue)
npx vercel inspect <new-url> --scope jlfowler1084s-projects
# Confirm Builds section shows real Lambda functions, not just `. [0ms]`
```

If verification fails, **production is stale**. Fix paths:
- Build is 0ms ghost → check `vercel project inspect` for `rootDirectory` (must be `dashboard`, not blank)
- Build is real but `target=preview` → check `link.productionBranch` (must be `feature/dashboard-v2`)
- For the production-branch fix specifically, the documented PATCH endpoint rejects the field. Use undocumented `PATCH /v9/projects/career-pilot/branch` body `{"branch":"feature/dashboard-v2"}` — see `docs/solutions/best-practices/vercel-deploy-verification.md` for the full incident write-up.

`VERCEL_TOKEN` is already configured as a Windows User-scope env var. Use PowerShell to read it via `[Environment]::GetEnvironmentVariable("VERCEL_TOKEN", "User")` if the parent terminal launched before the env var was set (process inheritance gotcha).

### Manifest preservation

`tools/regression-check.sh` reads `dashboard/feature-manifest.json`. Verify before AND after changes that the count of PASS lines matches. Pre-existing FAIL on `CAR-182 Prep Pack API Route MISSING PATTERN: Invoke-SBAutobook` — known stale entry, leave it alone unless cleaning the manifest is explicitly part of the ticket.

### Validation chain

1. Vitest: `npm run test:run` → 420 tests must all pass
2. TypeScript: built into `npm run build`'s compile phase
3. Regression: `bash tools/regression-check.sh > /tmp/log 2>&1` (Windows stdout-flush bug truncates if not redirected)
4. **Production HTML markers** (gold standard): Playwright fetch + `cache: 'no-store'` + check `age` header is fresh + check for new code markers in the HTML

## What to read before starting

In order:
1. **CAR-208 audit comment** — full context on what's left and why
2. `docs/solutions/best-practices/vercel-deploy-verification.md` — deploy gotchas
3. `dashboard/CLAUDE.md` — Vercel CLI quick-reference + token convention + post-merge checklist
4. `dashboard/src/components/applications/application-row.tsx` — the file you'll be editing if you take #4

## Out of scope (this multi-ticket effort)

- Native mobile app (React Native, Capacitor, etc.)
- PWA / offline-first (deferred to optional follow-up)
- Tablet-specific optimizations (responsive design covers it)
- The legacy `dashboard/vercel.json` `builds` array — separate ticket [CAR-213](https://jlfowler1084.atlassian.net/browse/CAR-213)

## Closeout for CAR-208

The parent ticket transitions to Done when every `(main)` page is functional at 375px width with 44×44px touch targets on interactive elements. Right now: shell works (sidebar drawer + header). Data views (Application Row, Contacts) and forms/dialogs (Add Application form, Modals) still need responsive treatment. Estimated 3-5 more child tickets to fully close.
