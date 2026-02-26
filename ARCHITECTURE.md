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
└── cli/                     # optional local CLI wrapper
    └── a1.js                # a1 team create, a1 team list, a1 agent spawn, etc.
```

---

## Build Phases

### Phase 1 — Foundation
- [ ] Agent base image (Dockerfile with tmux, git, Node.js, msg CLI)
- [ ] Claude Code agent variant image
- [ ] Team compose template (Ergo + git volume + agents)
- [ ] Manager skeleton: spawn/teardown a single team via CLI
- [ ] `msg` and `irc-poll` working inside containers (IRC_HOST from env)
- [ ] Heartbeat from PostToolUse hook to Manager

### Phase 2 — Manager API + Dynamic Config
- [ ] REST API: team CRUD, agent spawn/kill
- [ ] IRC gateway: Manager connects to each team's Ergo, bridges to API
- [ ] WebSocket stream for real-time monitoring
- [ ] Dynamic config: add/remove agents and tools at runtime
- [ ] Nudge dispatch via `docker exec`

### Phase 3 — Multi-runtime + Tooling
- [ ] Codex agent variant image
- [ ] Tool container provisioning (temp Postgres, Redis, preview servers)
- [ ] BYOK key management (per-team, encrypted at rest)
- [ ] Resource limits (CPU/mem per agent container)

### Phase 4 — Production + Scale
- [ ] K8s operator (translate compose model to namespaces/pods)
- [ ] Auth + billing hooks on the public API
- [ ] Web dashboard
- [ ] Audit logging
- [ ] Multi-node deployment
