#!/usr/bin/env bash
# setup-worktree.sh — Symlink untracked environment files into a CareerPilot worktree
#
# Usage: ./scripts/setup-worktree.sh <worktree-path>
#   e.g. ./scripts/setup-worktree.sh ../CareerPilot-worktrees/car-131
#
# Called after `git worktree add` to ensure the worktree has the environment
# files it needs to build and run. These files are untracked (.gitignored)
# so they don't propagate automatically to new worktrees.
#
# Related: INFRA-122, project_dashboard_git_workflow.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Validate args ---
if [ $# -lt 1 ]; then
  echo "Usage: $0 <worktree-path>"
  echo "  e.g. $0 ../CareerPilot-worktrees/car-131"
  exit 1
fi

WORKTREE_DIR="$(cd "$1" 2>/dev/null && pwd || echo "$1")"

if [ ! -d "$WORKTREE_DIR" ]; then
  echo "Error: Worktree directory does not exist: $WORKTREE_DIR"
  exit 1
fi

if [ ! -f "$WORKTREE_DIR/.git" ]; then
  echo "Error: Not a git worktree: $WORKTREE_DIR"
  exit 1
fi

# --- Files to symlink ---
# Add entries here as needed. Each line: relative path from project root.
ENV_FILES=(
  ".env.local"
  ".env.development.local"
  ".env.test.local"
)

# --- Create symlinks ---
linked=0
skipped=0

for file in "${ENV_FILES[@]}"; do
  src="$MAIN_DIR/$file"
  dest="$WORKTREE_DIR/$file"

  if [ ! -f "$src" ]; then
    # Source doesn't exist in main — skip silently
    continue
  fi

  if [ -f "$dest" ] || [ -L "$dest" ]; then
    echo "  skip: $file (already exists)"
    ((skipped++))
    continue
  fi

  # Ensure parent directory exists
  mkdir -p "$(dirname "$dest")"

  ln -s "$src" "$dest"
  echo "  link: $file → $src"
  ((linked++))
done

echo ""
echo "Worktree setup complete: $linked linked, $skipped skipped"
echo "Worktree ready at: $WORKTREE_DIR"
