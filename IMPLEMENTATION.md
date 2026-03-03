# A1 Engineer v2 — Implementation Plan

> MVP scope: **IRC + Claude Code (interactive) + session token from local macOS**
> Full architecture: see `ARCHITECTURE_v2.md`

---

## MVP Scope

What we're building first — the minimum to get agents running, communicating, and manageable from a web UI.

| In scope | Out of scope (later) |
|----------|---------------------|
| Claude Code (interactive mode, session token) | OpenAI Codex, Aider runtimes |
| IRC (Ergo) for agent communication | Slack, Telegram, Discord adapters |
| GitHub plugin (worktrees, token refresh) | MCP server plugins |
| Web UI (from Figma export, wired to real API) | OAuth login (GitHub, Google) |
| Email/password auth + JWT | Billing, usage tracking |
| PostgreSQL for state | Task templates, team templates |
| Agent lifecycle (persistent, ghost, Keep Context) | Benchmarking system |
| Chuck as watchdog | Multi-provider benchmarking |
| PostToolUse hooks (comm-poll + heartbeat) | Mobile responsive |

---

## Container Architecture (MVP)

```
┌──────────────────────────────────────────────────────────────────┐
│  HOST MACHINE (your Mac)                                          │
│                                                                    │
│  Claude Max session token extracted from Keychain                 │
│  Docker Desktop running                                           │
│                                                                    │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────────────────┐   │
│  │ Web UI   │ │ Backend      │ │ Account Manager            │   │
│  │ Next.js  │ │ Node.js      │ │ Node.js                    │   │
│  │ :3000    │ │ :4000        │ │ :4100                      │   │
│  │          │→│ REST + WS    │→│ REST API                   │   │
│  │          │ │ Auth, CRUD   │ │ Docker socket mounted      │   │
│  └──────────┘ └──────┬───────┘ │                            │   │
│                       │         │  ┌──────────────────────┐  │   │
│                       │         │  │ Ergo IRC Server      │  │   │
│                       │         │  │ :6667                │  │   │
│                       │         │  └──────────────────────┘  │   │
│                       │         │                            │   │
│                       │         │  ┌──────────────────────┐  │   │
│                       │         │  │ GitHub Plugin        │  │   │
│                       │         │  │ Token refresh cron   │  │   │
│                       │         │  │ Worktree management  │  │   │
│                       │         │  └──────────────────────┘  │   │
│                       │         │                            │   │
│                       │         │  ┌────────┐ ┌────────┐    │   │
│                       │         │  │Agent 1 │ │Agent 2 │... │   │
│                       │         │  │Claude  │ │Claude  │    │   │
│                       │         │  │Code    │ │Code    │    │   │
│                       │         │  └────────┘ └────────┘    │   │
│                       │         └────────────────────────────┘   │
│  ┌──────────────────┐ │                                          │
│  │ PostgreSQL       │←┘                                          │
│  │ :5432            │                                            │
│  └──────────────────┘                                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Session Token Mechanic

Claude Max plan doesn't use API keys — it uses a session cookie. Current v1 already solved this:

### How it works

```
1. User has Claude Code installed locally, logged into Max plan
2. Session credentials stored in macOS Keychain
3. At agent launch time:
   a. Backend calls Account Manager: POST /agents/launch
   b. Account Manager reads session from Keychain (security CLI)
   c. Writes session to /run/secrets/anthropic_session.txt in agent container
   d. Agent entrypoint configures Claude Code to use session auth
4. Claude Code in container runs in interactive mode (tmux session)
5. Session refreshes are handled by Claude Code itself
```

### Keychain extraction (proven in v1)

```bash
# Extract Claude session credentials
security find-generic-password -s "claude.ai" -w 2>/dev/null
# or from Claude Code's own config
cat ~/.claude/.credentials.json
```

### Agent container secret mount

```yaml
# Agent container gets session as a Docker secret
secrets:
  - anthropic_session
environment:
  - AUTH_MODE=session
  - CLAUDE_CONFIG_DIR=/home/agent/.claude
```

### Two auth modes per agent

```
Agent
├── auth_mode: "session" | "api-key"
├── If session → mount host's Claude session into container
└── If api-key → mount ANTHROPIC_API_KEY from encrypted store
```

**MVP**: Session mode only (your Max plan). API key mode is trivial to add later.

---

## Component Implementation Order

### Phase 1: Foundation (Week 1)

```
1. PostgreSQL schema + migrations
   - tenants, agents, teams, tasks, channels, plugins tables
   - Seed: default tenant, default team

2. Backend container (Node.js + Express)
   - POST /auth/register, POST /auth/login (email + JWT)
   - GET/POST/PATCH/DELETE /agents
   - GET/POST /teams
   - GET/POST /tasks
   - WebSocket server (agent status events)

3. Account Manager container
   - REST API: POST /agents/launch, POST /agents/stop, POST /agents/directive
   - Docker socket access (docker run, docker exec, docker kill)
   - Keychain session extraction
   - Health endpoint
```

### Phase 2: Agent Runtime (Week 2)

```
4. Agent base Docker image
   - Ubuntu + tmux + git + Node.js
   - msg CLI (IRC client → Ergo)
   - comm-poll hook (PostToolUse → IRC poll)
   - heartbeat hook (PostToolUse → Account Manager)
   - agent-entrypoint.sh (env setup, secret injection, tmux launch)

5. Claude Code layer (Dockerfile.claude)
   - Claude Code CLI installed
   - Session auth configuration
   - Interactive mode launch in tmux
   - PostToolUse hooks configured in .claude/settings.json

6. Ergo IRC server (inside Account Manager network)
   - Auto-provision channels on agent creation
   - msg CLI registered as client per agent
   - Channel history (CHATHISTORY)
```

### Phase 3: GitHub Plugin (Week 2-3)

```
7. GitHub Plugin container
   - GitHub App authentication (private key)
   - Token refresh cron (every 45 min)
   - Credential injection into agent containers
   - Git worktree lifecycle (create on launch, cleanup on stop)
   - git-credential-manager-token helper (from v1)
```

### Phase 4: Chuck (Week 3)

```
8. Chuck agent
   - Special agent: persistent, always-on, first agent created
   - Prompt from .context/agents/chuck/prompt.md (evolve from v1)
   - Chuck CLI tools: spawn, kill, screen, nudge, directive, status
   - Screen-check loop, heartbeat monitoring
   - Ghost agent launching capability
```

### Phase 5: Web UI (Week 3-4)

```
9. Wire Figma export to real Backend API
   - Replace mock data with API calls (fetch/SWR/React Query)
   - WebSocket connection for real-time status
   - Agent creation modal → POST /agents + POST /agents/launch
   - Agent detail console → WebSocket stream of tmux output
   - Channels view → IRC channel list from Backend
   - Auth pages (login, register) → Backend auth API
   - Settings → Backend settings API

10. xterm.js for console view
    - Stream agent's tmux session to browser
    - Directive input → chuck directive → agent tmux
```

---

## Database Schema (PostgreSQL)

```sql
-- Core tables
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL DEFAULT 'Default',
  memory_md TEXT DEFAULT '',  -- MEMORY.md content
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  team_id UUID REFERENCES teams(id),
  name TEXT NOT NULL,
  role TEXT,
  mode TEXT NOT NULL DEFAULT 'persistent',  -- persistent | ghost
  keep_context BOOLEAN DEFAULT false,
  runtime TEXT NOT NULL DEFAULT 'claude-code',
  model TEXT DEFAULT 'claude-sonnet-4-20250514',
  effort TEXT DEFAULT 'high',
  auth_mode TEXT DEFAULT 'session',  -- session | api-key
  status TEXT DEFAULT 'ghost',  -- ghost | starting | running | idle | stopped | crashed
  container_id TEXT,
  channel_subscriptions TEXT[] DEFAULT '{}',
  plugins TEXT[] DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  team_id UUID REFERENCES teams(id),
  agent_id UUID REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT[],
  status TEXT DEFAULT 'queued',  -- queued | assigned | running | done | failed
  context_md TEXT,  -- CONTEXT.md content
  constraints JSONB DEFAULT '{}',
  artifacts JSONB DEFAULT '[]',
  parent_task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,  -- e.g., #general, #dev
  adapter TEXT DEFAULT 'irc',  -- irc (MVP only)
  config JSONB DEFAULT '{}',  -- adapter-specific config
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- github | mcp
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'stopped',
  container_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## API Surface

### Backend API (:4000)

```
# Auth
POST   /auth/register          { email, password }
POST   /auth/login             { email, password } → { token }
GET    /auth/me                → { tenant }

# Agents
GET    /agents                 → [agents]
POST   /agents                 { name, role, mode, runtime, ... } → agent
GET    /agents/:id             → agent
PATCH  /agents/:id             { ...updates }
DELETE /agents/:id
POST   /agents/:id/launch      → triggers Account Manager
POST   /agents/:id/stop        → triggers Account Manager
POST   /agents/:id/directive   { message } → triggers Account Manager

# Teams
GET    /teams                  → [teams]
POST   /teams                  { name }
PATCH  /teams/:id              { ...updates }

# Tasks
GET    /tasks                  → [tasks]
POST   /tasks                  { title, description, agent_id, ... }
PATCH  /tasks/:id              { status, artifacts, ... }

# Channels
GET    /channels               → [channels]
POST   /channels               { name, adapter }

# Plugins
GET    /plugins                → [plugins]
POST   /plugins/:id/enable
POST   /plugins/:id/disable

# WebSocket
WS     /ws                     → agent status events, console streams
```

### Account Manager API (:4100)

```
# Agent lifecycle
POST   /agents/launch          { agent_id, config, secrets }
POST   /agents/stop            { agent_id }
POST   /agents/kill            { agent_id }
POST   /agents/directive       { agent_id, message }
GET    /agents/screen/:id      → tmux capture output
GET    /agents/status           → all agent container statuses

# Heartbeat (called by agents)
POST   /heartbeat              { agent_id, timestamp }

# IRC management
POST   /irc/channels           { name } → create Ergo channel
GET    /irc/messages            { agent_id, since } → new messages

# Plugin lifecycle
POST   /plugins/launch         { plugin_id, config }
POST   /plugins/stop           { plugin_id }
```

---

## Agent Entrypoint Flow (MVP)

```bash
#!/bin/bash
# agent-entrypoint.sh

# 1. Source injected environment
source /run/secrets/agent-env.sh

# 2. Configure Claude Code session auth
mkdir -p /home/agent/.claude
if [ "$AUTH_MODE" = "session" ]; then
  cp /run/secrets/anthropic_session.txt /home/agent/.claude/.credentials.json
fi

# 3. Configure git identity
git config --global user.name "$AGENT_NAME"
git config --global user.email "$AGENT_NAME@a1.agent"

# 4. Configure PostToolUse hooks
cat > /home/agent/.claude/settings.json << EOF
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "comm-poll" },
          { "type": "command", "command": "heartbeat" }
        ]
      }
    ]
  }
}
EOF

# 5. Set up IRC identity
export IRC_NICK="$AGENT_NAME"
export IRC_SERVER="ergo:6667"

# 6. Mount task context if provided
if [ -d /tmp/task ]; then
  echo "Task context available at /tmp/task/"
fi

# 7. Launch Claude Code in tmux (interactive mode)
tmux new-session -d -s agent
tmux send-keys -t agent "claude --resume" Enter

# Keep container alive
tail -f /dev/null
```

---

## PostToolUse Hooks (MVP)

### comm-poll (IRC message check)

```javascript
#!/usr/bin/env node
// comm-poll — checks IRC for new messages via Account Manager API

const agentId = process.env.AGENT_ID;
const managerUrl = process.env.ACCOUNT_MANAGER_URL || 'http://account-manager:4100';
const cursorFile = `/tmp/.comm-poll-cursor`;

const fs = require('fs');
const since = fs.existsSync(cursorFile) 
  ? fs.readFileSync(cursorFile, 'utf8').trim() 
  : new Date(Date.now() - 10000).toISOString();

fetch(`${managerUrl}/irc/messages?agent_id=${agentId}&since=${since}`)
  .then(r => r.json())
  .then(data => {
    if (data.messages?.length > 0) {
      fs.writeFileSync(cursorFile, data.cursor);
      // Output for PostToolUse hook visibility
      console.log(JSON.stringify({
        hookSpecificOutput: {
          additionalContext: data.messages
            .map(m => `[${m.channel}] ${m.from}: ${m.text}`)
            .join('\n')
        }
      }));
    }
  })
  .catch(() => {}); // Silent fail — don't interrupt agent
```

### heartbeat

```javascript
#!/usr/bin/env node
// heartbeat — reports liveness to Account Manager

const agentId = process.env.AGENT_ID;
const managerUrl = process.env.ACCOUNT_MANAGER_URL || 'http://account-manager:4100';

fetch(`${managerUrl}/heartbeat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agent_id: agentId, timestamp: new Date().toISOString() })
}).catch(() => {});
```

---

## Docker Compose (Local Dev)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: agentfarm
      POSTGRES_USER: agentfarm
      POSTGRES_PASSWORD: localdev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "4000:4000"
    environment:
      DATABASE_URL: postgres://agentfarm:localdev@postgres:5432/agentfarm
      JWT_SECRET: local-dev-secret-change-in-prod
      ACCOUNT_MANAGER_URL: http://account-manager:4100
    depends_on:
      - postgres

  account-manager:
    build: ./account-manager
    ports:
      - "4100:4100"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      BACKEND_URL: http://backend:4000
      ERGO_HOST: ergo
      ERGO_PORT: 6667

  ergo:
    image: ghcr.io/ergochat/ergo:stable
    ports:
      - "6667:6667"
    volumes:
      - ./templates/ergo/ircd.yaml:/ircd/ircd.yaml
      - ergodata:/ircd/db

  web:
    build: ./web
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
      NEXT_PUBLIC_WS_URL: ws://localhost:4000/ws

volumes:
  pgdata:
  ergodata:
```

**Agent containers are NOT in compose** — they're launched dynamically by the Account Manager via Docker API.

---

## File Structure (MVP Build)

```
agentfarm/                        # New repo: safitudo/agentfarm
├── ARCHITECTURE_v2.md
├── DESIGN_SPEC_v2.md
├── IMPLEMENTATION.md             # This file
├── docker-compose.yml            # Local dev compose
│
├── backend/                      # Backend API service
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js              # Express app + WS
│       ├── db/
│       │   ├── connection.js     # PG pool
│       │   └── migrations/       # SQL migrations
│       ├── api/
│       │   ├── auth.js
│       │   ├── agents.js
│       │   ├── teams.js
│       │   ├── tasks.js
│       │   ├── channels.js
│       │   └── plugins.js
│       ├── ws/
│       │   └── index.js          # WebSocket handlers
│       └── middleware/
│           └── auth.js           # JWT verification
│
├── account-manager/              # Per-account orchestrator
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── api/
│       │   ├── agents.js         # Launch, stop, kill, directive
│       │   ├── heartbeat.js
│       │   ├── irc.js            # IRC message relay
│       │   └── plugins.js
│       ├── docker/
│       │   └── containers.js     # Docker API wrapper
│       ├── irc/
│       │   └── ergo.js           # Ergo channel management
│       └── session/
│           └── keychain.js       # macOS Keychain extraction
│
├── agent/                        # Agent container images
│   ├── Dockerfile                # Base image
│   ├── Dockerfile.claude         # + Claude Code
│   └── bin/
│       ├── agent-entrypoint.sh
│       ├── msg.js                # IRC send/read via Ergo
│       ├── comm-poll.js          # PostToolUse → IRC poll
│       └── heartbeat.js          # PostToolUse → Account Manager
│
├── plugins/
│   └── github/
│       ├── Dockerfile
│       └── src/
│           ├── token-refresh.js
│           ├── worktree.js
│           └── inject.js
│
├── web/                          # Figma export → wired to API
│   ├── (from figma-design/, restructured for Next.js)
│   └── ...
│
├── templates/
│   └── ergo/
│       └── ircd.yaml
│
└── .env.example
```

---

## .env.example

```bash
# Database
DATABASE_URL=postgres://agentfarm:localdev@localhost:5432/agentfarm

# Auth
JWT_SECRET=change-me-in-production

# Account Manager
ACCOUNT_MANAGER_URL=http://localhost:4100

# Claude (session mode — extracted from local Keychain)
AUTH_MODE=session
# Or: ANTHROPIC_API_KEY=sk-ant-... (API key mode)

# GitHub Plugin (optional)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=
GITHUB_APP_INSTALLATION_ID=

# IRC
ERGO_HOST=localhost
ERGO_PORT=6667

# Email (optional — skip for local dev)
# RESEND_API_KEY=
# SMTP_HOST=
# SMTP_PORT=
# SMTP_USER=
# SMTP_PASS=
```

---

## What We Reuse from v1 (Copy & Adapt)

| v1 file | → v2 location | Adaptation needed |
|---------|---------------|-------------------|
| `agent/bin/agent-entrypoint.sh` | `agent/bin/agent-entrypoint.sh` | Remove compose-specific refs, add Account Manager heartbeat |
| `agent/bin/irc-poll` | `agent/bin/comm-poll.js` | Point to Account Manager API instead of direct Ergo |
| `agent/bin/msg` | `agent/bin/msg.js` | Keep IRC interface, add Account Manager relay option |
| `.context/agents/chuck/prompt.md` | `chuck/prompt.md` | Expand with ghost launching, Account Manager integration |
| `manager/src/watchdog/token-refresh.js` | `plugins/github/src/token-refresh.js` | Move to plugin container |
| `agent/bin/git-credential-manager-token` | `plugins/github/src/inject.js` | Plugin injects creds into agent containers |
| `templates/ergo/ircd.yaml` | `templates/ergo/ircd.yaml` | Same config, might add more channels |
