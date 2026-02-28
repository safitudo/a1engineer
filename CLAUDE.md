# CLAUDE.md — AI Agent Configuration

> **Architecture**: See `ARCHITECTURE.md` for the full system design.

---

## Project

A1 Engineer — containerized orchestration platform for AI coding agent teams. Node.js codebase.

---

## IRC Agent Orchestration

### Channels

| Channel | Purpose |
|---------|---------|
| `#main` | General coordination, status updates, cross-team comms |
| `#tasks` | Task assignments, ACKs, progress updates — single source of truth |
| `#code` | Code discussions, PR links, review requests, approvals |
| `#testing` | Test execution, results reporting |
| `#merges` | Merge queue, approval gates, merge status |

### CLI

```bash
msg send '#channel' "text"    # Send a message
msg read                      # Read new messages from all channels
msg read '#channel'           # Read from a specific channel
```

### GitHub API Token

**Do NOT use `$GITHUB_TOKEN` directly** — it may be stale. Use the `github-token` helper which always returns a fresh token:

```bash
# Correct — always fresh:
curl -H "Authorization: token $(github-token)" https://api.github.com/repos/OWNER/REPO/pulls

# Wrong — may be expired:
curl -H "Authorization: token $GITHUB_TOKEN" ...
```

For `git push/pull`, the credential helper handles token refresh automatically — no action needed.

Your IRC nick is auto-generated from your worktree name + `IRC_ROLE`.
Before doing anything else, check if `IRC_ROLE` is set in your environment:
```bash
echo $IRC_ROLE
```
If it is empty, set it now based on your role:
```bash
export IRC_ROLE=dev       # Developer
export IRC_ROLE=arch      # Architect
export IRC_ROLE=lead      # Tech Lead
export IRC_ROLE=critic    # Critic
export IRC_ROLE=qa        # QA
```
Then verify your nick works: `msg send '#main' "online"`

### Communication Rhythm

You **MUST** run `msg read` regularly — not just at the start of work.
Run `msg read` every few tool calls while working. This is how you stay
in sync with other agents and respond to questions, blocks, or reassignments.
Do not go dark for long stretches. If someone asks you something on IRC,
you should see it within a few minutes and respond.

### Task Management — GitHub Issues

GitHub Issues is the single source of truth for task state.
IRC is for real-time coordination; GitHub Issues is for persistent tracking.

- Tech Lead creates issues, assigns them, and posts `[ASSIGN] @nick — #42 description` on `#tasks`
- When you start work, your PR should reference the issue: `Fixes #42`
- PR merge auto-closes the linked issue
- Use the GitHub MCP server to create, update, list, and close issues
- Every task must have a GitHub Issue before work starts
- Check assigned issues with the MCP tool, not just IRC

### Coordination Protocol

1. `msg read` before starting any work, and every few tool calls during work
2. Tasks are tracked as GitHub Issues and assigned on `#tasks` via `[ASSIGN]`
3. When you receive an assignment, reply `[ACK]` before starting
4. Do not start unassigned work — if you see something needed, ask on `#main`
5. One PR per task. Reference the issue: `Fixes #NN`. Do not expand scope
6. Post `[PR] link` on `#code` when ready for review
7. Wait for review verdict before making changes or starting next task
8. Never merge without QA approval

### Message Tags

| Tag | Usage |
|-----|-------|
| `[ASSIGN] @nick — #NN description` | Task assignment with issue number (Tech Lead / Architect only) |
| `[ACK]` | Acknowledge assignment, starting work |
| `[BLOCK] reason` | Blocking issue — stops merge (Critic / QA) |
| `[PR] link — Fixes #NN` | PR ready for review, linked to issue |
| `[REVIEW] verdict — PR link` | Review result (approved / changes needed) |
| `[DONE] #NN description` | Task completed, issue auto-closed by PR |
| `[STATUS] update` | Progress update |

---

## Sprint Progress (2026-02-28)

### What's Been Built & Merged to Main

**Web UI (Next.js — `web/`)**
- **Dashboard** (`web/app/dashboard/page.js`) — Team cards grid, dark theme (#0d1117 bg, #3fb950 accent)
- **Create Team Wizard** (`web/app/dashboard/teams/new/page.js`) — 5-step form + optional channels input. Channels parsed in launch handler
- **Sidebar Layout** (`web/app/dashboard/layout.js`) — Navigation layout wrapping dashboard pages
- **IrcFeed Component** (`web/components/IrcFeed.js`) — WebSocket IRC feed, connects directly to Manager:8080/ws. MAX_MESSAGES=500
- **Team Detail Page** (`web/app/dashboard/teams/[id]/page.js`) — Uses IrcFeed, AgentConsole, IrcConnectionInfo. Channels from team.channels (configurable)
- **AgentConsole Component** (`web/components/AgentConsole.js`) — Phase 3 interactive terminal via xterm.js + WS console protocol. Uses TeamWSProvider shared context
- **TeamWSProvider** (`web/components/TeamWSProvider.js`) — Shared authenticated WS context for IrcFeed + AgentConsole. Exponential backoff reconnect, opaque token auth
- **Login Page** (`web/app/login/page.js`) — Paste API key → set httpOnly cookie → redirect to dashboard
- **Route Handler Proxy** (`web/app/api/[...path]/route.js`) — Reads cookie, injects Authorization: Bearer header, forwards to Manager
- **Edge Middleware** (`web/middleware.js`) — Redirects unauthenticated /dashboard/* requests to /login

**Manager API (Express — `manager/`)**
- **Configurable Channels** — `DEFAULT_CHANNELS` exported from teams.js as single source of truth. Schema validated in team-config.schema.json. Stored per-team, passed to IRC gateway, exposed via API
- **IRC Gateway** (`manager/src/irc/gateway.js`) — Per-team IRC client with configurable channels, reconnection with exponential backoff
- **IRC Router** (`manager/src/irc/router.js`) — Per-team per-channel ring buffers (500 max), WS broadcast, structured tag parsing
- **Tenant Auth Middleware** (`manager/src/middleware/auth.js`) — Bearer token auth, BYOK auto-provisioning via upsertTenant
- **WebSocket Auth** — First-message auth protocol (opaque token or API key). Single-use 60s TTL tokens with periodic sweep
- **WS Tenant Scoping** — subscribe + console.attach reject cross-tenant access
- **Team Store Rehydration** — team-meta.json on create, TEAMS_DIR scan on startup. Backfills internalToken + channels
- **Signup Flow** — POST /api/auth/signup with randomUUID tenant + hashed key storage

**Tests**
- 340+ unit/integration tests passing (vitest)
- Playwright E2E: login, dashboard, wizard, team-detail, agent-console, template CRUD, auth lifecycle
- E2E agent harness (node:test, separate from vitest)

### Architecture Decisions
- **BYOK (Bring Your Own Key)** — Users provide their own API keys, no managed billing
- **Multi-tenant isolation** — API key to tenantId mapping, teams scoped to tenant
- **Next.js rewrites DO NOT proxy WebSocket** — IrcFeed connects directly to Manager:8080
- **Design tokens** — #0d1117 bg, #161b22 card, #3fb950 accent (GitHub dark theme)
- **SQLite with node:sqlite** — WAL mode, append-only migrations, :memory: test isolation. node:sqlite built-in (Node 22), zero npm deps
- **Gateway abstraction** — IRC is first adapter; channel management decoupled from team lifecycle to enable cross-team comms and future Slack/Discord integration

### Completed Milestones
- **Self-Hosting** (15/15, b21cf15) — PRs #122-#133
- **Custom Template CRUD Frontend** — PR #147
- **E2E Test Expansion** — PRs #141, #142
- **CI Workflow** — PR #149
- **SQLite Phase 1-2 (teams.js)** — PR #150
- **SQLite Phase 3 (tenants.js)** — PR #151

### Roadmap

**M1 — Complete SQLite Migration (current)**
- Phase 4: templates.js — migrate builtinStore + tenantStore Maps to SQLite (dev-4, in progress)
- Phase 5: cleanup — strip keyHash from findByApiKey/upsertTenant return values, remove dead Map imports, final pass
- Deliverable: zero in-memory Maps for persistent state

**M2 — Decouple Communication Channels**
Goal: channels as first-class entities, not team-embedded arrays. IRC first, later Slack/Discord.
- Channel store (SQLite table) with id, type=irc, config, independent of teams
- GatewayRegistry abstraction: Manager -> GatewayRegistry -> [IrcAdapter, SlackAdapter, ...]
- gateway.js: add joinChannel(name) / partChannel(name) for runtime channel mutation
- router.js: re-key buffers from teamId:channel to channelId
- Teams subscribe to channels (many-to-many); cross-team comms via shared gateway

**M3 — Dynamic Agent Add/Remove**
Goal: add/remove agents at runtime without recreating the team.
- compose.js: per-agent docker compose up/down (not all-or-nothing startTeam/stopTeam)
- team-compose.yml.ejs: git-init must run for newly added agents (currently one-shot)
- agents.js API POST: fix git worktree initialization for new agents
- agents.js API DELETE: rewrite compose file + flush team-meta.json on removal

**M4 — Auth + Interactive Mode + Chuck Fix**
- API key auth cannot work with interactive mode — session OAuth tokens required for TUI; document tradeoffs
- Text-mode (print-loop) agents don't show live updates — console.attach captures tmux but input doesn't reach print loop
- Fix nudger.js: replace direct tmux injection with writeFifo() path for mode-aware delivery

### Current Assignments
| Agent | Task | Status |
|-------|------|--------|
| arch | Architecture, roadmap, PR review | Active |
| dev-3 | CLAUDE.md roadmap update | In progress |
| dev-4 | M1 Phase 4 — templates.js SQLite | In progress |
| critic-7 | PR review | Monitoring |
| qa-6 | Testing | Monitoring |

### Known Issues
- nudger.js auto-nudge broken for print-loop (API key) agents — uses direct tmux, bypasses sidecar FIFO
- agents.js DELETE does not rewrite compose or persist meta — partial implementation
- broadcastAgentStatus() in ws.js is dead code — never called
