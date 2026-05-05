"""One-shot inspection script to verify CAR-145 migration landed on the real DB."""

import sqlite3
from pathlib import Path

db_path = Path(__file__).resolve().parent.parent / "data" / "careerpilot.db"
conn = sqlite3.connect(str(db_path))

legacy_exists = bool(
    conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='interview_analyses'"
    ).fetchone()
)

has_kind = any(
    row[1] == "kind"
    for row in conn.execute("PRAGMA table_info(transcripts)").fetchall()
)

total_transcripts = conn.execute("SELECT COUNT(*) FROM transcripts").fetchone()[0]

legacy_backfilled = conn.execute(
    "SELECT COUNT(*) FROM transcripts WHERE source='legacy_interview_analyses'"
).fetchone()[0]

kind_breakdown = conn.execute(
    "SELECT kind, COUNT(*) FROM transcripts GROUP BY kind ORDER BY kind"
).fetchall()

print(f"DB path: {db_path}")
print(f"interview_analyses table exists: {legacy_exists}")
print(f"transcripts.kind column exists:  {has_kind}")
print(f"total transcripts:               {total_transcripts}")
print(f"legacy backfilled rows:          {legacy_backfilled}")
print(f"kind breakdown:                  {kind_breakdown or '(no rows)'}")

conn.close()
