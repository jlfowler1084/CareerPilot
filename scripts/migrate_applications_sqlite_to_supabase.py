"""One-time SQLite → Supabase applications migration (CAR-170 / M3).

Moves all rows from the local `applications` table at `data/careerpilot.db`
into Supabase under `CAREERPILOT_USER_ID`. After CAR-165 (M2), the CLI
writes to Supabase directly, so existing SQLite rows are orphaned — this
script closes that gap.

## Usage

Typical flow (three invocations):

    # 1. Dry run — reads SQLite, probes Supabase for URL matches, writes nothing
    python scripts/migrate_applications_sqlite_to_supabase.py --dry-run

    # 2. Real run — inserts missing rows into Supabase
    python scripts/migrate_applications_sqlite_to_supabase.py

    # 3. Finalize — rename the SQLite applications table to
    #    applications_deprecated_YYYY_MM_DD so it's preserved for restore
    #    but no longer shows up as the live table.
    python scripts/migrate_applications_sqlite_to_supabase.py --finalize --yes

Separation is deliberate: the operator is forced to verify the Supabase
dashboard between step 2 and 3, so a silent insert bug can't auto-destroy
the SQLite insurance copy.

## Idempotency

Rows with a non-empty `url` are deduped against Supabase via
`ApplicationTracker.find_by_url` (scoped by `CAREERPILOT_USER_ID`). If a
row with the same URL already exists, the migration skips it. Rows with
empty URL are always inserted; at this project's single-user scale with
~12 rows, duplicate cleanup is trivial if any occur.

## Field mapping

- `description` (SQLite) → `job_description` (Supabase), matching the
  rename M2 applied to `ApplicationTracker.save_job`
- `portal_id` (SQLite INTEGER) → `portal_id` (Supabase text) — cast to str
- All timestamp columns pass through as ISO strings; Supabase interprets
  naive ISO strings as UTC
- `user_id` is set from `settings.CAREERPILOT_USER_ID` (the same bootstrap
  config CAR-165 introduced)

## Out of scope

- Contacts migration — that is CAR-168 (M5), uses the same pattern
- Any CLI-SQLite tables beyond `applications` — that is CAR-169 (M6)
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

# Resolve project root so this script can be run from any cwd
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
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


def read_sqlite_applications(db_path: Path) -> List[Dict[str, Any]]:
    """Read all rows from the SQLite `applications` table as a list of dicts."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM applications").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def map_sqlite_row_to_supabase(row: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """Translate SQLite column names and types to the Supabase insert payload shape."""
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "title": row.get("title") or "",
        "company": row.get("company") or "",
        "location": row.get("location") or "",
        "url": row.get("url") or "",
        "source": row.get("source") or "",
        "salary_range": row.get("salary_range") or "",
        "status": row.get("status") or "found",
        "notes": row.get("notes") or "",
        "profile_id": row.get("profile_id") or "",
        # CLI's `description` → Supabase `job_description` (matches M2)
        "job_description": row.get("description"),
        "message_id": row.get("message_id") or "",
    }
    # Optional timestamps — only include if present, so Supabase defaults
    # (e.g., date_found → now()) kick in for absent values.
    for col in (
        "date_found",
        "date_applied",
        "date_response",
        "external_status",
        "external_status_updated",
        "withdraw_date",
    ):
        val = row.get(col)
        if val:
            payload[col] = val
    # portal_id: SQLite INTEGER → Supabase text
    if row.get("portal_id"):
        payload["portal_id"] = str(row["portal_id"])
    return payload


def migrate_applications(
    db_path: Path,
    tracker: Any,  # ApplicationTracker — typed Any to avoid forcing import at collect time
    client: Any,
    *,
    dry_run: bool = False,
) -> MigrationResult:
    """Copy SQLite applications into Supabase.

    Args:
        db_path: Path to the local SQLite DB.
        tracker: Configured `ApplicationTracker` (for `find_by_url` dedup).
        client: Supabase client (for direct `.table().insert()`).
        dry_run: If True, report what would happen without inserting.

    Returns:
        `MigrationResult` with counts and any per-row errors.
    """
    result = MigrationResult()
    rows = read_sqlite_applications(db_path)
    result.rows_read = len(rows)

    for row in rows:
        url = (row.get("url") or "").strip()
        sqlite_id = row.get("id")
        try:
            if url:
                existing = tracker.find_by_url(url)
                if existing:
                    result.rows_skipped_existing += 1
                    logger.info(
                        "SKIP (url exists): sqlite_id=%s title=%r url=%s",
                        sqlite_id, row.get("title"), url,
                    )
                    continue

            payload = map_sqlite_row_to_supabase(row, tracker._user_id)
            if dry_run:
                logger.info(
                    "INSERT [dry-run]: sqlite_id=%s title=%r company=%r",
                    sqlite_id, row.get("title"), row.get("company"),
                )
                result.rows_inserted += 1
            else:
                response = client.table("applications").insert(payload).execute()
                if response.data:
                    new_id = response.data[0].get("id")
                    logger.info(
                        "INSERT: sqlite_id=%s → supabase_id=%s title=%r",
                        sqlite_id, new_id, row.get("title"),
                    )
                    result.rows_inserted += 1
                else:
                    result.errors.append(
                        f"Insert returned no data for sqlite_id={sqlite_id}"
                    )
        except Exception as e:  # noqa: BLE001 — surface every row's error
            msg = f"Row sqlite_id={sqlite_id}: {e}"
            result.errors.append(msg)
            logger.error("FAILED: %s", msg)

    return result


def finalize_sqlite_table(db_path: Path) -> str:
    """Rename `applications` to `applications_deprecated_YYYY_MM_DD` in-place.

    Keeps the row data around as insurance without it shadowing the live
    state. Returns the new table name.
    """
    today = datetime.now().strftime("%Y_%m_%d")
    new_name = f"applications_deprecated_{today}"
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='applications'"
        )
        if cur.fetchone() is None:
            raise RuntimeError(
                f"applications table does not exist in {db_path}. "
                "Either it was already renamed or the DB is unexpected."
            )
        conn.execute(f'ALTER TABLE applications RENAME TO "{new_name}"')
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
    logger.info("Skipped (url exists):   %d", result.rows_skipped_existing)
    if result.errors:
        logger.info("Errors:                 %d", len(result.errors))
        for err in result.errors:
            logger.info("  - %s", err)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="CAR-170 one-time SQLite → Supabase applications migration"
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
            "Rename SQLite applications table to applications_deprecated_"
            "YYYY_MM_DD. Run ONLY after an insert pass is verified on the "
            "Supabase dashboard."
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
                "migrated rows (the dashboard applications list), then re-run."
            )
            return 2
        new_name = finalize_sqlite_table(Path(db_path))
        logger.info("Renamed applications → %s in %s", new_name, db_path)
        return 0

    # Lazy import so tests that mock settings can do so before ApplicationTracker loads
    from src.db.supabase_client import get_supabase_client
    from src.jobs.tracker import ApplicationTracker

    tracker = ApplicationTracker()  # reads settings.CAREERPILOT_USER_ID
    client = get_supabase_client()
    result = migrate_applications(
        Path(db_path), tracker, client, dry_run=args.dry_run
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
