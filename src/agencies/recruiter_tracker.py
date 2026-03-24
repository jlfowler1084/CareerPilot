"""
CareerPilot — Recruiter Relationship Tracker

SQLite-backed tracker for managing recruiter contacts, interactions,
and submitted roles across staffing agencies.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from config.settings import DATA_DIR


DEFAULT_DB_PATH = str(DATA_DIR / "recruiter_tracker.db")


class RecruiterTracker:
    """Manages recruiter contacts and interaction history."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS recruiters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                phone TEXT,
                agency TEXT NOT NULL,
                title TEXT,
                specialties TEXT,
                notes TEXT,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recruiter_id INTEGER NOT NULL,
                interaction_type TEXT NOT NULL,
                direction TEXT DEFAULT 'inbound',
                subject TEXT,
                summary TEXT,
                roles_discussed TEXT,
                follow_up_date TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (recruiter_id) REFERENCES recruiters(id)
            );

            CREATE TABLE IF NOT EXISTS submitted_roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recruiter_id INTEGER NOT NULL,
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
                FOREIGN KEY (recruiter_id) REFERENCES recruiters(id)
            );

            CREATE INDEX IF NOT EXISTS idx_recruiters_agency ON recruiters(agency);
            CREATE INDEX IF NOT EXISTS idx_interactions_recruiter ON interactions(recruiter_id);
            CREATE INDEX IF NOT EXISTS idx_submitted_roles_recruiter ON submitted_roles(recruiter_id);
            CREATE INDEX IF NOT EXISTS idx_submitted_roles_status ON submitted_roles(status);
        """)
        self.conn.commit()

    # ── Recruiter CRUD ───────────────────────────────────────────────

    def add_recruiter(
        self,
        name: str,
        agency: str,
        email: str | None = None,
        phone: str | None = None,
        title: str | None = None,
        specialties: str | None = None,
        notes: str | None = None,
    ) -> int:
        """Add a recruiter contact. Returns the recruiter ID."""
        cur = self.conn.execute(
            """INSERT INTO recruiters (name, agency, email, phone, title, specialties, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (name, agency, email, phone, title, specialties, notes),
        )
        self.conn.commit()
        return cur.lastrowid

    def get_recruiter(self, recruiter_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM recruiters WHERE id = ?", (recruiter_id,)).fetchone()
        return dict(row) if row else None

    def find_recruiter_by_email(self, email: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM recruiters WHERE email = ?", (email.lower(),)).fetchone()
        return dict(row) if row else None

    def list_recruiters(self, agency: str | None = None, status: str = "active") -> list[dict]:
        if agency:
            rows = self.conn.execute(
                "SELECT * FROM recruiters WHERE agency = ? AND status = ? ORDER BY updated_at DESC",
                (agency, status),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM recruiters WHERE status = ? ORDER BY updated_at DESC", (status,)
            ).fetchall()
        return [dict(r) for r in rows]

    def update_recruiter(self, recruiter_id: int, **kwargs):
        """Update recruiter fields. Pass any column name as keyword arg."""
        allowed = {"name", "email", "phone", "agency", "title", "specialties", "notes", "status"}
        fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
        if not fields:
            return
        fields["updated_at"] = datetime.now().isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [recruiter_id]
        self.conn.execute(f"UPDATE recruiters SET {set_clause} WHERE id = ?", values)
        self.conn.commit()

    # ── Interactions ─────────────────────────────────────────────────

    def log_interaction(
        self,
        recruiter_id: int,
        interaction_type: str,
        direction: str = "inbound",
        subject: str | None = None,
        summary: str | None = None,
        roles_discussed: str | None = None,
        follow_up_date: str | None = None,
    ) -> int:
        """Log an interaction with a recruiter. Types: email, call, meeting, text."""
        cur = self.conn.execute(
            """INSERT INTO interactions
               (recruiter_id, interaction_type, direction, subject, summary, roles_discussed, follow_up_date)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (recruiter_id, interaction_type, direction, subject, summary, roles_discussed, follow_up_date),
        )
        # Update recruiter's updated_at
        self.conn.execute(
            "UPDATE recruiters SET updated_at = datetime('now') WHERE id = ?", (recruiter_id,)
        )
        self.conn.commit()
        return cur.lastrowid

    def get_interactions(self, recruiter_id: int, limit: int = 20) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM interactions WHERE recruiter_id = ? ORDER BY created_at DESC LIMIT ?",
            (recruiter_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Submitted Roles ──────────────────────────────────────────────

    def add_submitted_role(
        self,
        recruiter_id: int,
        company: str,
        role_title: str,
        status: str = "submitted",
        pay_rate: str | None = None,
        location: str | None = None,
        role_type: str = "contract",
        notes: str | None = None,
    ) -> int:
        """Track a role the recruiter submitted you for."""
        cur = self.conn.execute(
            """INSERT INTO submitted_roles
               (recruiter_id, company, role_title, status, pay_rate, location, role_type, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (recruiter_id, company, role_title, status, pay_rate, location, role_type, notes),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_role_status(self, role_id: int, status: str, notes: str | None = None):
        """Update status: submitted, interviewing, offered, rejected, withdrawn."""
        self.conn.execute(
            "UPDATE submitted_roles SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?",
            (status, notes, role_id),
        )
        self.conn.commit()

    def get_submitted_roles(self, recruiter_id: int | None = None, status: str | None = None) -> list[dict]:
        query = "SELECT sr.*, r.name as recruiter_name, r.agency FROM submitted_roles sr JOIN recruiters r ON sr.recruiter_id = r.id"
        conditions = []
        params = []
        if recruiter_id:
            conditions.append("sr.recruiter_id = ?")
            params.append(recruiter_id)
        if status:
            conditions.append("sr.status = ?")
            params.append(status)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY sr.updated_at DESC"
        return [dict(r) for r in self.conn.execute(query, params).fetchall()]

    # ── Summary / Stats ──────────────────────────────────────────────

    def get_summary(self) -> dict:
        """Get a summary of recruiter relationships."""
        recruiters = self.conn.execute("SELECT COUNT(*) FROM recruiters WHERE status = 'active'").fetchone()[0]
        roles = self.conn.execute("SELECT COUNT(*) FROM submitted_roles").fetchone()[0]
        active_roles = self.conn.execute("SELECT COUNT(*) FROM submitted_roles WHERE status IN ('submitted', 'interviewing')").fetchone()[0]
        interactions = self.conn.execute("SELECT COUNT(*) FROM interactions").fetchone()[0]
        agencies = self.conn.execute("SELECT COUNT(DISTINCT agency) FROM recruiters WHERE status = 'active'").fetchone()[0]
        return {
            "active_recruiters": recruiters,
            "total_roles_submitted": roles,
            "active_roles": active_roles,
            "total_interactions": interactions,
            "agencies": agencies,
        }

    def close(self):
        self.conn.close()
