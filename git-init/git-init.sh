#!/bin/sh
set -e

REPO_URL="${REPO_URL:?REPO_URL is required}"
REPO_BRANCH="${REPO_BRANCH:-main}"
AGENTS="${AGENTS:-[]}"
GIT_DIR="/git/repo.git"
WORKTREES_DIR="/git/worktrees"

# Authenticate via ~/.netrc to avoid token in URL (ps aux / git remote -v safe)
if [ -n "$GITHUB_TOKEN" ]; then
  printf 'machine github.com\nlogin x-access-token\npassword %s\n' "$GITHUB_TOKEN" > /root/.netrc
  chmod 600 /root/.netrc
fi

# 1. Clone bare repo (idempotent)
if [ -d "$GIT_DIR" ]; then
  echo "[git-init] Bare repo already exists at $GIT_DIR, skipping clone."
else
  echo "[git-init] Cloning (branch: $REPO_BRANCH) as bare repo..."
  git clone --bare --branch "$REPO_BRANCH" "$REPO_URL" "$GIT_DIR"
  echo "[git-init] Clone complete."
fi

mkdir -p "$WORKTREES_DIR"

# 2. Create per-agent worktrees from AGENTS JSON
# AGENTS is a JSON array of [{role, city, id?}]
# Use awk to parse — alpine/git has no jq
# If "id" is present, use it as the worktree name; otherwise fall back to city-role.
echo "$AGENTS" | awk '
BEGIN { RS="}"; FS="\"" }
{
  role=""; city=""; id=""
  for (i=1; i<=NF; i++) {
    if ($i == "role") role=$(i+2)
    if ($i == "city") city=$(i+2)
    if ($i == "id")   id=$(i+2)
  }
  if (role != "" && city != "") {
    if (id != "") print id
    else print city "-" role
  }
}
' | while read -r name; do
  worktree_path="$WORKTREES_DIR/$name"
  branch="agent/$name"

  if [ -d "$worktree_path" ]; then
    # Verify it's a real worktree (has .git file), not just an empty dir
    # created by Docker's working_dir from a previous run.
    if [ -e "$worktree_path/.git" ]; then
      echo "[git-init] Worktree already exists: $worktree_path"
      continue
    else
      echo "[git-init] Removing stale empty directory: $worktree_path"
      rm -rf "$worktree_path"
    fi
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
