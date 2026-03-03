# A1 Engineer v2 — Architecture

## Vision

A general-purpose platform for orchestrating AI agents. **Agent-first**: users create agents, give them tasks, and connect them to communication channels. Teams are an organizational layer that emerges when users need coordination — not a prerequisite.

Agents are **stateful** — they persist in the team structure until the user deletes them. Two modes: **persistent** (running, stays alive) or **ghost** (defined but idle, launched on demand). Chuck can additionally spin up **ephemeral (feature for later - off by default)** agents for one-off tasks that self-destruct on completion. Work is preserved via artifacts (git commits, git issues, file outputs, API calls).

The platform is **provider-agnostic** (Claude, OpenAI, Aider, any CLI agent), **tool-agnostic** (GitHub, MCP servers — all installable plugins), and **purpose-agnostic** (coding, research, ops, sales, marketing, content — not just software engineering).

---

## What We Learned (v1 → v2)

### Keep — proven patterns
- **Docker isolation** — per-agent containers. Clean, portable, secure
- **Chuck as watchdog** — screen-checks, nudges, restarts, status updates. The glue that makes agents work
- **PostToolUse hooks for real-time comms** — fires between every tool call, keeping agents responsive to messages in real-time (not just at task boundaries). **This is a core differentiator**
- **IRC as coordination bus** — lightweight, proven, agents communicate naturally
- **`msg` CLI** — simple send/read interface that works across all agent runtimes
- **Heartbeat via hooks** — PostToolUse sends heartbeat, tracks liveness
- **Agent entrypoint pattern** — tmux + launch script + env injection
- **Git worktrees** — each agent gets its own worktree, push is the persistence layer (when GitHub plugin is enabled)

### Change — lessons learned
- **Agent context should be managed, not accumulated** — long-running agents accumulate stale context, hit token limits, need manual compaction. Fresh execution per task is cleaner, but persistent agents can keep their console/context alive between tasks when configured to do so
- **Tasks must be closed-loop** — inject all context upfront (memory, codebase architecture, assignment). Agent shouldn't need to "remember" anything from previous sessions
- **Global memory is a document, not agent state** — like CLAUDE.md, memory is a file injected into each task. Updated by the system after task completion, not by the agent mid-run
- **Communication channels decoupled from teams** — channels are first-class entities. Agents subscribe to channels individually. Cross-team comms via shared channels
- **Auth shouldn't be API-key-only** — standard email/password + confirmation link. API keys as secondary auth for programmatic access
- **Tools are installable plugins** — GitHub, MCP servers are opt-in. Each plugin runs as its own account-level container
- **Provider must be a plugin** — Claude Code, OpenAI Codex, Aider — all first-class. Enables benchmarking, cost optimization, model routing
- **Agent-first UX** — users should be able to launch agents without creating a team. Teams are secondary, organizational
- **Isolation per account** — each account gets its own Account Manager container, so plugins, agents, and comms are fully isolated between tenants

---

## System Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│  WEB UI CONTAINER (Next.js)                                          │
│                                                                       │
│  Agent-first dashboard · Agent launcher · Team grouping (subtle)     │
│  Live feeds · Console · Settings                                     │
└───────────────────────────┬───────────────────────────────────────────┘
                            │ REST + WebSocket
┌───────────────────────────▼───────────────────────────────────────────┐
│  BACKEND CONTAINER (Node.js)                                          │
│                                                                       │
│  Auth (email/JWT/OAuth) · API · WebSocket                            │
│  Agent CRUD · Task CRUD · Plugin registry                            │
│  Team records (logical grouping — not infra boundary)                │
└───────────────────────────┬───────────────────────────────────────────┘
                            │ REST API (per-account routing)
┌───────────────────────────▼───────────────────────────────────────────┐
│  ACCOUNT MANAGER CONTAINER (one per account, N total)                 │
│  (per-account orchestrator — owns Docker socket, REST API)           │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  COMMUNICATION GATEWAY                                          │  │
│  │                                                                  │  │
│  │  ┌───────┐ ┌───────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐   │  │
│  │  │  IRC  │ │ Slack │ │ Telegram │ │ Discord │ │ Webhooks  │   │  │
│  │  └───┬───┘ └───┬───┘ └────┬─────┘ └────┬────┘ └─────┬─────┘   │  │
│  │      └─────────┴──────────┴─────────────┴────────────┘         │  │
│  │                        Channel Router                           │  │
│  │              (subscriptions · history · delivery)                │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  PLUGIN CONTAINERS (account-level)                              │  │
│  │                                                                  │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                      │  │
│  │  │  GitHub Plugin   │  │  MCP Server(s)  │   ← each its own     │  │
│  │  │  Token refresh   │  │  (per server)   │     Docker container  │  │
│  │  │  Worktree mgmt   │  │                  │                      │  │
│  │  │  Auth injection  │  │                  │                      │  │
│  │  └─────────────────┘  └─────────────────┘                      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  AGENT CONTAINERS                                               │  │
│  │                                                                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │  │
│  │  │ Agent A  │ │ Agent B  │ │ Agent C  │ │  CHUCK   │          │  │
│  │  │ ghost    │ │ persist  │ │ persist  │ │ persist  │          │  │
│  │  │ (idle)   │ │ (working)│ │ (idle)   │ │ (24/7)   │          │  │
│  │  │ claude   │ │ claude   │ │ openai   │ │ claude   │          │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │  │
│  │                                                                  │  │
│  │  PostToolUse hooks (between EVERY tool call):                    │  │
│  │    → comm-poll (read subscribed channels via Gateway)            │  │
│  │    → heartbeat (report alive to Account Manager)                 │  │
│  │                                                                  │  │
│  │  + ephemeral agents (spun up by Chuck, self-destruct on done)   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

  TEAMS = database records, not infrastructure.
  A team groups agents for bulk actions, shared config, and shared memory.
  Creating your first agent auto-creates a "default" team.
  Teams surface in the UI only when you need multiple groups.
```

---

## Core Concepts

### 1. Agents — Persistent and Ghost

Agents are Docker containers that **persist in the team structure** until the user deletes them. Both modes are stateful — the agent definition (config, role, subscriptions, plugins) is always saved.

**Agent modes** (set at creation, changeable):

| Mode | Behavior | Example |
|------|----------|--------|
| **Persistent** | Running. Stays alive across tasks. Goes idle between tasks, ready for the next one. | Chuck (24/7), Lead, Architect — coordination roles |
| **Ghost** | Defined but not running. Launched on demand by user, Chuck, or another agent. Container starts when needed, stops when task completes. Agent record stays. | Dev agents — launched per task, stop after, still in the team |

**UI agent launcher** options (both checked by default):
- ☑ **Always ON** — keep running after task completion (if unchecked → ghost, stops after task)
- ☑ **Run now** — launch immediately on creation (if unchecked → created as ghost, idle)
- ☐ **Keep Context** — (for ghost agents) don't kill the container, keep the console/context alive in idle state. New tasks drop into the existing session instead of a fresh one. Useful when you want fast re-engagement without cold start.

**Chuck's ephemeral agents**: Chuck has a special capability — spinning up **ephemeral (stateless) agents** on demand for one-off tasks. These are not created by the user, don't appear in the team roster, and self-destruct on completion. Think of them as Chuck's internal workers.

**Agent-first UX**: Users log in → create an agent or two → connect them to their Slack/IRC → done. No team setup required. Agents are auto-assigned to a "default" team. Teams only surface when users need multiple groups or shared configurations.

**Agent definition**:
```
Agent
├── id, name, role
├── mode (ghost | persistent)
├── keep_context (bool — ghost only: keep container alive between tasks)
├── runtime (claude-code | openai-codex | aider)
├── model, effort
├── team_id (auto-assigned to "default" if not specified)
├── channel_subscriptions[] (which comms channels to listen to)
├── plugins[] (github, mcp servers enabled for this agent)
├── status (ghost | starting | running | idle | stopped | crashed)
├── container_id (null when ghost+!keep_context and stopped)
└── provider_credentials (BYOK, encrypted)
```

**Task context package** (injected at launch):
```
/tmp/task/
├── TASK.md           # The assignment — what to do, acceptance criteria
├── MEMORY.md         # Accumulated project knowledge (like CLAUDE.md)
├── CONTEXT.md        # Relevant code snippets, PR history, related issues
└── constraints.json  # Timeouts, model, effort level, resource limits
```

**Lifecycle**:
```
User creates agent (Always ON + Run now checked by default → persistent, starts immediately)
  │
  ├─ [Run Now] or [Chuck launches] or [Task assigned]
  │
  ├─ Container starts
  │     Context package mounted (TASK.md, MEMORY.md, CONTEXT.md)
  │     Plugin access configured (GitHub creds, MCP endpoints)
  │     Channel subscriptions active
  │
  ├─ Agent works
  │     PostToolUse hook fires between every tool call:
  │       → comm-poll (check subscribed channels via Gateway)
  │       → heartbeat (report alive to Account Manager)
  │
  ├─ Task completes (or fails/times out)
  │
  ├─ If ghost (no Keep Context) → container killed, agent returns to ghost state
  ├─ If ghost (Keep Context) → container stays, console idle, awaits next task drop-in
  └─ If persistent → container stays running, agent goes idle, awaits next task

Chuck ephemeral agent (not user-visible):
  │
  ├─ Chuck spawns for one-off task
  ├─ Container starts, works, completes
  └─ Container + record deleted automatically
```

**Key property**: If an agent crashes or gets stuck, Chuck (or the Account Manager) kills and respawns it with the same context. No state lost — work is in artifacts. The agent record always persists.

### 2. Chuck — The Watchdog (Fallback Orchestrator)

Chuck is the **default always-on agent** per team. Its primary job is **monitoring and intervention** — keeping other agents healthy and productive.

Chuck is **not** the sole brain. In a coding team, the Tech Lead manages the task queue and the Architect manages memory/context. In a marketing team, a Campaign Manager might do the same. Chuck is the **fallback** — if no other agent handles these duties, Chuck steps in.

**Chuck's primary responsibilities**:
- **Monitors agents** — screen-checks, heartbeats, status
- **Detects failures** — stuck, crashed, error loops, scope creep
- **Restarts/redirects** broken agents
- **Launches ghost agents** when tasks need them
- **Falls back** to task management, status reporting, memory updates when no other agent covers these

**Chuck does NOT own by default**:
- Task queue management (Lead/PM agent does this)
- Memory/context collection (Architect agent does this)
- Status reporting (any agent can report via comms)

These responsibilities **fall to Chuck only when no other agent is configured for them**.

**Chuck's provider settings are part of onboarding** — when a user creates their account and first team, Chuck's runtime/model/credentials are configured as part of the setup flow.

**Chuck's tools**:
```
chuck spawn <agent-id>               # Launch a ghost agent
chuck kill <agent-id>                # Tear down an agent
chuck screen <agent-id>              # See what agent is doing
chuck nudge <agent-id> [message]     # Send message to agent's prompt
chuck directive <agent-id> <msg>     # Interrupt + redirect
chuck exec <agent-id> <command>      # Run command in agent container
chuck status                         # Overview of all agents
```

`msg` CLI is the universal interface to the Communication Gateway — Chuck and all agents use it. `msg send` posts through the Gateway API, `msg read` (via `comm-poll` hook) pulls from it. The `msg` tool is essentially a thin client for the Gateway.

### 3. Communication Gateway (Account-Level Daemon)

Communication is **completely decoupled** from teams and agents. A dedicated **Communication Gateway** runs as an account-level daemon — always up, routing messages between agents and external channels.

```
┌─────────────────────────────────────────────────────────┐
│                 COMMUNICATION GATEWAY                    │
│                 (account-level, 24/7)                    │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │   IRC    │ │  Slack   │ │ Telegram │ │ Discord  │  │
│  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │  │
│  │ (Ergo)   │ │ (Bot)    │ │ (Bot)    │ │ (Bot)    │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       └─────────────┴────────────┴─────────────┘        │
│                         │                                │
│              ┌──────────▼──────────┐                    │
│              │   Channel Router    │                    │
│              │                     │                    │
│              │  channel → adapter  │                    │
│              │  agent → channels[] │                    │
│              │  history store      │                    │
│              │  delivery queue     │                    │
│              └─────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

**Key design**:
- **Adapter pattern** — each communication platform (IRC, Slack, Telegram, Discord, webhooks) is an adapter plugin. Adding a new platform = writing a new adapter, no core changes.
- **Agents subscribe to channels** — not teams. Any agent can be on any channel, regardless of team.
- **Channel registry** — channels are created, configured, and managed independently. An agent subscribes by ID.
- **Message routing** — gateway receives messages from adapters, routes to subscribed agents. Agent responses route back through the gateway to the right adapter.
- **History persistence** — all messages stored, queryable. Agents can read history on spawn (injected into context).
- **PostToolUse integration** — the `comm-poll` hook (successor to `irc-poll`) calls the gateway API to check for new messages on the agent's subscribed channels. This fires between every tool call, keeping agents responsive in real-time.

**Agent ↔ Gateway flow**:
```
Agent PostToolUse fires
  → comm-poll calls Gateway API: GET /messages?agent={id}&since={cursor}
  → Gateway returns new messages from subscribed channels
  → comm-poll outputs JSON via hookSpecificOutput.additionalContext
  → Agent sees messages, can respond inline

Agent sends message:
  → msg send '#channel' "text"
  → msg CLI calls Gateway API: POST /messages {channel, text, sender}
  → Gateway routes to correct adapter (IRC → Ergo, Slack → Bot API, etc.)
```

### 4. Plugins (Account-Level Containers)

Plugins are **account-level Docker containers** that provide capabilities to agents. Each plugin is a compiled Docker image that runs independently.

```
Plugin
├── id, name, type (github | mcp)
├── image (Docker image)
├── config (credentials, schedules, endpoints)
└── status (running | stopped)
```

**Plugin types**:

**GitHub Plugin** (own container):
- Token refresh cron (every 45 min) — generates fresh GitHub App installation tokens
- Injects credentials into agent containers that have GitHub enabled
- Manages git worktree lifecycle — creates worktrees on agent launch, cleans up on teardown
- Provides PR/Issue API access
- Runs its own Docker image with the GitHub App private key

**MCP Plugin** (own container per server):
- Each MCP server runs as its own container
- Agents connect as MCP clients (stdio or HTTP, depending on server)
- Account Manager provisions MCP containers when enabled
- Standard MCP protocol — any conformant server works

**How plugins interact with agents**: Plugin containers execute commands inside agent containers (via Docker API) to inject credentials, configure tools, etc. The Account Manager mediates this access.

### 5. Provider-Agnostic Agent Runtime

Runtime is a plugin — the platform doesn't care what agent runs inside a container:

```
AgentRuntime
├── id (claude-code | openai-codex | aider)
├── image (Docker image with the runtime installed)
├── entrypoint (how to launch with a prompt)
├── auth (what credentials it needs)
├── hooks (PostToolUse hook mechanism — varies by runtime)
└── capabilities (interactive-tui | print-loop | mcp-client)
```

**Supported runtimes** (each is a Dockerfile layer on the base agent image):
- `claude-code` — Claude Code CLI, interactive TUI or --print mode
- `openai-codex` — OpenAI Codex CLI
- `aider` — Aider CLI (supports many models)

**Benchmarking**: Same task, different runtimes. Spawn N agents with identical context packages but different runtimes. Compare: time to completion, quality (test pass rate, review score), cost (tokens used), failures. Built into the task system.

### 6. Memory System

Memory is a **document**, not agent state. Maintained by the system and injected into each task.

**Layers**:
```
MEMORY.md (per-team, persistent)
├── Project overview, architecture decisions
├── Codebase conventions, patterns
├── Known issues, workarounds
├── Sprint state, what's been done
└── Agent-discovered knowledge (appended after each task)

CONTEXT.md (per-task, assembled at spawn)
├── Relevant file contents / diffs
├── Related PR/issue history
├── Previous attempts at this task (if retry)
└── Dependencies and blockers
```

After a task completes, the responsible agent (Lead, Architect, or Chuck as fallback) extracts key learnings and appends them to MEMORY.md. This is how the team accumulates knowledge without any agent needing persistent memory.

### 7. Task System

Tasks are the unit of work. They are **closed-loop**: everything the agent needs is in the context package.

```
Task
├── id, title, description
├── acceptance_criteria[]
├── context_files[]
├── plugins_required[] (github, mcp servers, etc.)
├── constraints
│   ├── timeout (max runtime)
│   ├── runtime (claude-code | openai-codex | ...)
│   ├── model, effort
│   └── max_cost (token budget)
├── status (queued | assigned | running | done | failed)
├── assigned_to (agent ID)
├── artifacts[] (git commits, files, PR URLs)
└── parent_task_id (for subtask decomposition)
```

**Task lifecycle**:
1. Created (by human via UI/comms, or by an agent decomposing a larger task)
2. Queued (waiting for an available agent)
3. Assigned (Lead/Chuck picks it up, assembles context, launches ghost agent)
4. Running (agent is working on it)
5. Done / Failed (agent completes or times out; artifacts collected)

Tasks can have subtasks — agents can decompose large tasks into smaller ones and run them in parallel.

---

## Authentication

Standard web auth — not tied to a single API key.

- **Email + password** registration with email confirmation link
- **OAuth** (GitHub, Google) as secondary providers
- **JWT sessions** for web UI
- **API keys** for programmatic access (generated in settings, scoped per tenant)
- **Per-agent provider keys** — BYOK, stored encrypted, injected as Docker secrets
- **Chuck provider setup** is part of onboarding flow

---

## What to Reuse from v1

| Component | Reuse? | Notes |
|-----------|--------|-------|
| IRC (Ergo + msg CLI) | **Yes** | Becomes an adapter in the Communication Gateway |
| PostToolUse hooks (irc-poll + heartbeat) | **Yes** | Core differentiator. `irc-poll` evolves to `comm-poll` (reads from gateway) |
| Chuck prompt + tools | **Yes** | Expand: agent launching, fallback orchestration |
| Agent entrypoint pattern | **Yes** | tmux + launch script + env injection — proven |
| Git worktree pattern | **Module** | Moves into GitHub Plugin container. Only active when GitHub plugin enabled |
| Token refresh watchdog | **Module** | Moves into GitHub Plugin container (cron every 45 min) |
| Agent base image | **Evolve** | Add MCP client support, multi-runtime layers |
| Auth middleware | **Rewrite** | Email/pass + JWT + confirmation link |
| Channel management | **Rewrite** | Becomes the Communication Gateway daemon |
| Web UI (Next.js) | **Rewrite** | Agent-first dashboard, teams subtle/secondary |
| Manager REST+WS API | **Rewrite** | Splits into Backend (API/auth) + Account Manager (orchestration, REST API) |
| Docker compose per team | **Rethink** | Agents launch independently. Teams are logical grouping, not compose boundary |
| Team config schema | **Redesign** | Agent-first config, plugin declarations, channel subscriptions |
| Template system | **Keep** | Team templates still useful (lower priority), plus task templates |

---

## Infrastructure

### Phase 1: Local Docker (target)
- Backend + 1 Account Manager + gateway + plugin containers on one machine
- Agents as individual Docker containers (not compose-per-team)
- PostgreSQL for state (no SQLite — go straight to PG for consistency dev↔prod)
- Suitable for development and single-user

### Phase 2: Production
- All components containerized, PostgreSQL
- Multi-node via Docker Swarm or K8s
- N Account Manager containers (one per account, isolated)
- Backend horizontally scaled behind LB
- Each agent = pod, gateway = service per account, plugins = services per account

| Docker | K8s |
|--------|-----|
| Backend container | Deployment + Service |
| Account Manager container | Pod (per account) |
| Agent container | Pod |
| Gateway container | Service (per account) |
| Plugin container | Service (per account) |
| Network | NetworkPolicy |
| Volume | PVC |
| Secret | K8s Secret |
| `docker exec` | `kubectl exec` |

---

## Project Structure

```
a1engineer/
├── ARCHITECTURE_v2.md         # This file
├── DESIGN_SPEC_v2.md          # Visual design spec
│
├── manager/                   # Manager service (API + orchestration)
│   ├── Dockerfile
│   └── src/
│       ├── index.js
│       ├── api/
│       │   ├── agents.js      # Agent CRUD, launch, kill
│       │   ├── teams.js       # Team management (secondary)
│       │   ├── tasks.js       # Task CRUD
│       │   ├── plugins.js     # Plugin registry
│       │   ├── auth.js        # Email/pass + JWT + OAuth
│       │   └── ws.js          # WebSocket (agent status, live feed)
│       ├── orchestrator/
│       │   └── account-mgr.js # REST client to Account Manager API
│       ├── store/
│       │   ├── db.js          # PostgreSQL connection
│       │   ├── agents.js
│       │   ├── teams.js
│       │   ├── tasks.js
│       │   ├── tenants.js
│       │   └── plugins.js
│       └── watchdog/
│           └── nudger.js      # Heartbeat monitoring, auto-nudge
│
├── gateway/                   # Communication Gateway (account-level daemon)
│   ├── Dockerfile
│   └── src/
│       ├── index.js
│       ├── adapters/
│       │   ├── irc.js         # Ergo IRC adapter
│       │   ├── slack.js       # Slack Bot adapter
│       │   ├── telegram.js    # Telegram Bot adapter
│       │   └── discord.js     # Discord Bot adapter
│       ├── router.js          # Channel → adapter routing
│       ├── channels.js        # Channel registry + subscription mgmt
│       ├── history.js         # Message persistence
│       └── api.js             # REST API for agent comm-poll + msg send
│
├── plugins/                   # Plugin container images
│   ├── github/
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── token-refresh.js   # Cron: refresh GitHub App tokens
│   │       ├── worktree.js        # Git worktree lifecycle
│   │       └── inject.js          # Push creds into agent containers
│   └── mcp/
│       └── README.md              # Standard MCP servers — no custom code
│
├── agent/                     # Agent container images
│   ├── Dockerfile             # Base image (tmux, git, msg CLI, hooks)
│   ├── Dockerfile.claude      # + Claude Code
│   ├── Dockerfile.codex       # + OpenAI Codex
│   ├── Dockerfile.aider       # + Aider
│   └── bin/
│       ├── agent-entrypoint.sh
│       ├── msg.js             # Gateway client (send + read via Gateway API)
│       ├── comm-poll.js       # PostToolUse hook → Gateway API (via msg)
│       ├── heartbeat.js       # PostToolUse hook → Account Manager API
│       └── launch-agent.sh    # Runtime-specific launcher
│
├── chuck/                     # Chuck agent config + tools
│   ├── prompt.md
│   └── bin/
│       └── chuck.js           # CLI: spawn, kill, screen, nudge, status
│
├── web/                       # Next.js UI (rewrite)
│   ├── app/
│   │   ├── page.js            # Landing
│   │   ├── login/
│   │   ├── signup/
│   │   └── dashboard/
│   │       ├── page.js        # Agent-first view (grouped by team, subtle)
│   │       ├── agents/
│   │       │   ├── new/       # Agent launcher (Always ON, Run now, Keep Context)
│   │       │   └── [id]/      # Agent detail, console, logs
│   │       ├── teams/         # Team management (secondary nav)
│   │       ├── plugins/       # Plugin management
│   │       ├── channels/      # Communication channel management
│   │       └── settings/      # Account, billing, API keys
│   └── components/
│
├── templates/                 # Ergo config, team templates (lower priority)
│   └── ergo/
│       └── ircd.yaml
│
└── configs/                   # Example configs
    └── example-agent.json
```
