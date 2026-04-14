# [CAR-118] Contacts Hub — Merge UI + Gmail Auto-Create Integration (Worker F)
# Model: SONNET
# Justification: Two focused integrations wiring existing backend to UI and scanner

## Tickets
- **Primary:** CAR-118 — Contacts UI
- **Relates to:** CAR-116 (epic), CAR-117 (auto-create endpoint)

## Estimated Scope
2 new files + 2 modifications: merge modal, list page update, use-emails hook patch

---

## Phase 0 — Branch Setup

**Branch:** `feat/CAR-116-contacts-hub` (must exist from Workers A-E)

1. Pull latest: `git pull origin feat/CAR-116-contacts-hub`
2. Confirm merge API route and auto-create API route exist from Worker C
3. Confirm contacts list page exists from Worker D

---

## Context

Read plan Units 8 and 9 at `docs/plans/2026-04-11-001-feat-contacts-communications-hub-plan.md`.

**Merge UI (Unit 8):** Side-by-side preview. Primary record fields win; secondary fills NULLs. User can swap primary/secondary.

**Gmail Integration (Unit 9):** After classification completes in useEmails, call `/api/contacts/auto-create` for each `recruiter_outreach` email. Fire-and-forget with `Promise.allSettled`.

---

## What NOT To Do

- Do NOT block the Gmail scan UX on contact creation — auto-create is fire-and-forget
- Do NOT show toast errors for auto-create failures — log to console only
- Do NOT trigger auto-create for non-recruiter_outreach emails
- Do NOT modify the classify API route — it stays read-only

---

## Phase 1 — Audit (READ-ONLY)

1. Read `src/hooks/use-emails.ts` — find the `classifyEmails` function and the post-classification processing section (~lines 306-547)
2. Read the merge API route from Worker C to understand expected request/response shape
3. Read the contacts list page from Worker D to understand where merge action should appear

**STOP.** Report the classifyEmails hook point and merge API contract.

---

## Phase 2 — Merge UI

Create `src/components/contacts/contact-merge-modal.tsx`:
- Props: `{ contacts: Contact[], primaryId: string, secondaryId: string, onMerge, onClose }`
- Side-by-side layout: left = primary (highlighted), right = secondary
- Each R2 field shown as a row with both values. Primary value highlighted. Secondary shown grayed
- "Swap" button to swap primary/secondary
- Preview section: shows what the merged contact will look like (primary fields + secondary fills NULLs)
- Confirm button: calls `/api/contacts/merge` with `{ primary_id, secondary_id }`
- On success: toast "Contacts merged", call onMerge callback

Modify `src/app/(main)/contacts/page.tsx`:
- Add checkbox selection on contact rows (multi-select mode)
- When exactly 2 contacts selected, show "Merge" button in action bar
- Merge button opens ContactMergeModal with the two selected contacts

---

## Phase 3 — Gmail Auto-Create Integration

Modify `src/hooks/use-emails.ts`:
- In `classifyEmails`, after emails are classified and status is updated to the DB:
- Collect all emails with `category === "recruiter_outreach"` from the classification results
- For each, call `POST /api/contacts/auto-create` with:
  ```
  { from_email, from_name, from_domain, company: classification_json.company, role: classification_json.role, application_id: suggested_application_id || null }
  ```
- Use `Promise.allSettled` to avoid blocking the scan flow
- Log failures to `console.error` but do NOT show toast errors
- Do NOT await the entire batch — fire-and-forget after the scan UI updates

---

## Phase 4 — Verify

1. `npx tsc --noEmit` — no type errors
2. Test merge: select 2 contacts on list page, click Merge, verify side-by-side preview, confirm merge
3. Test Gmail integration: trigger a scan with a known recruiter email, verify contact auto-created
4. Test non-recruiter email: verify no auto-create call
5. Verify existing Gmail scan flow works without regression (scan + classify still completes)

---

## Phase 5 — Commit and Push

1. Stage all files
2. `git commit -m "feat(CAR-118): add contact merge UI and Gmail auto-create integration"`
3. `git push origin feat/CAR-116-contacts-hub`

---

## Invocation

```
claude --model sonnet --prompt-file prompts/CAR-118-worker-F-merge-gmail.md
```
