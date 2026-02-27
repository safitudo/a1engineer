#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT")-trees"

# --- Validate role argument ---
ROLE="${1:-}"
VALID_ROLES=("dev" "qa" "arch" "lead" "critic" "chuck")

if [[ -z "$ROLE" ]] || ! printf '%s\n' "${VALID_ROLES[@]}" | grep -qx "$ROLE"; then
  echo "Usage: $0 <role>"
  echo "Roles: ${VALID_ROLES[*]}"
  exit 1
fi

# --- City name list ---
CITIES=(
  mumbai tokyo seoul dubai cairo lagos nairobi accra lima bogota
  santiago havana prague vienna zurich oslo helsinki dublin lisbon
  amsterdam brussels copenhagen warsaw budapest bucharest belgrade
  tbilisi yerevan baku tehran karachi dhaka hanoi manila jakarta
  bangkok taipei osaka kyoto kobe sapporo busan guadalajara medellin
  cusco asuncion montevideo panama kingston nassau reykjavik edinburgh
  porto sevilla lyon marseille hamburg munich milan rome florence
  naples athens istanbul ankara casablanca tunis dakar kampala
)

# --- Pick an unused city name ---
pick_city() {
  local shuffled
  shuffled=($(printf '%s\n' "${CITIES[@]}" | sort -R))

  for city in "${shuffled[@]}"; do
    if [[ ! -d "$WORKTREE_BASE/$city" ]]; then
      echo "$city"
      return 0
    fi
  done

  # All cities taken — append version number
  for city in "${shuffled[@]}"; do
    for v in $(seq 2 99); do
      local name="${city}-v${v}"
      if [[ ! -d "$WORKTREE_BASE/$name" ]]; then
        echo "$name"
        return 0
      fi
    done
  done

  echo "ERROR: No available city names" >&2
  exit 1
}

CITY="$(pick_city)"
SESSION_NAME="${CITY}-${ROLE}"
BRANCH_NAME="agent/${CITY}"
WORKTREE_PATH="${WORKTREE_BASE}/${CITY}"

echo "==> Creating agent: $SESSION_NAME"
echo "    Worktree: $WORKTREE_PATH"
echo "    Branch:   $BRANCH_NAME"

# --- Ensure base directory exists ---
mkdir -p "$WORKTREE_BASE"

# --- Create git worktree ---
cd "$REPO_ROOT"
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" main

# --- Load agent config ---
CONFIG_FILE="$SCRIPT_DIR/agents/$ROLE/config.json"
PROMPT_FILE="$SCRIPT_DIR/agents/$ROLE/prompt.md"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Missing $CONFIG_FILE" >&2
  exit 1
fi
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Missing $PROMPT_FILE" >&2
  exit 1
fi

MODEL="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['model'])" "$CONFIG_FILE")"
EFFORT="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('effort', 'high'))" "$CONFIG_FILE")"

# --- Launch in tmux ---
# If inside tmux, create a new window in the current session
# Otherwise, create a new detached session
if [[ -n "${TMUX:-}" ]]; then
  tmux new-window -n "$SESSION_NAME" -c "$WORKTREE_PATH"
  tmux send-keys -t "$SESSION_NAME" "export IRC_ROLE=$ROLE && claude --model $MODEL --effort $EFFORT --dangerously-skip-permissions \"\$(cat $PROMPT_FILE)\"" Enter
  echo "==> Agent launched: window '$SESSION_NAME' in current tmux session"
else
  tmux new-session -d -s "$SESSION_NAME" -c "$WORKTREE_PATH"
  tmux send-keys -t "$SESSION_NAME" "export IRC_ROLE=$ROLE && claude --model $MODEL --effort $EFFORT --dangerously-skip-permissions \"\$(cat $PROMPT_FILE)\"" Enter
  echo "==> Agent launched: tmux session '$SESSION_NAME'"
  echo "    Attach: tmux attach -t $SESSION_NAME"
fi
