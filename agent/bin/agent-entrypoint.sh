#!/usr/bin/env bash
set -e

# ── Workspace ───────────────────────────────────────────────────────────────
# WORKSPACE points to the repo checkout (or worktree) where CLAUDE.md and
# .context/agents/ live.  Defaults to /git (the shared volume mount).
WORKSPACE="${WORKSPACE:-/git}"

if [ -d "$WORKSPACE" ]; then
  cd "$WORKSPACE"
fi

# ── tmux ────────────────────────────────────────────────────────────────────
tmux new-session -d -s agent

# ── Git identity ────────────────────────────────────────────────────────────
if [ -n "$GIT_NAME" ]; then
  git config --global user.name "$GIT_NAME"
fi
if [ -n "$GIT_EMAIL" ]; then
  git config --global user.email "$GIT_EMAIL"
fi

# ── .claude/settings.json — irc-poll hook ───────────────────────────────────
mkdir -p /root/.claude
cat > /root/.claude/settings.json <<'EOF'
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "irc-poll" }]
    }]
  }
}
EOF

# ── Inject API keys from Docker secrets (if present) ────────────────────────
[ -f /run/secrets/anthropic_key ] && export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic_key)
[ -f /run/secrets/github_token ]  && export GITHUB_TOKEN=$(cat /run/secrets/github_token)

# ── Role-specific config from filesystem ────────────────────────────────────
# .context/agents/{role}/config.json → model override
# .context/agents/{role}/prompt.md   → role prompt (preferred over AGENT_PROMPT)
ROLE_DIR="$WORKSPACE/.context/agents/$IRC_ROLE"
PROMPT_FILE=""

if [ -d "$ROLE_DIR" ]; then
  # Model override from config.json
  if [ -f "$ROLE_DIR/config.json" ]; then
    CONFIG_MODEL=$(jq -r '.model // empty' "$ROLE_DIR/config.json" 2>/dev/null)
    if [ -n "$CONFIG_MODEL" ]; then
      MODEL="$CONFIG_MODEL"
    fi
  fi

  # Prompt from filesystem (takes priority over AGENT_PROMPT env var)
  if [ -f "$ROLE_DIR/prompt.md" ]; then
    PROMPT_FILE="$ROLE_DIR/prompt.md"
  fi
fi

# Fall back to AGENT_PROMPT env var
if [ -z "$PROMPT_FILE" ] && [ -n "$AGENT_PROMPT" ]; then
  printf '%s' "$AGENT_PROMPT" > /tmp/prompt.md
  PROMPT_FILE="/tmp/prompt.md"
fi

# ── Resolve runtime + model defaults ───────────────────────────────────────
AGENT_RUNTIME="${AGENT_RUNTIME:-claude-code}"
MODEL="${MODEL:-sonnet}"

# ── Launch agent in tmux ───────────────────────────────────────────────────
case "$AGENT_RUNTIME" in
  claude-code)
    CMD="claude --model $MODEL"
    if [ -n "$PROMPT_FILE" ]; then
      CMD="$CMD --prompt-file $PROMPT_FILE"
    fi
    tmux send-keys -t agent "$CMD" Enter
    ;;
  codex)
    CMD="codex --model $MODEL"
    if [ -n "$PROMPT_FILE" ]; then
      CMD="$CMD --instructions \"\$(cat $PROMPT_FILE)\""
    fi
    tmux send-keys -t agent "$CMD" Enter
    ;;
  *)
    echo "Unknown AGENT_RUNTIME: $AGENT_RUNTIME" >&2
    exit 1
    ;;
esac

# ── Keep container alive ───────────────────────────────────────────────────
exec tail -f /dev/null
