# A1 Engineer — Test Suite

Three levels of test coverage, each with different requirements.

---

## Level 1 — Unit tests (vitest)

**No Docker, no IRC, no API key required.**

```bash
cd manager
npm test
```

Runs all `*.test.js` files under `manager/src/` via [vitest](https://vitest.dev/).
Covers: auth middleware, team CRUD, compose rendering, IRC router logic, agent launch/stop.

**Required env vars:** none

---

## Level 2 — E2E tests (node:test)

**No Docker required. Tests Manager + IRC routing in-process.**

```bash
cd manager
npm run test:e2e
```

Runs `node --test --experimental-test-module-mocks src/e2e/*.test.js`.
Covers: full HTTP request/response cycles, Manager state transitions, IRC message routing through the real router code.

> **Note:** These tests use Node.js built-in `node:test` runner with module mocks — requires Node >= 22.

**Required env vars:** none

---

## Level 3 — Smoke test (Docker)

**Requires Docker. Starts real containers.**

```bash
bash test/smoke-test.sh [configs/testapp.json]
```

Builds images, starts a real team (Ergo IRC + agent containers), verifies health, posts a message, then tears everything down.

**Steps:**
1. `make build` — build all Docker images
2. Create team via `POST /api/teams`
3. Wait for containers to reach `running` state (timeout 120s)
4. Verify Ergo IRC accepts connections
5. Verify all agent containers are running
6. `POST /api/teams/:id/channels/main/messages` — send a message
7. Destroy team via `DELETE /api/teams/:id`
8. Verify containers stopped and Docker network removed

**Required env vars:** none (Docker must be running)

**Optional:** pass a different config file as `$1` (default: `configs/testapp.json`)

---

## Level 4 — Full agent IRC loop (Docker + Claude API)

**Requires Docker + Anthropic API key. Tests the complete agent → IRC → response loop.**

```bash
ANTHROPIC_API_KEY=sk-ant-... bash test/smoke-test.sh
```

Runs all Level 3 steps, then adds **Step 6b**:

- Sends a `PING` message to `#main` via the Manager API
- Waits up to **60 seconds** for any agent response in `#main`
- Uses `test/irc-check.mjs` as an IRC observer (connects to Ergo, joins `#main`, listens for `PRIVMSG`)
- **PASS** if agent responds within timeout; **FAIL** (exit 3) if no response

Step 6b is **skipped automatically** if:
- `ANTHROPIC_API_KEY` is not set, or
- Ergo does not expose a host port (internal-only networks)

### Required env vars

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for the agent. Required for Step 6b. |

### Isolation guarantee

The smoke test creates a fresh team with a unique ID (`test-irc-<timestamp>`) and tears it down on exit (including `SIGINT`). It will never touch or interfere with any live team containers.

### Running with a custom key in CI

Store `ANTHROPIC_API_KEY` as a GitHub Actions secret, then:

```yaml
- name: Smoke test (full agent loop)
  run: bash test/smoke-test.sh
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## Helper scripts

| Script | Purpose |
|--------|---------|
| `test/smoke-test.sh` | Levels 3 + 4 smoke test (see above) |
| `test/irc-check.mjs` | IRC observer — connects to Ergo, waits for a `PRIVMSG` in a channel. Used by Step 6b. |

### `test/irc-check.mjs` usage

```bash
# Run from manager/ so irc-framework resolves from node_modules
cd manager
node ../test/irc-check.mjs <host> <port> <channel> <timeout_ms> [observer_nick]

# Example
node ../test/irc-check.mjs localhost 16667 '#main' 60000 smoke-checker
```

Exits `0` on response received, `1` on timeout, `2` on bad arguments.
