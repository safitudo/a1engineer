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

## Sprint Progress (2026-02-27)

### What's Been Built & Merged to Main

**Web UI (Next.js — `web/`)**
- **Dashboard** (`web/app/dashboard/page.js`) — Team cards grid, dark theme (#0d1117 bg, #3fb950 accent)
- **Create Team Wizard** (`web/app/dashboard/teams/new/page.js`) — 5-step form: team name+repo, runtime select, agents, API key, review+launch
- **Sidebar Layout** (`web/app/dashboard/layout.js`) — Navigation layout wrapping dashboard pages
- **IrcFeed Component** (`web/components/IrcFeed.js`) — WebSocket IRC feed, connects directly to Manager:8080/ws (not through Next.js proxy). MAX_MESSAGES=500
- **Team Detail Page** (`web/app/dashboard/teams/[id]/page.js`) — Uses IrcFeed component, correct WS URL
- **AgentConsole Component** (`web/components/AgentConsole.js`) — Phase 2 read-only. Polls GET /api/teams/:id/agents/:agentId/screen every 2s. Click agent card to expand/collapse console output
- **Login Page** (`web/app/login/page.js`) — Paste API key → set httpOnly cookie → redirect to dashboard
- **Route Handler Proxy** (`web/app/api/[...path]/route.js`) — Replaces Next.js rewrites. Reads cookie, injects Authorization: Bearer header, forwards to Manager
- **Edge Middleware** (`web/middleware.js`) — Redirects unauthenticated /dashboard/* requests to /login

**Manager API (Express — `manager/`)**
- **IRC Gateway Lifecycle** (`manager/src/index.js`) — createGateway/destroyGateway wired into team start/stop
- **TEAMS_DIR Constant** (`manager/src/constants.js`) — Extracted from 4 duplicated locations
- **Tenant Auth Middleware** (`manager/src/middleware/auth.js`) — Bearer token auth on all /api/teams routes, BYOK auto-provisioning via upsertTenant, heartbeat endpoint exempt
- **Tenant Store** (`manager/src/store/tenants.js`) — In-memory Map, same pattern as teams.js
- **Auth Endpoints** (`manager/src/api/auth.js`) — POST /api/auth/login validates Bearer token
- **WebSocket Auth** — First-message auth protocol (token in WS frame, not URL). findByApiKey rejects unknown keys
- **IRC Channel Send** — POST /channels/:name/messages now works (was 501 stub), uses IrcGateway.say()
- **Team Store Rehydration** — Writes team-meta.json on create, scans TEAMS_DIR on startup to rebuild store. POST /api/teams/rehydrate endpoint
- **Signup Flow** — POST /api/auth/signup with randomUUID tenant + hashed key storage
- **Playwright E2E Tests** — Login, dashboard, wizard flows (web/e2e/)

**Tests**
- 98 unit/integration tests passing (7 test files)
- Test mocks for IRC gateway and router (prevent real TCP connections)
- WS auth handshake coverage (auth/UNAUTHENTICATED/MISSING_TOKEN paths)

### Architecture Decisions
- **BYOK (Bring Your Own Key)** — Users provide their own API keys, no managed billing
- **Agent-agnostic** — Claude first, but architecture supports adding other providers
- **Multi-tenant isolation** — API key → tenantId mapping, teams scoped to tenant
- **Next.js rewrites DON'T proxy WebSocket** — IrcFeed connects directly to Manager:8080
- **Next.js rewrites DON'T forward custom headers** — Route handler proxy pattern used instead
- **Design tokens** — #0d1117 bg, #161b22 card, #3fb950 accent (GitHub dark theme)

### What's Remaining (Priority Order)

**P0 — DONE** ~~#61 Team store rehydration~~ — Merged. team-meta.json written on create, TEAMS_DIR scanned on startup.
**P1 — DONE** ~~#62 Tenant ID collision~~ — Fixed via sha256(fullApiKey). ~~#63 WS auth bypass~~ — Fixed: findByApiKey rejects unknown keys. ~~#64 API key in WS URL~~ — Fixed: first-message auth protocol.

**P2 — In Progress**
1. **Phase 3 AgentConsole Backend** — WS handlers: console.attach/input/detach/resize via existing /ws. Assigned to dev-4.
2. **Phase 3 AgentConsole Frontend** — xterm.js replacing polling AgentConsole. Assigned to dev-3. Depends on backend.
3. **IRC client URL for users** — Expose Ergo connection details in team detail UI. Assigned to dev-5.
4. **PR #50 PostgreSQL store** — Blocked: tests need async update. Parked.

### Current Assignments
| Agent | Issue | Task | Status |
|-------|-------|------|--------|
| arch | — | Architecture, reviewing | Available |
| dev-3 | — | AgentConsole Phase 3 Frontend (xterm.js) | Assigned |
| dev-4 | — | AgentConsole Phase 3 Backend (WS handlers) | Assigned |
| dev-5 | — | IRC connection details in UI | Assigned |
| critic-7 | — | Reviewing PRs | Monitoring |
| qa-6 | — | Testing, monitoring | Monitoring |

### Known Issues
- GitHub token expiration blocked pushes mid-sprint (resolved by Stanislav)
- PR #50 (PostgreSQL) blocked — tests use sync API but store is async
