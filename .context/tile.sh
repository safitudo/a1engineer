#!/usr/bin/env bash
set -euo pipefail

# Open a tiled monitoring view of all agent windows.
# Each pane shows a live view of an agent's tmux pane.
# Close with: Ctrl-B & (kill window) or run this script again.

ROLES="dev|qa|arch|lead|critic"
MONITOR_WIN="monitor"

CURRENT_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null || echo "")
if [[ -z "$CURRENT_SESSION" ]]; then
  echo "ERROR: Not inside a tmux session." >&2
  exit 1
fi

# Toggle: if monitor exists, kill it
if tmux list-windows -t "$CURRENT_SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$MONITOR_WIN"; then
  tmux kill-window -t "${CURRENT_SESSION}:${MONITOR_WIN}"
  echo "==> Monitor closed."
  exit 0
fi

# Find all agent windows
AGENTS=$(tmux list-windows -t "$CURRENT_SESSION" -F '#{window_index} #{window_name}' 2>/dev/null | grep -E -- "-(${ROLES})$" || true)

if [[ -z "$AGENTS" ]]; then
  echo "No agent windows found."
  exit 0
fi

COUNT=$(echo "$AGENTS" | wc -l | tr -d ' ')
echo "==> Creating monitor with $COUNT agents"

# Create monitor window with first agent's live view
FIRST_IDX=$(echo "$AGENTS" | head -1 | awk '{print $1}')
FIRST_NAME=$(echo "$AGENTS" | head -1 | awk '{print $2}')
tmux new-window -n "$MONITOR_WIN" "watch -t -n2 'tmux capture-pane -t ${CURRENT_SESSION}:${FIRST_NAME} -p 2>/dev/null | tail -40'"

# Add remaining agents as split panes
echo "$AGENTS" | tail -n +2 | while IFS= read -r line; do
  NAME=$(echo "$line" | awk '{print $2}')
  tmux split-window -t "${CURRENT_SESSION}:${MONITOR_WIN}" \
    "watch -t -n2 'tmux capture-pane -t ${CURRENT_SESSION}:${NAME} -p 2>/dev/null | tail -40'"
  tmux select-layout -t "${CURRENT_SESSION}:${MONITOR_WIN}" tiled
done

echo "==> Monitor active. Run again to close."
