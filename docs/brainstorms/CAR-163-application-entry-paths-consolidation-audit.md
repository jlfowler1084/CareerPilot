# CAR-163 — Application-Entry-Paths Consolidation Audit

**Ticket:** [CAR-163](https://jlfowler1084.atlassian.net/browse/CAR-163)
**Date:** 2026-04-21
**Author:** Joe (via Claude Code audit session)
**Status:** Decision locked — Option (c). Migration tickets drafted below, pending filing.

---

## 1. Background

On 2026-04-20 the user flagged:
> "I feel like this is getting messy. What does the tracker add even do differently functionality wise than just adding manually from the UI?"

Root cause: over CAR-155 / 156 / 157 / 160 / 161 / 162, CareerPilot accumulated multiple overlapping ways to create an `applications` row, each writing to a different database. No single ticket owned the question "where does an application row live?", so each feature made a locally reasonable choice and the split metastasized.

This document is the decision artifact required by CAR-163's acceptance criteria. It is **not** an implementation plan — it chooses the end state and files the tickets that will execute it.

---

## 2. Verified Inventory

All five currently shipped paths were verified against source (2026-04-21). The two dashboard paths listed in the ticket as "planned" (CAR-161 email-import, CAR-162 attachment-upload) are not yet implemented — they are decision-points, not code.

### 2.1 `applications` table write paths (shipped)

| # | Path | Entry-point file | Write site | DB | Fields populated | Gaps |
|---|---|---|---|---|---|---|
| 1 | `cli tracker add` wizard | `cli.py` → `src/jobs/tracker.py:29` | `ApplicationTracker.save_job()` — INSERT at `src/jobs/tracker.py:48-67` | SQLite | title, company, location, url, source, salary_range, status, date_found, notes, profile_id, description, message_id | no `user_id` (no auth); no `job_type`/`posted_date`/`tailored_resume`/`cover_letter` |
| 2 | `cli tracker import-from-email` | `cli.py:1777` → `src/gmail/attachments.py` + `ApplicationTracker` | Same `save_job()` call | SQLite | title, company, description, source="email_import", status, message_id | no location, no url, no salary_range |
| 3 | `cli search` (save-on-prompt) | `cli.py:1045` → `ApplicationTracker` | Same `save_job()` call | SQLite | title, company, location, url, salary_range, status, date_found, notes, source | no description, no message_id |
| 4 | Dashboard "Add Application Manually" | `dashboard/src/components/applications/add-form.tsx` → `dashboard/src/hooks/use-applications.ts:103` | `supabase.from("applications").insert(...)` at line 112-142 | Supabase | user_id, title, company, location, url, source, salary_range, status, job_type, posted_date, profile_id, notes, tailored_resume, cover_letter | no description, no contact fields |
| 5 | Dashboard "Paste URL to auto-extract" | `dashboard/src/app/api/extract-job/route.ts` → same hook (via `createFromExtraction`) | Same `supabase.from("applications").insert(...)` | Supabase | user_id, title, company, location, url, source, salary_range, status, job_type, posted_date, job_description, contact_name, contact_email, profile_id, notes | — |

### 2.2 Planned (not implemented)

| # | Path | Proposed destination | Status |
|---|---|---|---|
| 6 | Dashboard email-import | Supabase | CAR-161 To Do — **retire** under Option (c) (see §5) |
| 7 | Dashboard attachment-upload | Supabase | CAR-162 To Do — **rescope/deprioritize** under Option (c) (see §5) |

### 2.3 Key structural fact (decisive for Option c cost)

All three CLI paths funnel through **one method** (`ApplicationTracker.save_job()`), and both dashboard paths go through **one hook** (`use-applications.addApplication()`). The backend swap has **two seam points across the codebase, not seven**.

### 2.4 Contacts — same pattern, confirmed

`src/db/models.py:502-650` (`add_contact`, `upsert_contact`) writes to SQLite; `dashboard/src/app/api/contacts/route.ts:158-172` writes directly to Supabase. Field mappings diverge (dashboard hardcodes `source="manual"`). **The consolidation rationale for applications applies identically to contacts** — but per ticket scope, contacts get their own audit ticket (see §6).

### 2.5 Duplicated heuristics — audit findings

- **Extraction logic is NOT duplicated but IS inconsistent.** `src/gmail/attachments.py:27-117` uses Python regex/heuristics for PDF/DOCX text extraction + company/title inference. `dashboard/src/app/api/extract-job/route.ts:52-76` delegates to Claude AI. Two different strategies, no shared code. **Not urgent to consolidate** — the CAR-162 worry ("heuristic will be re-ported to TypeScript") is moot; TypeScript side already picked a different (and likely better) approach.
- **URL duplicate detection is duplicated inconsistently.** CLI (`ApplicationTracker.find_by_url()` at `src/jobs/tracker.py:84`) hard-blocks duplicates with a confirm prompt (CAR-157). Dashboard `url-import.tsx:94-97` does a soft in-memory warn. Dashboard `add-form.tsx` has no check at all. **This is a real consolidation target**, tracked as a separate migration ticket below.

---

## 3. Decision: Option (c) — Unify on Supabase via Python Client

**Restating the three options from the ticket:**

- **(a) Dashboard-only** — retire all CLI write paths. Disruptive to existing CLI-first workflows; eliminates valuable scripting/headless path.
- **(b) CLI + sync** — keep both DBs, build SQLite→Supabase sync. Doubles the schema surface, introduces sync failure modes, doesn't actually eliminate the mess.
- **(c) Unify on Supabase via Python client** — CLI keeps its wizard/scan UX but writes to Supabase. Local SQLite retired for `applications` (and later `contacts`).

**Option (c) is chosen.** Rationale:

1. **Single source of truth for the user.** Rows created by CLI become visible on the dashboard and vice versa. This is the behavior the user expected on 2026-04-20 when `tracker add` rows didn't appear in the dashboard.
2. **CLI UX preserved.** The wizard, `search`-save flow, and email-import stay — they're Claude-driven / terminal-optimized surfaces that the browser can't easily replicate. Option (a) would throw this value away.
3. **Low code cost.** Two seam points (`ApplicationTracker.save_job()` + the matching read methods; `use-applications.addApplication()` stays as-is). The `ApplicationTracker` class interface doesn't need to change — only its backend.
4. **Avoids sync failure modes.** Option (b) creates a new class of bugs (sync conflicts, race conditions, schema drift between two live DBs) that don't exist in (c).
5. **Contacts extend naturally.** Once the Supabase-Python-client pattern is proven for applications, applying it to contacts is copy-paste of the pattern.

**Primary risk: CLI authentication with Supabase.**

The dashboard authenticates via Supabase Auth sessions; rows are scoped by `user_id` under RLS. The CLI has no auth today and doesn't belong in a browser login flow. Three viable sub-options, to be decided in the first migration ticket:

- **(c.1) Supabase service-role key in `.env`** — bypasses RLS. Simplest. Acceptable for a single-user local tool. Risk: the service-role key is effectively god-mode; losing `.env` is bad. Already the pattern for other secrets in this project.
- **(c.2) One-time device-login flow** — CLI opens browser once, stores refresh token in `data/`. More user-facing auth correctness. Medium UX cost.
- **(c.3) Dedicated "CLI user" account** — CLI uses a long-lived password/session for a single Supabase user that represents "me from the terminal." Simple but clunky.

Recommendation for the migration ticket: start with (c.1), revisit if multi-user ever matters. This project is single-user by design.

**Secondary risks (flagged, handled inside migration tickets):**

- **Schema alignment.** SQLite has `message_id`, `date_found` as explicit columns; Supabase presumably has `created_at` and no `message_id`. Adding `message_id` + `description` to the Supabase schema preserves all CLI functionality. Adding `user_id` to the CLI write path requires resolving the auth question above. Decision to be made in CAR-163-M2 below.
- **Existing SQLite data.** ~12 rows (per CAR-160 notes) migrate in one script. Low risk.
- **Offline use.** Losing local SQLite means `cli.py` can't function without network. Current flows already require Gmail/Claude API calls over network, so this is not a regression.
- **Test strategy.** Current tests hit real SQLite via `ApplicationTracker`. Under Option (c), tests either hit a Supabase test project or mock the client. Decision in CAR-163-M2.

---

## 4. Migration Ticket Plan

The ticket numbering below is provisional — actual CAR-* keys assigned when filed.

| Proposed | Summary | Scope | Depends on |
|---|---|---|---|
| **CAR-163-M1** | Add Supabase Python client + decide CLI auth strategy | Install `supabase-py`; add `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` to `config/settings.py`; write a thin `get_supabase_client()` helper; pick (c.1) / (c.2) / (c.3) and document. **Does NOT port any write paths yet** — just unblocks the next ticket. | — |
| **CAR-163-M2** | Port `ApplicationTracker` to Supabase backend | Rewrite `save_job`, `find_by_url`, `find_application_by_message_id`, `update_status`, `list_applications`, `response_rate` etc. to use the Supabase client. Keep class interface stable so CLI callers don't change. Add missing columns to Supabase schema (`message_id`, `description` if absent; `date_found` maps to `created_at`). Fix tests. **Shipping this ticket makes all three CLI paths write to Supabase.** | M1 |
| **CAR-163-M3** | One-time data migration: SQLite `applications` → Supabase | One-off Python script under `scripts/`. Read existing rows, push to Supabase with a single `user_id` (the current dashboard user). Idempotent (skip if URL already in Supabase). Verify on a dry-run flag first. Delete or rename `data/careerpilot.db` applications table after verification. | M2 |
| **CAR-163-M4** | Behavior parity: URL duplicate detection on dashboard forms | Add `find_by_url` equivalent to `dashboard/src/components/applications/add-form.tsx` and tighten the soft warn in `url-import.tsx:94-97` to match the CLI's confirm-before-duplicate behavior. Uses the newly-unified Supabase table. | M2 |
| **CAR-163-M5** | Contacts audit + consolidation | Mirror this audit for `contacts` (CLI `add_contact` / `upsert_contact` vs dashboard `/api/contacts/route.ts`). Decide whether to apply Option (c) to contacts. Likely yes, but out of scope for this audit per the ticket. | M1 (shares auth pattern) |
| **CAR-163-M6** | (Optional) Retire CLI SQLite entirely | After M3 + M5 land, audit remaining SQLite usage (skills, journals, interviews, search cache). Decide whether the local DB becomes a pure cache or goes away. Separate decision from applications/contacts — may stay. | M3, M5 |

---

## 5. Re-Examination of Existing Tickets

Per acceptance criterion 4 — every related ticket revisited under Option (c).

| Ticket | Current scope | Under Option (c) | Action |
|---|---|---|---|
| **CAR-155** (Contacts create-from-email) | Shipped, writes SQLite | Same refactor as applications — part of M5 | **Leave as shipped; address in M5** |
| **CAR-156** (`tracker import-from-email`) | Shipped, writes SQLite | Functionality stays, backend swaps via M2 | **No rescope needed — M2 supersedes** |
| **CAR-157** (`tracker add` wizard) | Shipped, writes SQLite | Wizard UX stays, backend swaps via M2 | **No rescope needed — M2 supersedes** |
| **CAR-159** (Improve weak email extraction) | Open | Still valid — extraction quality is orthogonal to storage. Note: dashboard uses Claude, CLI uses heuristics; CAR-159 could optionally unify on Claude. | **Keep; add note "consider unifying on Claude-based extraction to match dashboard"** |
| **CAR-160** (Dashboard form missing description/status/notes) | Open | Still valid; dashboard is the canonical UI under Option (c), so completing the form is higher priority after M2 lands | **Keep; raise priority post-M2** |
| **CAR-161** (Dashboard email-import) | Open | Under Option (c), CLI `tracker import-from-email` already writes to Supabase via M2 — this is the email-import feature. Dashboard browser-based email-import is a separate UX feature, not a data-consolidation need | **Retire** — re-file as a future UX feature if users want it in-browser |
| **CAR-162** (Dashboard attachment-upload) | Open | Under Option (c), CLI attachment import via Gmail already covers the import story. Dashboard browser-based attachment upload is a nice-to-have, not consolidation-driven | **Rescope + deprioritize** — keep ticket but mark as "future enhancement, not blocking consolidation" |

---

## 6. Out of scope for this audit

- Actually executing any of M1-M6 — those are their own tickets.
- Contacts consolidation detailed inventory (tracked as M5; applications-only here).
- Schema changes to other CLI-only tables (`skills`, `journal`, `interview_transcripts`, etc.) — deferred to M6 or indefinitely.
- Dashboard feature work unrelated to application-entry (analytics, auto-apply, etc.).

---

## 7. Acceptance criteria status

- [x] Inventory table produced and committed to `docs/brainstorms/`
- [x] End-state option chosen with explicit rationale (Option c, §3)
- [ ] Migration tickets filed (drafts in §4 — pending user review before filing)
- [x] Existing application-related tickets re-examined (§5)
- [ ] `CLAUDE.md` updated with canonical entry path + pointer to this doc (pending)

---

## 8. Source

Raised by user 2026-04-20:
> "at some point we have to do another audit to find out where we have half developed features or duplicated features and start consolidating/cleaning them up."

Verified inventory sourced from a codebase sweep on 2026-04-21. See `ApplicationTracker.save_job()` at `src/jobs/tracker.py:29-73` and `addApplication` at `dashboard/src/hooks/use-applications.ts:103-165` for the two seam points.
