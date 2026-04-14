---
title: "feat: Contacts & Communications Hub"
type: feat
status: active
date: 2026-04-11
origin: docs/brainstorms/contacts-hub-requirements.md
tickets: CAR-116 (epic), CAR-117 (schema/backend), CAR-118 (UI)
---

# feat: Contacts & Communications Hub

## Overview

Add a first-class Contacts entity to CareerPilot's dashboard with a dedicated contacts page, detail view with activity timeline, auto-creation from Gmail scanner, manual merge, and integration with the existing Conversations system. This is a solo job seeker's personal CRM for tracking recruiter and hiring manager relationships across applications.

## Problem Frame

Contact information is trapped in flat fields on the `applications` table (one contact per app) and unlinked interviewer names in `debriefs`. The same recruiter across multiple roles has no unified view. Emails from recruiters aren't linked to persistent contact records. (see origin: `docs/brainstorms/contacts-hub-requirements.md`)

## Requirements Trace

- R1-R4. Contact entity: first-class, stores PII fields, email dedup, manual merge
- R5-R7. Contact-application many-to-many with roles, flat field migration
- R8-R10. Auto-creation from `recruiter_outreach` via `/api/contacts/auto-create`, manual creation
- R11-R14. Dedicated detail page at `/contacts/:id` with summary card, edit/delete, activity timeline
- R15-R20. Contacts list page with search, filters, recency presets, empty state
- R21-R23. Timeline built from emails table + conversations.people JSONB, last_contact_date auto-update

## Scope Boundaries

- **Out of scope:** Google Fi calling, LinkedIn import, AI enrichment, import/export, batch ops, cross-linking to source views (P2), fuzzy dedup, debrief linkage in timeline
- **In scope:** Schema + RLS, data migration, auto-create endpoint, contacts CRUD, list page, detail page, timeline, merge, ConversationForm email field patch, Gmail scanner integration

## Context & Research

### Relevant Code and Patterns

| Pattern | Source | Notes |
|---------|--------|-------|
| Migration conventions | `supabase/migrations/015_fix_rls_subquery_pattern.sql` | `(SELECT auth.uid())` subquery, never bare `auth.uid()` |
| Join table with user_id | `supabase/migrations/005_gmail_inbox.sql` | `email_application_links`: composite PK, own `user_id` for RLS, `linked_by` metadata |
| Table creation | `supabase/migrations/001_*.sql`, `004_*.sql` | UUID PK, user_id FK, created_at/updated_at with trigger |
| Hook pattern | `src/hooks/use-conversations.ts` | Fetch via API route, realtime via Supabase channel, debounced refetch |
| API route auth | `src/app/api/conversations/route.ts` | `createServerSupabaseClient()`, auth check, NextResponse.json |
| Type definitions | `src/types/index.ts` | Nullable columns use `\| null`, status as string unions |
| Page structure | `src/app/(main)/conversations/page.tsx` | `"use client"`, custom hook, Lucide icons, Sonner toast |
| Sidebar nav | `src/components/layout/sidebar.tsx` | Add entry to `NAV_ITEMS` array |
| Email schema | `supabase/migrations/005_gmail_inbox.sql` | `from_email` indexed, `classification_json` JSONB |
| Activity feed | `src/components/dashboard/activity-feed.tsx` | Simple fetch-and-render timeline pattern |
| CommunicationsSection | `src/components/applications/communications-section.tsx` | Groups emails by thread, reference for email timeline |
| ConversationForm (app-scoped) | `src/components/applications/conversation-form.tsx` | Missing email field in people entries — must patch |
| ConversationFormModal (standalone) | `src/components/conversations/conversation-form-modal.tsx` | Has email field — reference pattern |

### Institutional Learnings

- No `docs/solutions/` entries exist yet — this feature is a good candidate for `ce:compound` after implementation
- Feature manifest at `feature-manifest.json` tracks 178 features — must update after implementation
- No JSONB containment queries (`@>`) exist in the codebase yet — the conversation timeline matching will be the first

## Key Technical Decisions

- **Next migration is `016_add_contacts.sql`:** Single migration file covering contacts table, join table, RLS, indexes, and data migration from flat fields. Flat columns deprecated (not dropped) in this migration; dropped in `017_*` after UI references are updated
- **`last_contact_date` is a materialized column on contacts:** Updated server-side in the API routes when contacts are created, when auto-create runs, and when the timeline is loaded. Required for R18 recency filter queries. Not a computed/virtual column — needs to be in the WHERE clause
- **Timeline query strategy — client-side merge at current volumes:** API route returns emails (query by `from_email`, indexed) and conversations (JSONB containment query server-side) as separate arrays. Client merges and sorts by date. No GIN index needed until conversations exceed ~500 rows. Revisit if profiling shows degradation
- **Contacts hook follows use-conversations.ts pattern:** Fetch via API routes (not direct Supabase client), subscribe via realtime channel for live updates
- **First dedicated [id] route in the app:** Contacts introduces `src/app/(main)/contacts/[id]/page.tsx`. Applications currently use a slide-over panel — contacts needs more space for the timeline

## Open Questions

### Resolved During Planning

- **Auto-create hook point:** Separate `/api/contacts/auto-create` endpoint (option c). Classify route stays read-only. Client calls auto-create for each `recruiter_outreach` email after classification completes. Server handles dedup + linking with full RLS context
- **Migration complexity:** Most `applications.contact_*` rows are NULL (columns added recently in migration 010, only populated via URL import or manual entry). Migration is a simple INSERT-SELECT for non-null rows. Validate row counts at migration time with a DO block
- **Conversation timeline matching viability:** The application-scoped ConversationForm omits email from people entries. Unit 4 patches this form to add the email field, ensuring new conversation records can be matched. Historical records without email will not appear in contact timelines (known limitation, documented in R22)
- **Role uniqueness on join table:** A contact can hold only ONE role per application. The join table has a unique constraint on `(contact_id, application_id)`. To change the role, update the existing link. Multiple simultaneous roles on the same application is out of scope
- **Validation applies to all paths:** RFC-5322 email validation and 255-char name length bound apply to auto-creation, manual creation, and edit. Shared validation utility

### Deferred to Implementation

- **Exact row count of non-null contact_* fields:** Run a count query at migration time to decide whether to log or skip
- **Conversation people JSONB GIN index:** Monitor query performance; add index if conversations table exceeds ~500 rows
- **Auto-create error path:** When from_email fails validation on already-stored email data, skip contact creation silently and log — the email record is already stored, just don't create a contact from malformed data

## Implementation Units

- [ ] **Unit 1: Schema Migration** `(CAR-117)`

**Goal:** Create contacts table, contact_application_links join table, RLS policies, indexes, and migrate existing flat contact data.

**Requirements:** R1, R2, R3, R5, R6, R7

**Dependencies:** None — this is the foundation

**Files:**
- Create: `supabase/migrations/016_add_contacts.sql`

**Approach:**
- `contacts` table: id (UUID PK), user_id (FK auth.users ON DELETE CASCADE), name TEXT NOT NULL, email TEXT, phone TEXT, company TEXT, title TEXT, source TEXT NOT NULL DEFAULT 'manual', notes TEXT, last_contact_date TIMESTAMPTZ, created_at, updated_at with trigger
- Unique partial index on `(user_id, email) WHERE email IS NOT NULL` for dedup (R3)
- `contact_application_links` table: contact_id (FK), application_id (FK), user_id (FK), role TEXT NOT NULL DEFAULT 'recruiter', created_at. Unique constraint on `(contact_id, application_id)`
- RLS on both tables using `(SELECT auth.uid())` pattern with USING + WITH CHECK
- Performance indexes: contacts(user_id), contacts(email), contacts(last_contact_date DESC), contact_application_links(application_id), contact_application_links(contact_id)
- Data migration: INSERT INTO contacts SELECT DISTINCT ON (contact_email) ... FROM applications WHERE contact_email IS NOT NULL. Then INSERT INTO contact_application_links from the same source rows
- DO NOT drop flat columns — leave them as deprecated. Drop in `017_*`

**Patterns to follow:**
- `supabase/migrations/005_gmail_inbox.sql` for join table structure (composite PK, user_id, metadata columns)
- `supabase/migrations/015_fix_rls_subquery_pattern.sql` for RLS policy syntax
- `supabase/migrations/001_*.sql` for table creation conventions (gen_random_uuid, update_updated_at trigger)

**Test scenarios:**
- Happy path: migration applies cleanly on empty DB and on DB with existing application contact data
- Edge case: applications with same contact_email get deduplicated into one contact with multiple join table entries
- Edge case: applications with NULL contact_email are skipped (no orphan contacts created)
- Edge case: applications with contact_name but NULL contact_email create no contact record
- Integration: RLS prevents anon-key SELECT on contacts table (0 rows returned)
- Integration: RLS prevents user A from reading user B's contacts

**Verification:**
- `supabase db reset` succeeds with the new migration
- Contacts and join table exist with correct columns, constraints, and indexes
- RLS policies are active on both tables

---

- [ ] **Unit 2: TypeScript Types** `(CAR-117)`

**Goal:** Define Contact and ContactApplicationLink types, update database types.

**Requirements:** R2, R5, R6

**Dependencies:** Unit 1 (schema must be defined)

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/types/database.types.ts` (regenerate or manually add)

**Approach:**
- Add `Contact` interface: id, user_id, name, email (string | null), phone (string | null), company (string | null), title (string | null), source, notes (string | null), last_contact_date (string | null), created_at, updated_at
- Add `ContactApplicationLink` interface: contact_id, application_id, user_id, role, created_at
- Add `ContactRole` type: `"recruiter" | "hiring_manager" | "interviewer" | "hr" | "referral"`
- Add computed display type: `ContactWithLinks` extending Contact with `applications: Pick<Application, "id" | "title" | "company" | "status">[]` and `link_count: number`

**Patterns to follow:**
- Existing entity types in `src/types/index.ts` — nullable columns use `| null`, joined data uses `?` optional

**Test expectation:** None — pure type definitions, verified by TypeScript compilation

---

- [ ] **Unit 3: API Routes — CRUD + Auto-Create + Merge** `(CAR-117)`

**Goal:** Server-side API routes for all contact operations.

**Requirements:** R1-R4, R5, R6, R8, R9, R10, R12, R23

**Dependencies:** Unit 1 (tables), Unit 2 (types)

**Files:**
- Create: `src/app/api/contacts/route.ts` (GET list, POST create)
- Create: `src/app/api/contacts/[id]/route.ts` (GET single, PUT update, DELETE)
- Create: `src/app/api/contacts/auto-create/route.ts` (POST)
- Create: `src/app/api/contacts/merge/route.ts` (POST)
- Create: `src/app/api/contacts/[id]/timeline/route.ts` (GET)
- Create: `src/lib/contacts/validation.ts` (shared validation utility)

**Approach:**
- All routes: `createServerSupabaseClient()`, auth check, return NextResponse.json
- **GET /api/contacts:** Query contacts with join to contact_application_links for link count. Support query params: `search` (ilike on name, company, email), `role`, `recency` (Active/Recent/Dormant/Inactive mapped to date ranges)
- **POST /api/contacts:** Create with validation (name required, email RFC-5322 if provided, display name length-bounded). Check email dedup before insert
- **PUT /api/contacts/[id]:** Update with same validation. If email changes, recheck dedup
- **DELETE /api/contacts/[id]:** Delete contact + cascade join table entries. Emails and conversations are NOT deleted (they match by email, not FK)
- **POST /api/contacts/auto-create:** Receives `{ email_id, from_email, from_name, from_domain, company, role, application_id? }`. Validates email. Upserts contact (create or match by email). Creates join table entry if application_id provided. Updates last_contact_date. Returns created/matched contact
- **POST /api/contacts/merge:** Receives `{ primary_id, secondary_id }`. Validates both belong to auth user. Wraps in transaction: update secondary's join table entries to point to primary, fill NULL fields on primary from secondary, delete secondary contact. Returns merged contact
- **GET /api/contacts/[id]/timeline:** Queries emails by from_email + conversations by people JSONB containment. Returns `{ emails: [...], conversations: [...] }` for client-side merge and sort

**Patterns to follow:**
- `src/app/api/conversations/route.ts` for GET with query params and joined data
- `src/app/api/gmail/classify/route.ts` for POST pattern with validation

**Test scenarios:**
- Happy path: Create contact with all fields, verify returned with id
- Happy path: Auto-create from recruiter email, verify contact created and linked to application
- Happy path: Auto-create matches existing contact by email, verify no duplicate created
- Happy path: Merge two contacts, verify links reassigned and secondary deleted
- Edge case: Create contact with email that already exists — return 409 conflict
- Edge case: Auto-create with malformed from_email — skip silently, return success with `contact: null`
- Edge case: Merge where primary and secondary have conflicting names — primary wins
- Edge case: Delete contact with 3 linked applications — join entries deleted, applications unaffected
- Error path: Unauthorized request — 401
- Error path: Merge with contact_id belonging to different user — 404 (RLS hides it)
- Integration: Timeline returns emails sorted by received_at DESC merged with conversations sorted by date DESC

**Verification:**
- All CRUD operations work via curl/Postman against running dev server
- Auto-create dedup prevents duplicates
- Merge is transactional — no partial state on failure

---

- [ ] **Unit 4: ConversationForm Email Field Patch** `(CAR-118 prep)`

**Goal:** Add email field to the application-scoped ConversationForm so conversation records can be matched to contacts via R22.

**Requirements:** R22 (known gap)

**Dependencies:** None — independent patch

**Files:**
- Modify: `src/components/applications/conversation-form.tsx`

**Approach:**
- Add email input field to the people entry section, matching the pattern in `conversation-form-modal.tsx` (lines 302-337)
- Email field is optional but validated on entry if provided (RFC-5322)
- Existing conversation records are NOT retroactively updated — this only affects new entries

**Patterns to follow:**
- `src/components/conversations/conversation-form-modal.tsx` people section (has email + phone fields)

**Test scenarios:**
- Happy path: Log a conversation with people including email — email saved in JSONB
- Happy path: Log a conversation without email — still saves (email optional)
- Edge case: Enter malformed email — validation error shown inline

**Verification:**
- ConversationForm people entries now include email field
- Saved conversation records in Supabase contain email in people JSONB

---

- [ ] **Unit 5: useContacts Hook** `(CAR-118)`

**Goal:** Client-side data fetching, caching, realtime subscription, and CRUD methods for contacts.

**Requirements:** R1-R4, R15-R20

**Dependencies:** Unit 3 (API routes must exist)

**Files:**
- Create: `src/hooks/use-contacts.ts`

**Approach:**
- Fetch via `/api/contacts` with query params for search, role filter, recency filter
- Realtime subscription on `contacts` table via Supabase channel (debounced refetch on changes, following use-conversations.ts pattern)
- Expose: `{ contacts, loading, error, fetchContacts, createContact, updateContact, deleteContact, mergeContacts }`
- Search is client-side text filter on name/company/email (adequate for solo user volume)
- Recency filter passes preset to API route which translates to date range WHERE clause

**Patterns to follow:**
- `src/hooks/use-conversations.ts` for API-route-based fetching + realtime subscription pattern
- `src/hooks/use-applications.ts` for optimistic update pattern and toast notifications

**Test scenarios:**
- Happy path: Hook fetches contacts on mount, returns array
- Happy path: Create contact via hook, appears in list without page reload (realtime)
- Happy path: Search filters contacts client-side by name match
- Edge case: Empty contacts list — returns empty array, no error
- Edge case: Realtime event from another tab — debounced refetch fires

**Verification:**
- Hook provides contacts data to consuming components
- Realtime updates work across browser tabs

---

- [ ] **Unit 6: Contacts List Page + Sidebar** `(CAR-118)`

**Goal:** Dedicated contacts page with searchable, filterable list and sidebar navigation entry.

**Requirements:** R15, R16, R17, R18, R19, R20

**Dependencies:** Unit 5 (useContacts hook)

**Files:**
- Create: `src/app/(main)/contacts/page.tsx`
- Create: `src/components/contacts/contact-list.tsx`
- Create: `src/components/contacts/contact-row.tsx`
- Create: `src/components/contacts/contact-filters.tsx`
- Modify: `src/components/layout/sidebar.tsx` (add NAV_ITEMS entry)

**Approach:**
- Page: `"use client"`, Suspense wrapper, uses `useContacts()` hook
- List: Each row shows name, company/title, role label, last contact date (relative time), linked app count. Clickable rows navigate to `/contacts/:id`
- Filters: Search input (name/company/email), role dropdown (All/Recruiter/Hiring Manager/etc.), recency segment control (Active/Recent/Dormant/Inactive)
- Default sort: most recently contacted first (last_contact_date DESC)
- Empty state: message about auto-creation from Gmail + "Add contact manually" button opening a create modal
- Sidebar: Add `{ id: "contacts", href: "/contacts", label: "Contacts", icon: Users }` to NAV_ITEMS (between Applications and Analytics)

**Patterns to follow:**
- `src/app/(main)/conversations/page.tsx` for page structure (closest analog)
- `src/components/inbox/filter-chips.tsx` for filter component pattern

**Test scenarios:**
- Happy path: Page renders contact list sorted by last_contact_date DESC
- Happy path: Search "TekSystems" filters to matching contacts
- Happy path: Filter by "Recruiter" role shows only recruiter contacts
- Happy path: Filter by "Dormant" shows contacts with 61-180 day last contact
- Happy path: Click contact row navigates to /contacts/:id
- Edge case: Zero contacts — empty state renders with CTA
- Edge case: Search with no results — "No contacts match" message with "Clear filters" link

**Verification:**
- Contacts page accessible from sidebar
- Search and filters work independently and in combination
- Navigation to detail page works

---

- [ ] **Unit 7: Contact Detail Page + Timeline** `(CAR-118)`

**Goal:** Dedicated detail page with summary card, edit/delete actions, and activity timeline.

**Requirements:** R11, R12, R13, R14, R21, R22, R23

**Dependencies:** Unit 5 (useContacts hook), Unit 3 (timeline API route)

**Files:**
- Create: `src/app/(main)/contacts/[id]/page.tsx`
- Create: `src/components/contacts/contact-summary-card.tsx`
- Create: `src/components/contacts/contact-timeline.tsx`
- Create: `src/components/contacts/contact-edit-modal.tsx`
- Create: `src/components/contacts/contact-delete-dialog.tsx`

**Approach:**
- Page fetches single contact by ID + timeline data via API routes
- **Summary card:** Name (heading), company/title, phone, email, linked applications as chips (up to 3 inline, "+N more" expands), last contact date, editable notes section. Edit and Delete buttons
- **Edit modal:** Form with all R2 fields. Name required, email validated (RFC-5322). On email change, dedup check before save
- **Delete dialog:** Confirmation with consequence text per R12 (including re-attachment disclosure)
- **Timeline:** Fetches from `/api/contacts/[id]/timeline`. Client merges emails + conversations, sorts by date DESC. Each entry shows: icon by type (email/conversation), date, key info (email subject or conversation type + notes). No cross-linking to source views in v1 (P2)
- **Empty timeline state:** "No interactions recorded yet. Conversations logged via the Conversations form will appear here automatically."
- Linked applications: each chip shows job title + status color badge, links to `/applications` with the app selected

**Patterns to follow:**
- `src/components/applications/detail-panel.tsx` for section layout and auto-save patterns (but this is a page, not a sheet)
- `src/components/applications/communications-section.tsx` for email grouping/display
- `src/components/dashboard/activity-feed.tsx` for timeline rendering

**Test scenarios:**
- Happy path: Page loads with summary card and populated timeline
- Happy path: Edit contact name + save — card updates immediately
- Happy path: Delete contact — redirects to /contacts list
- Happy path: Timeline shows emails and conversations interleaved by date
- Edge case: Contact with no timeline entries — empty state message
- Edge case: Contact with 5 linked applications — 3 shown, "+2 more" expandable
- Edge case: Edit email to existing contact's email — dedup warning
- Error path: Navigate to non-existent contact ID — 404 or redirect to list

**Verification:**
- Detail page renders at `/contacts/:id`
- Edit and delete work with proper confirmation
- Timeline shows real email and conversation data

---

- [ ] **Unit 8: Contact Merge UI** `(CAR-118)`

**Goal:** Merge two contacts into one with side-by-side preview and field conflict resolution.

**Requirements:** R4

**Dependencies:** Unit 3 (merge API route), Unit 6 (list page for selection)

**Files:**
- Create: `src/components/contacts/contact-merge-modal.tsx`
- Modify: `src/app/(main)/contacts/page.tsx` (add merge action)

**Approach:**
- Entry point: Select two contacts on list page (checkbox selection), "Merge" button appears in action bar
- Modal shows two contacts side-by-side: left = primary (highlighted), right = secondary
- Each field row shows both values. Primary value wins; secondary fills only NULL primary fields. User can swap primary/secondary
- Preview section shows what the merged contact will look like
- Confirm button calls `/api/contacts/merge` with primary_id and secondary_id
- On success: redirect to merged contact detail page, toast "Contacts merged"

**Patterns to follow:**
- `src/components/conversations/conversation-form-modal.tsx` for modal structure and form pattern

**Test scenarios:**
- Happy path: Select two contacts, open merge modal, see side-by-side preview
- Happy path: Confirm merge — secondary deleted, primary updated, links reassigned
- Happy path: Swap primary/secondary — preview updates correctly
- Edge case: Primary has name "David P", secondary has "David Perez" — primary wins ("David P")
- Edge case: Primary has NULL company, secondary has "TekSystems" — secondary fills the gap
- Edge case: Both contacts linked to same application — no duplicate link after merge

**Verification:**
- Merge modal opens with correct data
- Merged contact retains all links from both sources
- Secondary contact no longer exists

---

- [ ] **Unit 9: Gmail Auto-Create Integration** `(CAR-117/118)`

**Goal:** Wire the Gmail scanner to automatically create contacts from `recruiter_outreach` classified emails.

**Requirements:** R8, R9

**Dependencies:** Unit 3 (auto-create API route), Unit 5 (useContacts hook)

**Files:**
- Modify: `src/hooks/use-emails.ts` (add auto-create call after classification)

**Approach:**
- In the `classifyEmails` function, after emails are classified and status is updated, iterate over results
- For each email with category `recruiter_outreach`, call `POST /api/contacts/auto-create` with: email_id, from_email, from_name, from_domain, company (from classification_json), role (from classification_json), application_id (from suggested_application_id if available)
- Fire-and-forget — don't block the scan UX on contact creation. Use `Promise.allSettled` to avoid breaking the scan flow if auto-create fails for some emails
- Log failures to console but don't show toast errors (auto-creation is background work)

**Patterns to follow:**
- Existing post-classification processing in `use-emails.ts` `classifyEmails()` function (lines 306-547)

**Test scenarios:**
- Happy path: Scan + classify recruiter email — contact auto-created in background
- Happy path: Scan recruiter email from known contact — existing contact matched, no duplicate
- Happy path: Scan non-recruiter email (interview_request) — no auto-create call
- Edge case: Auto-create fails for one email — other emails still processed
- Edge case: Scan 5 recruiter emails from same sender — one contact created, not five
- Integration: After scan completes, contacts page shows newly auto-created contacts

**Verification:**
- Gmail scan + classify flow still works without regression
- New recruiter emails produce contacts visible on the contacts page
- Non-recruiter emails do not trigger contact creation

---

- [ ] **Unit 10: Feature Manifest + Regression Check**

**Goal:** Register all new features in the manifest and verify no regressions.

**Requirements:** All — verification gate

**Dependencies:** All previous units

**Files:**
- Modify: `feature-manifest.json`

**Approach:**
- Add entries for: contacts page, contact detail page, contact list, contact timeline, contact merge, contact auto-create, contacts API routes, useContacts hook, ConversationForm email patch
- Run `npm run build` to verify TypeScript compilation
- Run `npx vitest run` to verify test suite
- Run `tools/regression-check.sh` if it exists

**Test expectation:** None — manifest update only. Build and test suite are verification steps.

**Verification:**
- `npm run build` succeeds
- Test suite passes at same or higher baseline
- Feature manifest updated with all new features

## System-Wide Impact

- **Interaction graph:** Gmail scan → classify → auto-create endpoint → contacts table. Conversations form → conversations table → contact timeline query. Applications detail panel still reads flat contact_* fields until Unit 10b drops them
- **Error propagation:** Auto-create failures are silent (fire-and-forget). CRUD errors surface via toast. Merge failures return 500 and show error toast
- **State lifecycle risks:** Dual-state during migration (flat fields + contacts table coexist). Mitigated by deprecating flat columns immediately and dropping in subsequent migration
- **API surface parity:** The existing detail-panel.tsx contact section continues to work with flat fields until explicitly replaced. No breaking change in v1
- **Integration coverage:** Auto-create dedup must be tested with concurrent scan + manual creation. Merge must be tested with contacts linked to the same application
- **Unchanged invariants:** Applications CRUD, Gmail scan/classify flow, Conversations CRUD, and all existing pages remain unchanged. The contacts feature is purely additive except for the ConversationForm email field patch (Unit 4)

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| conversations.people JSONB often lacks email | Unit 4 patches the form. Historical records are a known limitation. Consider adding contact_id FK to conversations in a follow-up |
| Flat column dual-state creates confusion | Mark columns deprecated in migration comment. Plan `017_drop_flat_contact_columns.sql` as immediate follow-up |
| First [id] route introduces new routing pattern | Follow Next.js App Router conventions. Simple params.id destructuring |
| JSONB containment query performance | Client-side filtering acceptable at current volumes (<500 conversation rows). Add GIN index if needed |
| Auto-create fires on malformed email data | Validation skips silently. Contact not created, email record unaffected |

## Worker Agent Deployment Sequence

```
Parallel batch 1 (no dependencies):
  Worker A: Unit 1 (Schema Migration)
  Worker B: Unit 4 (ConversationForm Patch)

Sequential after batch 1:
  Worker C: Unit 2 + Unit 3 (Types + API Routes)

Sequential after Worker C:
  Worker D: Unit 5 (useContacts Hook)

Parallel batch 2 (after Worker D):
  Worker E: Unit 6 (Contacts List Page + Sidebar)
  Worker F: Unit 7 (Contact Detail Page + Timeline)

Sequential after batch 2:
  Worker G: Unit 8 + Unit 9 (Merge UI + Gmail Integration)

Final:
  Worker H: Unit 10 (Feature Manifest + Build Verification)
```

## Sources & References

- **Origin document:** [contacts-hub-requirements.md](docs/brainstorms/contacts-hub-requirements.md)
- Related code: `src/hooks/use-conversations.ts`, `src/hooks/use-applications.ts`, `src/hooks/use-emails.ts`
- Related migrations: `005_gmail_inbox.sql`, `010_add_cover_letter_and_events.sql`, `015_fix_rls_subquery_pattern.sql`
- Related tickets: CAR-116 (epic), CAR-117 (schema/backend), CAR-118 (UI)
