# A1 Engineer — Test Utilities

This directory contains end-to-end and smoke-test tooling for the A1 Engineer
platform.

---

## `smoke-test.sh` — Fast smoke test (CI-safe)

An 8-step bash script that validates the full team lifecycle without requiring
a real Anthropic API key (steps 1–5, 7–8) or a live agent response (step 6b is
skipped when `ANTHROPIC_API_KEY` is absent).

```
./test/smoke-test.sh [configs/testapp.json]
```

**Default config:** `configs/testapp.json`

### Steps

| # | What | Failure exit |
|---|------|-------------|
| 1 | `make build` | 1 |
| 2 | POST /api/teams — create team | 2 |
| 3 | Containers reach running state (120 s) | 4 |
| 4 | Ergo IRC accepts connections | 3 |
| 5 | All agent containers are `running` | 4 |
| 6 | POST /channels/main/messages → 200 | 3 |
| 6b | IRC observer gets a reply from agent (60 s) — **skipped without `ANTHROPIC_API_KEY`** | 3 |
| 7 | DELETE /api/teams/:id → 204 | 5 |
| 8 | Containers stopped, Docker network removed | 5 |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All steps passed |
| 1 | `make build` failed |
| 2 | Team creation failed |
| 3 | IRC / messaging step failed |
| 4 | Container health failed |
| 5 | Teardown failed |

### Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Optional | Enables step 6b (agent IRC response check) |

---

## `e2e-agent.mjs` — Level B end-to-end test (real agent + GitHub PR)

A standalone Node ESM script that runs the **full agent task loop**: starts a
real team, sends the agent an actual coding task over IRC, and asserts that a
GitHub pull request appears in `safitudo/a1-test-repo` within 5 minutes.

```
node test/e2e-agent.mjs [configs/testapp.json]
```

**Default config:** `configs/testapp.json`

### Credential loading

The script uses a layered credential resolution strategy so it works in both
local dev (`.env` file) and CI (environment variables) without code changes:

1. **`ANTHROPIC_API_KEY`** — checked in `process.env` first; if absent, loaded
   from `ROOT/.env` (dotenv-style, parsed manually). If neither is present the
   test exits 0 with a graceful skip.
2. **GitHub token** — after team creation, read from
   `/tmp/a1-teams/$TEAM_ID/github_token.txt` (written by the Manager when it
   resolves the GitHub App credentials from `testapp.json`). Falls back to
   `GITHUB_TOKEN` env var. If neither is available after team creation the
   GitHub polling step fails with a descriptive error.
3. **GitHub App creds** — provided via `testapp.json` (`appId`, `installationId`,
   `privateKeyPath`). The Manager resolves these automatically.

### Prerequisites

The script exits 0 (graceful skip) if any prerequisite is absent:

| Prerequisite | Purpose |
|--------------|---------|
| `ANTHROPIC_API_KEY` (env or `ROOT/.env`) | Agent runtime (Claude API) |
| Docker daemon | Must be running and accessible |

> The `GITHUB_TOKEN` env var is no longer required — the Manager resolves a
> token via the GitHub App and writes it to the team directory. The test reads
> it from there.

### Steps

| # | What | Failure exit |
|---|------|-------------|
| 1 | Start Manager on a free port | 1 |
| 2 | POST /api/teams — create team | 1 |
| 3 | Containers reach running state (120 s) | 1 |
| 4 | Ergo IRC accepts connections | 1 |
| 5 | Start IRC observer → send task → agent replies in #main (60 s) | 3 |
| 6 | Poll GitHub for new PR in `safitudo/a1-test-repo` (5 min) | 3 |
| 7 | Close PR via GitHub API | 1 |
| 8 | DELETE /api/teams/:id → 204 | 1 |

### Task sent to agent

```
[e2e-test] Please create a file named `test-e2e-{timestamp}.txt` containing
exactly the text "OK" and open a pull request for it in the repository
(safitudo/a1-test-repo). This is an automated test. PR title should start
with "e2e-test".
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All steps passed (or prerequisites absent — graceful skip) |
| 1 | Setup / config failure |
| 3 | Agent timeout or PR not found within limit |

### Cleanup

On any exit (success or failure) the script:
1. Closes the created PR (if any)
2. Destroys the team via Manager API
3. Force-stops Docker containers
4. Kills the Manager process

---

## `irc-check.mjs` — IRC response verifier

A low-level utility used by both `smoke-test.sh` and `e2e-agent.mjs`. Connects
to an Ergo IRC server as an observer, joins a channel, and waits for a
qualifying `PRIVMSG`. Exits 0 on success, 1 on timeout.

**Must be run from `manager/`** so that `irc-framework` resolves from
`manager/node_modules`:

```bash
cd manager && node ../test/irc-check.mjs <host> <port> <channel> <timeout_ms> [observer_nick] [filter_nick]
```

### Arguments

| Arg | Default | Description |
|-----|---------|-------------|
| `host` | — | IRC server hostname |
| `port` | — | IRC server port |
| `channel` | — | Channel to join (e.g. `#main`) |
| `timeout_ms` | `60000` | How long to wait (ms) |
| `observer_nick` | `smoke-checker` | Nick to use when connecting |
| `filter_nick` | *(none)* | If set, only messages **from this nick** count as a pass |

When `filter_nick` is supplied (typically the agent's UUID from the team
creation API response), spurious messages from other bots or system notices are
ignored. Without it, any `PRIVMSG` from a non-observer nick passes.

### Example

```bash
# Any response in #main passes:
cd manager && node ../test/irc-check.mjs localhost 16667 '#main' 60000 my-observer

# Only a specific agent (UUID) passes:
cd manager && node ../test/irc-check.mjs localhost 16667 '#main' 60000 my-observer abc123-agent-uuid
```
