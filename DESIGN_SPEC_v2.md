# A1 Engineer v2 — UI Visual Design Spec

> Companion to `ARCHITECTURE_v2.md`. Wireframes, screen flows, component design.

---

## Design Principles

- **Agent-first** — agents are the primary objects. Teams are subtle grouping.
- **Progressive disclosure** — simple by default, powerful when you dig in.
- **Real-time** — live status, live console, live comms. WebSocket everywhere.
- **Dark mode default** — developer-centric audience. Light mode available.
- **Minimal chrome** — content-dense, not decoration-dense. Inspired by Linear, Vercel, Raycast.

---

## Navigation Structure

```
┌─────────────────────────────────────────────────────────┐
│  ┌──────┐                                    ┌───────┐  │
│  │ LOGO │  Agents  Channels  Plugins  ···    │ ⚙ ▾  │  │
│  └──────┘                                    └───────┘  │
└─────────────────────────────────────────────────────────┘
     │
     ├── Agents (default landing after login)
     ├── Channels (communication management)
     ├── Plugins (GitHub, MCP servers)
     └── Settings (account, API keys, billing, teams)
```

- **Top nav** — horizontal, minimal. Agents is the default tab.
- **Teams** — NOT a top-level nav item. Visible as a subtle grouping/filter inside the Agents view and in Settings → Teams.
- **User menu** (⚙) — account settings, team management, API keys, logout.

---

## Screen Wireframes

### 1. Agents Dashboard (Landing Page)

The primary view. Shows all agents grouped by team, with team headers being subtle separators — not dominant sections.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LOGO   Agents   Channels   Plugins                       ⚙ Stan ▾ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────┐  ┌──────────────────┐ │
│  │  🔍 Search agents...          + New Agent│  │ Filter: All ▾    │ │
│  └─────────────────────────────────────────┘  └──────────────────┘ │
│                                                                     │
│  Default Team                                          3 agents     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ ● Chuck              persist · claude · 24/7                   │ │
│  │   Monitoring team — all agents healthy          2 min ago  ▸  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ ● Dev-1               persist · claude · working               │ │
│  │   Task: Implement user auth API (#42)           12 sec ago ▸  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ ○ Dev-2               ghost · openai · idle                    │ │
│  │   Ready — last task: Fix pagination (#38)       1 hr ago   ▸  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Marketing Team                                        2 agents     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ ● Campaign-Lead       persist · claude · idle                  │ │
│  │   Waiting for tasks                             5 min ago  ▸  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ ○ Writer-1            ghost · aider · idle                     │ │
│  │   Ready — last task: Blog post draft            3 hrs ago  ▸  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Legend:  ● = running/persistent    ○ = ghost/idle    ▸ = expand/detail
```

**Key UX decisions**:
- Team headers are **light dividers** — a label + count, dashed line. Not cards, not tabs.
- Each agent row shows: **status dot**, **name**, **mode · runtime · state**, **last activity summary**, **time ago**.
- Clicking an agent row → Agent Detail view.
- `+ New Agent` button always visible, top right of list.
- Filter dropdown: All, Running, Ghost, By Team.

---

### 2. New Agent — Creation Modal

Slides in as a modal/drawer from the right. Fast, focused.

```
┌──────────────────────────────────────────────┐
│  Create New Agent                        ✕   │
├──────────────────────────────────────────────┤
│                                              │
│  Name          [________________________]    │
│  Role          [________________________]    │
│                                              │
│  ── Runtime ──────────────────────────────   │
│  Provider      [Claude Code        ▾]        │
│  Model         [claude-sonnet-4  ▾]        │
│  Effort        [high ▾]                      │
│                                              │
│  ── Options ──────────────────────────────   │
│  ☑ Always ON    Keep running after tasks     │
│  ☑ Run now      Launch immediately           │
│  ☐ Keep Context Don't kill container on idle │
│                                              │
│  ── Communication ────────────────────────   │
│  Channels      [+ Add channel]               │
│                #general         ✕             │
│                #dev             ✕             │
│                                              │
│  ── Plugins ──────────────────────────────   │
│  ☑ GitHub      (connected)                   │
│  ☐ Web Search  (MCP — not installed)         │
│                                              │
│  ── Team ─────────────────────────────────   │
│  Team          [Default           ▾]         │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │          Create Agent                │    │
│  └──────────────────────────────────────┘    │
│                                              │
└──────────────────────────────────────────────┘
```

**Key UX decisions**:
- Team selector is **at the bottom**, de-emphasized. Defaults to "Default" team.
- Checkboxes: Always ON + Run now **checked by default**. Keep Context **unchecked by default**.
- Channel assignment inline — type-ahead search, add multiple.
- Plugin toggles — show installed plugins with toggle, uninstalled ones grayed with "(not installed)".
- Provider selector populates model dropdown dynamically.

---

### 3. Agent Detail View

Full-page view with tabs. The command center for a single agent.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LOGO   Agents   Channels   Plugins                       ⚙ Stan ▾ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back to Agents                                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ● Dev-1                                                     │   │
│  │  Role: Full-stack developer                                  │   │
│  │  claude-sonnet-4 · persistent · running                    │   │
│  │  Team: Default    Uptime: 2h 34m    Tasks: 3 done, 1 active │   │
│  │                                                               │   │
│  │  [⏸ Pause]  [🔄 Restart]  [⏹ Stop]  [⚙ Settings]           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Console    Chat    Tasks    Logs    Settings                       │
│  ━━━━━━━                                                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  $ Implementing user authentication...                        │   │
│  │  > Created src/auth/middleware.js                              │   │
│  │  > Running tests... 14/14 passed                              │   │
│  │  > Committing: "feat: add JWT auth middleware"                │   │
│  │                                                               │   │
│  │  [comm-poll] New message in #dev from @architect:             │   │
│  │    "Make sure to add rate limiting to the auth endpoints"     │   │
│  │                                                               │   │
│  │  > Adding rate limiting to auth routes...                     │   │
│  │  > Updated src/auth/middleware.js                              │   │
│  │  █                                                            │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Tabs**:

| Tab | Content |
|-----|---------|
| **Console** | Live terminal view — streamed from agent's tmux session via WebSocket. Read-only by default, with an input bar to send directives. |
| **Chat** | Agent's communication feed — all messages from subscribed channels, filtered to this agent. Can send messages as yourself. |
| **Tasks** | Task history + current task. Status, artifacts, time, cost. Assign new tasks. |
| **Logs** | Structured logs — heartbeats, status changes, errors, restarts. Filterable. |
| **Settings** | Agent config — mode, runtime, model, channels, plugins. Edit inline. |

**Console input bar** (bottom of console tab):
```
┌─────────────────────────────────────────────────────────────────┐
│  💬 Send directive to agent...                          [Send]  │
└─────────────────────────────────────────────────────────────────┘
```
This sends a `chuck directive` or `chuck nudge` to the agent — human can redirect the agent in real-time.

---

### 4. Channels View

Manage communication channels. Decoupled from teams.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LOGO   Agents   Channels   Plugins                       ⚙ Stan ▾ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Communication Channels                          + New Channel      │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  #general           IRC (Ergo)         5 agents subscribed     │ │
│  │  General coordination channel                              ▸  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  #dev               IRC (Ergo)         3 agents subscribed     │ │
│  │  Development discussion                                    ▸  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  #marketing-team    Slack              2 agents subscribed     │ │
│  │  Connected to: #ai-agents in Acme Workspace                ▸  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  #alerts            Telegram           1 agent subscribed      │ │
│  │  Bot: @a1_alerts_bot                                       ▸  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Channel detail** (clicking ▸):
- Live message feed
- Subscriber list (agents + humans)
- Adapter config (IRC server, Slack workspace, Telegram bot token)
- History search

**New Channel modal**:
- Adapter type selector (IRC, Slack, Telegram, Discord, Webhook)
- Adapter-specific config fields
- Auto-subscribe agents (multi-select)

---

### 5. Plugins View

Account-level plugin management.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LOGO   Agents   Channels   Plugins                       ⚙ Stan ▾ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Plugins                                                            │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  ● GitHub                                         Connected    │ │
│  │    GitHub App: a1-engineer · Org: acme-corp                    │ │
│  │    Token refresh: every 45 min · Last: 12 min ago              │ │
│  │    Worktrees: 3 active                                         │ │
│  │                                       [Configure]  [Disable]   │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  ● Web Search (MCP)                               Running      │ │
│  │    Server: tavily-search · Port: 3100                          │ │
│  │    Used by: Dev-1, Dev-2, Writer-1                             │ │
│  │                                       [Configure]  [Disable]   │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  ○ File Analysis (MCP)                            Not installed │ │
│  │    Analyze PDFs, images, documents                             │ │
│  │                                                    [Install]   │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  ○ Database (MCP)                                 Not installed │ │
│  │    PostgreSQL/SQLite query access                              │ │
│  │                                                    [Install]   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 6. Onboarding Flow

First-time user experience. Sets up account + Chuck.

```
Step 1: Account                Step 2: Provider              Step 3: Chuck
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│                  │          │                  │          │                  │
│  Welcome to A1   │          │  AI Provider     │          │  Meet Chuck      │
│                  │          │                  │          │                  │
│  Email:          │   ──▸    │  ☑ Claude Code   │   ──▸    │  Chuck is your   │
│  [____________]  │          │  ☐ OpenAI Codex  │          │  always-on       │
│  Password:       │          │  ☐ Aider         │          │  watchdog agent. │
│  [____________]  │          │                  │          │                  │
│                  │          │  API Key:        │          │  He monitors     │
│  [Create Account]│          │  [____________]  │          │  your agents,    │
│                  │          │                  │          │  restarts them,  │
│  or sign in with │          │  Model:          │          │  and keeps       │
│  GitHub · Google │          │  [sonnet-4 ▾]  │          │  things running. │
│                  │          │                  │          │                  │
│                  │          │  [Continue →]    │          │  [Launch Chuck →]│
│                  │          │                  │          │                  │
└──────────────────┘          └──────────────────┘          └──────────────────┘

Step 4: First Agent (optional)
┌──────────────────┐
│                  │
│  Create your     │
│  first agent     │
│                  │
│  Name:           │
│  [____________]  │
│  Role:           │
│  [____________]  │
│                  │
│  ☑ Always ON     │
│  ☑ Run now       │
│                  │
│  [Create Agent →]│
│  Skip for now    │
│                  │
└──────────────────┘
```

**Key**: Chuck's provider/model setup happens during onboarding — not buried in settings.

---

### 7. Settings

Accessed via ⚙ in top nav. Sub-pages:

```
Settings
├── Account          — email, password, profile
├── Teams            — create/edit teams, assign agents (subtle, secondary)
├── API Keys         — generate/revoke programmatic access keys
├── Provider Keys    — manage AI provider credentials (BYOK)
├── Billing          — usage, costs per agent/runtime
└── Templates        — team templates, task templates (lower priority)
```

---

## Component Library

### Status Indicators

```
●  Running (green)      — agent is actively working or idle-persistent
◐  Starting (yellow)    — container spinning up
○  Ghost (gray)         — defined but no container running
◌  Ghost+Context (blue) — ghost with Keep Context, container idle
⊘  Stopped (red)        — explicitly stopped or crashed
```

### Agent Card (compact — for dashboard list)

```
┌────────────────────────────────────────────────────────────┐
│  ● Agent Name        mode · runtime · state         time ▸ │
│    Last activity or current task summary                    │
└────────────────────────────────────────────────────────────┘
```

### Channel Badge

```
┌──────────────────────────┐
│  #channel-name  IRC  (5) │    ← adapter type + subscriber count
└──────────────────────────┘
```

### Plugin Card

```
┌────────────────────────────────────────────────────────────┐
│  ● Plugin Name                              Status         │
│    Description · Config summary                            │
│                                    [Configure]  [Toggle]   │
└────────────────────────────────────────────────────────────┘
```

---

## Interaction Flows

### Flow 1: User creates and launches an agent

```
User clicks "+ New Agent"
  │
  ├─ Modal opens with defaults (Always ON ☑, Run now ☑)
  ├─ User fills name, role, selects runtime
  ├─ User adds channel subscriptions (#general, #dev)
  ├─ User enables GitHub plugin
  ├─ Clicks "Create Agent"
  │
  ├─ UI → Backend API: POST /agents {name, role, runtime, mode, channels, plugins}
  ├─ Backend → Account Manager API: POST /agents/launch {agent_id, config}
  ├─ Account Manager → docker run agent container
  ├─ Account Manager → GitHub Plugin: inject credentials
  ├─ Account Manager → Gateway: register channel subscriptions
  │
  ├─ Agent appears in dashboard as ◐ (starting)
  ├─ WebSocket pushes status update → ● (running)
  └─ User clicks agent row → Console tab shows live output
```

### Flow 2: Ghost agent receives a task

```
Task created (via UI or by another agent)
  │
  ├─ Task assigned to ghost agent (by Lead/Chuck)
  ├─ Account Manager spins up container for ghost agent
  ├─ Context package mounted (TASK.md, MEMORY.md, CONTEXT.md)
  │
  ├─ Agent works on task
  │     comm-poll fires between every tool call
  │     heartbeat reports to Account Manager
  │
  ├─ Task completes
  │
  ├─ If Keep Context OFF → container killed, status → ○ (ghost)
  └─ If Keep Context ON  → container stays, status → ◌ (ghost+context)
```

### Flow 3: Human sends directive to running agent

```
User opens Agent Detail → Console tab
  │
  ├─ Types message in directive input bar
  ├─ UI → Backend API: POST /agents/{id}/directive {message}
  ├─ Backend → Account Manager: POST /agents/{id}/directive {message}
  ├─ Account Manager → chuck directive {agent-id} {message}
  │     (Ctrl+C current work + paste new instruction into tmux)
  │
  ├─ Agent sees interrupt, reads new directive
  └─ Console view updates in real-time via WebSocket
```

### Flow 4: Agent communicates across channels

```
Agent wants to send message:
  │
  ├─ Agent runs: msg send '#dev' "PR ready for review: #123"
  ├─ msg CLI → Gateway API: POST /messages {channel: #dev, text, sender}
  ├─ Gateway → IRC adapter → Ergo server → #dev channel
  ├─ Gateway → Slack adapter → Slack API → #ai-agents channel (if bridged)
  │
  ├─ Other agents subscribed to #dev:
  │     Their next comm-poll picks up the message
  │     PostToolUse hook surfaces it between tool calls
  │
  └─ Web UI: Channels → #dev shows message in real-time (WebSocket)
```

---

## Responsive Behavior

| Viewport | Layout |
|----------|--------|
| Desktop (>1200px) | Full layout as wireframed above |
| Tablet (768-1200px) | Collapsible nav, single-column agent list |
| Mobile (<768px) | Bottom tab nav, stacked cards, console in fullscreen |

---

## Tech Stack (UI)

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (Radix primitives)
- **Icons**: Lucide
- **Real-time**: WebSocket (native, via Backend)
- **Terminal**: xterm.js (for console view)
- **State**: Zustand or React Query for server state
- **Auth**: JWT in httpOnly cookies
- **Charts**: recharts (for billing/usage dashboards)

---

## Color System

```
Background:     #0a0a0a (near-black)
Surface:        #141414 (cards, modals)
Surface hover:  #1a1a1a
Border:         #262626
Text primary:   #fafafa
Text secondary: #a1a1a1
Text muted:     #666666

Accent:         #3b82f6 (blue — primary actions)
Success:        #22c55e (green — running, healthy)
Warning:        #eab308 (yellow — starting, attention)
Error:          #ef4444 (red — crashed, failed)
Ghost:          #6b7280 (gray — idle, ghost)
Context:        #60a5fa (light blue — ghost with context)
```
