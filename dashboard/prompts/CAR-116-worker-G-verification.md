# [CAR-116] Contacts Hub — Feature Manifest + Build Verification (Worker G)
# Model: SONNET
# Justification: Final verification gate — build check, manifest update, regression check

## Tickets
- **Primary:** CAR-116 — Contacts & Communications Hub (epic)
- **Relates to:** CAR-117, CAR-118

## Estimated Scope
1 file modification + build verification

---

## Phase 0 — Branch Setup

**Branch:** `feat/CAR-116-contacts-hub` (must exist from Workers A-F)

1. Pull latest: `git pull origin feat/CAR-116-contacts-hub`
2. Confirm all previous workers have committed

---

## Context

This is the final verification worker. All implementation is complete from Workers A-F. This worker:
1. Updates the feature manifest
2. Runs build verification
3. Runs test suite
4. Reports readiness for PR

---

## Phase 1 — Audit All New Files

List all files created/modified by Workers A-F:
- `supabase/migrations/016_add_contacts.sql`
- `src/types/index.ts` (Contact types)
- `src/lib/contacts/validation.ts`
- `src/app/api/contacts/route.ts`
- `src/app/api/contacts/[id]/route.ts`
- `src/app/api/contacts/auto-create/route.ts`
- `src/app/api/contacts/merge/route.ts`
- `src/app/api/contacts/[id]/timeline/route.ts`
- `src/hooks/use-contacts.ts`
- `src/components/applications/conversation-form.tsx` (email field patch)
- `src/app/(main)/contacts/page.tsx`
- `src/components/contacts/contact-list.tsx`
- `src/components/contacts/contact-row.tsx`
- `src/components/contacts/contact-filters.tsx`
- `src/components/layout/sidebar.tsx` (NAV_ITEMS entry)
- `src/app/(main)/contacts/[id]/page.tsx`
- `src/components/contacts/contact-summary-card.tsx`
- `src/components/contacts/contact-timeline.tsx`
- `src/components/contacts/contact-edit-modal.tsx`
- `src/components/contacts/contact-delete-dialog.tsx`
- `src/components/contacts/contact-merge-modal.tsx`
- `src/hooks/use-emails.ts` (auto-create integration)

Verify each file exists and is non-empty.

**STOP.** Report file inventory.

---

## Phase 2 — Feature Manifest Update

Read `feature-manifest.json` to understand the entry format.

Add entries for all new features:
- Contacts page (`src/app/(main)/contacts/page.tsx`)
- Contact detail page (`src/app/(main)/contacts/[id]/page.tsx`)
- Contact list component (`src/components/contacts/contact-list.tsx`)
- Contact summary card (`src/components/contacts/contact-summary-card.tsx`)
- Contact timeline (`src/components/contacts/contact-timeline.tsx`)
- Contact merge modal (`src/components/contacts/contact-merge-modal.tsx`)
- Contact edit modal (`src/components/contacts/contact-edit-modal.tsx`)
- Contact delete dialog (`src/components/contacts/contact-delete-dialog.tsx`)
- Contact filters (`src/components/contacts/contact-filters.tsx`)
- Contacts API routes (CRUD, auto-create, merge, timeline)
- useContacts hook (`src/hooks/use-contacts.ts`)
- Contact validation utility (`src/lib/contacts/validation.ts`)
- ConversationForm email field patch

---

## Phase 3 — Build + Test Verification

1. `npm run build` — must succeed with zero errors
2. `npx vitest run` — test suite must pass at current baseline or higher
3. `tools/regression-check.sh` — run if it exists, verify no regressions

**STOP.** Report build status, test results, and any issues.

---

## Phase 4 — Commit and Push

1. `git add feature-manifest.json`
2. `git commit -m "chore(CAR-116): update feature manifest with contacts hub features"`
3. `git push origin feat/CAR-116-contacts-hub`

Report: branch is ready for PR to `feature/dashboard-v2`.

---

## Invocation

```
claude --model sonnet --prompt-file prompts/CAR-116-worker-G-verification.md
```
