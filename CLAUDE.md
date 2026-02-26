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
