"""SQLite schema and CRUD operations for candidate profile data."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime

from src.db.models import get_connection

logger = logging.getLogger(__name__)

PROFILE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS profile_personal (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    street TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    zip TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    github_url TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    work_authorization TEXT NOT NULL DEFAULT ''
        CHECK(work_authorization IN ('', 'us_citizen', 'permanent_resident', 'require_sponsorship')),
    willing_to_relocate BOOLEAN NOT NULL DEFAULT 0,
    remote_preference TEXT NOT NULL DEFAULT ''
        CHECK(remote_preference IN ('', 'remote_only', 'hybrid', 'onsite', 'flexible')),
    desired_salary_min INTEGER,
    desired_salary_max INTEGER,
    available_start_date TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS profile_work_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT,
    description TEXT NOT NULL DEFAULT '',
    is_current BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profile_education (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school TEXT NOT NULL,
    degree TEXT NOT NULL DEFAULT '',
    field_of_study TEXT NOT NULL DEFAULT '',
    graduation_date TEXT NOT NULL DEFAULT '',
    gpa TEXT
);

CREATE TABLE IF NOT EXISTS profile_certifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL DEFAULT '',
    date_obtained TEXT NOT NULL DEFAULT '',
    expiry_date TEXT,
    in_progress BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profile_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    relationship TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS profile_eeo (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    gender TEXT NOT NULL DEFAULT '',
    race_ethnicity TEXT NOT NULL DEFAULT '',
    veteran_status TEXT NOT NULL DEFAULT '',
    disability_status TEXT NOT NULL DEFAULT ''
);
"""


def init_profile_schema(conn: sqlite3.Connection) -> None:
    """Create profile tables if they don't exist."""
    conn.executescript(PROFILE_SCHEMA_SQL)


def get_profile_connection(db_path=None) -> sqlite3.Connection:
    """Get a connection with both base and profile schemas initialized."""
    conn = get_connection(db_path)
    init_profile_schema(conn)
    return conn


# --- Personal CRUD ---


def get_personal(conn: sqlite3.Connection) -> dict | None:
    """Get personal info (singleton row). Returns dict or None."""
    row = conn.execute("SELECT * FROM profile_personal WHERE id = 1").fetchone()
    return dict(row) if row else None


def upsert_personal(conn: sqlite3.Connection, **kwargs) -> None:
    """Insert or update personal info. Only provided fields are updated."""
    kwargs["updated_at"] = datetime.now().isoformat()
    existing = get_personal(conn)
    if existing is None:
        kwargs.setdefault("id", 1)
        cols = ", ".join(kwargs.keys())
        placeholders = ", ".join("?" for _ in kwargs)
        conn.execute(
            f"INSERT INTO profile_personal ({cols}) VALUES ({placeholders})",
            list(kwargs.values()),
        )
    else:
        set_clause = ", ".join(f"{k} = ?" for k in kwargs)
        conn.execute(
            f"UPDATE profile_personal SET {set_clause} WHERE id = 1",
            list(kwargs.values()),
        )
    conn.commit()


# --- Work History CRUD ---


def add_work_history(conn: sqlite3.Connection, company: str, title: str,
                     location: str = "", start_date: str = "",
                     end_date: str | None = None, description: str = "",
                     is_current: bool = False) -> int:
    """Add a work history entry. Returns the new row id."""
    cursor = conn.execute(
        "INSERT INTO profile_work_history "
        "(company, title, location, start_date, end_date, description, is_current) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (company, title, location, start_date, end_date, description, is_current),
    )
    conn.commit()
    return cursor.lastrowid


def get_all_work_history(conn: sqlite3.Connection) -> list[dict]:
    """Get all work history entries, ordered by start_date DESC."""
    rows = conn.execute(
        "SELECT * FROM profile_work_history ORDER BY start_date DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_work_history(conn: sqlite3.Connection, row_id: int) -> dict | None:
    """Get a single work history entry by id."""
    row = conn.execute(
        "SELECT * FROM profile_work_history WHERE id = ?", (row_id,)
    ).fetchone()
    return dict(row) if row else None


def update_work_history(conn: sqlite3.Connection, row_id: int, **kwargs) -> bool:
    """Update a work history entry. Returns True if found."""
    if not kwargs:
        return False
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    cursor = conn.execute(
        f"UPDATE profile_work_history SET {set_clause} WHERE id = ?",
        list(kwargs.values()) + [row_id],
    )
    conn.commit()
    return cursor.rowcount > 0


def delete_work_history(conn: sqlite3.Connection, row_id: int) -> bool:
    """Delete a work history entry. Returns True if found."""
    cursor = conn.execute(
        "DELETE FROM profile_work_history WHERE id = ?", (row_id,)
    )
    conn.commit()
    return cursor.rowcount > 0


# --- Education CRUD ---


def add_education(conn: sqlite3.Connection, school: str, degree: str = "",
                  field_of_study: str = "", graduation_date: str = "",
                  gpa: str | None = None) -> int:
    """Add an education entry. Returns the new row id."""
    cursor = conn.execute(
        "INSERT INTO profile_education "
        "(school, degree, field_of_study, graduation_date, gpa) "
        "VALUES (?, ?, ?, ?, ?)",
        (school, degree, field_of_study, graduation_date, gpa),
    )
    conn.commit()
    return cursor.lastrowid


def get_all_education(conn: sqlite3.Connection) -> list[dict]:
    """Get all education entries."""
    rows = conn.execute(
        "SELECT * FROM profile_education ORDER BY graduation_date DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_education(conn: sqlite3.Connection, row_id: int) -> dict | None:
    """Get a single education entry by id."""
    row = conn.execute(
        "SELECT * FROM profile_education WHERE id = ?", (row_id,)
    ).fetchone()
    return dict(row) if row else None


def update_education(conn: sqlite3.Connection, row_id: int, **kwargs) -> bool:
    """Update an education entry. Returns True if found."""
    if not kwargs:
        return False
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    cursor = conn.execute(
        f"UPDATE profile_education SET {set_clause} WHERE id = ?",
        list(kwargs.values()) + [row_id],
    )
    conn.commit()
    return cursor.rowcount > 0


def delete_education(conn: sqlite3.Connection, row_id: int) -> bool:
    """Delete an education entry. Returns True if found."""
    cursor = conn.execute(
        "DELETE FROM profile_education WHERE id = ?", (row_id,)
    )
    conn.commit()
    return cursor.rowcount > 0


# --- Certifications CRUD ---


def add_certification(conn: sqlite3.Connection, name: str, issuer: str = "",
                      date_obtained: str = "", expiry_date: str | None = None,
                      in_progress: bool = False) -> int:
    """Add a certification entry. Returns the new row id."""
    cursor = conn.execute(
        "INSERT INTO profile_certifications "
        "(name, issuer, date_obtained, expiry_date, in_progress) "
        "VALUES (?, ?, ?, ?, ?)",
        (name, issuer, date_obtained, expiry_date, in_progress),
    )
    conn.commit()
    return cursor.lastrowid


def get_all_certifications(conn: sqlite3.Connection) -> list[dict]:
    """Get all certifications."""
    rows = conn.execute(
        "SELECT * FROM profile_certifications ORDER BY date_obtained DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_certification(conn: sqlite3.Connection, row_id: int) -> dict | None:
    """Get a single certification by id."""
    row = conn.execute(
        "SELECT * FROM profile_certifications WHERE id = ?", (row_id,)
    ).fetchone()
    return dict(row) if row else None


def update_certification(conn: sqlite3.Connection, row_id: int, **kwargs) -> bool:
    """Update a certification. Returns True if found."""
    if not kwargs:
        return False
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    cursor = conn.execute(
        f"UPDATE profile_certifications SET {set_clause} WHERE id = ?",
        list(kwargs.values()) + [row_id],
    )
    conn.commit()
    return cursor.rowcount > 0


def delete_certification(conn: sqlite3.Connection, row_id: int) -> bool:
    """Delete a certification. Returns True if found."""
    cursor = conn.execute(
        "DELETE FROM profile_certifications WHERE id = ?", (row_id,)
    )
    conn.commit()
    return cursor.rowcount > 0


# --- References CRUD ---


def add_reference(conn: sqlite3.Connection, name: str, title: str = "",
                  company: str = "", phone: str = "", email: str = "",
                  relationship: str = "") -> int:
    """Add a reference entry. Returns the new row id."""
    cursor = conn.execute(
        "INSERT INTO profile_references "
        "(name, title, company, phone, email, relationship) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (name, title, company, phone, email, relationship),
    )
    conn.commit()
    return cursor.lastrowid


def get_all_references(conn: sqlite3.Connection) -> list[dict]:
    """Get all references."""
    rows = conn.execute(
        "SELECT * FROM profile_references ORDER BY name"
    ).fetchall()
    return [dict(r) for r in rows]


def get_reference(conn: sqlite3.Connection, row_id: int) -> dict | None:
    """Get a single reference by id."""
    row = conn.execute(
        "SELECT * FROM profile_references WHERE id = ?", (row_id,)
    ).fetchone()
    return dict(row) if row else None


def update_reference(conn: sqlite3.Connection, row_id: int, **kwargs) -> bool:
    """Update a reference. Returns True if found."""
    if not kwargs:
        return False
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    cursor = conn.execute(
        f"UPDATE profile_references SET {set_clause} WHERE id = ?",
        list(kwargs.values()) + [row_id],
    )
    conn.commit()
    return cursor.rowcount > 0


def delete_reference(conn: sqlite3.Connection, row_id: int) -> bool:
    """Delete a reference. Returns True if found."""
    cursor = conn.execute(
        "DELETE FROM profile_references WHERE id = ?", (row_id,)
    )
    conn.commit()
    return cursor.rowcount > 0


# --- EEO CRUD ---


def get_eeo(conn: sqlite3.Connection) -> dict | None:
    """Get EEO data (singleton row). Returns dict or None."""
    row = conn.execute("SELECT * FROM profile_eeo WHERE id = 1").fetchone()
    return dict(row) if row else None


def upsert_eeo(conn: sqlite3.Connection, **kwargs) -> None:
    """Insert or update EEO data. Only provided fields are updated."""
    existing = get_eeo(conn)
    if existing is None:
        kwargs.setdefault("id", 1)
        cols = ", ".join(kwargs.keys())
        placeholders = ", ".join("?" for _ in kwargs)
        conn.execute(
            f"INSERT INTO profile_eeo ({cols}) VALUES ({placeholders})",
            list(kwargs.values()),
        )
    else:
        set_clause = ", ".join(f"{k} = ?" for k in kwargs)
        conn.execute(
            f"UPDATE profile_eeo SET {set_clause} WHERE id = 1",
            list(kwargs.values()),
        )
    conn.commit()
