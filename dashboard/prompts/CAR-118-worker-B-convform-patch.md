# [CAR-118] Contacts Hub — ConversationForm Email Patch (Worker B)
# Model: SONNET
# Justification: Single-file focused patch following existing modal pattern

## Tickets
- **Primary:** CAR-118 — Contacts UI
- **Relates to:** CAR-116 (epic), R22 known gap

## Estimated Scope
Single file modification: `src/components/applications/conversation-form.tsx`

---

## Phase 0 — Branch Setup

**Branch:** `feat/CAR-116-contacts-hub`
**Base:** `feature/dashboard-v2`

If branch already exists from Worker A, check it out. Otherwise create it:
1. `git fetch origin feature/dashboard-v2`
2. `git worktree add .worktrees/contacts-convform origin/feature/dashboard-v2 -b feat/CAR-116-contacts-hub` (or checkout existing)
3. Confirm branch and pull latest

---

## Context

Read plan Unit 4 at `docs/plans/2026-04-11-001-feat-contacts-communications-hub-plan.md`.

The application-scoped ConversationForm (`conversation-form.tsx`) currently collects only name+role for people entries — no email field. The standalone ConversationFormModal (`conversation-form-modal.tsx`) already has email+phone fields. This patch adds the email field to the application-scoped form so conversation records can be matched to contacts via people JSONB.

---

## What NOT To Do

- Do NOT refactor or merge the two conversation forms — that's a separate task
- Do NOT modify `conversation-form-modal.tsx` — it already has email
- Do NOT make email required — it is optional

---

## Phase 1 — Audit (READ-ONLY)

1. Read `src/components/applications/conversation-form.tsx` — find the people entry section (name + role inputs)
2. Read `src/components/conversations/conversation-form-modal.tsx` lines 302-337 — the pattern to follow for email field
3. Confirm both forms use the same type system for people entries

**STOP.** Report the people section location and the modal's email pattern.

---

## Phase 2 — Add Email Field

1. Add an email input field to the people entry section in `conversation-form.tsx`, matching the modal's pattern
2. Email is optional, validated inline on entry if provided (simple email regex)
3. Include the email value in the people JSONB array when saving

**Success criteria:**
- ConversationForm people entries now include an email text input
- Email is persisted in the conversations.people JSONB on save
- Existing functionality (name, role) is unchanged

---

## Phase 3 — Commit and Push

1. `git add src/components/applications/conversation-form.tsx`
2. `git commit -m "feat(CAR-118): add email field to application-scoped ConversationForm"`
3. `git push origin feat/CAR-116-contacts-hub`

---

## Invocation

```
claude --model sonnet --prompt-file prompts/CAR-118-worker-B-convform-patch.md
```
