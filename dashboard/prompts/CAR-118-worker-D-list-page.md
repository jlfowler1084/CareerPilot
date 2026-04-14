# [CAR-118] Contacts Hub — Contacts List Page + Sidebar (Worker D)
# Model: SONNET
# Justification: Multi-file UI implementation following established page patterns

## Tickets
- **Primary:** CAR-118 — Contacts UI
- **Relates to:** CAR-116 (epic)

## Estimated Scope
4 new files + 1 modification: page, list, row, filters components + sidebar entry

---

## Phase 0 — Branch Setup

**Branch:** `feat/CAR-116-contacts-hub` (must exist from Workers A-C)

1. Pull latest: `git pull origin feat/CAR-116-contacts-hub`
2. Confirm useContacts hook and API routes exist from Worker C

---

## Context

Read plan Unit 6 at `docs/plans/2026-04-11-001-feat-contacts-communications-hub-plan.md`.

Key patterns:
- **Page structure:** `src/app/(main)/conversations/page.tsx` — closest analog (search, filter, modal, CRUD)
- **Sidebar:** `src/components/layout/sidebar.tsx` — add to `NAV_ITEMS` array
- **Filter pattern:** `src/components/inbox/filter-chips.tsx` for filter component reference

---

## What NOT To Do

- Do NOT create the detail page ([id] route) — that's Worker E
- Do NOT implement merge UI — that's Worker F

---

## Phase 1 — Audit (READ-ONLY)

1. Read `src/app/(main)/conversations/page.tsx` for page structure pattern
2. Read `src/components/layout/sidebar.tsx` for NAV_ITEMS array
3. Confirm useContacts hook exports from Worker C

**STOP.** Report patterns confirmed.

---

## Phase 2 — Sidebar Entry

Modify `src/components/layout/sidebar.tsx`:
- Add `{ id: "contacts", href: "/contacts", label: "Contacts", icon: Users }` to NAV_ITEMS
- Place between Applications and Analytics (or after Conversations — use judgment)
- Import `Users` from `lucide-react`

---

## Phase 3 — List Page Components

Create `src/components/contacts/contact-filters.tsx`:
- Search input (name/company/email)
- Role dropdown: All, Recruiter, Hiring Manager, Interviewer, HR, Referral
- Recency segment: Active (14d), Recent (15-60d), Dormant (61-180d), Inactive (180+d)

Create `src/components/contacts/contact-row.tsx`:
- Row displays: name, company/title, role badge, last contact date (relative time via date-fns or similar), linked app count
- Clickable — navigates to `/contacts/:id` via Next.js router

Create `src/components/contacts/contact-list.tsx`:
- Renders contact-row components in a list
- Handles empty state: message about auto-creation from Gmail + "Add contact manually" CTA button
- No-results state: "No contacts match [search/filters]" with "Clear filters" link

Create `src/app/(main)/contacts/page.tsx`:
- `"use client"`, Suspense wrapper
- Uses `useContacts()` hook
- Filter/search bar at top with count display
- ContactList below
- "Add contact" button opens a create modal (simple form with R2 fields, name required, email optional + validated)

---

## Phase 4 — Verify

1. `npx tsc --noEmit` — no type errors
2. Start dev server, navigate to /contacts — page renders
3. Sidebar shows Contacts link with correct icon
4. Empty state renders when no contacts exist
5. Search and filters work

---

## Phase 5 — Commit and Push

1. Stage all files
2. `git commit -m "feat(CAR-118): add contacts list page with search, filters, and sidebar nav"`
3. `git push origin feat/CAR-116-contacts-hub`

---

## Invocation

```
claude --model sonnet --prompt-file prompts/CAR-118-worker-D-list-page.md
```
