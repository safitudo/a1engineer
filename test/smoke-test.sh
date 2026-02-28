#!/usr/bin/env bash
# test/smoke-test.sh — A1 Engineer end-to-end smoke test
#
# Usage:
#   ./test/smoke-test.sh [configs/testapp.json]   # testapp.json = default (CI)
#   ./test/smoke-test.sh configs/hamburg.json      # full test
#
# Dependencies: docker, node, curl, nc
# Exit codes:
#   1 = build failed         (step 1)
#   2 = create-team failed   (step 2)
#   3 = IRC/channels failed  (steps 4, 6)
#   4 = containers failed    (steps 3, 5)
#   5 = destroy-team failed  (steps 7, 8)

set -euo pipefail

CONFIG="${1:-configs/testapp.json}"

# ── Colours ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

PASS="${GREEN}[PASS]${RESET}"
FAIL="${RED}[FAIL]${RESET}"
INFO="${CYAN}[INFO]${RESET}"

pass() { echo -e "${PASS} Step $1 — $2"; }
fail() { echo -e "${FAIL} Step $1 — $2"; exit "$3"; }
info() { echo -e "${INFO} $1"; }
warn() { echo -e "${YELLOW}[WARN]${RESET} $1"; }

# ── Preflight ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$ROOT/$CONFIG" ]]; then
  echo -e "${RED}Config not found: $ROOT/$CONFIG${RESET}"
  exit 1
fi

for cmd in docker node curl nc; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Missing required command: $cmd${RESET}"
    exit 1
  fi
done

# ── Test state ─────────────────────────────────────────────────────────────────
TEAM_ID=""
COMPOSE_FILE=""
MANAGER_PID=""
SMOKE_API_KEY="smoke-test-key-$(date +%s)"
MANAGER_PORT=8080

cleanup() {
  # Tear down containers if still up (handles early-exit / signal cases)
  if [[ -n "$TEAM_ID" ]] && [[ -n "$COMPOSE_FILE" ]] && [[ -f "$COMPOSE_FILE" ]]; then
    # Best-effort API delete so Manager cleans up its state
    curl -s -o /dev/null -X DELETE \
      -H "Authorization: Bearer $SMOKE_API_KEY" \
      "http://localhost:$MANAGER_PORT/api/teams/$TEAM_ID" 2>/dev/null || true
    # Force-down containers regardless (covers Manager-unaware orphans)
    docker compose -f "$COMPOSE_FILE" down --timeout 10 2>/dev/null || true
  fi
  if [[ -n "$MANAGER_PID" ]] && kill -0 "$MANAGER_PID" 2>/dev/null; then
    kill "$MANAGER_PID" 2>/dev/null || true
    wait "$MANAGER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Step 1: make build ─────────────────────────────────────────────────────────
echo
echo -e "${CYAN}═══ Step 1: make build ═══${RESET}"
if make -C "$ROOT" build 2>&1; then
  pass 1 "make build succeeded"
else
  fail 1 "make build failed" 1
fi

# ── Step 2: create-team ───────────────────────────────────────────────────────
echo
echo -e "${CYAN}═══ Step 2: create-team ═══${RESET}"

# Start Manager on port 8080 (default) so agent containers can reach it
info "Starting Manager on port $MANAGER_PORT…"
node "$ROOT/manager/src/index.js" serve --port "$MANAGER_PORT" 2>/dev/null &
MANAGER_PID=$!

# Wait for Manager to be ready (up to 10s) — any HTTP response means it's up
READY=0
for i in $(seq 1 20); do
  if nc -z localhost "$MANAGER_PORT" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 0.5
done
if [[ $READY -eq 0 ]]; then
  warn "Manager did not start in time — using CLI direct mode"
fi

# Create team via Manager API (auth required)
info "Creating team from $CONFIG…"
CREATE_OUT=$(curl -sf \
  -X POST \
  -H "Authorization: Bearer $SMOKE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$ROOT/$CONFIG" \
  "http://localhost:$MANAGER_PORT/api/teams" 2>&1) || true

TEAM_ID=$(echo "$CREATE_OUT" | node -e "
  process.stdin.resume(); let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { const j = JSON.parse(d); process.stdout.write(j.id || ''); }
    catch(e) { process.stdout.write(''); }
  });
" <<< "$CREATE_OUT")

if [[ -z "$TEAM_ID" ]]; then
  fail 2 "create-team returned no team ID. Output: $CREATE_OUT" 2
fi

COMPOSE_FILE="/tmp/a1-teams/$TEAM_ID/docker-compose.yml"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  fail 2 "compose file not found: $COMPOSE_FILE" 2
fi

# Extract team name from compose header
TEAM_NAME=$(head -3 "$COMPOSE_FILE" | grep -oP '(?<=Team: )[^ ]+' || echo "unknown")
pass 2 "team created: $TEAM_ID ($TEAM_NAME)"

# ── Step 3: wait for containers ───────────────────────────────────────────────
echo
echo -e "${CYAN}═══ Step 3: wait for containers (timeout 120s) ═══${RESET}"

TIMEOUT=120
ELAPSED=0
RUNNING=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  # Count services in 'running' state (exclude git-init which is one-shot)
  RUNNING_COUNT=$(docker compose -f "$COMPOSE_FILE" ps --status running --format json 2>/dev/null \
    | node -e "
        process.stdin.resume(); let d='';
        process.stdin.on('data', c => d += c);
        process.stdin.on('end', () => {
          try {
            const lines = d.trim().split('\n').filter(Boolean);
            // docker compose ps --format json outputs one JSON object per line
            const services = lines.map(l => JSON.parse(l));
            console.log(services.length);
          } catch(e) { console.log('0'); }
        });
      " 2>/dev/null || echo 0)

  # We need at least ergo + agents running (git-init is one-shot, may be exited)
  EXPECTED=$(($(grep -c 'image: a1-agent' "$COMPOSE_FILE" || echo 0) + 1))
  if [[ "$RUNNING_COUNT" -ge "$EXPECTED" ]]; then
    RUNNING=1
    break
  fi

  sleep 5
  ELAPSED=$((ELAPSED + 5))
  info "Waiting for containers… ${ELAPSED}s / ${TIMEOUT}s (${RUNNING_COUNT}/${EXPECTED} running)"
done

if [[ $RUNNING -eq 0 ]]; then
  docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || true
  fail 3 "containers did not reach running state within ${TIMEOUT}s" 4
fi
pass 3 "containers running after ${ELAPSED}s"

# ── Step 4: verify Ergo IRC accepting connections ─────────────────────────────
echo
echo -e "${CYAN}═══ Step 4: verify Ergo IRC ═══${RESET}"

# Get Ergo host port from compose file
IRC_HOST_PORT=$(grep -A2 'ports:' "$COMPOSE_FILE" | grep -oP '"\K[0-9]+(?=:[0-9]+")' | head -1 || echo "")

if [[ -z "$IRC_HOST_PORT" ]]; then
  warn "No hostPort found in compose — Ergo is internal only, skipping nc check"
  pass 4 "Ergo internal (no hostPort exposed)"
else
  IRC_READY=0
  for i in $(seq 1 12); do
    if nc -z localhost "$IRC_HOST_PORT" 2>/dev/null; then
      IRC_READY=1
      break
    fi
    sleep 2
  done
  if [[ $IRC_READY -eq 0 ]]; then
    fail 4 "Ergo IRC not accepting connections on localhost:$IRC_HOST_PORT" 3
  fi
  pass 4 "Ergo IRC accepting connections on localhost:$IRC_HOST_PORT"
fi

# ── Step 5: verify each agent container healthy ───────────────────────────────
echo
echo -e "${CYAN}═══ Step 5: verify agent containers healthy ═══${RESET}"

AGENT_SERVICES=$(grep -oP '(?<=  agent-)[^ :]+(?=:)' "$COMPOSE_FILE" || true)
if [[ -z "$AGENT_SERVICES" ]]; then
  fail 5 "no agent services found in compose file" 4
fi

ALL_HEALTHY=1
while IFS= read -r svc; do
  STATE=$(docker compose -f "$COMPOSE_FILE" ps "agent-$svc" --format json 2>/dev/null \
    | node -e "
        process.stdin.resume(); let d='';
        process.stdin.on('data', c => d += c);
        process.stdin.on('end', () => {
          try {
            const lines = d.trim().split('\n').filter(Boolean);
            const s = JSON.parse(lines[0]);
            process.stdout.write(s.State || 'unknown');
          } catch(e) { process.stdout.write('unknown'); }
        });
      " 2>/dev/null || echo "unknown")
  if [[ "$STATE" == "running" ]]; then
    info "  agent-$svc: $STATE ✓"
  else
    warn "  agent-$svc: $STATE (expected running)"
    ALL_HEALTHY=0
  fi
done <<< "$AGENT_SERVICES"

if [[ $ALL_HEALTHY -eq 0 ]]; then
  fail 5 "one or more agent containers not running" 4
fi
pass 5 "all agent containers running"

# ── Step 6: POST message to IRC channel via Manager API ───────────────────────
echo
echo -e "${CYAN}═══ Step 6: POST /api/teams/:id/channels/main/messages ═══${RESET}"

MSG_RESP=$(curl -s -o /tmp/smoke-msg-resp.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $SMOKE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"smoke-test ping"}' \
  "http://localhost:$MANAGER_PORT/api/teams/$TEAM_ID/channels/%23main/messages")

if [[ "$MSG_RESP" == "200" ]]; then
  pass 6 "POST /channels/#main/messages → 200"
else
  BODY=$(cat /tmp/smoke-msg-resp.json 2>/dev/null || echo "")
  fail 6 "POST /channels/messages returned $MSG_RESP — $BODY" 3
fi

# ── Step 7: destroy-team ──────────────────────────────────────────────────────
echo
echo -e "${CYAN}═══ Step 7: destroy-team ═══${RESET}"

DEL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE \
  -H "Authorization: Bearer $SMOKE_API_KEY" \
  "http://localhost:$MANAGER_PORT/api/teams/$TEAM_ID")

if [[ "$DEL_STATUS" == "204" ]]; then
  pass 7 "team destroyed (204)"
else
  fail 7 "DELETE /api/teams/$TEAM_ID returned $DEL_STATUS" 5
fi

# ── Step 8: verify cleanup ────────────────────────────────────────────────────
echo
echo -e "${CYAN}═══ Step 8: verify cleanup ═══${RESET}"

# Wait up to 30s for containers to stop
STOPPED=0
for i in $(seq 1 15); do
  STILL_RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running --format json 2>/dev/null \
    | node -e "
        process.stdin.resume(); let d='';
        process.stdin.on('data', c => d += c);
        process.stdin.on('end', () => {
          try {
            const lines = d.trim().split('\n').filter(Boolean);
            console.log(lines.length);
          } catch(e) { console.log('0'); }
        });
      " 2>/dev/null || echo 0)
  if [[ "$STILL_RUNNING" -eq 0 ]]; then
    STOPPED=1
    break
  fi
  sleep 2
done

if [[ $STOPPED -eq 0 ]]; then
  fail 8 "containers still running after destroy-team" 5
fi

# Verify network removed
NET_NAME="net-$TEAM_NAME"
if docker network ls --format '{{.Name}}' 2>/dev/null | grep -q "^${NET_NAME}$"; then
  fail 8 "Docker network '$NET_NAME' still exists after destroy" 5
fi

pass 8 "containers stopped and network '$NET_NAME' removed"

# ── Summary ────────────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}══════════════════════════════════════${RESET}"
echo -e "${GREEN}  All 8 steps passed — smoke test OK  ${RESET}"
echo -e "${GREEN}══════════════════════════════════════${RESET}"
echo
