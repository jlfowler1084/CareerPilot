---
date: 2026-04-11
topic: contacts-communications-hub
---

# Contacts & Communications Hub

## Problem Frame

Joe tracks job applications in CareerPilot's dashboard, but contact information is trapped in flat fields on the `applications` table (one contact per app) and unlinked interviewer name strings in `debriefs`. When the same recruiter (e.g., David Perez from TekSystems) works with Joe across multiple roles, there's no way to see all interactions with that person in one place. Emails from recruiters land in the Gmail inbox but aren't linked to a persistent contact record. When Joe enters an interview or gets a call, he has no quick-access relationship context -- who is this person, what's their role, what have we discussed before.

This is a solo job seeker's personal CRM: lightweight, curated, and integrated with the existing application pipeline and Gmail inbox.

**Considered alternative:** A read-only aggregation view (query emails + applications by email, display in a panel) was considered. It would deliver contact context with zero schema changes. The first-class entity approach was chosen because it supports manual contacts (phone-only, LinkedIn-only), notes, and contacts not yet linked to any application -- capabilities a view-only approach cannot provide.

## Requirements

**Contact Entity**
- R1. Contacts are a first-class entity, independent of applications -- a contact exists even if not yet linked to any application
- R2. A contact record stores: name, email (optional -- manual contacts may lack email), phone, company, title/role, source (e.g., "recruiter email", "manual"), and optional notes
- R3. Contacts are deduplicated by email address when email is present -- if two recruiter emails arrive from the same address, they map to one contact. Contacts without email are allowed but cannot be auto-deduplicated
- R4. Manual merge: user can select two contacts and merge them into one, reassigning all linked applications and timeline entries. User selects a primary record; primary fields win on conflict, secondary fields fill only NULL fields on the primary. Merge preview shows both records side-by-side with primary values highlighted. This handles recruiters who email from multiple addresses

**Contact-Application Relationship**
- R5. Contacts and applications have a many-to-many relationship -- one contact can be linked to multiple applications, and one application can have multiple contacts
- R6. Each contact-application link stores a role label (recruiter, hiring manager, interviewer, HR, referral) so the same person can have different roles across different applications
- R7. The existing flat `contact_name`/`contact_email`/`contact_phone`/`contact_role` fields on `applications` are migrated into proper contact records and links during the schema migration. Post-migration, the flat columns are kept as read-only deprecated fields with a defined drop schedule (drop after migration is verified and all UI references updated)

**Auto-Creation from Gmail**
- R8. When the Gmail scanner classifies an email as `recruiter_outreach`, automatically create a contact record (or match to an existing one by email) and link it to the relevant application if one can be matched. Other classification categories (interview_request, follow_up, offer) do NOT trigger auto-creation -- those contacts are created manually when the user decides the relationship is worth tracking
- R9. Auto-created contacts are populated from existing emails table fields (from_name, from_email, from_domain) and classification_json metadata (company, role) -- no additional header parsing needed. All values extracted from email data must be validated before database write: email must pass RFC-5322 format check, display name stripped of HTML and length-bounded (255 chars). The user can enrich remaining fields later
- R10. Manual contact creation is always available -- the primary path for contacts from interview_request, follow_up, and offer emails

**Contact Detail View (dedicated page at /contacts/:id)**
- R11. Contact detail shows a summary card: name, company, title, phone, email, linked applications (with their statuses), last contact date, and editable notes
- R12. Summary card includes edit and delete actions. Edit: inline or form for all R2 fields, with the same RFC-5322 email validation from R9 applied to all creation/edit paths. Delete: confirmation dialog stating consequences (linked applications lose the contact link; timeline entries from Gmail are not deleted; conversation records are not deleted; if a new contact is later created with the same email, previously orphaned emails and conversations will automatically re-appear in their timeline)
- R13. Below the summary card, a chronological activity timeline shows interactions from existing data sources: scanned emails (from emails table) and conversation records (from conversations table matched by contact email in people JSONB) -- ordered newest-first. Debrief linkage via fuzzy name matching is a stretch goal (see Dependencies)
- R14. Timeline entries display key info inline (email subject/date, conversation type/notes, debrief stage). Cross-linking to source views (inbox, coaching) is a P2 follow-up, not required for v1

**Contacts Dashboard Page**
- R15. A dedicated "Contacts" page in the sidebar navigation shows all contacts in a searchable, filterable list
- R16. Each list row shows: name, company/title, role label (recruiter/hiring manager/etc.), last contact date, linked application count. Default sort: most recently contacted first
- R17. The list is searchable by name, company, and email
- R18. The list is filterable by: company, role (recruiter/hiring manager/etc.), and recency presets (Active: last 14 days, Recent: 15-60 days, Dormant: 61-180 days, Inactive: 180+ days)
- R19. Clicking a contact navigates to the dedicated detail page (R11-R14)
- R20. Empty state (zero contacts): message explaining auto-creation from Gmail scanning + "Add contact manually" CTA

**Communication History (built on existing systems)**
- R21. Emails previously scanned and stored in the emails table that match a contact's from_email are surfaced in that contact's timeline. This does NOT perform a live Gmail API search -- emails received before the first scan or outside the scan window will not appear
- R22. Conversation records from the existing conversations table are surfaced in the contact timeline by matching contact email against conversations.people JSONB. No new interaction logging UI is built -- users log calls, meetings, and notes via the existing Conversations form, and those records appear in the contact's timeline automatically. **Known gap:** The application-scoped ConversationForm currently collects only name+role for people entries (no email field). Planning must add an email field to this form so conversation records can be matched to contacts. The standalone ConversationFormModal already includes email
- R23. The contact's "last contact date" auto-updates from the most recent timeline entry. Timeline entries that count: sent/received emails, conversation records (calls, meetings, messages). Application status changes do NOT update last contact date

## Success Criteria

- Opening a contact shows every touchpoint with that person across all applications and communication channels in one view
- The same recruiter appearing in 3 different applications shows as one contact with 3 linked apps, not 3 orphaned records
- Existing flat contact data on applications is preserved and linked -- no data loss during migration
- Auto-creation from recruiter emails works without manual intervention for the common case (recruiter_outreach classification)
- No duplicate interaction logging systems -- conversations are logged once via the existing Conversations form and appear in both the application view and the contact timeline

## Scope Boundaries

- **Out of scope:** Google Fi web calling integration (future feature, schema should accommodate but no UI/API work now)
- **Out of scope:** LinkedIn message import or scraping (manual logging via Conversations covers this)
- **Out of scope:** AI-powered contact enrichment (e.g., auto-filling titles from LinkedIn) -- manual enrichment only
- **Out of scope:** Contact import/export (CSV, vCard) -- not needed for solo use
- **Out of scope:** Batch operations on contacts (mass delete, mass tag)
- **Out of scope:** Cross-linking from timeline entries to source views (P2 follow-up)
- **Out of scope:** Automatic dedup by name/company fuzzy matching (manual merge handles edge cases)
- **In scope for future:** The `communication_type` field on conversation records already includes "phone" -- future Google Fi integration hooks into the existing Conversations system, not a new one

## Key Decisions

- **First-class entity over embedded fields:** Contacts need their own table because the same person spans multiple applications and communication channels. Flat fields can't represent this. A read-only aggregation view was considered but cannot support manual contacts, notes, or unlinked contacts.
- **Many-to-many with roles:** A recruiter on one app might be a referral source on another. The join table carries a role label to capture this context.
- **recruiter_outreach only for auto-creation:** Only emails classified as `recruiter_outreach` trigger auto-creation. Other categories (interview_request, follow_up, offer) are for people Joe already knows -- he creates those contacts manually when the relationship proves worth tracking. This keeps the contact list curated and avoids noise from staffing agency spam.
- **Email dedup + manual merge:** Deduplication by email handles the common case. For recruiters who use multiple email addresses, a manual merge action lets the user combine two contacts into one. Automatic fuzzy matching is out of scope.
- **Build on existing Conversations system:** The dashboard already has a full conversations system (table, form, list page) for logging phone calls, video calls, emails, in-person meetings, chat, and notes. R22 reuses this -- the contact timeline surfaces conversation records by matching contact email against conversations.people. No new interaction logging UI is built.
- **Dedicated page over slide-over:** Contact detail is a full page at /contacts/:id. More room for the timeline, clean back-navigation. Note: applications currently use a slide-over panel, not a dedicated page -- contacts will be the first entity with a dedicated [id] route in the app.

## Dependencies / Assumptions

- Gmail inbox scanner classification (already working) is the trigger for auto-contact creation -- specifically the `recruiter_outreach` category
- The existing `applications.contact_name`/`contact_email`/`contact_phone`/`contact_role` columns contain data that must be migrated -- most rows are likely NULL (these columns were added recently in migration 010 and only populated via URL import or manual entry)
- Supabase RLS policies must be enabled on the contacts table AND the join table before any rows are inserted. Policy predicate: `auth.uid() = user_id` using the `(SELECT auth.uid())` subquery pattern established in migration 015
- The `debriefs.interviewer_names` field is a text[] (string array) column -- individual names are plain strings without email addresses, so linking to contacts requires fuzzy name matching (stretch goal, not required for initial launch)
- The existing conversations table has a `people` JSONB column with optional email field per person -- timeline matching depends on email being present in this field
- The emails table has `from_email` indexed (idx_emails_from_email) -- R21 queries are efficient for incoming emails. Sent emails are NOT scanned or stored (the Gmail scanner only fetches inbox messages) -- the contact timeline will only show incoming emails from the contact, not emails Joe sent to them. Sent-mail scanning is a future enhancement

## Outstanding Questions

### Deferred to Planning
- [Affects R7][Technical] What's the migration strategy for existing flat contact fields? Most rows are likely NULL. Validate actual row counts before designing migration complexity. Define the deprecation timeline for flat columns and the order of UI reference updates (6+ source files: detail-panel.tsx, use-applications.ts, url-import.tsx, extract-job route)
- [Affects R8][Technical] Auto-creation uses a separate `/api/contacts/auto-create` endpoint (option c). The classify route stays read-only. After classification completes, the client calls the new endpoint for each `recruiter_outreach` email. The endpoint handles contact creation/dedup and application linking server-side with full RLS context. Planning determines the exact call site and error handling
- [Affects R13][Technical] How to efficiently build the activity timeline? Emails: query by from_email (indexed). Conversations: query by people JSONB containment (unindexed -- may need GIN index or accept client-side filtering at current data volumes). Debriefs: query via application_id join. Consider whether a server-side union or client-side merge is appropriate
- [Affects R4][UX] What is the merge UX? Likely: select two contacts from list, "Merge" action, pick primary record, reassign all links. Define which fields win on conflict (e.g., which name/company to keep)

## Next Steps

-> `/ce:plan` for structured implementation planning
