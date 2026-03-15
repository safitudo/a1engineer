# CLAUDE.md — A1 Engineer

## Current focus: v1 polish

The team is currently polishing the v1 codebase. No new features — bugs, cleanup, and test coverage only.

### Shipped fixes (on main)

| Commit | What |
|--------|------|
| `dc9971a` | refactor: extract `loadHistory`/`saveHistory` into `agent/lib/history.js` — removes 3 duplicate definitions |
| `4f02460` | fix: atomic mv inbox race in `agent-entrypoint.sh`; add `test:e2e` npm script; remove `auth:session` override from `configs/testapp.json` |
| `f44d8b8` | fix: cap `CHATHISTORY LATEST` first-run fetch at 50 messages (was 500) |
| `fdc44fc` | fix: pass `githubToken` to `startTeam()` on create and restart — unblocks git push from agent containers |
| `b51237f` | feat(test): add IRC response verification step to `smoke-test.sh` (Step 6b, skips if no `ANTHROPIC_API_KEY`) |
| `59c113b` | feat(test): Task #11 — `e2e-agent.mjs` Level B real-agent test; smoke-test observer race fix; `irc-check.mjs` `filter_nick`; `SESSION_TOKEN` priority + dotenv layered credential loading |
| `0f78790` | feat(watchdog): Task #14 — `status-broadcaster.js` posts team status to `#main` every 5 min; router.js `@all` feedback-loop guard (skip nudge when sender is gateway nick) |

### Active tasks

*(none — Tasks #9 and #10 shipped; Tasks #11 and #14 shipped above)*

### What to work on next

See `test/README.md` for the test suite. Priority order:
1. Polish pass — fix bugs/omissions flagged in IRC (critic-1 issues)
2. E2E agent tests — real agent IRC loop with `ANTHROPIC_API_KEY`
3. Docs — keep `CLAUDE.md` and `test/README.md` up to date

---

## v2 Migration *(on hold — v1 polish first)*

This codebase is migrating from v1 (monolithic Manager + team-scoped compose) to v2 (Backend + Account Manager per-account + agent-first UX). The v1 code in `manager/`, `web/`, `agent/` is reference — new work targets the v2 structure.

### Key docs

| Doc | What's in it |
|-----|-------------|
| `ARCHITECTURE_v2.md` | Full system design — containers, agent modes, Chuck, Communication Gateway, plugins, infra |
| `DESIGN_SPEC_v2.md` | UI wireframes, interaction flows, component library, color system |
| `IMPLEMENTATION.md` | MVP build plan — phases, DB schema, API surfaces, docker-compose, entrypoint scripts |
| `FIGMA_PROMPT.md` | Condensed design prompt for Figma AI |
| `figma-design/` | Figma export (React + Vite + Tailwind) — 7 pages, all components, ready to wire |

### What changed (v1 → v2)

- **Manager** splits into **Backend** (API/auth, :4000) + **Account Manager** (Docker orchestration, :4100, one per account)
- **Teams** are now DB records, not infrastructure — no more docker-compose-per-team
- **Agents** are the primary entity: persistent (always-on) or ghost (on-demand), both stateful
- **Communication** decoupled — Gateway daemon with adapter pattern (IRC first, Slack/Telegram/Discord later)
- **Plugins** are account-level containers (GitHub, MCP) — not sidecars
- **Auth** — email/password + JWT + OAuth, not API-key-only
- **DB** — PostgreSQL (not SQLite)
- **UI** — full rewrite from Figma export, agent-first dashboard

### What carries over

- **IRC (Ergo) + `msg` CLI** — now an adapter in the Communication Gateway
- **PostToolUse hooks** — `comm-poll` (was `irc-poll`) + `heartbeat`, still the core differentiator
- **Chuck** — watchdog + fallback orchestrator, expanded with ghost agent launching
- **Agent entrypoint** — tmux + launch script + env injection pattern
- **GitHub plugin** — token refresh (45 min cron), worktree management, credential injection
- **Session token auth** — Claude Max session from macOS Keychain, injected into containers

### MVP scope (build first)

IRC + Claude Code (interactive mode) + session token. See `IMPLEMENTATION.md` for phases, schema, and API contracts.

### Agent modes (UI checkboxes, both checked by default)

- **☑ Always ON** — persistent, stays running after tasks
- **☑ Run now** — launch immediately on creation
- **☐ Keep Context** — ghost-only: keep container/console alive between tasks

### Repo structure (new)

```
backend/          → Backend API service (Express, JWT, PG)
account-manager/  → Per-account orchestrator (Docker socket, REST API)
agent/            → Agent Docker images (base + claude/codex/aider layers)
plugins/github/   → GitHub plugin container
web/              → UI (Figma export → Next.js, wired to Backend API)
templates/ergo/   → IRC server config
```

### Repo structure (v1 — reference only)

```
manager/          → v1 monolithic Manager (Express + compose orchestrator)
web/              → v1 Next.js UI (team-centric dashboard)
agent/            → v1 agent image (reuse entrypoint pattern)
```
