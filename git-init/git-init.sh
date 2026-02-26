#!/bin/sh
set -e

REPO_URL="${REPO_URL:?REPO_URL is required}"
REPO_BRANCH="${REPO_BRANCH:-main}"
AGENTS="${AGENTS:-[]}"
GIT_DIR="/git/repo.git"
WORKTREES_DIR="/git/worktrees"

# Inject GITHUB_TOKEN into URL if provided
if [ -n "$GITHUB_TOKEN" ]; then
  # Replace https:// with https://<token>@
  REPO_URL=$(echo "$REPO_URL" | sed "s|https://|https://${GITHUB_TOKEN}@|")
fi

# 1. Clone bare repo (idempotent)
if [ -d "$GIT_DIR" ]; then
  echo "[git-init] Bare repo already exists at $GIT_DIR, skipping clone."
else
  echo "[git-init] Cloning $REPO_URL (branch: $REPO_BRANCH) as bare repo..."
  git clone --bare --branch "$REPO_BRANCH" "$REPO_URL" "$GIT_DIR"
  echo "[git-init] Clone complete."
fi

mkdir -p "$WORKTREES_DIR"

# 2. Create per-agent worktrees from AGENTS JSON
# AGENTS is a JSON array of [{role, city}]
# Use awk to parse — alpine/git has no jq
echo "$AGENTS" | awk '
BEGIN { RS="}"; FS="\"" }
{
  role=""; city=""
  for (i=1; i<=NF; i++) {
    if ($i == "role") role=$(i+2)
    if ($i == "city") city=$(i+2)
  }
  if (role != "" && city != "") print city "-" role
}
' | while read -r name; do
  worktree_path="$WORKTREES_DIR/$name"
  branch="agent/$name"

  if [ -d "$worktree_path" ]; then
    echo "[git-init] Worktree already exists: $worktree_path"
    continue
  fi

  echo "[git-init] Creating worktree: $worktree_path (branch: $branch)"
  # Check if branch already exists in the bare repo
  if git --git-dir="$GIT_DIR" rev-parse --verify "refs/heads/$branch" > /dev/null 2>&1; then
    git --git-dir="$GIT_DIR" worktree add "$worktree_path" "$branch"
  else
    git --git-dir="$GIT_DIR" worktree add -b "$branch" "$worktree_path" "$REPO_BRANCH"
  fi
  echo "[git-init] Worktree ready: $worktree_path"
done

echo "[git-init] Done."
