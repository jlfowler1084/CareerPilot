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
    contact_uuid TEXT NOT NULL,
    interaction_type TEXT NOT NULL,
    direction TEXT DEFAULT 'outbound',
    subject TEXT,
    summary TEXT,
    roles_discussed TEXT,
    follow_up_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_interactions_uuid
    ON contact_interactions(contact_uuid);

CREATE TABLE IF NOT EXISTS submitted_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_uuid TEXT NOT NULL,
    company TEXT NOT NULL,
    role_title TEXT NOT NULL,
    status TEXT DEFAULT 'submitted',
    submitted_date TEXT DEFAULT (date('now')),
    notes TEXT,
    pay_rate TEXT,
    location TEXT,
    role_type TEXT DEFAULT 'contract',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submitted_roles_uuid
    ON submitted_roles(contact_uuid);

CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ats_portals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    ats_type TEXT NOT NULL,
    portal_url TEXT NOT NULL,
    email_used TEXT NOT NULL DEFAULT 'jlfowler1084@gmail.com',
    username TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1 CHECK(active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    full_text TEXT NOT NULL,
    segments_json TEXT NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en',
    audio_path TEXT,
    raw_metadata TEXT NOT NULL DEFAULT '{}',
    application_id INTEGER REFERENCES applications(id),
    analyzed_at TEXT,
    analysis_json TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    kind TEXT NOT NULL DEFAULT 'interview' CHECK(kind IN (
        'recruiter_intro','recruiter_prep','phone_screen','technical',
        'panel','debrief','mock','interview'
    ))
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

CREATE TABLE IF NOT EXISTS llm_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task TEXT NOT NULL,
    provider_used TEXT NOT NULL CHECK(provider_used IN ('local', 'claude')),
    model TEXT NOT NULL,
    prompt TEXT,
    prompt_sha256 TEXT,
    response TEXT,
    response_sha256 TEXT,
    schema_invalid INTEGER NOT NULL DEFAULT 0 CHECK(schema_invalid IN (0, 1)),
    pii_bearing INTEGER NOT NULL DEFAULT 0 CHECK(pii_bearing IN (0, 1)),
    fallback_reason TEXT,
    reviewed_at TEXT,
    review_verdict TEXT,
    latency_ms INTEGER,
    tokens_in INTEGER,
    tokens_out INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_budget_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    last_reset_at TEXT NOT NULL DEFAULT (datetime('now')),
    fallback_count_since_reset INTEGER NOT NULL DEFAULT 0
);
"""


def _column_exists(conn, table, column):
    """Check if a column exists in a table."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def _migrate_applications(conn):
    """Add new columns to applications table if they don't exist."""
    migrations = [
        ("portal_id", "INTEGER REFERENCES ats_portals(id)"),
        ("external_status", "TEXT"),
        ("external_status_updated", "TEXT"),
        ("withdraw_date", "TEXT"),
        ("message_id", "TEXT DEFAULT ''"),
    ]
    for col_name, col_def in migrations:
        if not _column_exists(conn, "applications", col_name):
            try:
                conn.execute(f"ALTER TABLE applications ADD COLUMN {col_name} {col_def}")
                logger.debug("Migrated applications: added column '%s'", col_name)
            except sqlite3.OperationalError:
                logger.warning("Failed to add column '%s' to applications", col_name)
    conn.commit()


def _migrate_llm_calls(conn):
    """Add tokens_in/tokens_out columns to llm_calls if they don't exist."""
    for col_name in ("tokens_in", "tokens_out"):
        if not _column_exists(conn, "llm_calls", col_name):
            try:
                conn.execute(f"ALTER TABLE llm_calls ADD COLUMN {col_name} INTEGER")
                logger.debug("Migrated llm_calls: added column '%s'", col_name)
            except sqlite3.OperationalError:
                logger.warning("Failed to add column '%s' to llm_calls", col_name)
    conn.commit()


def _migrate_transcripts_kind(conn):
    """Add kind column to transcripts if it doesn't exist (for pre-CAR-145 DBs)."""
    if not _column_exists(conn, "transcripts", "kind"):
        try:
            conn.execute(
                "ALTER TABLE transcripts ADD COLUMN kind TEXT NOT NULL DEFAULT 'interview'"
            )
            logger.debug("Migrated transcripts: added column 'kind'")
        except sqlite3.OperationalError:
            logger.warning("Failed to add column 'kind' to transcripts")
    conn.commit()


def _migrate_contact_uuid_schema(conn):
    """Rebuild contact_interactions + submitted_roles with contact_uuid TEXT.

    CAR-171: these tables previously used contact_id INTEGER FK to the local
    SQLite contacts table. After the Supabase port, the canonical FK is a
    Supabase UUID string (contact_uuid TEXT). Tables are rebuilt if the old
    column name is still present. Safe on empty tables; the live DB had 0 rows
    at migration time (verified 2026-04-21 before shipping CAR-171).
    """
    for table, old_col in (
        ("contact_interactions", "contact_id"),
        ("submitted_roles", "contact_id"),
    ):
        cols = [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if old_col not in cols:
            continue  # already migrated or freshly created with new schema
        logger.info("Migrating %s: replacing %s with contact_uuid", table, old_col)
        conn.executescript(f"""
            ALTER TABLE {table} RENAME TO {table}_old_car171;
        """)
        conn.commit()
    # Re-apply SCHEMA_SQL will create the tables with the new schema; they were
    # renamed above so IF NOT EXISTS is satisfied. The old tables are left as
    # *_old_car171 for manual inspection; CAR-172 finalize drops them.
    conn.executescript(f"""
        CREATE TABLE IF NOT EXISTS contact_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_uuid TEXT NOT NULL,
            interaction_type TEXT NOT NULL,
            direction TEXT DEFAULT 'outbound',
            subject TEXT,
            summary TEXT,
            roles_discussed TEXT,
            follow_up_date TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_contact_interactions_uuid
            ON contact_interactions(contact_uuid);
        CREATE TABLE IF NOT EXISTS submitted_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_uuid TEXT NOT NULL,
            company TEXT NOT NULL,
            role_title TEXT NOT NULL,
            status TEXT DEFAULT 'submitted',
            submitted_date TEXT DEFAULT (date('now')),
            notes TEXT,
            pay_rate TEXT,
            location TEXT,
            role_type TEXT DEFAULT 'contract',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_submitted_roles_uuid
            ON submitted_roles(contact_uuid);
    """)
    conn.commit()


def _backfill_interview_analyses(conn):
    """Copy all interview_analyses rows into transcripts, then drop the legacy table.

    Idempotent: if interview_analyses no longer exists, this is a no-op.
    Backfill policy (per CAR-145 plan):
      - application_id = NULL
      - kind = 'interview'
      - source = 'legacy_interview_analyses'
      - segments_json = '[]'
      - full_text = file contents if transcript_file is readable, else ''
      - analysis_json preserved verbatim
      - analyzed_at preserved verbatim
    """
    table_exists = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='interview_analyses'"
    ).fetchone()[0]

    if not table_exists:
        return

    rows = conn.execute(
        "SELECT transcript_file, analysis_json, analyzed_at FROM interview_analyses"
    ).fetchall()

    for row in rows:
        transcript_file, analysis_json, analyzed_at = row[0], row[1], row[2]
        try:
            full_text = Path(transcript_file).read_text(encoding="utf-8")
        except (OSError, IOError):
            full_text = ""

        conn.execute(
            "INSERT INTO transcripts "
            "(source, full_text, segments_json, duration_seconds, language, "
            " raw_metadata, application_id, analyzed_at, analysis_json, kind) "
            "VALUES ('legacy_interview_analyses', ?, '[]', 0, 'en', '{}', NULL, ?, ?, 'interview')",
            (full_text, analyzed_at, analysis_json),
        )
        logger.debug("Backfilled legacy row analyzed_at=%s into transcripts", analyzed_at)

    conn.execute("DROP TABLE interview_analyses")
    conn.commit()
    logger.info("Backfilled %d interview_analyses rows into transcripts; legacy table dropped", len(rows))


def get_connection(db_path: Path = None) -> sqlite3.Connection:
    """Get a SQLite connection, creating the database and schema if needed."""
    db_path = db_path or settings.DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Must run before SCHEMA_SQL: SCHEMA_SQL creates an index on contact_uuid;
    # if the old table still has contact_id that index creation fails.
    _migrate_contact_uuid_schema(conn)
    conn.executescript(SCHEMA_SQL)

    # --- Migrations ---
    _migrate_applications(conn)
    _migrate_llm_calls(conn)
    _migrate_transcripts_kind(conn)
    _backfill_interview_analyses(conn)
    migrate_recruiters_to_contacts(conn)
    migrate_applications_description(conn)

    # Re-issue after executescript may have reset it
    conn.execute("PRAGMA foreign_keys = ON")

    # Seed llm_budget_resets with one row on first init (CAR-142)
    if conn.execute("SELECT COUNT(*) FROM llm_budget_resets").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO llm_budget_resets (last_reset_at, fallback_count_since_reset) "
            "VALUES (datetime('now'), 0)"
        )
        conn.commit()

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


# --- ATS Portal CRUD ---


VALID_ATS_TYPES = {"Workday", "Greenhouse", "Lever", "iCIMS", "Taleo", "Custom"}


def add_portal(conn, company, ats_type, portal_url, email_used="jlfowler1084@gmail.com",
               username=None, notes=None):
    """Insert a new ATS portal. Returns the row id."""
    cursor = conn.execute(
        "INSERT INTO ats_portals (company, ats_type, portal_url, email_used, username, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (company, ats_type, portal_url, email_used, username, notes),
    )
    conn.commit()
    logger.debug("Added portal: %s (%s)", company, ats_type)
    return cursor.lastrowid


def list_portals(conn, active_only=True):
    """Get all portals. If active_only, exclude deactivated."""
    sql = "SELECT * FROM ats_portals"
    if active_only:
        sql += " WHERE active = 1"
    sql += " ORDER BY company"
    rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


def update_portal(conn, portal_id, **kwargs):
    """Update portal fields. Returns True if found."""
    if not kwargs:
        return False
    row = conn.execute("SELECT id FROM ats_portals WHERE id = ?", (portal_id,)).fetchone()
    if not row:
        return False
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    conn.execute(
        f"UPDATE ats_portals SET {sets} WHERE id = ?",
        (*kwargs.values(), portal_id),
    )
    conn.commit()
    return True


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
                    "INSERT INTO contact_interactions (contact_uuid, interaction_type, "
                    "direction, subject, summary, roles_discussed, follow_up_date, "
                    "created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        str(new_contact_id), i["interaction_type"], i.get("direction", "outbound"),
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
                    "INSERT INTO submitted_roles (contact_uuid, company, role_title, "
                    "status, submitted_date, notes, pay_rate, location, role_type, "
                    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        str(new_contact_id), role["company"], role["role_title"],
                        role.get("status", "submitted"), role.get("submitted_date"),
                        role.get("notes"), role.get("pay_rate"), role.get("location"),
                        role.get("role_type", "contract"), role.get("created_at"),
                        role.get("updated_at"),
                    ),
                )


def deactivate_portal(conn, portal_id):
    """Set a portal as inactive. Returns True if found."""
    return update_portal(conn, portal_id, active=0)


def get_stale_portals(conn, days=7):
    """Get active portals not checked in `days` with pending applications.

    Pending = application status NOT IN ('withdrawn', 'rejected', 'ghosted').
    """
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    rows = conn.execute(
        "SELECT p.*, COUNT(a.id) AS pending_app_count "
        "FROM ats_portals p "
        "JOIN applications a ON a.portal_id = p.id "
        "WHERE p.active = 1 "
        "  AND a.status NOT IN ('withdrawn', 'rejected', 'ghosted') "
        "  AND (p.last_checked IS NULL OR p.last_checked < ?) "
        "GROUP BY p.id "
        "ORDER BY p.last_checked ASC",
        (cutoff,),
    ).fetchall()
    return [dict(r) for r in rows]


# --- Contact Interactions (from agencies tracker) ---


def add_contact_interaction(conn, contact_uuid, interaction_type, direction="outbound",
                            subject=None, summary=None, roles_discussed=None,
                            follow_up_date=None):
    """Log a detailed interaction in the contact_interactions table. Returns row id."""
    cursor = conn.execute(
        "INSERT INTO contact_interactions (contact_uuid, interaction_type, direction, "
        "subject, summary, roles_discussed, follow_up_date) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (str(contact_uuid), interaction_type, direction, subject, summary,
         roles_discussed, follow_up_date),
    )
    conn.commit()
    return cursor.lastrowid


def get_contact_interactions(conn, contact_uuid, limit=20):
    """Get interaction history for a contact."""
    rows = conn.execute(
        "SELECT * FROM contact_interactions WHERE contact_uuid = ? "
        "ORDER BY created_at DESC LIMIT ?",
        (str(contact_uuid), limit),
    ).fetchall()
    return [dict(r) for r in rows]


# --- Submitted Roles ---


def add_submitted_role(conn, contact_uuid, company, role_title, status="submitted",
                       pay_rate=None, location=None, role_type="contract", notes=None):
    """Track a role a recruiter submitted you for. Returns row id."""
    cursor = conn.execute(
        "INSERT INTO submitted_roles (contact_uuid, company, role_title, status, "
        "pay_rate, location, role_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (str(contact_uuid), company, role_title, status, pay_rate, location, role_type, notes),
    )
    conn.commit()
    return cursor.lastrowid


def get_submitted_roles(conn, contact_uuid=None, status=None):
    """Get submitted roles, optionally filtered by contact or status."""
    query = "SELECT sr.* FROM submitted_roles sr"
    conditions = []
    params = []
    if contact_uuid:
        conditions.append("sr.contact_uuid = ?")
        params.append(str(contact_uuid))
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
