# A1 Engineer — Architecture

## Overview

A1 Engineer is a containerized platform for orchestrating teams of AI coding agents. Each team runs in full isolation: its own IRC server, its own codebase volumes, its own ephemeral agent containers. A central **Manager** container owns the lifecycle of all teams and exposes a public API for control and observation.

The system is agent-runtime agnostic (Claude Code, Codex, or any CLI-based agent) and follows a bring-your-own-keys model.

---

## System Diagram

```
                         ┌──────────────────┐
                         │   Public API      │
                         │  REST + WebSocket │
                         └────────┬─────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │      MANAGER CONTAINER      │
                    │                             │
                    │  - Docker socket mounted     │
                    │  - Team lifecycle (CRUD)     │
                    │  - Dynamic config store      │
                    │  - IRC gateway (per-team)    │
                    │  - Heartbeat collector       │
                    │  - Nudge dispatcher          │
                    │  - Resource provisioner      │
                    └──┬──────────────┬───────────┘
                       │              │
          docker compose up     docker compose up
                       │              │
          ┌────────────▼───┐   ┌──────▼────────────┐
          │  TEAM STACK A  │   │  TEAM STACK B      │
          │  (network: a)  │   │  (network: b)      │
          │                │   │                     │
          │  ergo-a :6667  │   │  ergo-b :6667       │
          │                │   │                     │
          │  git-a (vol)   │   │  git-b (vol)        │
          │  ├ repo clone  │   │  ├ repo clone       │
          │  └ worktrees/  │   │  └ worktrees/       │
          │                │   │                     │
          │  agent-a-dev   │   │  agent-b-dev        │
          │  agent-a-arch  │   │  agent-b-lead       │
          │  agent-a-qa    │   │  agent-b-dev-2      │
          │                │   │                     │
          │  tools-a (vol) │   │  tools-b (vol)      │
          │  ├ temp DBs    │   │  ├ temp DBs         │
          │  └ compute     │   │  └ compute          │
          └────────────────┘   └─────────────────────┘
```

---

## Core Principles

1. **Ephemeral agents** — no persistent storage per agent. Worktrees are created from the repo on spawn, destroyed on teardown. Work is preserved only via git push.
2. **Dynamic config** — team configuration is mutable at any time. Add/remove agents, repos, tools, channels while the team is running.
3. **Agent-agnostic** — the platform doesn't care if the agent is Claude Code, Codex, or a custom runtime. It manages containers with a PTY and an entrypoint.
4. **BYOK (bring your own keys)** — each team provides its own API keys. The platform never shares keys across teams.
5. **IRC as the coordination bus** — all inter-agent communication flows through IRC. The platform exposes IRC content via a public API for external consumption.

---

## Components

### 1. Manager Container

The single orchestrator. Runs continuously. Owns the Docker socket.

**Responsibilities:**
- **Team CRUD** — create, update, destroy team stacks via Docker Compose
- **Dynamic config** — store and apply team config changes in real-time (add agents, swap models, connect tools)
- **IRC gateway** — maintains an IRC client connection to each team's Ergo instance, bridges messages to/from the public API
- **Heartbeat collection** — receives heartbeat pings from agent PostToolUse hooks, tracks agent liveness
- **Nudge dispatch** — when an agent goes silent or is mentioned on IRC, sends `docker exec tmux send-keys` to wake it
- **Resource provisioning** — manages shared resources per team: git volumes, temp databases, tool containers
- **Public API** — REST + WebSocket for external consumers (dashboards, integrations, client access)

**Tech stack:**
- Node.js (consistent with existing tooling)
- Docker Engine API (via dockerode or similar)
- SQLite or in-memory store for team state (graduated to Postgres in prod)

### 2. Team Stack (per team)

A Docker Compose project generated and managed by the Manager. Each stack is fully isolated.

**Components per stack:**

#### 2a. Ergo IRC Server (`ergo-{team}`)
- One per team, on isolated Docker network
- Pre-configured channels and history enabled
- Manager connects to it as a privileged client (for the API gateway)
- Agents connect to it via Docker DNS: `IRC_HOST=ergo-{team}`

#### 2b. Git Volume (`git-{team}`)
- Docker volume containing cloned repo(s)
- An init container runs first: clones repos, sets up remotes
- Worktrees are created per-agent at spawn time
- Each agent container bind-mounts only its worktree (read-write) and the bare repo (read-only for git operations)

#### 2c. Agent Containers (`agent-{team}-{role}`)
- One container per agent
- Contains: the agent runtime (Claude Code / Codex / custom), tmux, git, Node.js, the `msg` CLI, language-specific tooling
- Entrypoint: starts tmux, launches the agent runtime with the role prompt
- Environment: `IRC_HOST`, `IRC_ROLE`, API keys (injected as Docker secrets), model config
- PostToolUse hook: calls `irc-poll` (reads IRC) + sends heartbeat to Manager
- No persistent storage — container is disposable

#### 2d. Tool Containers (`tools-{team}-{name}`)
- Optional sidecar containers for team-specific tooling
- Examples: temp Postgres/Redis for testing, build servers, preview environments
- Manager provisions these dynamically based on team config
- Connected to the same team network

#### 2e. Team Network (`net-{team}`)
- Isolated Docker bridge network
- All team containers communicate internally
- No cross-team traffic possible
- Manager container joins all team networks (for IRC gateway + monitoring)

### 3. Agent Container Image

A base Docker image that any agent runtime can use.

```dockerfile
FROM node:22-slim

# System deps
RUN apt-get update && apt-get install -y \
    git tmux curl jq openssh-client \
    && rm -rf /var/lib/apt/lists/*

# IRC tooling (msg CLI, irc-poll)
COPY bin/ /usr/local/bin/
COPY lib/ /usr/local/lib/a1/
RUN npm install -g irc-framework

# Agent runtimes installed per-variant
# claude-code variant: npm install -g @anthropic-ai/claude-code
# codex variant: npm install -g @openai/codex

ENTRYPOINT ["/usr/local/bin/agent-entrypoint.sh"]
```

The entrypoint script:
1. Starts tmux session
2. Configures git identity
3. Writes `.claude/settings.json` (or equivalent) with PostToolUse hooks
4. Launches the agent runtime with the prompt from env/config

### 4. Public API

Exposed by the Manager container. This is how clients, dashboards, and integrations interact.

#### REST Endpoints

```
POST   /teams                    Create a team
GET    /teams                    List teams
GET    /teams/:id                Team status + agent liveness
PATCH  /teams/:id                Update team config (dynamic)
DELETE /teams/:id                Teardown team

POST   /teams/:id/agents         Spawn an agent
DELETE /teams/:id/agents/:agent   Kill an agent

GET    /teams/:id/channels                    List channels
GET    /teams/:id/channels/:channel/messages   Read messages (paginated)
POST   /teams/:id/channels/:channel/messages   Send a message (as human/client)

GET    /teams/:id/heartbeats     Agent liveness data
POST   /teams/:id/nudge/:agent   Force-nudge an agent
```

#### WebSocket

```
WS /teams/:id/stream
```

Real-time stream of:
- IRC messages across all channels
- Agent heartbeats / status changes
- System events (agent spawned, agent died, nudge sent)

This enables:
- **Web dashboards** — live view of team activity
- **Slack/Discord bots** — bridge IRC to external chat
- **CI/CD hooks** — trigger actions on merge events
- **Client participation** — send instructions to #main just like you do in Halloy today

### 5. IRC Routing (Manager as Gateway)

The Manager maintains one IRC client per team, connected to that team's Ergo instance.

```
Client (REST/WS) → Manager API → Manager IRC Client → Ergo-{team} → Agents
Agents → Ergo-{team} → Manager IRC Client → Manager API → Client (WS push)
```

This avoids exposing raw IRC to the internet. The API handles auth, rate limiting, and message formatting. Clients never need an IRC client — they use REST/WebSocket.

For power users who want raw IRC access (e.g., connecting Halloy), the Manager can optionally proxy TCP connections with auth, mapping external ports to team-specific Ergo instances.

### 6. Web UI

A Next.js application served alongside the Manager API. The UI is the primary interface for non-developer users.

**Pages:**

| Route | Purpose |
|-------|---------|
| `/` | Landing page — "Hire your agent team today" hero, product features, pricing, signup CTA |
| `/login` | Email + password login, OAuth (GitHub, Google) |
| `/signup` | Registration with email verification |
| `/dashboard` | Tenant home — list of teams, usage stats, quick actions |
| `/dashboard/teams/new` | Create team wizard — pick repo, configure agents, set API keys |
| `/dashboard/teams/:id` | Team detail — agent status cards, live IRC feed, controls (spawn/kill/nudge) |
| `/dashboard/teams/:id/settings` | Team config — edit agents, repos, channels, API keys |
| `/dashboard/settings` | Tenant settings — profile, billing, API keys |

**Tech stack:**
- **Next.js 15** (App Router) — SSR for landing/auth pages, client components for dashboard
- **React 19** — UI components
- **Tailwind CSS** — styling
- **WebSocket client** — connects to Manager WS for live team streams
- **Auth**: NextAuth.js with credentials + GitHub + Google providers, JWT sessions

**Architecture:**
```
Browser → Next.js (SSR + static) → Manager REST API → Docker/Teams
Browser → WebSocket → Manager WS → IRC Gateway → Ergo → Agents
```

The Next.js app is a thin client over the Manager API. It holds no team state — all state lives in the Manager. Auth state (users, sessions, tenants) lives in PostgreSQL.

**Multi-tenant model:**
- Each signup creates a **tenant** (organization)
- A tenant owns zero or more teams
- API keys are scoped per tenant
- All API endpoints are tenant-scoped: the JWT identifies the tenant, and the API filters accordingly
- No cross-tenant data access — enforced at the query layer

**Data model additions (PostgreSQL, Phase 2):**
```
Tenant
├── id, name, created_at
├── plan (free | pro | enterprise)
├── users[]
│   ├── id, email, password_hash, oauth_provider
│   ├── role (owner | admin | member)
│   └── last_login
├── api_keys[]
│   ├── key_hash, label, created_at, last_used
│   └── permissions (scopes)
└── teams[] (references team IDs in Manager store)

Session
├── token, user_id, tenant_id
├── created_at, expires_at
```

---

## Dynamic Configuration

Team config is not a static file — it's mutable state managed by the Manager.

### What can change at runtime:

| Property | How it applies |
|---|---|
| Add/remove agent | Manager spawns/kills a container |
| Change agent model/effort | Manager kills + respawns the agent container with new env |
| Add/remove repo | Manager runs git clone in the git volume, creates worktrees |
| Add/remove tool container | Manager adds/removes sidecar from the compose stack |
| Change channels | Manager updates Ergo config, notifies agents |
| Rotate API keys | Manager updates Docker secrets, restarts affected containers |
| Change agent prompt | Manager kills + respawns with new prompt |

### Config state model (in Manager):

```
Team
├── id, name, created_at
├── status: running | paused | teardown
├── repos[]
│   ├── url, branch, credentials
│   └── volume_id
├── agents[]
│   ├── id, role, runtime (claude-code | codex | custom)
│   ├── model, effort, prompt
│   ├── container_id, status, last_heartbeat
│   └── worktree_path
├── tools[]
│   ├── type (postgres | redis | preview | custom)
│   ├── container_id, config
│   └── volume_id (if persistent)
├── channels[]
├── api_keys (encrypted, per-runtime)
└── network_id
```

---

## Agent Lifecycle

```
spawn request (via API or CLI)
  │
  ▼
Manager: pick city name, create branch
  │
  ▼
Manager: docker exec git-{team} -- git worktree add /worktrees/{city} {branch}
  │
  ▼
Manager: docker run agent-{team}-{city}-{role}
         --network net-{team}
         --mount worktree:/workspace
         --env IRC_HOST=ergo-{team}
         --env IRC_ROLE={role}
         --env ANTHROPIC_API_KEY=***  (or OPENAI_API_KEY for Codex)
         --env AGENT_PROMPT="..."
         --env HEARTBEAT_URL=http://manager:8080/heartbeat/{team}/{agent}
  │
  ▼
Container entrypoint:
  1. tmux new-session -d -s agent
  2. Configure .claude/settings.json (PostToolUse hook)
  3. tmux send-keys "claude --model $MODEL ..." Enter
  │
  ▼
Agent runs, reads IRC, does work, pushes to git
  │
  ▼
PostToolUse hook fires:
  - irc-poll (read messages, surface to agent)
  - curl $HEARTBEAT_URL (report alive to Manager)
  │
  ▼
Teardown (via API, or team destroy):
  Manager: docker rm -f agent-{team}-{city}-{role}
  Manager: docker exec git-{team} -- git worktree remove /worktrees/{city}
  (no data preserved — work was pushed to git)
```

---

## Security

| Concern | Mitigation |
|---|---|
| Cross-team code | Separate Docker volumes, separate networks |
| Cross-team IRC | Isolated Ergo instances on isolated networks |
| API key isolation | Per-team keys as Docker secrets, never shared |
| Docker socket exposure | Manager is the only container with socket access; restricted via Docker API permissions |
| Agent escape | Non-root containers, no `--privileged`, CPU/memory limits, no host mounts |
| Public API auth | API keys or OAuth per client, rate limiting, audit logging |
| Git credentials | Short-lived tokens (GitHub App install tokens), injected as secrets |

---

## Infrastructure Compatibility

### Phase 1: Local Docker (current target)
- Manager + team stacks all on one machine
- `docker compose` per team
- Good for: development, single-user, small scale (1-10 teams)

### Phase 2: Kubernetes
- Manager becomes a K8s operator/controller
- Each team = a namespace
- Each agent = a pod
- Ergo = a service per namespace
- Git volume = PVC
- Tool containers = sidecar pods or StatefulSets
- Horizontal scaling: multiple manager replicas behind a load balancer
- Good for: production, multi-tenant, 100+ teams

The mapping is clean:
| Docker concept | K8s equivalent |
|---|---|
| Team compose project | Namespace |
| Container | Pod |
| Docker network | NetworkPolicy |
| Docker volume | PersistentVolumeClaim |
| Docker secret | K8s Secret |
| `docker exec` nudge | `kubectl exec` nudge |

---

## Project Structure

```
a1engineer/
├── ARCHITECTURE.md          # this file
├── README.md
├── manager/                 # Manager container
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js         # entrypoint — starts API + team watcher
│       ├── api/             # REST + WebSocket handlers
│       │   ├── teams.js
│       │   ├── agents.js
│       │   ├── channels.js
│       │   └── ws.js
│       ├── orchestrator/    # team lifecycle
│       │   ├── compose.js   # generate + run docker-compose per team
│       │   ├── agents.js    # spawn/kill/nudge agents
│       │   └── resources.js # git volumes, tool containers
│       ├── irc/             # IRC gateway
│       │   ├── gateway.js   # per-team IRC client, bridges to API
│       │   └── router.js    # message routing + webhook dispatch
│       ├── watchdog/        # heartbeat + nudge
│       │   ├── collector.js
│       │   └── nudger.js
│       └── store/           # team config state
│           └── teams.js
├── agent/                   # Agent container base image
│   ├── Dockerfile
│   ├── Dockerfile.claude    # Claude Code variant
│   ├── Dockerfile.codex     # Codex variant
│   ├── bin/
│   │   ├── agent-entrypoint.sh
│   │   ├── msg.js
│   │   └── irc-poll.js
│   └── lib/
│       ├── config.js
│       └── connection.js
├── templates/               # compose templates + configs
│   ├── team-compose.yml.ejs # template for per-team docker-compose
│   └── ergo/
│       └── ircd.yaml
├── web/                     # Web UI (Phase 2) — Next.js 15 app
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── app/
│   │   ├── layout.js        # root layout, providers, global styles
│   │   ├── page.js           # landing page — "Hire your agent team today"
│   │   ├── login/
│   │   │   └── page.js       # login (email + OAuth)
│   │   ├── signup/
│   │   │   └── page.js       # signup + tenant provisioning
│   │   └── dashboard/
│   │       ├── layout.js     # authenticated shell, sidebar nav
│   │       ├── page.js       # team list overview
│   │       ├── teams/
│   │       │   ├── new/
│   │       │   │   └── page.js    # create team wizard
│   │       │   └── [id]/
│   │       │       ├── page.js    # team detail — agent status, live IRC
│   │       │       └── settings/
│   │       │           └── page.js
│   │       └── settings/
│   │           └── page.js   # tenant settings, API keys, billing
│   ├── components/           # shared UI components
│   │   ├── Header.js
│   │   ├── Sidebar.js
│   │   ├── TeamCard.js
│   │   ├── AgentStatus.js
│   │   └── IrcFeed.js        # real-time IRC message viewer (WebSocket)
│   └── lib/
│       ├── api.js            # fetch wrapper for Manager REST API
│       ├── auth.js           # NextAuth.js config
│       └── ws.js             # WebSocket client for live feeds
└── cli/                     # optional local CLI wrapper
    └── a1.js                # a1 team create, a1 team list, a1 agent spawn, etc.
```

---

## Build Phases

### Phase 1 — Foundation
- [ ] Project scaffolding (directory structure, package.json files) — **#1**
- [ ] IRC tooling: `msg` CLI and `irc-poll` for agent communication — **#4**
- [ ] Ergo IRC server configuration — **#6**
- [ ] Agent base image + Claude Code variant (Dockerfiles + entrypoint) — **#7**
- [ ] Team compose template (EJS → docker-compose.yml) — **#8**
- [ ] Manager skeleton: spawn/teardown a single team via CLI + heartbeat — **#9**

### Phase 2 — Manager API + UI + Multi-tenant
- [ ] REST API: team CRUD, agent spawn/kill, channel messages — **#13**
- [ ] IRC gateway: Manager connects to each team's Ergo, bridges to API — **#14**
- [ ] WebSocket stream for real-time monitoring — **#15**
- [ ] **Web UI — Landing page** ("Hire your agent team today"), product marketing, signup CTA — **#16**
- [ ] **Web UI — Auth**: login/signup (email + OAuth), session management, JWT tokens — **#17**
- [ ] **Web UI — Dashboard**: team list, create team wizard, agent status, live IRC feed per team — **#18**
- [ ] **Multi-tenant**: per-tenant isolation in the API, tenant-scoped API keys, team ownership — **#19**
- [ ] **Database**: migrate from in-memory store to PostgreSQL for persistent team/tenant state — **#20**

### Phase 3 — Multi-runtime + Tooling
- [ ] Codex agent variant image
- [ ] Tool container provisioning (temp Postgres, Redis, preview servers)
- [ ] BYOK key management (per-team, encrypted at rest)
- [ ] Resource limits (CPU/mem per agent container)

### Phase 4 — Production + Scale
- [ ] K8s operator (translate compose model to namespaces/pods)
- [ ] Billing hooks on the public API
- [ ] Audit logging
- [ ] Multi-node deployment
