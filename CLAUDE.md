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
- **WebSocket Auth** — WS upgrade validates API key via ?token= query param, tenant scoping on subscribe
- **IRC Channel Send** — POST /channels/:name/messages now works (was 501 stub), uses IrcGateway.say()

**Tests**
- 81 unit/integration tests passing
- Test mocks for IRC gateway and router (prevent real TCP connections)

### Architecture Decisions
- **BYOK (Bring Your Own Key)** — Users provide their own API keys, no managed billing
- **Agent-agnostic** — Claude first, but architecture supports adding other providers
- **Multi-tenant isolation** — API key → tenantId mapping, teams scoped to tenant
- **Next.js rewrites DON'T proxy WebSocket** — IrcFeed connects directly to Manager:8080
- **Next.js rewrites DON'T forward custom headers** — Route handler proxy pattern used instead
- **Design tokens** — #0d1117 bg, #161b22 card, #3fb950 accent (GitHub dark theme)

### What's Remaining (Priority Order)

**P0 — Chuck Hotfix (blocks all agent orchestration)**
1. **#61 Team store rehydration** — In-memory team store loses state on Manager restart. Chuck gets 404 for all teams. Fix: write `team-meta.json` at create time, scan `TEAMS_DIR` on startup to rebuild store, add `POST /api/teams/rehydrate` endpoint. Assigned to arch.
2. **Chuck CLI auth header** — `agent/bin/chuck` doesn't send Authorization header. Add `API_KEY` env var to request headers (~2 lines). Bundled with #61.

**P1 — Security (3 blocks from Critic)**
3. **#62 Tenant ID collision** — `apiKey.slice(0,12)` is identical for all Anthropic keys (`sk-ant-api03`). All tenants share same ID. Fix: `crypto.randomUUID()` with separate lookup table.
4. **#63 WS auth bypass** — `upsertTenant()` never returns null, so any `?token=` passes auth. Fix: validate against existing tenants only on WS connect, don't auto-create.
5. **#64 API key in WS URL** — Raw API key in `?token=` query param visible in logs/devtools. Fix: short-lived opaque WS token.

**P2 — Features**
6. **#57 Signup page** — PR #60 submitted, needs rework (duplicates existing files). May be unnecessary in BYOK model (login auto-provisions). Under review.
7. ~~**Channels API gap**~~ — Already implemented. GET /:name/messages works. Confirmed by Critic.
8. **#59 Playwright E2E tests** — Assigned to dev-3. Setup + login/dashboard/wizard flows.
9. **Phase 3 AgentConsole** — Interactive terminal via xterm.js (currently read-only polling)
10. **IRC client URL for users** — Expose Ergo IRC server connection details in UI

### Current Assignments
| Agent | Issue | Task | Status |
|-------|-------|------|--------|
| arch | #61 | Team store rehydration + chuck CLI auth | In progress |
| dev-3 | #59 | Playwright E2E tests | In progress |
| dev-4 | #57 | Signup page (PR #60 needs rework) | Rework needed |
| dev-5 | — | Available (reassigned from #58, done) | Available |
| critic-7 | — | Reviewing PRs, filed 3 security blocks | Reviewing |
| qa-6 | — | Testing PRs, monitoring | Monitoring |

### Known Issues
- `chuck screen/nudge/directive` return EXEC_ERROR — root cause: in-memory team store loses state on Manager restart (NOT docker socket issue). Fix in progress (#61)
- Tenant ID collision makes multi-tenancy broken for Anthropic keys (#62)
- WebSocket auth is effectively unauthenticated (#63)
- API keys leaked in WebSocket URLs (#64)
- GitHub token expiration blocked pushes mid-sprint (resolved by Stanislav)
