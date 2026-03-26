# Professional Contacts Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate two recruiter tracking systems into a unified professional contacts manager with tags, follow-ups, interaction history, and submitted roles tracking.

**Architecture:** Replace `recruiters` table in `careerpilot.db` and `RecruiterTracker` class (separate DB) with unified `contacts` + `contact_interactions` + `submitted_roles` tables in `careerpilot.db`. Functional CRUD in `src/db/models.py`. CLI via `contacts` group in `cli.py` with `recruiters` backward-compat alias.

**Tech Stack:** Python 3.8+, SQLite, Click, Rich, pytest

**Spec:** `docs/superpowers/specs/2026-03-24-contacts-manager-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/db/models.py` | Modify | Schema (contacts, contact_interactions, submitted_roles), CRUD functions, migration |
| `cli.py` | Modify | `contacts` CLI group, `recruiters` alias, updated `morning()`, updated `agencies` subcommands |
| `src/agencies/agencies_cli.py` | Modify | Rewire to use `src.db.models` instead of `RecruiterTracker` |
| `src/agencies/recruiter_tracker.py` | Delete | Replaced by models.py functions |
| `tests/test_contacts.py` | Create | Comprehensive contacts tests |
| `tests/test_recruiters.py` | Delete | Replaced by test_contacts.py |
| `tests/test_agencies.py` | Modify | Update recruiter tracker tests |

---

## Task 1: Schema + Migration in models.py

**Files:**
- Modify: `src/db/models.py`
- Test: `tests/test_contacts.py`

- [ ] **Step 1: Write schema tests**

Tests for: contacts table creation, contact_interactions table creation, submitted_roles table creation, migration from recruiters table, migration from recruiter_tracker.db.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_contacts.py -v`

- [ ] **Step 3: Replace recruiters schema with contacts + contact_interactions + submitted_roles in SCHEMA_SQL**

- [ ] **Step 4: Implement migrate_recruiters_to_contacts(conn)**

Handles both sources: careerpilot.db recruiters table and recruiter_tracker.db.

- [ ] **Step 5: Wire migration into get_connection()**

- [ ] **Step 6: Run tests to verify they pass**

- [ ] **Step 7: Commit**

```
feat(SCRUM-130): contacts schema + migration from both recruiter systems
```

---

## Task 2: Contacts CRUD functions in models.py

**Files:**
- Modify: `src/db/models.py`
- Test: `tests/test_contacts.py`

- [ ] **Step 1: Write CRUD tests**

Tests for: add_contact, get_contact, list_contacts (with filters), update_contact, delete_contact (soft + hard), search_contacts.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement CRUD functions**

Replace old recruiter functions with: add_contact, get_contact, list_contacts, update_contact, delete_contact, search_contacts.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```
feat(SCRUM-130): contacts CRUD functions
```

---

## Task 3: Interaction, follow-up, and tag functions

**Files:**
- Modify: `src/db/models.py`
- Test: `tests/test_contacts.py`

- [ ] **Step 1: Write tests**

Tests for: log_contact_interaction, get_stale_contacts, get_followup_due, add_tag, remove_tag, add_contact_interaction, get_contact_interactions, add_submitted_role, get_submitted_roles, update_role_status, get_contacts_summary.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement functions**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```
feat(SCRUM-130): interaction logging, follow-ups, tags, submitted roles
```

---

## Task 4: contacts CLI group in cli.py

**Files:**
- Modify: `cli.py`

- [ ] **Step 1: Replace recruiters group with contacts group**

Implement: contacts (list all), contacts add, contacts show, contacts edit, contacts log, contacts search, contacts stale, contacts followups, contacts tag, contacts untag, contacts by-type.

- [ ] **Step 2: Add recruiters backward-compat alias**

- [ ] **Step 3: Update morning() to use contacts table**

- [ ] **Step 4: Run full test suite**

- [ ] **Step 5: Commit**

```
feat(SCRUM-130): contacts CLI commands with recruiters alias
```

---

## Task 5: Rewire agencies CLI + cleanup

**Files:**
- Modify: `src/agencies/agencies_cli.py`
- Modify: `cli.py` (agencies subcommands)
- Delete: `src/agencies/recruiter_tracker.py`
- Delete: `tests/test_recruiters.py`
- Modify: `tests/test_agencies.py`

- [ ] **Step 1: Rewire agencies_cli.py to use models.py functions**

- [ ] **Step 2: Update agencies subcommands in cli.py**

- [ ] **Step 3: Update tests/test_agencies.py**

- [ ] **Step 4: Delete recruiter_tracker.py and test_recruiters.py**

- [ ] **Step 5: Run full test suite**

- [ ] **Step 6: Commit**

```
feat: professional contacts manager with tags, follow-ups, and interaction history [SCRUM-130]
```
