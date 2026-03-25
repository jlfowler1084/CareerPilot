"""SQLite schema and CRUD operations for CareerPilot."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from config import settings

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    current_level INTEGER NOT NULL DEFAULT 1 CHECK(current_level BETWEEN 1 AND 5),
    target_level INTEGER NOT NULL DEFAULT 3 CHECK(target_level BETWEEN 1 AND 5),
    last_practiced TEXT,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS skill_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL,
    old_level INTEGER NOT NULL,
    new_level INTEGER NOT NULL,
    changed_at TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT DEFAULT '',
    url TEXT DEFAULT '',
    source TEXT DEFAULT '',
    salary_range TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'found',
    date_found TEXT,
    date_applied TEXT,
    date_response TEXT,
    notes TEXT DEFAULT '',
    profile_id TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS interview_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transcript_file TEXT NOT NULL,
    analysis_json TEXT NOT NULL,
    analyzed_at TEXT NOT NULL,
    company TEXT DEFAULT '',
    role TEXT DEFAULT ''
);

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

CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_intel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    role_title TEXT,
    brief TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    application_id INTEGER,
    FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE TABLE IF NOT EXISTS skill_demand (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL UNIQUE,
    category TEXT,
    times_seen INTEGER DEFAULT 1,
    required_count INTEGER DEFAULT 0,
    preferred_count INTEGER DEFAULT 0,
    match_level TEXT,
    last_seen_in TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL UNIQUE,
    priority_rank INTEGER,
    study_hours_logged REAL DEFAULT 0,
    target_hours REAL,
    resources TEXT,
    notes TEXT,
    status TEXT DEFAULT 'not_started',
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_application_map (
    skill_name TEXT NOT NULL,
    application_id INTEGER NOT NULL,
    requirement_level TEXT,
    FOREIGN KEY (application_id) REFERENCES applications(id),
    PRIMARY KEY (skill_name, application_id)
);
"""


def get_connection(db_path: Path = None) -> sqlite3.Connection:
    """Get a SQLite connection, creating the database and schema if needed."""
    db_path = db_path or settings.DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_SQL)
    migrate_recruiters_to_contacts(conn)
    migrate_applications_description(conn)
    return conn


# --- Skills CRUD ---


def add_skill(conn, name, category="", current_level=1, target_level=3, notes=""):
    """Insert a new skill. Returns the row id, or None if it already exists."""
    try:
        cursor = conn.execute(
            "INSERT INTO skills (name, category, current_level, target_level, notes) "
            "VALUES (?, ?, ?, ?, ?)",
            (name, category, current_level, target_level, notes),
        )
        conn.commit()
        logger.debug("Added skill: %s (level %d/%d)", name, current_level, target_level)
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        logger.debug("Skill '%s' already exists, skipping", name)
        return None


def update_skill(conn, name, new_level, source="manual"):
    """Update a skill's current_level and log the change."""
    row = conn.execute("SELECT id, current_level FROM skills WHERE name = ?", (name,)).fetchone()
    if not row:
        logger.warning("Skill '%s' not found", name)
        return False

    old_level = row["current_level"]
    now = datetime.now().isoformat()

    conn.execute(
        "UPDATE skills SET current_level = ?, last_practiced = ? WHERE id = ?",
        (new_level, now, row["id"]),
    )
    conn.execute(
        "INSERT INTO skill_log (skill_id, old_level, new_level, changed_at, source) "
        "VALUES (?, ?, ?, ?, ?)",
        (row["id"], old_level, new_level, now, source),
    )
    conn.commit()
    logger.info("Updated skill '%s': %d -> %d (source=%s)", name, old_level, new_level, source)
    return True


def get_skill(conn, name):
    """Get a single skill by name. Returns dict or None."""
    row = conn.execute("SELECT * FROM skills WHERE name = ?", (name,)).fetchone()
    return dict(row) if row else None


def get_all_skills(conn):
    """Get all skills, sorted by category then name."""
    rows = conn.execute("SELECT * FROM skills ORDER BY category, name").fetchall()
    return [dict(r) for r in rows]


def get_gaps(conn):
    """Get skills where current_level < target_level, sorted by gap size desc."""
    rows = conn.execute(
        "SELECT *, (target_level - current_level) AS gap "
        "FROM skills WHERE current_level < target_level "
        "ORDER BY gap DESC, name",
    ).fetchall()
    return [dict(r) for r in rows]


def get_skill_log(conn, skill_name=None):
    """Get skill change history, optionally filtered by skill name."""
    if skill_name:
        rows = conn.execute(
            "SELECT sl.*, s.name AS skill_name FROM skill_log sl "
            "JOIN skills s ON sl.skill_id = s.id "
            "WHERE s.name = ? ORDER BY sl.changed_at DESC",
            (skill_name,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT sl.*, s.name AS skill_name FROM skill_log sl "
            "JOIN skills s ON sl.skill_id = s.id "
            "ORDER BY sl.changed_at DESC",
        ).fetchall()
    return [dict(r) for r in rows]


# --- Key-Value Store ---


def get_kv(conn, key):
    """Get a value from the kv_store. Returns string or None."""
    row = conn.execute("SELECT value FROM kv_store WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_kv(conn, key, value):
    """Set a value in the kv_store (upsert)."""
    conn.execute(
        "INSERT INTO kv_store (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )
    conn.commit()


# --- Migration ---


def migrate_recruiters_to_contacts(conn):
    """Migrate data from old recruiters table and recruiter_tracker.db into contacts.

    Idempotent — safe to call multiple times.
    """
    # Check if old recruiters table exists
    old_table = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='recruiters'"
    ).fetchone()

    if old_table:
        # Copy recruiters -> contacts (agency -> company)
        conn.execute(
            "INSERT INTO contacts (name, company, email, phone, linkedin_url, "
            "specialization, last_contact, contact_method, relationship_status, "
            "notes, created_at, contact_type, source) "
            "SELECT name, agency, email, phone, linkedin_url, "
            "specialization, last_contact, contact_method, relationship_status, "
            "notes, created_at, 'recruiter', 'staffing_agency' "
            "FROM recruiters"
        )
        conn.execute("DROP TABLE recruiters")
        conn.commit()
        logger.info("Migrated recruiters table to contacts")

    # Check if recruiter_tracker.db exists and has data
    tracker_db_path = settings.DATA_DIR / "recruiter_tracker.db"
    if tracker_db_path.exists():
        try:
            conn.execute(
                "ATTACH DATABASE ? AS tracker_db", (str(tracker_db_path),)
            )
            # Check the attached db has a recruiters table
            has_table = conn.execute(
                "SELECT name FROM tracker_db.sqlite_master "
                "WHERE type='table' AND name='recruiters'"
            ).fetchone()
            if has_table:
                _migrate_tracker_db(conn)
            conn.execute("DETACH DATABASE tracker_db")
            conn.commit()
            logger.info("Migrated recruiter_tracker.db into contacts")
        except Exception:
            logger.warning("Could not migrate recruiter_tracker.db", exc_info=True)
            try:
                conn.execute("DETACH DATABASE tracker_db")
            except Exception:
                pass


def _migrate_tracker_db(conn):
    """Merge recruiter_tracker.db data into contacts tables."""
    # Get existing emails in contacts to deduplicate
    existing_emails = {
        row[0].lower()
        for row in conn.execute(
            "SELECT email FROM contacts WHERE email IS NOT NULL"
        ).fetchall()
    }

    # Map old tracker recruiter IDs to new contact IDs
    id_map = {}
    tracker_recruiters = conn.execute(
        "SELECT * FROM tracker_db.recruiters"
    ).fetchall()

    for r in tracker_recruiters:
        r = dict(r)
        email = r.get("email")
        if email and email.lower() in existing_emails:
            # Already exists — find the existing contact ID
            existing = conn.execute(
                "SELECT id FROM contacts WHERE lower(email) = ?",
                (email.lower(),),
            ).fetchone()
            if existing:
                id_map[r["id"]] = existing["id"]
            continue

        cursor = conn.execute(
            "INSERT INTO contacts (name, company, title, email, phone, "
            "specialization, relationship_status, notes, created_at, "
            "contact_type, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiter', 'staffing_agency')",
            (
                r["name"], r.get("agency"), r.get("title"), email,
                r.get("phone"), r.get("specialties"),
                r.get("status", "new"), r.get("notes"),
                r.get("created_at", datetime.now().isoformat()),
            ),
        )
        id_map[r["id"]] = cursor.lastrowid
        if email:
            existing_emails.add(email.lower())

    # Copy interactions
    has_interactions = conn.execute(
        "SELECT name FROM tracker_db.sqlite_master "
        "WHERE type='table' AND name='interactions'"
    ).fetchone()
    if has_interactions:
        interactions = conn.execute(
            "SELECT * FROM tracker_db.interactions"
        ).fetchall()
        for i in interactions:
            i = dict(i)
            new_contact_id = id_map.get(i["recruiter_id"])
            if new_contact_id:
                conn.execute(
                    "INSERT INTO contact_interactions (contact_id, interaction_type, "
                    "direction, subject, summary, roles_discussed, follow_up_date, "
                    "created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        new_contact_id, i["interaction_type"], i.get("direction", "outbound"),
                        i.get("subject"), i.get("summary"), i.get("roles_discussed"),
                        i.get("follow_up_date"), i.get("created_at"),
                    ),
                )

    # Copy submitted_roles
    has_roles = conn.execute(
        "SELECT name FROM tracker_db.sqlite_master "
        "WHERE type='table' AND name='submitted_roles'"
    ).fetchone()
    if has_roles:
        roles = conn.execute("SELECT * FROM tracker_db.submitted_roles").fetchall()
        for role in roles:
            role = dict(role)
            new_contact_id = id_map.get(role["recruiter_id"])
            if new_contact_id:
                conn.execute(
                    "INSERT INTO submitted_roles (contact_id, company, role_title, "
                    "status, submitted_date, notes, pay_rate, location, role_type, "
                    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        new_contact_id, role["company"], role["role_title"],
                        role.get("status", "submitted"), role.get("submitted_date"),
                        role.get("notes"), role.get("pay_rate"), role.get("location"),
                        role.get("role_type", "contract"), role.get("created_at"),
                        role.get("updated_at"),
                    ),
                )


# --- Contacts CRUD ---


def add_contact(conn, name, contact_type="recruiter", **kwargs):
    """Insert a new contact. Returns the row id."""
    allowed = {
        "company", "title", "email", "phone", "linkedin_url",
        "specialization", "source", "last_contact", "contact_method",
        "next_followup", "relationship_status", "tags", "notes",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    columns = ["name", "contact_type"] + list(fields.keys())
    placeholders = ", ".join("?" for _ in columns)
    col_names = ", ".join(columns)
    values = [name, contact_type] + list(fields.values())

    cursor = conn.execute(
        f"INSERT INTO contacts ({col_names}) VALUES ({placeholders})", values,
    )
    conn.commit()
    logger.debug("Added contact: %s (type=%s)", name, contact_type)
    return cursor.lastrowid


def get_contact(conn, contact_id):
    """Get a single contact by id. Returns dict or None."""
    row = conn.execute(
        "SELECT * FROM contacts WHERE id = ?", (contact_id,)
    ).fetchone()
    return dict(row) if row else None


def list_contacts(conn, contact_type=None, status=None, tag=None):
    """Get contacts with optional filters, sorted by company then name."""
    query = "SELECT * FROM contacts"
    conditions = []
    params = []

    if contact_type:
        conditions.append("contact_type = ?")
        params.append(contact_type)
    if status:
        conditions.append("relationship_status = ?")
        params.append(status)
    if tag:
        conditions.append("(',' || tags || ',') LIKE ?")
        params.append(f"%,{tag},%")

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY company, name"

    rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def update_contact(conn, contact_id, **kwargs):
    """Update contact fields. Returns True if found, False otherwise."""
    allowed = {
        "name", "company", "title", "contact_type", "email", "phone",
        "linkedin_url", "specialization", "source", "last_contact",
        "contact_method", "next_followup", "relationship_status",
        "tags", "notes",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return False

    row = conn.execute(
        "SELECT id FROM contacts WHERE id = ?", (contact_id,)
    ).fetchone()
    if not row:
        logger.warning("Contact id=%d not found", contact_id)
        return False

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [contact_id]
    conn.execute(f"UPDATE contacts SET {set_clause} WHERE id = ?", values)
    conn.commit()
    logger.info("Updated contact id=%d: %s", contact_id, list(fields.keys()))
    return True


def delete_contact(conn, contact_id, force=False):
    """Delete a contact. Soft delete (do_not_contact) unless force=True."""
    row = conn.execute(
        "SELECT id FROM contacts WHERE id = ?", (contact_id,)
    ).fetchone()
    if not row:
        return False

    if force:
        conn.execute("DELETE FROM contact_interactions WHERE contact_id = ?", (contact_id,))
        conn.execute("DELETE FROM submitted_roles WHERE contact_id = ?", (contact_id,))
        conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    else:
        conn.execute(
            "UPDATE contacts SET relationship_status = 'do_not_contact' WHERE id = ?",
            (contact_id,),
        )
    conn.commit()
    return True


def search_contacts(conn, query):
    """Search contacts by name, company, email, or notes (LIKE matching)."""
    pattern = f"%{query}%"
    rows = conn.execute(
        "SELECT * FROM contacts WHERE "
        "name LIKE ? OR company LIKE ? OR email LIKE ? OR notes LIKE ? "
        "ORDER BY name",
        (pattern, pattern, pattern, pattern),
    ).fetchall()
    return [dict(r) for r in rows]


def log_contact_interaction(conn, contact_id, method, note=""):
    """Log a contact interaction.

    Updates last_contact to now, sets contact_method, and appends a
    timestamped entry to notes.
    """
    row = conn.execute(
        "SELECT id, notes FROM contacts WHERE id = ?", (contact_id,)
    ).fetchone()
    if not row:
        logger.warning("Contact id=%d not found", contact_id)
        return False

    now = datetime.now().isoformat(timespec="seconds")
    existing_notes = row["notes"] or ""
    entry = f"[{now}] ({method}) {note}".strip() if note else f"[{now}] ({method})"
    new_notes = f"{existing_notes}\n{entry}".strip()

    conn.execute(
        "UPDATE contacts SET last_contact = ?, contact_method = ?, notes = ? "
        "WHERE id = ?",
        (now, method, new_notes, contact_id),
    )
    conn.commit()
    logger.info("Logged contact for contact id=%d via %s", contact_id, method)
    return True


def get_stale_contacts(conn, days=14):
    """Get contacts with active/warm status not contacted in `days`+ days."""
    rows = conn.execute(
        "SELECT * FROM contacts "
        "WHERE relationship_status IN ('active', 'warm') "
        "AND last_contact IS NOT NULL "
        "AND julianday('now') - julianday(last_contact) >= ? "
        "ORDER BY last_contact ASC",
        (days,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_followup_due(conn):
    """Get contacts with follow-ups due today or overdue."""
    rows = conn.execute(
        "SELECT * FROM contacts "
        "WHERE next_followup IS NOT NULL "
        "AND date(next_followup) <= date('now') "
        "ORDER BY next_followup ASC",
    ).fetchall()
    return [dict(r) for r in rows]


def add_tag(conn, contact_id, tag):
    """Add a tag to a contact's comma-separated tag list."""
    row = conn.execute(
        "SELECT id, tags FROM contacts WHERE id = ?", (contact_id,)
    ).fetchone()
    if not row:
        return False

    existing = row["tags"] or ""
    tag_list = [t.strip() for t in existing.split(",") if t.strip()]
    if tag not in tag_list:
        tag_list.append(tag)
    new_tags = ",".join(tag_list)

    conn.execute("UPDATE contacts SET tags = ? WHERE id = ?", (new_tags, contact_id))
    conn.commit()
    return True


def remove_tag(conn, contact_id, tag):
    """Remove a tag from a contact's comma-separated tag list."""
    row = conn.execute(
        "SELECT id, tags FROM contacts WHERE id = ?", (contact_id,)
    ).fetchone()
    if not row:
        return False

    existing = row["tags"] or ""
    tag_list = [t.strip() for t in existing.split(",") if t.strip()]
    if tag in tag_list:
        tag_list.remove(tag)
    new_tags = ",".join(tag_list)

    conn.execute("UPDATE contacts SET tags = ? WHERE id = ?", (new_tags, contact_id))
    conn.commit()
    return True


# --- Contact Interactions (from agencies tracker) ---


def add_contact_interaction(conn, contact_id, interaction_type, direction="outbound",
                            subject=None, summary=None, roles_discussed=None,
                            follow_up_date=None):
    """Log a detailed interaction in the contact_interactions table. Returns row id."""
    cursor = conn.execute(
        "INSERT INTO contact_interactions (contact_id, interaction_type, direction, "
        "subject, summary, roles_discussed, follow_up_date) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (contact_id, interaction_type, direction, subject, summary,
         roles_discussed, follow_up_date),
    )
    conn.execute(
        "UPDATE contacts SET last_contact = datetime('now') WHERE id = ?",
        (contact_id,),
    )
    conn.commit()
    return cursor.lastrowid


def get_contact_interactions(conn, contact_id, limit=20):
    """Get interaction history for a contact."""
    rows = conn.execute(
        "SELECT * FROM contact_interactions WHERE contact_id = ? "
        "ORDER BY created_at DESC LIMIT ?",
        (contact_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]


# --- Submitted Roles ---


def add_submitted_role(conn, contact_id, company, role_title, status="submitted",
                       pay_rate=None, location=None, role_type="contract", notes=None):
    """Track a role a recruiter submitted you for. Returns row id."""
    cursor = conn.execute(
        "INSERT INTO submitted_roles (contact_id, company, role_title, status, "
        "pay_rate, location, role_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (contact_id, company, role_title, status, pay_rate, location, role_type, notes),
    )
    conn.commit()
    return cursor.lastrowid


def get_submitted_roles(conn, contact_id=None, status=None):
    """Get submitted roles, optionally filtered by contact or status."""
    query = (
        "SELECT sr.*, c.name AS contact_name, c.company "
        "FROM submitted_roles sr JOIN contacts c ON sr.contact_id = c.id"
    )
    conditions = []
    params = []
    if contact_id:
        conditions.append("sr.contact_id = ?")
        params.append(contact_id)
    if status:
        conditions.append("sr.status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY sr.updated_at DESC"
    return [dict(r) for r in conn.execute(query, params).fetchall()]


def update_role_status(conn, role_id, status, notes=None):
    """Update a submitted role's status."""
    conn.execute(
        "UPDATE submitted_roles SET status = ?, notes = COALESCE(?, notes), "
        "updated_at = datetime('now') WHERE id = ?",
        (status, notes, role_id),
    )
    conn.commit()


def get_contacts_summary(conn):
    """Get summary stats for the contacts system."""
    active_contacts = conn.execute(
        "SELECT COUNT(*) FROM contacts WHERE relationship_status IN ('new', 'active', 'warm')"
    ).fetchone()[0]
    total_roles = conn.execute("SELECT COUNT(*) FROM submitted_roles").fetchone()[0]
    active_roles = conn.execute(
        "SELECT COUNT(*) FROM submitted_roles WHERE status IN ('submitted', 'interviewing')"
    ).fetchone()[0]
    total_interactions = conn.execute(
        "SELECT COUNT(*) FROM contact_interactions"
    ).fetchone()[0]
    companies = conn.execute(
        "SELECT COUNT(DISTINCT company) FROM contacts WHERE company IS NOT NULL"
    ).fetchone()[0]
    return {
        "active_contacts": active_contacts,
        "total_roles_submitted": total_roles,
        "active_roles": active_roles,
        "total_interactions": total_interactions,
        "companies": companies,
    }


def find_contact_by_email(conn, email):
    """Find a contact by email address. Returns dict or None."""
    row = conn.execute(
        "SELECT * FROM contacts WHERE lower(email) = ?", (email.lower(),)
    ).fetchone()
    return dict(row) if row else None


# --- Company Intel CRUD ---


def cache_brief(conn, company, role_title, brief_dict, application_id=None):
    """Cache a company intel brief. Returns the row id."""
    now = datetime.now().isoformat()
    expires = (datetime.now() + timedelta(days=30)).isoformat()
    brief_json = json.dumps(brief_dict, ensure_ascii=False)

    cursor = conn.execute(
        "INSERT INTO company_intel (company, role_title, brief, generated_at, "
        "expires_at, application_id) VALUES (?, ?, ?, ?, ?, ?)",
        (company, role_title, brief_json, now, expires, application_id),
    )
    conn.commit()
    logger.info("Cached intel brief for %s (id=%d)", company, cursor.lastrowid)
    return cursor.lastrowid


def get_cached_brief(conn, company, max_age_days=30):
    """Get a cached brief for a company if it exists and hasn't expired.

    Returns (brief_dict, row_dict) or (None, None).
    """
    row = conn.execute(
        "SELECT * FROM company_intel WHERE lower(company) = lower(?) "
        "AND (expires_at IS NULL OR datetime(expires_at) > datetime('now')) "
        "ORDER BY generated_at DESC LIMIT 1",
        (company,),
    ).fetchone()

    if not row:
        return None, None

    # Additional max_age check
    generated = row["generated_at"]
    if generated:
        try:
            gen_dt = datetime.fromisoformat(generated)
            if datetime.now() - gen_dt > timedelta(days=max_age_days):
                return None, None
        except (ValueError, TypeError):
            pass

    try:
        brief = json.loads(row["brief"])
    except (json.JSONDecodeError, TypeError):
        return None, None

    return brief, dict(row)


def link_brief_to_application(conn, brief_id, application_id):
    """Link an existing brief to an application."""
    conn.execute(
        "UPDATE company_intel SET application_id = ? WHERE id = ?",
        (application_id, brief_id),
    )
    conn.commit()


def get_brief_for_application(conn, application_id):
    """Get the cached brief linked to an application. Returns dict or None."""
    row = conn.execute(
        "SELECT * FROM company_intel WHERE application_id = ? "
        "ORDER BY generated_at DESC LIMIT 1",
        (application_id,),
    ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["brief"])
    except (json.JSONDecodeError, TypeError):
        return None


# --- Skill Demand + Study Plan CRUD ---


def migrate_applications_description(conn):
    """Add description column to applications if it doesn't exist."""
    columns = [
        row[1] for row in conn.execute("PRAGMA table_info(applications)").fetchall()
    ]
    if "description" not in columns:
        conn.execute("ALTER TABLE applications ADD COLUMN description TEXT")
        conn.commit()
        logger.info("Added description column to applications table")


def upsert_skill_demand(conn, skill_name, category=None, requirement_level="mentioned",
                        application_id=None, last_seen_in=None):
    """Insert or update a skill demand entry. Returns the row id."""
    row = conn.execute(
        "SELECT id, times_seen, required_count, preferred_count "
        "FROM skill_demand WHERE skill_name = ?",
        (skill_name,),
    ).fetchone()

    now = datetime.now().isoformat()
    req_inc = 1 if requirement_level == "required" else 0
    pref_inc = 1 if requirement_level == "preferred" else 0

    if row:
        conn.execute(
            "UPDATE skill_demand SET times_seen = times_seen + 1, "
            "required_count = required_count + ?, preferred_count = preferred_count + ?, "
            "category = COALESCE(?, category), last_seen_in = COALESCE(?, last_seen_in), "
            "updated_at = ? WHERE id = ?",
            (req_inc, pref_inc, category, last_seen_in, now, row["id"]),
        )
        conn.commit()
        return row["id"]
    else:
        cursor = conn.execute(
            "INSERT INTO skill_demand (skill_name, category, times_seen, "
            "required_count, preferred_count, last_seen_in, updated_at) "
            "VALUES (?, ?, 1, ?, ?, ?, ?)",
            (skill_name, category, req_inc, pref_inc, last_seen_in, now),
        )
        conn.commit()
        return cursor.lastrowid


def get_skill_demand(conn, min_count=1, match_level=None):
    """Get skill demand entries, filtered and sorted by times_seen DESC."""
    query = "SELECT * FROM skill_demand WHERE times_seen >= ?"
    params = [min_count]
    if match_level:
        query += " AND match_level = ?"
        params.append(match_level)
    query += " ORDER BY times_seen DESC, skill_name"
    rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def get_top_gaps(conn, limit=10):
    """Get top gap skills sorted by demand frequency."""
    rows = conn.execute(
        "SELECT * FROM skill_demand WHERE match_level = 'gap' "
        "ORDER BY times_seen DESC, skill_name LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def update_match_levels(conn):
    """Bulk update match_level on skill_demand by joining against skills table."""
    # Get all current skills with levels
    skill_levels = {}
    for row in conn.execute("SELECT name, current_level FROM skills").fetchall():
        skill_levels[row["name"].lower()] = row["current_level"]

    demands = conn.execute("SELECT id, skill_name FROM skill_demand").fetchall()
    for d in demands:
        level = skill_levels.get(d["skill_name"].lower())
        if level is None:
            match = "gap"
        elif level >= 3:
            match = "strong"
        else:
            match = "partial"
        conn.execute(
            "UPDATE skill_demand SET match_level = ? WHERE id = ?",
            (match, d["id"]),
        )
    conn.commit()


def upsert_study_plan(conn, skill_name, **kwargs):
    """Create or update a study plan entry. Returns the row id."""
    allowed = {
        "priority_rank", "study_hours_logged", "target_hours",
        "resources", "notes", "status", "started_at", "completed_at",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}

    row = conn.execute(
        "SELECT id FROM study_plan WHERE skill_name = ?", (skill_name,)
    ).fetchone()

    now = datetime.now().isoformat()
    if row:
        if fields:
            fields["updated_at"] = now
            set_clause = ", ".join(f"{k} = ?" for k in fields)
            values = list(fields.values()) + [row["id"]]
            conn.execute(f"UPDATE study_plan SET {set_clause} WHERE id = ?", values)
            conn.commit()
        return row["id"]
    else:
        columns = ["skill_name", "updated_at"] + list(fields.keys())
        placeholders = ", ".join("?" for _ in columns)
        col_names = ", ".join(columns)
        values = [skill_name, now] + list(fields.values())
        cursor = conn.execute(
            f"INSERT INTO study_plan ({col_names}) VALUES ({placeholders})", values,
        )
        conn.commit()
        return cursor.lastrowid


def get_study_plan(conn):
    """Get active study plan items ordered by priority."""
    rows = conn.execute(
        "SELECT * FROM study_plan WHERE status != 'completed' "
        "ORDER BY COALESCE(priority_rank, 999), skill_name"
    ).fetchall()
    return [dict(r) for r in rows]


def log_study_time(conn, skill_name, hours, note=""):
    """Log study time for a skill. Returns True if found, False otherwise."""
    row = conn.execute(
        "SELECT id, study_hours_logged, notes, started_at FROM study_plan "
        "WHERE skill_name = ?",
        (skill_name,),
    ).fetchone()
    if not row:
        return False

    now = datetime.now().isoformat(timespec="seconds")
    new_hours = (row["study_hours_logged"] or 0) + hours
    existing_notes = row["notes"] or ""
    if note:
        entry = f"[{now}] +{hours}h: {note}"
        new_notes = f"{existing_notes}\n{entry}".strip()
    else:
        new_notes = existing_notes

    updates = {
        "study_hours_logged": new_hours,
        "notes": new_notes,
        "updated_at": now,
    }
    if not row["started_at"]:
        updates["started_at"] = now
        updates["status"] = "in_progress"

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [row["id"]]
    conn.execute(f"UPDATE study_plan SET {set_clause} WHERE id = ?", values)
    conn.commit()
    return True


def map_skill_to_application(conn, skill_name, application_id, requirement_level="mentioned"):
    """Map a skill to an application (ignore on conflict)."""
    try:
        conn.execute(
            "INSERT OR IGNORE INTO skill_application_map "
            "(skill_name, application_id, requirement_level) VALUES (?, ?, ?)",
            (skill_name, application_id, requirement_level),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        pass


def get_skills_for_application(conn, application_id):
    """Get skills required by a specific application."""
    rows = conn.execute(
        "SELECT sam.skill_name, sam.requirement_level, "
        "sd.times_seen, sd.match_level, sd.category "
        "FROM skill_application_map sam "
        "LEFT JOIN skill_demand sd ON sam.skill_name = sd.skill_name "
        "WHERE sam.application_id = ? ORDER BY sam.requirement_level, sam.skill_name",
        (application_id,),
    ).fetchall()
    return [dict(r) for r in rows]
