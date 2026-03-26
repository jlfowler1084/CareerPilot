# SCRUM-130: Professional Contacts Manager

**Date:** 2026-03-24
**Status:** Approved
**Approach:** Option B — consolidate both recruiter systems into unified contacts

---

## 1. Problem

Two overlapping recruiter tracking systems exist:

1. **`src/db/models.py`** — `recruiters` table in `careerpilot.db` with functional CRUD. Used by `cli.py` `recruiters` group and `morning()` scan.
2. **`src/agencies/recruiter_tracker.py`** — `RecruiterTracker` class with separate `recruiter_tracker.db` containing `recruiters`, `interactions`, and `submitted_roles` tables. Used by `agencies` CLI group.

Both need consolidation into a single professional contacts system that covers all work-related contacts, not just recruiters.

---

## 2. Schema

Three tables in `careerpilot.db`, replacing both old systems.

### 2.1 contacts

```sql
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    title TEXT,
    contact_type TEXT NOT NULL DEFAULT 'recruiter',
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    specialization TEXT,
    source TEXT,
    last_contact TEXT,
    contact_method TEXT,
    next_followup TEXT,
    relationship_status TEXT DEFAULT 'new',
    tags TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `contact_type`: recruiter, hiring_manager, networking, reference, colleague, mentor, school_contact, other
- `source`: staffing_agency, linkedin, meetup, referral, conference, cold_outreach, job_application, other
- `relationship_status`: new, active, warm, cold, do_not_contact
- `contact_method`: email, phone, linkedin, in_person, text
- `tags`: comma-separated strings

### 2.2 contact_interactions

Absorbed from `RecruiterTracker.interactions`.

```sql
CREATE TABLE IF NOT EXISTS contact_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    interaction_type TEXT NOT NULL,
    direction TEXT DEFAULT 'outbound',
    subject TEXT,
    summary TEXT,
    roles_discussed TEXT,
    follow_up_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
```

### 2.3 submitted_roles

Absorbed from `RecruiterTracker.submitted_roles`.

```sql
CREATE TABLE IF NOT EXISTS submitted_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    company TEXT NOT NULL,
    role_title TEXT NOT NULL,
    status TEXT DEFAULT 'submitted',
    submitted_date TEXT DEFAULT (date('now')),
    notes TEXT,
    pay_rate TEXT,
    location TEXT,
    role_type TEXT DEFAULT 'contract',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
```

---

## 3. Migration Strategy

Approach 2: CREATE new tables, INSERT from both sources, DROP old.

### 3.1 From `careerpilot.db` recruiters table

1. Check if `recruiters` table exists
2. INSERT INTO contacts: map `agency` -> `company`, set `contact_type='recruiter'`
3. DROP TABLE recruiters

### 3.2 From `recruiter_tracker.db`

1. Check if `data/recruiter_tracker.db` exists
2. ATTACH it as `tracker_db`
3. INSERT recruiters into contacts: map `agency` -> `company`, `specialties` -> `specialization`, `status` -> `relationship_status`, set `contact_type='recruiter'`, `source='staffing_agency'`. Dedup by email (skip if email already exists in contacts).
4. Copy `interactions` -> `contact_interactions` with remapped `contact_id` (old tracker ID -> new contacts ID, matched by email or name+company)
5. Copy `submitted_roles` with remapped `contact_id`
6. DETACH tracker_db

### 3.3 Idempotency

- Guard all steps with table/column existence checks
- Safe to run repeatedly — skips if contacts table already has data and recruiters table is gone
- Migration runs automatically in `get_connection()` after schema creation

---

## 4. CRUD Functions

All in `src/db/models.py`, replacing existing recruiter functions.

### 4.1 Core CRUD

| Function | Signature | Returns |
|---|---|---|
| `add_contact` | `(conn, name, contact_type, **kwargs)` | row id |
| `get_contact` | `(conn, contact_id)` | dict or None |
| `list_contacts` | `(conn, contact_type=None, status=None, tag=None)` | list of dicts |
| `update_contact` | `(conn, contact_id, **kwargs)` | bool |
| `delete_contact` | `(conn, contact_id, force=False)` | bool |
| `search_contacts` | `(conn, query)` | list of dicts |

`delete_contact`: soft delete sets `relationship_status='do_not_contact'`. Hard delete with `force=True`.

### 4.2 Interaction & Follow-up

| Function | Signature | Returns |
|---|---|---|
| `log_contact_interaction` | `(conn, contact_id, method, note="")` | bool |
| `get_stale_contacts` | `(conn, days=14)` | list of dicts |
| `get_followup_due` | `(conn)` | list of dicts |

`log_contact_interaction` updates `last_contact`, `contact_method`, appends timestamped note to `notes` field.

### 4.3 Tags

| Function | Signature | Returns |
|---|---|---|
| `add_tag` | `(conn, contact_id, tag)` | bool |
| `remove_tag` | `(conn, contact_id, tag)` | bool |

### 4.4 Agencies Tracker Functions (absorbed from RecruiterTracker)

| Function | Signature | Returns |
|---|---|---|
| `add_contact_interaction` | `(conn, contact_id, interaction_type, direction="outbound", subject=None, summary=None, roles_discussed=None, follow_up_date=None)` | row id |
| `get_contact_interactions` | `(conn, contact_id, limit=20)` | list of dicts |
| `add_submitted_role` | `(conn, contact_id, company, role_title, status="submitted", pay_rate=None, location=None, role_type="contract", notes=None)` | row id |
| `get_submitted_roles` | `(conn, contact_id=None, status=None)` | list of dicts |
| `update_role_status` | `(conn, role_id, status, notes=None)` | None |
| `get_contacts_summary` | `(conn)` | dict |

### 4.5 Migration

| Function | Signature | Returns |
|---|---|---|
| `migrate_recruiters_to_contacts` | `(conn)` | None |

Called from `get_connection()` after schema creation.

---

## 5. CLI Commands

### 5.1 contacts group (replaces recruiters)

| Command | Description |
|---|---|
| `contacts` | Rich table: ID, Name, Company, Type, Specialization, Last Contact, Status, Tags. Color-coded: green (active+recent), yellow (7-13 days), red (14+ days stale), dim (cold/do_not_contact). |
| `contacts add` | Interactive wizard with all fields |
| `contacts show <id>` | Rich panel with full detail + interaction history + submitted roles |
| `contacts edit <id>` | Update any field interactively |
| `contacts log <id>` | Log interaction: method, note, optional next_followup |
| `contacts search <query>` | Search name/company/email/notes |
| `contacts stale` | 14+ day stale active/warm contacts |
| `contacts followups` | Due/overdue follow-ups |
| `contacts tag <id> <tag>` | Add tag |
| `contacts untag <id> <tag>` | Remove tag |
| `contacts by-type <type>` | Filter by contact_type |

### 5.2 recruiters alias

`cli.py recruiters` kept as backward-compatible alias showing contacts filtered by `contact_type='recruiter'`.

### 5.3 agencies group updates

`agencies recruiter`, `agencies interaction`, `agencies role`, `agencies summary` subcommands rewired to use `src/db/models.py` functional CRUD instead of `RecruiterTracker`. `src/agencies/recruiter_tracker.py` deleted after migration.

`src/agencies/agencies_cli.py` updated to import from `src.db.models` and use `get_connection()`.

### 5.4 morning scan update

Updated to query contacts table. Shows:
1. Due follow-ups first (contacts where `next_followup <= today`)
2. Stale active/warm contacts (14+ days no contact)
3. Recent contacts (green checkmark)

---

## 6. Files Changed

| File | Action |
|---|---|
| `src/db/models.py` | Replace recruiters schema + CRUD with contacts/contact_interactions/submitted_roles schema + CRUD + migration |
| `cli.py` | Replace `recruiters` group with `contacts` group, add `recruiters` alias, update `morning()`, update `agencies` subcommands |
| `src/agencies/agencies_cli.py` | Rewire to use `src.db.models` functions instead of `RecruiterTracker` |
| `src/agencies/recruiter_tracker.py` | Delete |
| `tests/test_contacts.py` | New — comprehensive tests |
| `tests/test_recruiters.py` | Delete (replaced by test_contacts.py) |
| `tests/test_agencies.py` | Update recruiter tracker tests to use new functions |

---

## 7. Test Coverage

- Migration from `recruiters` table (data preserved, `agency` -> `company`)
- Migration from `recruiter_tracker.db` (recruiters merged, interactions/roles copied, contact_id remapped)
- CRUD: add, list, get, update, delete (soft + hard)
- Search across multiple fields
- Interaction logging with timestamped notes
- Stale detection (14+ days, active/warm only)
- Follow-up due detection
- Tag add/remove
- Filter by type, status, tag
- Submitted roles CRUD
- Contact interactions CRUD
- Backward compat: recruiters alias works
