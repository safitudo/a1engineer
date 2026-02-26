#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT")-trees"
ROLES="dev|qa|arch|lead|critic"

# --- Find and kill agent windows/sessions ---
KILLED=0

# Kill matching windows in all sessions
for session in $(tmux list-sessions -F '#{session_name}' 2>/dev/null); do
  WINDOWS=$(tmux list-windows -t "$session" -F '#{window_name}' 2>/dev/null | grep -E -- "-(${ROLES})$" || true)
  if [[ -n "$WINDOWS" ]]; then
    while IFS= read -r win; do
      echo "    Killing window: $session:$win"
      tmux kill-window -t "$session:$win" 2>/dev/null || true
      KILLED=$((KILLED + 1))
    done <<< "$WINDOWS"
  fi
done

# Kill matching standalone sessions
SESSIONS=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E -- "-(${ROLES})$" || true)
if [[ -n "$SESSIONS" ]]; then
  while IFS= read -r session; do
    echo "    Killing session: $session"
    tmux kill-session -t "$session" 2>/dev/null || true
    KILLED=$((KILLED + 1))
  done <<< "$SESSIONS"
fi

if [[ "$KILLED" -eq 0 ]]; then
  echo "No agent windows or sessions found."
else
  echo "    Killed $KILLED agent(s)."
fi

# --- Optionally remove worktrees ---
echo ""
read -p "Remove worktrees in $WORKTREE_BASE? (y/N) " REMOVE

if [[ "$REMOVE" =~ ^[Yy]$ ]]; then
  echo "==> Removing worktrees:"
  cd "$REPO_ROOT"

  for dir in "$WORKTREE_BASE"/*/; do
    [[ -d "$dir" ]] || continue
    echo "    $(basename "$dir")"
    git worktree remove --force "$dir" 2>/dev/null || true
  done

  git worktree prune
  echo "    Done."
else
  echo "Worktrees preserved."
fi
