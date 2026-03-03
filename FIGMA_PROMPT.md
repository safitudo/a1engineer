# A1 Engineer — Figma Design Prompt

AI agent orchestration platform. Dark mode, minimal chrome. Inspired by Linear, Vercel, Raycast. Agent-first — teams are secondary grouping.

## Nav
Top horizontal bar: Logo | Agents | Channels | Plugins | (spacer) | User menu (avatar + dropdown). Agents is default landing. Teams are NOT in nav — they appear as subtle group dividers inside Agents view and in Settings.

## 1. Agents Dashboard
Default page after login. List of all agents grouped by team with lightweight dividers (team name + agent count, dashed line — not cards or tabs).

Each agent = a row:
- Status dot (green=running, gray=ghost, blue=ghost+context, yellow=starting, red=crashed)
- Agent name (bold)
- Tags: mode · runtime · state (muted text)
- One-line summary: current task or last activity
- Time ago (right-aligned)
- Chevron to expand/detail

Top bar: search input + "+ New Agent" button + filter dropdown (All, Running, Ghost, By Team).

## 2. New Agent Modal
Right-side drawer/modal. Sections:

**Top**: Name, Role (text inputs)

**Runtime**: Provider dropdown (Claude Code, OpenAI Codex, Aider) → Model dropdown (dynamic) → Effort dropdown

**Options** (checkboxes):
- Always ON (checked by default) — keep running after tasks
- Run now (checked by default) — launch immediately
- Keep Context (unchecked) — for ghosts, preserve container/session between tasks

**Communication**: Channel multi-select with type-ahead. Shows added channels as removable chips.

**Plugins**: Toggle switches for installed plugins (GitHub, MCP servers). Uninstalled ones grayed with "not installed" label.

**Team**: Dropdown at bottom, de-emphasized. Defaults to "Default".

Primary CTA: "Create Agent" full-width button.

## 3. Agent Detail
Full page. Header card: status dot, name, role, runtime+model, mode, team, uptime, task count. Action buttons: Pause, Restart, Stop, Settings.

**5 tabs below header**:

**Console** — live terminal (xterm.js style) showing agent's tmux output streamed via WebSocket. Bottom input bar: "Send directive to agent..." with send button. This lets human redirect the agent in real-time.

**Chat** — message feed from agent's subscribed channels. Shows sender, channel badge, timestamp. Input to send messages as yourself into any subscribed channel.

**Tasks** — list of assigned tasks. Current task highlighted. Each: title, status badge, time, artifacts (commits, PRs). Button to assign new task.

**Logs** — structured log stream. Heartbeats, status changes, errors, restarts. Filterable by type.

**Settings** — inline-editable agent config: mode toggles, runtime/model selectors, channel subscriptions, plugin toggles.

## 4. Channels View
List page. Each channel = row: channel name, adapter badge (IRC/Slack/Telegram/Discord/Webhook), subscriber count, description. Click → channel detail with live message feed, subscriber list, adapter config, history search.

"+ New Channel" button. Creation: adapter type selector → adapter-specific config fields → auto-subscribe agents.

## 5. Plugins View
List page. Each plugin = card: status dot, name, type badge, config summary, "Used by: N agents". Actions: Configure, Enable/Disable, Install (for uninstalled). GitHub plugin shows: token refresh status, active worktrees. MCP plugins show: server URL, port.

## 6. Onboarding (4 steps)
Step 1 — Account: email, password, OAuth options (GitHub, Google).
Step 2 — Provider: select AI provider, enter API key, choose default model.
Step 3 — Chuck: explain Chuck as always-on watchdog. "Launch Chuck" CTA.
Step 4 — First Agent (optional): name, role, checkboxes (Always ON, Run now). Skip option.

Clean wizard with step indicators, one card per step, centered on page.

## 7. Settings
Sub-pages via left sidebar within settings: Account, Teams, API Keys, Provider Keys, Billing, Templates.

## Components
- **Status dots**: filled circle (running/green), half-filled (starting/yellow), empty circle (ghost/gray), empty+ring (ghost+context/blue), crossed (stopped/red)
- **Agent row**: status dot | name bold | mode·runtime·state muted | summary | time | chevron
- **Channel badge**: pill with #name + adapter icon + count
- **Plugin card**: status + name + description + actions
- **Modal/drawer**: slides from right, overlay background, close X top-right

## General
- Content-dense, not decoration-dense
- Monospace for console/terminal views
- Sans-serif (Inter or similar) for UI
- Generous but not wasteful spacing
- All real-time views use WebSocket — no polling in UI
- Responsive: desktop full layout, tablet single-column, mobile bottom tabs + stacked cards
