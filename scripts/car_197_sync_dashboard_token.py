"""Sync the CLI's Gmail refresh_token into dashboard/.env.local::GMAIL_REFRESH_TOKEN.

One-off recovery utility for CAR-197 — ensures the dashboard reads the same
refresh token the CLI just re-authed, without echoing token values.

Run from repo root:
    python scripts/car_197_sync_dashboard_token.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CLI_TOKEN = REPO_ROOT / "data" / "gmail_token.json"
DASH_ENV = REPO_ROOT / "dashboard" / ".env.local"


def main() -> int:
    if not CLI_TOKEN.exists():
        print(f"ERROR: CLI token file not found: {CLI_TOKEN}")
        return 2
    if not DASH_ENV.exists():
        print(f"ERROR: dashboard env file not found: {DASH_ENV}")
        return 2

    cli_token = json.loads(CLI_TOKEN.read_text(encoding="utf-8"))
    new_refresh = cli_token.get("refresh_token")
    if not new_refresh:
        print("ERROR: CLI token file has no refresh_token field")
        return 2

    lines = DASH_ENV.read_text(encoding="utf-8").splitlines(keepends=True)
    found = False
    old_tail = None
    for i, line in enumerate(lines):
        if line.startswith("GMAIL_REFRESH_TOKEN="):
            old_value = line.split("=", 1)[1].rstrip("\r\n")
            old_tail = old_value[-6:]
            lines[i] = f"GMAIL_REFRESH_TOKEN={new_refresh}\n"
            found = True
            break

    if not found:
        print("ERROR: GMAIL_REFRESH_TOKEN= line not found in dashboard/.env.local")
        return 2

    DASH_ENV.write_text("".join(lines), encoding="utf-8")
    print(f"OK — replaced GMAIL_REFRESH_TOKEN (old tail ...{old_tail}, new tail ...{new_refresh[-6:]})")
    print("Restart the dev server for the new value to take effect.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
