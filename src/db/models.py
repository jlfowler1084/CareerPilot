"""SQLite schema and CRUD operations for CareerPilot."""

from __future__ import annotations

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
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    ]
    for col_name, col_def in migrations:
        if not _column_exists(conn, "applications", col_name):
            try:
                conn.execute(f"ALTER TABLE applications ADD COLUMN {col_name} {col_def}")
                logger.debug("Migrated applications: added column '%s'", col_name)
            except sqlite3.OperationalError:
                logger.warning("Failed to add column '%s' to applications", col_name)
    conn.commit()


def get_connection(db_path: Path = None) -> sqlite3.Connection:
    """Get a SQLite connection, creating the database and schema if needed."""
    db_path = db_path or settings.DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_SQL)

    # --- Migrations ---
    _migrate_applications(conn)

    # Re-issue after executescript may have reset it
    conn.execute("PRAGMA foreign_keys = ON")

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
