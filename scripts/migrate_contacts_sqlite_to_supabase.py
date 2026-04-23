"""One-time SQLite → Supabase contacts migration (CAR-172 / M5b).

Moves all rows from the local `contacts` table at `data/careerpilot.db`
into Supabase under `CAREERPILOT_USER_ID`. After CAR-171 (M5a), the CLI
writes to Supabase directly via ContactManager, so existing SQLite rows are
orphaned — this script closes that gap.

## Usage

Typical flow (three invocations):

    # 1. Dry run — reads SQLite, probes Supabase for email matches, writes nothing
    python scripts/migrate_contacts_sqlite_to_supabase.py --dry-run

    # 2. Real run — inserts missing rows into Supabase
    python scripts/migrate_contacts_sqlite_to_supabase.py

    # 3. Finalize — rename the SQLite contacts table to
    #    contacts_deprecated_YYYY_MM_DD so it's preserved for restore
    #    but no longer shows up as the live table.
    python scripts/migrate_contacts_sqlite_to_supabase.py --finalize --yes

## Idempotency

Rows with a non-empty `email` are deduped against Supabase via
`ContactManager.find_by_email` (scoped by `CAREERPILOT_USER_ID`). If a
row with the same email already exists (e.g., a CAR-117 pre-migration row),
the migration skips it. Rows without email are always inserted.

## Field mapping

- `last_contact` TEXT → `last_contact_date` TIMESTAMPTZ (ISO passthrough)
- `tags` TEXT (comma-separated) → `tags` TEXT[] (list)
- `next_followup` TEXT (any format) → `next_followup` DATE (parsed tolerantly)
- `source` kept; rows without source get `source='sqlite_migration'`

## Finalize note

The finalize step also rebuilds `contact_interactions` and `submitted_roles`
with their post-CAR-171 schema (`contact_uuid TEXT NOT NULL`) if those tables
still carry the legacy `contact_id INTEGER` column. This is safe only when
those tables have zero rows — confirmed in Phase 1 audit (2026-04-21).
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Prefer CWD when it is the project root (contains config/settings.py), so the
# script can be invoked from the main repo even when __file__ lives in a
# git worktree that doesn't have its own .env copy.
_CWD = Path.cwd()
_FILE_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _CWD if (_CWD / "config" / "settings.py").exists() else _FILE_ROOT
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from config import settings  # noqa: E402

logger = logging.getLogger(__name__)


@dataclass
class MigrationResult:
    rows_read: int = 0
    rows_inserted: int = 0
    rows_skipped_existing: int = 0
    errors: List[str] = field(default_factory=list)
    id_map: Dict[int, str] = field(default_factory=dict)  # sqlite_id → supabase_uuid


def read_sqlite_contacts(db_path: Path) -> List[Dict[str, Any]]:
    """Read all rows from the SQLite `contacts` table as a list of dicts."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM contacts").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _parse_tags(raw: Any) -> List[str]:
    """Convert comma-separated SQLite tags text to a list. Empty input → []."""
    if not raw:
        return []
    parts = [t.strip() for t in str(raw).split(",")]
    return [t for t in parts if t]


def _parse_date(raw: Any) -> Optional[str]:
    """Parse a date string to YYYY-MM-DD. Returns None if unparseable or empty."""
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def map_sqlite_contact_to_supabase(row: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """Translate SQLite column names and types to the Supabase insert payload shape."""
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "name": row.get("name") or "",
        "contact_type": row.get("contact_type") or "recruiter",
        "relationship_status": row.get("relationship_status") or "new",
        "source": row.get("source") or "sqlite_migration",
        "tags": _parse_tags(row.get("tags")),
    }

    # Optional string fields — include only when non-empty
    for col in ("company", "title", "email", "phone", "linkedin_url",
                "specialization", "contact_method", "notes"):
        val = row.get(col)
        if val:
            payload[col] = val

    # last_contact TEXT → last_contact_date TIMESTAMPTZ (omit if null)
    if row.get("last_contact"):
        payload["last_contact_date"] = row["last_contact"]

    # next_followup TEXT → DATE (parse tolerantly; omit if unparseable)
    nf = _parse_date(row.get("next_followup"))
    if nf:
        payload["next_followup"] = nf

    # created_at passthrough (Supabase accepts ISO string)
    if row.get("created_at"):
        payload["created_at"] = row["created_at"]

    return payload


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def migrate_contacts(
    db_path: Path,
    manager: Any,  # ContactManager — typed Any to avoid forcing import at collect time
    client: Any,
    *,
    dry_run: bool = False,
) -> MigrationResult:
    """Copy SQLite contacts into Supabase.

    Args:
        db_path: Path to the local SQLite DB.
        manager: Configured `ContactManager` (for `find_by_email` dedup).
        client: Supabase client (for direct `.table().insert()`).
        dry_run: If True, report what would happen without inserting.

    Returns:
        `MigrationResult` with counts, errors, and sqlite_id→uuid id_map.
    """
    result = MigrationResult()
    rows = read_sqlite_contacts(db_path)
    result.rows_read = len(rows)

    for row in rows:
        email = (row.get("email") or "").strip()
        sqlite_id = row.get("id")
        try:
            if email:
                existing = manager.find_by_email(email)
                if existing:
                    result.rows_skipped_existing += 1
                    logger.info(
                        "SKIP (email exists): sqlite_id=%s name=%r email=%s",
                        sqlite_id, row.get("name"), email,
                    )
                    continue

            payload = map_sqlite_contact_to_supabase(row, manager._user_id)
            if dry_run:
                logger.info(
                    "INSERT [dry-run]: sqlite_id=%s name=%r company=%r",
                    sqlite_id, row.get("name"), row.get("company"),
                )
                result.rows_inserted += 1
            else:
                response = client.table("contacts").insert(payload).execute()
                if response.data:
                    new_id = response.data[0].get("id")
                    logger.info(
                        "INSERT: sqlite_id=%s → supabase_id=%s name=%r",
                        sqlite_id, new_id, row.get("name"),
                    )
                    result.rows_inserted += 1
                    if sqlite_id is None:
                        logger.warning(
                            "Row inserted but had no sqlite id — FK rewrite will "
                            "skip it: %r",
                            row.get("name"),
                        )
                    else:
                        result.id_map[sqlite_id] = new_id
                else:
                    result.errors.append(
                        f"Insert returned no data for sqlite_id={sqlite_id}"
                    )
        except Exception as e:  # noqa: BLE001 — surface every row's error
            msg = f"Row sqlite_id={sqlite_id}: {e}"
            result.errors.append(msg)
            logger.error("FAILED: %s", msg)

    return result


def _assert_rewrite_can_proceed(conn: sqlite3.Connection, table: str) -> bool:
    """Return True if the FK rewrite may proceed on ``table``.

    Returns False (caller should skip) when the ``contact_uuid`` destination
    column is absent and the table holds no legacy rows. Raises RuntimeError
    when the destination column is absent but legacy ``contact_id`` rows
    exist — that state would silently lose data the next time
    :func:`finalize_sqlite_table` DROPs the table (CAR-177 / CAR-178).
    """
    if _column_exists(conn, table, "contact_uuid"):
        return True

    if _column_exists(conn, table, "contact_id"):
        row_count = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE contact_id IS NOT NULL"
        ).fetchone()[0]
        if row_count > 0:
            raise RuntimeError(
                f"{table}: {row_count} row(s) have contact_id but no "
                "contact_uuid destination column. Add contact_uuid before "
                "running the FK rewrite, or these rows will be lost when "
                "finalize_sqlite_table DROPs this table."
            )

    logger.info("%s: no contact_uuid column — FK rewrite skipped", table)
    return False


def rewrite_interaction_fks(db_path: Path, id_map: Dict[int, str]) -> int:
    """Populate contact_interactions.contact_uuid from id_map.

    Walks rows where contact_uuid IS NULL and maps them via the captured
    sqlite_id → supabase_uuid dict. No-op when the column doesn't exist
    (legacy schema) or the table is empty. Returns count rewritten.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        if not _assert_rewrite_can_proceed(conn, "contact_interactions"):
            return 0
        cur = conn.execute(
            "SELECT id, contact_id FROM contact_interactions "
            "WHERE contact_uuid IS NULL"
        )
        rows = cur.fetchall()
        count = 0
        for (row_id, old_cid) in rows:
            new_uuid = id_map.get(old_cid)
            if new_uuid:
                conn.execute(
                    "UPDATE contact_interactions SET contact_uuid=? WHERE id=?",
                    (new_uuid, row_id),
                )
                count += 1
        conn.commit()
        logger.info("contact_interactions: rewrote %d FK(s)", count)
        return count
    finally:
        conn.close()


def rewrite_submitted_role_fks(db_path: Path, id_map: Dict[int, str]) -> int:
    """Populate submitted_roles.contact_uuid from id_map.

    Same semantics as rewrite_interaction_fks. Returns count rewritten.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        if not _assert_rewrite_can_proceed(conn, "submitted_roles"):
            return 0
        cur = conn.execute(
            "SELECT id, contact_id FROM submitted_roles "
            "WHERE contact_uuid IS NULL"
        )
        rows = cur.fetchall()
        count = 0
        for (row_id, old_cid) in rows:
            new_uuid = id_map.get(old_cid)
            if new_uuid:
                conn.execute(
                    "UPDATE submitted_roles SET contact_uuid=? WHERE id=?",
                    (new_uuid, row_id),
                )
                count += 1
        conn.commit()
        logger.info("submitted_roles: rewrote %d FK(s)", count)
        return count
    finally:
        conn.close()


def finalize_sqlite_table(db_path: Path) -> str:
    """Rename `contacts` to `contacts_deprecated_YYYY_MM_DD` in-place.

    Also rebuilds `contact_interactions` and `submitted_roles` with the
    post-CAR-171 `contact_uuid TEXT NOT NULL` schema if they still carry the
    legacy `contact_id INTEGER` column (schema drift: CREATE TABLE IF NOT
    EXISTS doesn't alter existing tables). Safe only when those tables have
    zero rows — confirmed in Phase 1 audit. Returns the new table name.
    """
    today = datetime.now().strftime("%Y_%m_%d")
    new_name = f"contacts_deprecated_{today}"
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'"
        )
        if cur.fetchone() is None:
            raise RuntimeError(
                f"contacts table does not exist in {db_path}. "
                "Either it was already renamed or the DB is unexpected."
            )

        if _column_exists(conn, "contact_interactions", "contact_id"):
            logger.info(
                "Rebuilding contact_interactions with contact_uuid schema "
                "(CAR-171 drift fix)"
            )
            conn.execute("DROP TABLE IF EXISTS contact_interactions")
            conn.execute("""
                CREATE TABLE contact_interactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    contact_uuid TEXT NOT NULL,
                    interaction_type TEXT NOT NULL,
                    direction TEXT DEFAULT 'outbound',
                    subject TEXT,
                    summary TEXT,
                    roles_discussed TEXT,
                    follow_up_date TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_contact_interactions_uuid
                    ON contact_interactions(contact_uuid)
            """)

        if _column_exists(conn, "submitted_roles", "contact_id"):
            logger.info(
                "Rebuilding submitted_roles with contact_uuid schema "
                "(CAR-171 drift fix)"
            )
            conn.execute("DROP TABLE IF EXISTS submitted_roles")
            conn.execute("""
                CREATE TABLE submitted_roles (
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
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_submitted_roles_uuid
                    ON submitted_roles(contact_uuid)
            """)

        conn.execute(f'ALTER TABLE contacts RENAME TO "{new_name}"')
        conn.commit()
        return new_name
    finally:
        conn.close()


def _log_summary(result: MigrationResult, dry_run: bool) -> None:
    logger.info("")
    logger.info("=== Migration Summary ===")
    logger.info("SQLite rows read:       %d", result.rows_read)
    logger.info(
        "Inserted%s:%s%d",
        " (dry-run)" if dry_run else "",
        " " * (12 if dry_run else 22),
        result.rows_inserted,
    )
    logger.info("Skipped (email exists): %d", result.rows_skipped_existing)
    if result.errors:
        logger.info("Errors:                 %d", len(result.errors))
        for err in result.errors:
            logger.info("  - %s", err)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="CAR-172 one-time SQLite → Supabase contacts migration"
    )
    parser.add_argument(
        "--db-path", type=Path, default=None,
        help="Path to SQLite DB. Defaults to settings.DB_PATH.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report what would happen without writing to Supabase.",
    )
    parser.add_argument(
        "--finalize", action="store_true",
        help=(
            "Rename SQLite contacts table to contacts_deprecated_YYYY_MM_DD. "
            "Run ONLY after an insert pass is verified on the Supabase dashboard."
        ),
    )
    parser.add_argument(
        "--yes", action="store_true",
        help="Required with --finalize to confirm the verification step.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    db_path = args.db_path or settings.DB_PATH
    if not Path(db_path).exists():
        logger.error("SQLite DB not found at %s", db_path)
        return 2

    if args.finalize:
        if not args.yes:
            logger.error(
                "--finalize requires --yes. Verify Supabase shows the "
                "migrated rows (the dashboard /contacts page), then re-run."
            )
            return 2
        new_name = finalize_sqlite_table(Path(db_path))
        logger.info("Renamed contacts → %s in %s", new_name, db_path)
        return 0

    # Lazy import so tests that mock settings can do so before ContactManager loads
    from src.db.supabase_client import get_supabase_client
    from src.db.contacts import ContactManager

    manager = ContactManager()  # reads settings.CAREERPILOT_USER_ID
    client = get_supabase_client()
    result = migrate_contacts(
        Path(db_path), manager, client, dry_run=args.dry_run
    )
    _log_summary(result, args.dry_run)

    if args.dry_run:
        logger.info("")
        logger.info("Dry run complete. Re-run without --dry-run to write.")
    else:
        logger.info("")
        logger.info(
            "Verify on the Supabase dashboard, then run with "
            "--finalize --yes to rename the SQLite table."
        )

    return 1 if result.errors else 0


if __name__ == "__main__":
    sys.exit(main())
