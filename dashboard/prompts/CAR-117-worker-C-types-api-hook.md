# [CAR-117/118] Contacts Hub — Types, API Routes, and Hook (Worker C)
# Model: SONNET
# Justification: Multi-file backend implementation following established patterns

## Tickets
- **Primary:** CAR-117 — Contacts schema/backend
- **Relates to:** CAR-116 (epic), CAR-118 (UI)

## Estimated Scope
~10 new files: types, 5 API routes, validation utility, hook

---

## Phase 0 — Branch Setup

**Branch:** `feat/CAR-116-contacts-hub` (must already exist from Worker A)

1. `cd .worktrees/contacts-hub` (or checkout the existing branch)
2. `git pull origin feat/CAR-116-contacts-hub` to get Worker A's schema migration
3. Confirm the contacts migration (016) exists

---

## Context

Read plan Units 2, 3, and 5 at `docs/plans/2026-04-11-001-feat-contacts-communications-hub-plan.md`.

Key patterns to follow:
- **Types:** `src/types/index.ts` — nullable columns use `| null`, status types are string unions
- **API routes:** `src/app/api/conversations/route.ts` — `createServerSupabaseClient()`, auth check, NextResponse.json
- **Hook:** `src/hooks/use-conversations.ts` — API route fetch, realtime Supabase channel, debounced refetch
- **Validation:** RFC-5322 email check + 255-char name length bound (shared across auto-create, manual create, edit)

---

## What NOT To Do

- Do NOT write UI components — this worker covers backend only
- Do NOT modify existing hooks or API routes (except adding the auto-create call site in Worker G)
- Do NOT implement the merge endpoint as a simple delete+update — wrap in a transaction

---

## Phase 1 — Audit (READ-ONLY)

1. Read `src/types/index.ts` to confirm entity type patterns
2. Read `src/app/api/conversations/route.ts` to confirm API route conventions (GET with query params, POST with body)
3. Read `src/hooks/use-conversations.ts` to confirm hook pattern (API fetch, realtime channel, debounced refetch)
4. Read `src/app/api/gmail/classify/route.ts` to confirm the classify route stays read-only (no DB writes)

**STOP.** Report patterns confirmed.

---

## Phase 2 — Types

Add to `src/types/index.ts`:
- `ContactRole` type: `"recruiter" | "hiring_manager" | "interviewer" | "hr" | "referral"`
- `Contact` interface matching the `contacts` table columns (all nullable fields as `| null`)
- `ContactApplicationLink` interface
- `ContactWithLinks` extending Contact with `applications?: Pick<Application, "id" | "title" | "company" | "status">[]` and `link_count?: number`

---

## Phase 3 — Validation Utility

Create `src/lib/contacts/validation.ts`:
- `validateContactEmail(email: string): boolean` — RFC-5322 basic check (use a practical regex, not full spec)
- `sanitizeContactName(name: string): string` — strip HTML tags, length-bound to 255 chars
- `validateContactInput(input)` — returns `{ valid: boolean, errors: string[] }` — name required, email validated if present

---

## Phase 4 — CRUD API Routes

Create `src/app/api/contacts/route.ts`:
- **GET:** List contacts with join to contact_application_links for link count. Query params: `search` (ilike name/company/email), `role`, `recency` (Active/Recent/Dormant/Inactive → date ranges on last_contact_date)
- **POST:** Create contact. Validate with utility. Check email dedup (query by user_id + email). Return 409 if duplicate

Create `src/app/api/contacts/[id]/route.ts`:
- **GET:** Single contact with linked applications (join through contact_application_links → applications)
- **PUT:** Update. Validate. If email changes, recheck dedup
- **DELETE:** Delete contact. Join table entries cascade. Return 204

Create `src/app/api/contacts/auto-create/route.ts`:
- **POST:** Receives `{ from_email, from_name, from_domain, company, role, application_id? }`. Validates email. Upserts contact (match by email or create). Creates join entry if application_id. Updates last_contact_date. Returns `{ contact, created: boolean }`

Create `src/app/api/contacts/merge/route.ts`:
- **POST:** Receives `{ primary_id, secondary_id }`. Verifies both belong to auth user. Transaction: update secondary's join entries to point to primary (skip if duplicate key), fill NULL fields on primary from secondary, delete secondary. Returns merged contact

Create `src/app/api/contacts/[id]/timeline/route.ts`:
- **GET:** Queries emails by from_email (contact's email) + conversations by people JSONB containment. Returns `{ emails: [...], conversations: [...] }` as separate arrays

---

## Phase 5 — useContacts Hook

Create `src/hooks/use-contacts.ts`:
- Fetch via `/api/contacts` with query params
- Realtime subscription on `contacts` table via Supabase channel (debounced refetch, following use-conversations.ts)
- Expose: `{ contacts, loading, error, createContact, updateContact, deleteContact, mergeContacts, fetchContacts }`
- Toast notifications via sonner

---

## Phase 6 — Verify

1. `npx tsc --noEmit` — no new type errors
2. Test API routes manually or with a quick verification script
3. Confirm auto-create dedup works (call twice with same email → one contact)

---

## Phase 7 — Commit and Push

**STOP before committing.** Report all files created.

After approval:
1. Stage all new files
2. `git commit -m "feat(CAR-117): add contact types, API routes, validation, and useContacts hook"`
3. `git push origin feat/CAR-116-contacts-hub`

---

## Invocation

```
claude --model sonnet --prompt-file prompts/CAR-117-worker-C-types-api-hook.md
```
