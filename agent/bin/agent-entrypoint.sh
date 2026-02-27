#!/usr/bin/env bash
set -e

# ── Headless environment ────────────────────────────────────────────────────
# These must be set BEFORE starting tmux so the child shell inherits them.
export IS_DEMO=1                          # Skip onboarding / theme wizard
export DISABLE_AUTOUPDATER=1              # No auto-update prompts
export DISABLE_TELEMETRY=1                # No telemetry in containers
export DISABLE_ERROR_REPORTING=1          # No error reporting in containers

AGENT_HOME="/home/agent"

# ── Workspace ───────────────────────────────────────────────────────────────
# WORKTREE_PATH is the per-agent checkout; fall back to WORKSPACE (/git).
WORKSPACE="${WORKSPACE:-/git}"
WORK_DIR="${WORKTREE_PATH:-$WORKSPACE}"

if [ -d "$WORK_DIR" ]; then
  cd "$WORK_DIR"
fi

# ── Git identity ────────────────────────────────────────────────────────────
GIT_NAME="${GIT_NAME:-a1-agent}"
GIT_EMAIL="${GIT_EMAIL:-agent@a1engineer.dev}"
git config --global user.name "$GIT_NAME"
git config --global user.email "$GIT_EMAIL"

# ── .claude session — copy read-only host mount into writable location ──────
mkdir -p "$AGENT_HOME/.claude"
if [ -d /root/.claude-host ]; then
  cp -a /root/.claude-host/. "$AGENT_HOME/.claude/"
fi

# ── .claude/settings.json ───────────────────────────────────────────────────
# skipDangerousModePermissionPrompt: suppress the interactive confirmation
# that --dangerously-skip-permissions normally shows on first use.
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

# ── Inject API keys from Docker secrets (if present) ────────────────────────
[ -f /run/secrets/anthropic_key ] && export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic_key)
[ -f /run/secrets/github_token ]  && export GITHUB_TOKEN=$(cat /run/secrets/github_token)

# ── Role-specific config from filesystem ────────────────────────────────────
# .context/agents/{role}/config.json → model override
# .context/agents/{role}/prompt.md   → role prompt (preferred over AGENT_PROMPT)
ROLE_DIR="$WORK_DIR/.context/agents/$IRC_ROLE"

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
    AGENT_PROMPT=$(cat "$ROLE_DIR/prompt.md")
  fi
fi

# ── Agent prompt ────────────────────────────────────────────────────────────
if [ -n "$AGENT_PROMPT" ]; then
  printf '%s' "$AGENT_PROMPT" > /tmp/prompt.md
fi

# ── Resolve runtime + model defaults ───────────────────────────────────────
export AGENT_RUNTIME="${AGENT_RUNTIME:-claude-code}"
export MODEL="${MODEL:-sonnet}"

# ── Fix permissions for non-root agent user ─────────────────────────────────
chown -R agent:agent "$AGENT_HOME" 2>/dev/null || true
chown -R agent:agent "$WORK_DIR" 2>/dev/null || true
chown agent:agent /tmp/prompt.md 2>/dev/null || true

# ── Git config for agent user ───────────────────────────────────────────────
su -s /bin/bash agent -c "git config --global user.name '$GIT_NAME' && git config --global user.email '$GIT_EMAIL'"

# ── Write launch script ────────────────────────────────────────────────────
# Using a script avoids tmux send-keys quoting issues with prompt content.
case "$AGENT_RUNTIME" in
  claude-code)
    cat > /tmp/launch-agent.sh <<'LAUNCH'
#!/usr/bin/env bash
if [ -f /tmp/prompt.md ]; then
  exec claude --dangerously-skip-permissions --model "$MODEL" --prompt-file /tmp/prompt.md
else
  exec claude --dangerously-skip-permissions --model "$MODEL"
fi
LAUNCH
    ;;
  codex)
    cat > /tmp/launch-agent.sh <<'LAUNCH'
#!/usr/bin/env bash
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

# ── Start tmux + agent as non-root user ─────────────────────────────────────
# Claude Code refuses --dangerously-skip-permissions when running as root,
# so we drop to the 'agent' user for the actual session.
su -s /bin/bash agent -c "
  cd '$WORK_DIR' 2>/dev/null || true
  tmux new-session -d -s agent
  tmux send-keys -t agent '/tmp/launch-agent.sh' Enter
"

# ── Keep container alive ───────────────────────────────────────────────────
exec tail -f /dev/null
