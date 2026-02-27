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

### GitHub App authentication (recommended)

Use a GitHub App for scoped, short-lived repo access instead of personal tokens. Agents get 1-hour tokens that auto-expire, scoped to a single repo with only the permissions they need.

#### Create the GitHub App

1. Go to **https://github.com/settings/apps** → **New GitHub App**
2. Fill in:
   - **Name**: `A1 Engineer` (or any name)
   - **Homepage URL**: `https://github.com/safitudo/a1engineer`
   - **Webhook**: uncheck "Active" (not needed)
3. Set **Repository permissions**:
   - **Contents**: Read & Write (clone, push branches)
   - **Pull requests**: Read & Write (create PRs, comment)
   - **Issues**: Read & Write (create/update/close issues)
   - **Metadata**: Read (auto-granted)
   - Everything else: **No access**
4. Set **Where can this app be installed?**: "Only on this account"
5. Click **Create GitHub App**
6. Note the **App ID** shown on the next page

#### Generate a private key

1. On the App settings page, scroll to **Private keys**
2. Click **Generate a private key** — a `.pem` file downloads
3. Move it to your project root:
   ```bash
   mv ~/Downloads/your-app-name.*.pem ./github-app-key.pem
   ```
   This file is gitignored (`*.pem` in `.gitignore`).

#### Install the App on your repo

1. On the App settings page, click **Install App** in the left sidebar
2. Select your account → **Only select repositories** → pick the repo
3. Click **Install**
4. Note the **Installation ID** from the URL: `https://github.com/settings/installations/{INSTALLATION_ID}`

#### Configure

Add to your `.env`:

```bash
GITHUB_APP_ID=123456
GITHUB_INSTALLATION_ID=78901234
GITHUB_APP_PRIVATE_KEY_PATH=./github-app-key.pem
```

Or add to your team config:

```json
"github": {
  "appId": "123456",
  "installationId": "78901234",
  "privateKeyPath": "./github-app-key.pem"
}
```

The Manager auto-generates a 1-hour installation token at team creation and injects it into agent containers via Docker secrets. Agents use it for `git clone`, `git push`, and `gh` CLI operations via `.netrc` — the token never appears in URLs or process listings.

#### Set up branch protection

Go to your repo → **Settings** → **Rules** → **Rulesets** → **New ruleset**:

| Setting | Value |
|---|---|
| Name | `protect-main` |
| Target | Default branch (`main`) |
| Bypass list | Only your GitHub username |

Enable these rules:
- Require a pull request before merging
- Require 1 approval
- Block force pushes
- Block deletions

This ensures agents can only push to `agent/*` branches and must go through PRs to merge into `main`.

#### Fallback: Personal Access Token

If you prefer not to use a GitHub App, set a fine-grained PAT:

```bash
export GITHUB_TOKEN=github_pat_...
```

The Manager falls back to `GITHUB_TOKEN` when no `github` section is in the team config. Create the PAT at `github.com/settings/personal-access-tokens/new`, scoped to your repo with Contents + Pull requests + Issues permissions.

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
POST   /api/teams                            Create a team
GET    /api/teams                            List all teams
GET    /api/teams/:id                        Team status + agent liveness
DELETE /api/teams/:id                        Teardown team

GET    /api/teams/:id/agents                 List agents in a team
POST   /api/teams/:id/agents                 Spawn an agent

GET    /api/teams/:id/channels               List IRC channels
GET    /api/teams/:id/channels/:ch/messages  Read IRC messages  (planned — #14)
POST   /api/teams/:id/channels/:ch/messages  Send a message     (planned — #14)

POST   /heartbeat/:teamId/:agentId           Agent heartbeat (internal)

WS     /ws                                   Real-time IRC + events
                                             Connect, then send:
                                             { "type": "subscribe", "teamId": "<id>" }
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
- **API key missing**: if using `mode: api-key`, either set `ANTHROPIC_API_KEY` in the environment where you ran `create-team`, or provide the key directly in your config via `"auth": { "mode": "api-key", "apiKey": "sk-ant-..." }` (written to a Docker secrets file at runtime and never stored in state).
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
