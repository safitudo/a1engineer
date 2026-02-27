#!/usr/bin/env bash
# ── Agent Sidecar ───────────────────────────────────────────────────────────
# Runs in the background inside the agent container alongside the tmux session.
# Handles infrastructure concerns that are runtime-agnostic:
#   1. Heartbeat reporting to Manager
#   2. IRC message polling + injection
#   3. Nudge FIFO listener
#
# Env vars (set by compose or entrypoint):
#   HEARTBEAT_URL   — Manager heartbeat endpoint
#   TMUX_SESSION    — tmux session name (default: agent)
#   NUDGE_FIFO      — path to nudge FIFO (default: /tmp/nudge.fifo)
#   HEARTBEAT_INTERVAL — seconds between heartbeats (default: 30)
#   IRC_POLL_INTERVAL  — seconds between IRC polls (default: 10)

set -u

TMUX_SESSION="${TMUX_SESSION:-agent}"
NUDGE_FIFO="${NUDGE_FIFO:-/tmp/nudge.fifo}"
HEARTBEAT_INTERVAL="${HEARTBEAT_INTERVAL:-30}"
IRC_POLL_INTERVAL="${IRC_POLL_INTERVAL:-10}"
TMUX_USER="${TMUX_USER:-agent}"

log() { echo "[sidecar] $(date -u +%H:%M:%S) $*"; }

# ── Wait for tmux session to be ready ────────────────────────────────────────
wait_for_tmux() {
  local tries=0
  while ! su -s /bin/bash "$TMUX_USER" -c "tmux has-session -t $TMUX_SESSION 2>/dev/null"; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      log "ERROR: tmux session '$TMUX_SESSION' never appeared, giving up"
      exit 1
    fi
    sleep 1
  done
  log "tmux session '$TMUX_SESSION' is up"
}

# ── Heartbeat loop ──────────────────────────────────────────────────────────
heartbeat_loop() {
  while true; do
    if [ -n "${HEARTBEAT_URL:-}" ]; then
      curl -sf -X POST "$HEARTBEAT_URL" -o /dev/null 2>/dev/null || true
    fi
    sleep "$HEARTBEAT_INTERVAL"
  done
}

# ── IRC poll loop ───────────────────────────────────────────────────────────
# Runs `msg read` and if there are new messages, injects them via tmux.
irc_poll_loop() {
  # Wait for msg binary and IRC env vars
  if ! command -v msg >/dev/null 2>&1; then
    log "msg not found, IRC polling disabled"
    return
  fi
  if [ -z "${IRC_HOST:-}" ]; then
    log "IRC_HOST not set, IRC polling disabled"
    return
  fi

  # Only poll IRC for --print loop agents. Interactive agents get messages
  # via the PostToolUse irc-poll hook — sidecar polling would race the cursor.
  if [ ! -f /tmp/agent-mode-print ]; then
    log "interactive mode — IRC polling handled by PostToolUse hook, sidecar skipping"
    return
  fi

  log "IRC polling started (every ${IRC_POLL_INTERVAL}s) [print-loop mode]"
  while true; do
    sleep "$IRC_POLL_INTERVAL"
    NEW_MSGS=$(su -s /bin/bash "$TMUX_USER" -c "cd /git/worktrees/${IRC_NICK:-agent} 2>/dev/null; msg read 2>/dev/null" || true)
    if [ -n "$NEW_MSGS" ] && ! echo "$NEW_MSGS" | grep -qi "no new messages"; then
      echo "[IRC] $NEW_MSGS" >> /tmp/agent-inbox.txt
    fi
  done
}

# ── Nudge FIFO listener ────────────────────────────────────────────────────
# Manager writes to this FIFO to nudge/interrupt/directive the agent.
# Protocol: one line per command.
#   nudge [message]     — send message via tmux send-keys
#   interrupt           — send Ctrl+C
#   directive [message] — Ctrl+C then send message
nudge_listener() {
  # Create FIFO if it doesn't exist
  [ -p "$NUDGE_FIFO" ] || mkfifo "$NUDGE_FIFO"
  chmod 666 "$NUDGE_FIFO"
  log "nudge FIFO ready at $NUDGE_FIFO"

  while true; do
    # Reading from FIFO blocks until a writer connects
    while IFS= read -r line; do
      CMD="${line%% *}"
      PAYLOAD="${line#* }"
      [ "$CMD" = "$line" ] && PAYLOAD=""

      case "$CMD" in
        nudge)
          MSG="${PAYLOAD:-continue. check IRC with msg read, then resume your current task.}"
          if [ -f /tmp/agent-mode-print ]; then
            echo "[NUDGE] $MSG" >> /tmp/agent-inbox.txt
          else
            # paste-buffer + raw CR — tmux send-keys doesn't work with Ink TUI
            su -s /bin/bash "$TMUX_USER" -c "
              tmux send-keys -t $TMUX_SESSION C-u
              sleep 0.1
              tmux set-buffer -b _nudge \"$MSG\"
              tmux paste-buffer -b _nudge -t $TMUX_SESSION
              sleep 0.1
              tmux send-keys -t $TMUX_SESSION -H 0d
            " 2>/dev/null || true
          fi
          log "nudged: $MSG"
          ;;
        interrupt)
          su -s /bin/bash "$TMUX_USER" -c "tmux send-keys -t $TMUX_SESSION C-c" 2>/dev/null || true
          log "interrupted"
          ;;
        directive)
          if [ -n "$PAYLOAD" ]; then
            if [ -f /tmp/agent-mode-print ]; then
              echo "[DIRECTIVE] $PAYLOAD" >> /tmp/agent-inbox.txt
            else
              su -s /bin/bash "$TMUX_USER" -c "tmux send-keys -t $TMUX_SESSION C-c" 2>/dev/null || true
              sleep 1
              su -s /bin/bash "$TMUX_USER" -c "
                tmux send-keys -t $TMUX_SESSION C-u
                sleep 0.1
                tmux set-buffer -b _nudge \"$PAYLOAD\"
                tmux paste-buffer -b _nudge -t $TMUX_SESSION
                sleep 0.1
                tmux send-keys -t $TMUX_SESSION -H 0d
              " 2>/dev/null || true
            fi
            log "directive: $PAYLOAD"
          fi
          ;;
        screen)
          # Dump screen to a file for Manager to read
          su -s /bin/bash "$TMUX_USER" -c "tmux capture-pane -t $TMUX_SESSION -p" > /tmp/screen.txt 2>/dev/null || true
          log "screen captured to /tmp/screen.txt"
          ;;
        *)
          log "unknown command: $CMD"
          ;;
      esac
    done < "$NUDGE_FIFO"
  done
}

# ── Main ────────────────────────────────────────────────────────────────────
wait_for_tmux

# Launch all loops in background
heartbeat_loop &
irc_poll_loop &
nudge_listener &

log "all loops started"
wait
