# [CAR-118] Contacts Hub — Contact Detail Page + Timeline (Worker E)
# Model: SONNET
# Justification: Multi-file UI with first dedicated [id] route and timeline aggregation

## Tickets
- **Primary:** CAR-118 — Contacts UI
- **Relates to:** CAR-116 (epic)

## Estimated Scope
5 new files: page, summary card, timeline, edit modal, delete dialog

---

## Phase 0 — Branch Setup

**Branch:** `feat/CAR-116-contacts-hub` (must exist from Workers A-D)

1. Pull latest: `git pull origin feat/CAR-116-contacts-hub`
2. Confirm contacts list page and hook exist from Workers C-D

---

## Context

Read plan Unit 7 at `docs/plans/2026-04-11-001-feat-contacts-communications-hub-plan.md`.

**This is the first dedicated [id] route in the app.** Applications use a slide-over panel, not a dedicated page. This introduces a new routing pattern: `src/app/(main)/contacts/[id]/page.tsx`.

Key patterns:
- **Section layout:** `src/components/applications/detail-panel.tsx` — section structure, auto-save patterns
- **Email display:** `src/components/applications/communications-section.tsx` — email grouping reference
- **Timeline rendering:** `src/components/dashboard/activity-feed.tsx` — simple feed pattern

---

## What NOT To Do

- Do NOT add cross-linking from timeline entries to source views — that's P2
- Do NOT include debriefs in the timeline — debrief linkage is a stretch goal
- Do NOT use a Sheet/slide-over — this is a dedicated page

---

## Phase 1 — Audit (READ-ONLY)

1. Read `src/components/applications/detail-panel.tsx` for section layout patterns
2. Read `src/components/applications/communications-section.tsx` for email display pattern
3. Read `src/components/dashboard/activity-feed.tsx` for timeline rendering
4. Confirm timeline API route exists from Worker C: `/api/contacts/[id]/timeline`

**STOP.** Report patterns confirmed.

---

## Phase 2 — Detail Page Components

Create `src/app/(main)/contacts/[id]/page.tsx`:
- `"use client"`, reads `params.id`
- Fetches contact via `/api/contacts/:id` and timeline via `/api/contacts/:id/timeline`
- Renders summary card + timeline
- Back link to /contacts

Create `src/components/contacts/contact-summary-card.tsx`:
- Displays: name (heading), company/title, phone, email, notes (editable inline)
- Linked applications: up to 3 as chips (job title + status color badge), "+N more" expands. Each links to /applications
- Last contact date (relative time)
- Edit button → opens edit modal
- Delete button → opens delete dialog

Create `src/components/contacts/contact-edit-modal.tsx`:
- Form with all R2 fields: name (required), email (optional, RFC-5322 validated), phone, company, title, source, notes
- On email change: dedup check before save (call API, show warning if match found)
- Uses shared validation from `src/lib/contacts/validation.ts`

Create `src/components/contacts/contact-delete-dialog.tsx`:
- Confirmation dialog with consequences text:
  - "Linked applications will lose this contact link"
  - "Timeline entries from Gmail are not deleted"
  - "Conversation records are not deleted"
  - "If a new contact is later created with the same email, orphaned records will re-appear"
- On confirm: DELETE via API, redirect to /contacts, toast "Contact deleted"

Create `src/components/contacts/contact-timeline.tsx`:
- Fetches from timeline API (emails + conversations arrays)
- Client-side merge: combine emails and conversations into one array, sort by date DESC
- Each entry shows: icon by type (Mail for email, Phone/MessageSquare/etc. for conversation), date (relative), key info
  - Email entries: subject, from_name
  - Conversation entries: type label, notes preview
- Empty state: "No interactions recorded yet. Conversations logged via the Conversations form will appear here automatically."
- No cross-links to source views in v1

---

## Phase 3 — Verify

1. `npx tsc --noEmit` — no type errors
2. Navigate to `/contacts/:id` — page renders with summary card
3. Edit contact — changes save and card updates
4. Delete contact — redirects to /contacts
5. Timeline shows emails and conversations interleaved by date

---

## Phase 4 — Commit and Push

1. Stage all files
2. `git commit -m "feat(CAR-118): add contact detail page with summary card, edit/delete, and activity timeline"`
3. `git push origin feat/CAR-116-contacts-hub`

---

## Invocation

```
claude --model sonnet --prompt-file prompts/CAR-118-worker-E-detail-page.md
```
