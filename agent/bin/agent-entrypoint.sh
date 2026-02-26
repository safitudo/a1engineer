#!/usr/bin/env bash
set -e

# 1. Start tmux session
tmux new-session -d -s agent

# 2. Configure git identity
if [ -n "$GIT_NAME" ]; then
  git config --global user.name "$GIT_NAME"
fi
if [ -n "$GIT_EMAIL" ]; then
  git config --global user.email "$GIT_EMAIL"
fi

# 3. Write .claude/settings.json with PostToolUse hook for irc-poll
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

# 4. If $AGENT_PROMPT is set, write it to /tmp/prompt.md
if [ -n "$AGENT_PROMPT" ]; then
  printf '%s' "$AGENT_PROMPT" > /tmp/prompt.md
fi

# 5. Launch agent in tmux based on $AGENT_RUNTIME
AGENT_RUNTIME="${AGENT_RUNTIME:-claude-code}"
MODEL="${MODEL:-claude-sonnet-4-20250514}"

case "$AGENT_RUNTIME" in
  claude-code)
    if [ -f /tmp/prompt.md ]; then
      tmux send-keys -t agent "claude --model $MODEL --prompt-file /tmp/prompt.md" Enter
    else
      tmux send-keys -t agent "claude --model $MODEL" Enter
    fi
    ;;
  codex)
    if [ -f /tmp/prompt.md ]; then
      tmux send-keys -t agent "codex --model $MODEL --instructions \"$(cat /tmp/prompt.md)\"" Enter
    else
      tmux send-keys -t agent "codex --model $MODEL" Enter
    fi
    ;;
  *)
    echo "Unknown AGENT_RUNTIME: $AGENT_RUNTIME" >&2
    exit 1
    ;;
esac

# 6. Keep container alive
exec tail -f /dev/null
