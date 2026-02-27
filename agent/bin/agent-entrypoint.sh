#!/usr/bin/env bash
set -e

# ── Headless environment ────────────────────────────────────────────────────
export IS_DEMO=1
export DISABLE_AUTOUPDATER=1
export DISABLE_TELEMETRY=1
export DISABLE_ERROR_REPORTING=1
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE="${CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:-35}"
export ENABLE_TOOL_SEARCH="${ENABLE_TOOL_SEARCH:-auto:5}"
export CLAUDE_CODE_EFFORT_LEVEL="${CLAUDE_CODE_EFFORT_LEVEL:-high}"

AGENT_HOME="/home/agent"
WORKSPACE="${WORKSPACE:-/git}"
WORK_DIR="${WORKTREE_PATH:-$WORKSPACE}"
[ -d "$WORK_DIR" ] && cd "$WORK_DIR"

# ── Git identity ────────────────────────────────────────────────────────────
GIT_NAME="${GIT_NAME:-a1-agent}"
GIT_EMAIL="${GIT_EMAIL:-agent@a1engineer.dev}"
git config --global user.name "$GIT_NAME"
git config --global user.email "$GIT_EMAIL"

# ── Claude session dir ──────────────────────────────────────────────────────
mkdir -p "$AGENT_HOME/.claude"
[ -d /root/.claude-host ] && cp -a /root/.claude-host/. "$AGENT_HOME/.claude/"

cat > "$AGENT_HOME/.claude/settings.json" <<'EOF'
{
  "skipDangerousModePermissionPrompt": true,
  "hooks": {
    "PostToolUse": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "irc-poll" }]
    }]
  }
}
EOF

# ── Inject secrets ──────────────────────────────────────────────────────────
[ -f /run/secrets/anthropic_key ] && export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic_key)
[ -f /run/secrets/github_token ]  && export GITHUB_TOKEN=$(cat /run/secrets/github_token)

# ── Git HTTPS auth (.netrc) ─────────────────────────────────────────────────
if [ -n "${GITHUB_TOKEN:-}" ]; then
  printf 'machine github.com\nlogin x-access-token\npassword %s\n' "$GITHUB_TOKEN" > "$AGENT_HOME/.netrc"
  chmod 600 "$AGENT_HOME/.netrc"
  cp "$AGENT_HOME/.netrc" /root/.netrc 2>/dev/null || true
fi

# ── Role-specific config from repo ──────────────────────────────────────────
ROLE_DIR="$WORK_DIR/.context/agents/${IRC_ROLE:-}"
if [ -d "$ROLE_DIR" ]; then
  [ -f "$ROLE_DIR/config.json" ] && {
    CONFIG_MODEL=$(jq -r '.model // empty' "$ROLE_DIR/config.json" 2>/dev/null)
    [ -n "$CONFIG_MODEL" ] && MODEL="$CONFIG_MODEL"
  }
  [ -f "$ROLE_DIR/prompt.md" ] && AGENT_PROMPT=$(cat "$ROLE_DIR/prompt.md")
fi

# ── Write prompt file ──────────────────────────────────────────────────────
[ -n "${AGENT_PROMPT:-}" ] && printf '%s' "$AGENT_PROMPT" > /tmp/prompt.md

# ── Defaults ────────────────────────────────────────────────────────────────
export AGENT_RUNTIME="${AGENT_RUNTIME:-claude-code}"
export MODEL="${MODEL:-sonnet}"

# ── Write env file (survives su + tmux boundary) ───────────────────────────
cat > /tmp/agent-env.sh <<ENVEOF
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-}"
export MODEL="${MODEL:-sonnet}"
export CLAUDE_CODE_EFFORT_LEVEL="${CLAUDE_CODE_EFFORT_LEVEL:-high}"
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE="${CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:-35}"
export ENABLE_TOOL_SEARCH="${ENABLE_TOOL_SEARCH:-auto:5}"
export IS_DEMO="${IS_DEMO:-1}"
export DISABLE_AUTOUPDATER="${DISABLE_AUTOUPDATER:-1}"
export DISABLE_TELEMETRY="${DISABLE_TELEMETRY:-1}"
export DISABLE_ERROR_REPORTING="${DISABLE_ERROR_REPORTING:-1}"
export IRC_HOST="${IRC_HOST:-}"
export IRC_PORT="${IRC_PORT:-6667}"
export IRC_NICK="${IRC_NICK:-}"
export IRC_ROLE="${IRC_ROLE:-}"
export CITY="${CITY:-}"
export TEAM_ID="${TEAM_ID:-}"
export MANAGER_URL="${MANAGER_URL:-}"
export HEARTBEAT_URL="${HEARTBEAT_URL:-}"
ENVEOF
chmod 644 /tmp/agent-env.sh

# ── Write runtime-specific launch script ────────────────────────────────────
# Runs INSIDE tmux. For API-key Claude Code, uses --print --continue loop.
# For session auth or other runtimes, runs interactively.
case "$AGENT_RUNTIME" in
  claude-code)
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
      # API key mode: --print --continue loop (API keys don't work in interactive mode)
      touch /tmp/agent-mode-print  # signal to sidecar
      cat > /tmp/launch-agent.sh <<'LAUNCH'
#!/usr/bin/env bash
source /tmp/agent-env.sh 2>/dev/null || true

PROMPT=""
[ -f /tmp/prompt.md ] && PROMPT=$(cat /tmp/prompt.md)
SESSION_ID=""
INBOX="/tmp/agent-inbox.txt"

# Initial prompt
if [ -n "$PROMPT" ]; then
  echo "[agent] sending initial prompt..."
  RESULT=$(claude --print --dangerously-skip-permissions --model "$MODEL" \
    --output-format json "$PROMPT" 2>&1)
  SESSION_ID=$(echo "$RESULT" | jq -r '.session_id // empty' 2>/dev/null)
  echo "$RESULT" | jq -r '.result // empty' 2>/dev/null
  echo "[agent] session=$SESSION_ID"
fi

# Main loop: pick up new messages from sidecar
echo "[agent] entering loop, watching $INBOX"
while true; do
  if [ -s "$INBOX" ]; then
    MSG=$(cat "$INBOX")
    : > "$INBOX"  # clear
    echo "[agent] processing: ${MSG:0:80}..."
    if [ -n "$SESSION_ID" ]; then
      RESULT=$(claude --print --dangerously-skip-permissions --model "$MODEL" \
        --output-format json --resume "$SESSION_ID" "$MSG" 2>&1)
    else
      RESULT=$(claude --print --dangerously-skip-permissions --model "$MODEL" \
        --output-format json "$MSG" 2>&1)
      SESSION_ID=$(echo "$RESULT" | jq -r '.session_id // empty' 2>/dev/null)
    fi
    echo "$RESULT" | jq -r '.result // empty' 2>/dev/null
  fi
  sleep 3
done
LAUNCH
    else
      # Session auth: interactive mode works
      cat > /tmp/launch-agent.sh <<'LAUNCH'
#!/usr/bin/env bash
source /tmp/agent-env.sh 2>/dev/null || true
if [ -f /tmp/prompt.md ]; then
  exec claude --dangerously-skip-permissions --model "$MODEL" "$(cat /tmp/prompt.md)"
else
  exec claude --dangerously-skip-permissions --model "$MODEL"
fi
LAUNCH
    fi
    ;;
  codex)
    cat > /tmp/launch-agent.sh <<'LAUNCH'
#!/usr/bin/env bash
source /tmp/agent-env.sh 2>/dev/null || true
if [ -f /tmp/prompt.md ]; then
  exec codex --model "$MODEL" --instructions "$(cat /tmp/prompt.md)"
else
  exec codex --model "$MODEL"
fi
LAUNCH
    ;;
  *)
    echo "Unknown AGENT_RUNTIME: $AGENT_RUNTIME" >&2
    exit 1
    ;;
esac
chmod +x /tmp/launch-agent.sh

# ── Fix permissions ─────────────────────────────────────────────────────────
chown -R agent:agent "$AGENT_HOME" 2>/dev/null || true
chown -R agent:agent "$WORK_DIR" 2>/dev/null || true
chown agent:agent /tmp/prompt.md 2>/dev/null || true
touch /tmp/agent-inbox.txt && chown agent:agent /tmp/agent-inbox.txt

# ── Git config for agent user ───────────────────────────────────────────────
su -s /bin/bash agent -c "git config --global user.name '$GIT_NAME' && git config --global user.email '$GIT_EMAIL'"

# ── Start tmux + agent ──────────────────────────────────────────────────────
su -s /bin/bash agent -c "
  cd '$WORK_DIR' 2>/dev/null || true
  tmux new-session -d -s agent
  tmux send-keys -t agent '/tmp/launch-agent.sh' Enter
"

# ── Start sidecar (background) ──────────────────────────────────────────────
/usr/local/bin/sidecar.sh &

# ── Keep container alive ────────────────────────────────────────────────────
exec tail -f /dev/null
