#!/usr/bin/env zsh
set -euo pipefail

ROLES="dev|qa|arch|lead|critic"
INTERVAL=15
STATUS_INTERVAL=30
LAST_STATUS=0
COORDINATOR_ROLES="arch|lead|critic"
COORDINATOR_IDLE_THRESHOLD=300   # 5 min auto-nudge for coordinators
IRC_NUDGE_SCREEN_THRESHOLD=10    # seconds of unchanged screen before IRC-nudge fires
NUDGE_MSG="continue. for idle, keep session running with sleep, echo commands"

# Use temp dir for state (avoids bash 4 associative arrays)
STATE_DIR=$(mktemp -d)
trap "rm -rf $STATE_DIR" EXIT

echo "==> Watchdog started (interval: ${INTERVAL}s)"
echo "    Coordinators (arch/lead/critic): auto-nudge after ${COORDINATOR_IDLE_THRESHOLD}s"
echo "    Dev/QA: IRC-triggered nudge only"
echo "    Watching: *-(${ROLES})"
echo "    Press Ctrl+C to stop"

while true; do
  TARGETS=""

  # Find matching windows in all sessions
  for session in $(tmux list-sessions -F '#{session_name}' 2>/dev/null); do
    WINDOWS=$(tmux list-windows -t "$session" -F '#{window_name}' 2>/dev/null | grep -E -- "-(${ROLES})$" || true)
    if [[ -n "$WINDOWS" ]]; then
      while IFS= read -r win; do
        TARGETS="${TARGETS}${session}:${win}"$'\n'
      done <<< "$WINDOWS"
    fi
  done

  # Find matching standalone sessions
  STANDALONE=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E -- "-(${ROLES})$" || true)
  if [[ -n "$STANDALONE" ]]; then
    TARGETS="${TARGETS}${STANDALONE}"
  fi

  if [[ -n "$TARGETS" ]]; then
    now=$(date +%s)

    # Periodic status report
    if [[ $((now - LAST_STATUS)) -ge $STATUS_INTERVAL ]]; then
      echo ""
      echo "[$(date +%H:%M:%S)] ── Agent Status ──────────────────────"
      while IFS= read -r t; do
        [[ -z "$t" ]] && continue
        safe_t=$(echo "$t" | tr ':/' '__')

        # Determine activity
        last_hash=""
        [[ -f "$STATE_DIR/${safe_t}.hash" ]] && last_hash=$(cat "$STATE_DIR/${safe_t}.hash")
        cur_hash=$(tmux capture-pane -t "$t" -p 2>/dev/null | md5 -q)

        first_stale_t=0
        [[ -f "$STATE_DIR/${safe_t}.first_stale" ]] && first_stale_t=$(cat "$STATE_DIR/${safe_t}.first_stale")

        if [[ "$last_hash" != "$cur_hash" ]] || [[ "$first_stale_t" -eq 0 ]]; then
          indicator="🟢 active"
        else
          idle_secs=$((now - first_stale_t))
          if [[ "$idle_secs" -lt 60 ]]; then
            indicator="🟢 active ${idle_secs}s ago"
          elif [[ "$idle_secs" -lt 300 ]]; then
            indicator="🟡 idle $((idle_secs / 60))m"
          else
            indicator="🔴 stale $((idle_secs / 60))m"
          fi
        fi

        printf "  %-26s %s\n" "$t" "$indicator"
      done <<< "$TARGETS"
      echo "──────────────────────────────────────────────────"
      LAST_STATUS=$now
    fi

    while IFS= read -r target; do
      [[ -z "$target" ]] && continue

      # Extract role from target name (last segment after -)
      role=$(echo "$target" | grep -oE "(dev|qa|arch|lead|critic)$" || true)
      is_coordinator=false
      echo "$role" | grep -qE "^(arch|lead|critic)$" && is_coordinator=true

      # Extract nick: session or window name without session prefix
      # Nick format: {city}-{role} (the window/session name)
      nick=$(echo "$target" | sed 's/.*://')

      # Sanitize target name for use as filename
      safe=$(echo "$target" | tr ':/' '__')
      current=$(tmux capture-pane -t "$target" -p 2>/dev/null | md5 -q)

      last=""
      [[ -f "$STATE_DIR/${safe}.hash" ]] && last=$(cat "$STATE_DIR/${safe}.hash")

      first_stale=0
      [[ -f "$STATE_DIR/${safe}.first_stale" ]] && first_stale=$(cat "$STATE_DIR/${safe}.first_stale")

      if [[ "$last" = "$current" ]]; then
        # Screen unchanged
        if [[ "$first_stale" -eq 0 ]]; then
          first_stale=$now
          echo "$first_stale" > "$STATE_DIR/${safe}.first_stale"
        fi
        stale_elapsed=$((now - first_stale))

        # Check IRC nudge flag (any role)
        nudge_flag="/tmp/.nudge-request-${nick}"
        if [[ -f "$nudge_flag" ]] && [[ "$stale_elapsed" -ge "$IRC_NUDGE_SCREEN_THRESHOLD" ]]; then
          echo "[$(date +%H:%M:%S)] IRC-nudging $target (addressed in IRC, idle ${stale_elapsed}s)"
          tmux send-keys -t "$target" "$NUDGE_MSG" && sleep 0.1 && tmux send-keys -t "$target" C-m
          rm -f "$nudge_flag"
          echo "0" > "$STATE_DIR/${safe}.first_stale"
        # Auto-nudge any idle agent
        elif [[ "$stale_elapsed" -ge "$COORDINATOR_IDLE_THRESHOLD" ]]; then
          echo "[$(date +%H:%M:%S)] Auto-nudging $target (idle ${stale_elapsed}s)"
          tmux send-keys -t "$target" "$NUDGE_MSG" && sleep 0.1 && tmux send-keys -t "$target" C-m
          echo "0" > "$STATE_DIR/${safe}.first_stale"
        fi
      else
        # Screen changed — reset stale timer
        echo "0" > "$STATE_DIR/${safe}.first_stale"
      fi

      echo "$current" > "$STATE_DIR/${safe}.hash"
    done <<< "$TARGETS"
  fi

  sleep "$INTERVAL"
done
