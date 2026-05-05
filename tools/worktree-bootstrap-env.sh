#!/usr/bin/env bash
# tools/worktree-bootstrap-env.sh
#
# Hydrates dashboard/.env.local in a fresh worktree by pulling production env
# vars from Vercel (Option B — CAR-215).
#
# Why: Every new git worktree off feature/dashboard-v2 starts with no
# dashboard/.env.local. npx next build then fails on the static prerender of
# /login with "Error: @supabase/ssr: Your project's URL and API key are
# required". TypeScript compile and bundling pass; only the static export
# of unauthenticated pages dies (discovered in CAR-214).
#
# Requires: VERCEL_TOKEN set in the environment (configured per CAR-212).
# Run once per new worktree, after npm ci.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DASHBOARD_DIR="$WORKTREE_ROOT/dashboard"
ENV_FILE="$DASHBOARD_DIR/.env.local"

# ── Guard: VERCEL_TOKEN must be present ─────────────────────────────────────
if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo ""
  echo "ERROR: VERCEL_TOKEN is not set in the environment."
  echo ""
  echo "  VERCEL_TOKEN is required so the Vercel CLI can authenticate without"
  echo "  an interactive login prompt."
  echo ""
  echo "  How to fix:"
  echo "    1. See docs/solutions/best-practices/vercel-deploy-verification.md"
  echo "       for the full CAR-212 token setup procedure."
  echo "    2. On Windows, VERCEL_TOKEN is stored as a User-scope env var."
  echo "       If it is missing in this shell, the parent terminal may have"
  echo "       launched before the var was set. Close and reopen the terminal."
  echo "    3. To read it on-demand in PowerShell:"
  echo "       [Environment]::GetEnvironmentVariable(\"VERCEL_TOKEN\", \"User\")"
  echo ""
  exit 1
fi

# ── Guard: skip if .env.local already exists ────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo "WARNING: $ENV_FILE already exists. Skipping pull to avoid overwriting."
  echo "  Delete the file manually and re-run this script if you need a fresh copy."
  exit 0
fi

echo "Linking worktree to Vercel project..."
cd "$DASHBOARD_DIR"

npx vercel link \
  --yes \
  --scope jlfowler1084s-projects \
  --project career-pilot

echo ""
echo "Pulling production env vars into dashboard/.env.local ..."

npx vercel env pull .env.local \
  --environment=production \
  --yes

echo ""
if [ -f "$ENV_FILE" ]; then
  echo "SUCCESS: dashboard/.env.local written."
  echo "  You can now run npm run build or npm run dev from the dashboard/ directory."
else
  echo "ERROR: vercel env pull exited without error but .env.local was not created."
  echo "  Check the output above for clues."
  exit 1
fi
