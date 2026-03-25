"""SQLite schema and CRUD operations for CareerPilot."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
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

CREATE TABLE IF NOT EXISTS recruiters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    agency TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    specialization TEXT,
    last_contact TEXT,
    contact_method TEXT,
    relationship_status TEXT DEFAULT 'new',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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


# --- Recruiters CRUD ---


def add_recruiter(conn, name, agency, email=None, phone=None,
                  linkedin_url=None, specialization=None, notes=None):
    """Insert a new recruiter. Returns the row id."""
    cursor = conn.execute(
        "INSERT INTO recruiters (name, agency, email, phone, linkedin_url, "
        "specialization, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (name, agency, email, phone, linkedin_url, specialization, notes),
    )
    conn.commit()
    logger.debug("Added recruiter: %s (%s)", name, agency)
    return cursor.lastrowid


def get_recruiter(conn, recruiter_id):
    """Get a single recruiter by id. Returns dict or None."""
    row = conn.execute(
        "SELECT * FROM recruiters WHERE id = ?", (recruiter_id,)
    ).fetchone()
    return dict(row) if row else None


def list_recruiters(conn):
    """Get all recruiters, sorted by agency then name."""
    rows = conn.execute(
        "SELECT * FROM recruiters ORDER BY agency, name"
    ).fetchall()
    return [dict(r) for r in rows]


def update_recruiter(conn, recruiter_id, **kwargs):
    """Update recruiter fields. Returns True if found, False otherwise."""
    allowed = {
        "name", "agency", "email", "phone", "linkedin_url",
        "specialization", "last_contact", "contact_method",
        "relationship_status", "notes",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return False

    row = conn.execute(
        "SELECT id FROM recruiters WHERE id = ?", (recruiter_id,)
    ).fetchone()
    if not row:
        logger.warning("Recruiter id=%d not found", recruiter_id)
        return False

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [recruiter_id]
    conn.execute(
        f"UPDATE recruiters SET {set_clause} WHERE id = ?", values,
    )
    conn.commit()
    logger.info("Updated recruiter id=%d: %s", recruiter_id, list(fields.keys()))
    return True


def get_stale_recruiters(conn, days=14):
    """Get recruiters with active/warm status not contacted in `days`+ days."""
    rows = conn.execute(
        "SELECT * FROM recruiters "
        "WHERE relationship_status IN ('active', 'warm') "
        "AND last_contact IS NOT NULL "
        "AND julianday('now') - julianday(last_contact) >= ? "
        "ORDER BY last_contact ASC",
        (days,),
    ).fetchall()
    return [dict(r) for r in rows]


def log_recruiter_contact(conn, recruiter_id, method, note=""):
    """Log a contact with a recruiter.

    Updates last_contact to now, sets contact_method, and appends a
    timestamped entry to notes.
    """
    row = conn.execute(
        "SELECT id, notes FROM recruiters WHERE id = ?", (recruiter_id,)
    ).fetchone()
    if not row:
        logger.warning("Recruiter id=%d not found", recruiter_id)
        return False

    now = datetime.now().isoformat(timespec="seconds")
    existing_notes = row["notes"] or ""
    entry = f"[{now}] ({method}) {note}".strip() if note else f"[{now}] ({method})"
    new_notes = f"{existing_notes}\n{entry}".strip()

    conn.execute(
        "UPDATE recruiters SET last_contact = ?, contact_method = ?, notes = ? "
        "WHERE id = ?",
        (now, method, new_notes, recruiter_id),
    )
    conn.commit()
    logger.info("Logged contact for recruiter id=%d via %s", recruiter_id, method)
    return True
