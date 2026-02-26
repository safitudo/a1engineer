# Self-Hosting A1 Engineer

Step-by-step guide for running A1 Engineer on a single machine (Phase 1 — local Docker).

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Docker Engine ≥ 26** | With the Compose plugin (`docker compose`) |
| **Node.js ≥ 22** | Required to run the manager CLI |
| **Git** | For cloning this repo and agent worktrees |
| **make** | For building Docker images |
| **Anthropic API key** *or* an active Claude session | Required for Claude Code agents |

Check your versions:

```bash
docker --version          # Docker version 26+
docker compose version    # Docker Compose v2+
node --version            # v22+
```

---

## 1. Clone the Repository

```bash
git clone https://github.com/safitudo/a1engineer.git
cd a1engineer
```

---

## 2. Build Docker Images

Build all four images in dependency order:

```bash
make build
```

This runs the following in sequence:

| Image | Purpose |
|---|---|
| `a1-agent-base:latest` | Agent base image (git, tmux, IRC tooling) |
| `a1-agent-claude:latest` | Claude Code agent variant |
| `a1-manager:latest` | Manager container (orchestrator) |
| `a1-ergo:latest` | Ergo IRC server |

To build individual images:

```bash
make build-agent          # a1-agent-base
make build-agent-claude   # a1-agent-claude
make build-manager        # a1-manager
make build-ergo           # a1-ergo
```

---

## 3. Install Manager Dependencies

```bash
cd manager
npm ci --production
cd ..
```

---

## 4. Create a Team Configuration

Create a JSON file describing your team. Use `configs/hamburg.json` as a reference:

```json
{
  "name": "myteam",
  "repo": {
    "url": "https://github.com/your-org/your-repo.git",
    "branch": "main"
  },
  "agents": [
    { "role": "arch",   "model": "claude-opus-4-6",    "prompt": "" },
    { "role": "lead",   "model": "claude-opus-4-6",    "prompt": "" },
    { "role": "dev",    "model": "claude-sonnet-4-6",  "prompt": "" },
    { "role": "qa",     "model": "claude-sonnet-4-6",  "prompt": "" },
    { "role": "critic", "model": "claude-sonnet-4-6",  "prompt": "" }
  ],
  "ergo": {
    "image": "a1-ergo:latest",
    "configPath": "./templates/ergo/ircd.yaml",
    "port": 6667
  }
}
```

### Auth configuration

Choose one of two auth modes and add it to your config:

**Session auth** (recommended for local use): shares your existing Claude session from the host.

```json
"auth": {
  "mode": "session",
  "sessionPath": "~/.claude"
}
```

This bind-mounts `~/.claude` into each agent container as read-only. The `~` is resolved to your home directory at runtime. You must be logged in to Claude Code on the host (`claude login`) before creating the team.

**API-key auth**: injects the key via Docker secrets (safer for shared/CI environments).

```json
"auth": {
  "mode": "api-key"
}
```

Set your key in the environment before starting:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

You may also pass a per-team key with `--secrets <dir>` (see §5 below).

> **Note**: Session auth is the default when `auth` is omitted from the config.

---

## 5. Start a Team

Run the manager CLI directly (no container needed for Phase 1):

```bash
node manager/src/index.js create-team --config configs/myteam.json
```

With a secrets directory (for api-key auth):

```bash
node manager/src/index.js create-team \
  --config configs/myteam.json \
  --secrets /var/run/a1/secrets
```

The command:
1. Parses and validates your config
2. Generates a Docker Compose file from the EJS template
3. Runs `docker compose up -d` for the team stack
4. Waits for the git-init container to clone your repo
5. Prints the team ID and JSON summary on success

Example output:

```
Creating team 4f3a1b2c-... (myteam)…
Team 4f3a1b2c-... is running.
{
  "id": "4f3a1b2c-...",
  "name": "myteam",
  "status": "running",
  "agents": [ ... ]
}
```

### What gets created

| Resource | Name pattern |
|---|---|
| Docker network | `net-myteam` |
| Git volume | `git-myteam` |
| IRC server | `ergo-myteam` (container) |
| Repo init container | `git-init-myteam` (exits after clone) |
| Agent containers | `agent-myteam-arch`, `agent-myteam-lead`, … |

---

## 6. Run the Manager API Server

For REST + WebSocket access, start the manager in serve mode:

```bash
node manager/src/index.js serve --port 8080
```

The API is then available at `http://localhost:8080`.

Key endpoints:

```
POST   /teams                    Create a team
GET    /teams                    List all teams
GET    /teams/:id                Team status + agent liveness
DELETE /teams/:id                Teardown team

GET    /teams/:id/channels/:channel/messages   Read IRC messages
POST   /teams/:id/channels/:channel/messages   Send a message

GET    /teams/:id/heartbeats     Agent liveness timestamps
POST   /heartbeat/:teamId/:agentId            Agent heartbeat (internal)

WS     /teams/:id/stream         Real-time IRC + events
```

---

## 7. Monitor Your Team

List running teams:

```bash
node manager/src/index.js list-teams
```

Output:

```
4f3a1b2c-...  myteam  status=running  agents=5
```

Inspect running containers:

```bash
docker ps --filter name=myteam
```

Watch agent logs (replace `myteam-dev` with the agent role):

```bash
docker logs -f agent-myteam-dev
```

Attach to an agent's tmux session (for debugging):

```bash
docker exec -it agent-myteam-dev tmux attach -t agent
```

Check IRC activity by reading the agent containers' logs or connecting via the API:

```bash
curl http://localhost:8080/teams/<id>/channels/main/messages
```

---

## 8. Stop and Destroy a Team

Stop a team and remove all its containers, networks, and volumes:

```bash
node manager/src/index.js destroy-team --id <team-id>
```

> **Warning**: This removes all containers and the git volume. Make sure agents have pushed their work before destroying the team.

To get the team ID:

```bash
node manager/src/index.js list-teams
```

---

## 9. Troubleshooting

### Team fails to start — git-init exits with error

The `git-init-myteam` container clones your repo. If it fails:

```bash
docker logs git-init-myteam
```

Common causes:
- **Private repo**: add `"githubToken": "ghp_..."` to the `repo` block in your config
- **Wrong branch**: verify `repo.branch` matches a real branch in your repo
- **Network issue**: ensure the Docker host has outbound internet access

### Agent containers keep restarting

```bash
docker logs agent-myteam-dev --tail 50
```

Common causes:
- **Session auth — session path not found**: if using `mode: session`, the `sessionPath` must exist on the host. Run `claude login` and verify `~/.claude` exists.
- **API key missing**: if using `mode: api-key`, ensure `ANTHROPIC_API_KEY` is set in the environment where you ran `create-team`.
- **Model not found**: verify the model name in your config (`claude-sonnet-4-6`, `claude-opus-4-6`, etc.).

### Session path warning at startup

```
Warning: session path /home/user/.claude does not exist
```

This is a non-fatal warning. The compose file is still generated, but the bind-mount will fail at container start. Run `claude login` on the host to create the session.

### Ports already in use

Each Ergo IRC server binds to port 6667 inside the team network, not on the host. Cross-team port conflicts are not possible by design. If you see port conflicts, another process on the host is using 8080 (manager API). Change it:

```bash
node manager/src/index.js serve --port 9090
```

### Manager can't connect to Docker

The manager CLI uses the Docker socket at `/var/run/docker.sock`. Ensure your user has permission:

```bash
docker ps   # should work without sudo
```

If not:

```bash
sudo usermod -aG docker $USER
# then log out and back in
```

### Check generated Compose files

The manager generates a Docker Compose file for each team. To inspect what was generated, look at the compose output before it is passed to Docker. You can also re-render manually by running the test suite:

```bash
cd manager && npm test
```

---

## Quick Reference

```bash
# Build images
make build

# Create a team
node manager/src/index.js create-team --config configs/myteam.json

# Start API server
node manager/src/index.js serve --port 8080

# List teams
node manager/src/index.js list-teams

# Destroy a team
node manager/src/index.js destroy-team --id <team-id>

# Watch agent logs
docker logs -f agent-myteam-dev

# Attach to agent tmux
docker exec -it agent-myteam-dev tmux attach -t agent

# Run tests
cd manager && npm test
```
