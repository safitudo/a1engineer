import { Router } from 'express'
import * as teamStore from '../store/teams.js'
import { startTeam, stopTeam, rehydrateTeams } from '../orchestrator/compose.js'
import { createGateway, destroyGateway } from '../irc/gateway.js'
import { routeMessage, clearTeamBuffers } from '../irc/router.js'

const router = Router()

function checkTeamScope(req, res) {
  if (req.teamScope && req.params.id !== req.teamScope) {
    res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' })
    return false
  }
  return true
}

// POST /api/teams — create team + spin up compose stack
// Accepts the full team config (same schema as JSON config files)
router.post('/', async (req, res) => {
  const config = req.body ?? {}
  const { name, repo, agents } = config
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required', code: 'MISSING_NAME' })
  }
  if (!repo?.url || typeof repo.url !== 'string') {
    return res.status(400).json({ error: 'repo.url is required', code: 'MISSING_REPO_URL' })
  }
  if (!Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ error: 'agents must be a non-empty array', code: 'MISSING_AGENTS' })
  }
  for (const a of agents) {
    if (!a.role) return res.status(400).json({ error: 'each agent must have a role', code: 'MISSING_AGENT_ROLE' })
  }

  const team = teamStore.createTeam(config, { tenantId: req.tenantId })
  try {
    await startTeam(team, { apiKey: config.auth?.apiKey })
    teamStore.updateTeam(team.id, { status: 'running' })
    createGateway(team, { onMessage: routeMessage })
    return res.status(201).json(teamStore.getTeam(team.id))
  } catch (err) {
    teamStore.deleteTeam(team.id)
    console.error('[api/teams] startTeam failed:', err)
    return res.status(500).json({ error: 'failed to start team', code: 'COMPOSE_ERROR' })
  }
})

// GET /api/teams — list teams (filtered by tenant)
router.get('/', (req, res) => {
  if (req.teamScope) {
    const team = teamStore.getTeam(req.teamScope)
    return res.json(team ? [team] : [])
  }
  res.json(teamStore.listTeams({ tenantId: req.tenantId }))
})

// GET /api/teams/:id — team detail
router.get('/:id', (req, res) => {
  if (!checkTeamScope(req, res)) return
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  if (req.tenantId && team.tenantId && team.tenantId !== req.tenantId) {
    return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  }
  // Auto-adopt rehydrated teams (tenantId was cleared on restore)
  if (req.tenantId && !team.tenantId) {
    teamStore.updateTeam(team.id, { tenantId: req.tenantId })
  }
  res.json(team)
})

// PATCH /api/teams/:id — update team config (name, apiKeys only — agents/repo require re-create)
router.patch('/:id', (req, res) => {
  if (!checkTeamScope(req, res)) return
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  if (req.tenantId && team.tenantId && team.tenantId !== req.tenantId) {
    return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  }
  if (req.tenantId && !team.tenantId) {
    teamStore.updateTeam(team.id, { tenantId: req.tenantId })
  }

  const { name, auth } = req.body ?? {}
  const updates = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name must be a non-empty string', code: 'INVALID_NAME' })
    }
    updates.name = name.trim()
  }
  if (auth !== undefined) {
    if (typeof auth !== 'object' || Array.isArray(auth)) {
      return res.status(400).json({ error: 'auth must be an object', code: 'INVALID_AUTH' })
    }
    updates.auth = auth
  }

  const updated = teamStore.updateTeam(req.params.id, updates)
  res.json(updated)
})

// GET /api/teams/:id/overview — high-level status of all agents (for Chuck orchestrator)
router.get('/:id/overview', (req, res) => {
  if (!checkTeamScope(req, res)) return
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  if (req.tenantId && team.tenantId && team.tenantId !== req.tenantId) {
    return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  }
  if (req.tenantId && !team.tenantId) {
    teamStore.updateTeam(team.id, { tenantId: req.tenantId })
  }

  const now = Date.now()
  const agents = (team.agents ?? []).map(a => {
    const lastHb = a.last_heartbeat ? new Date(a.last_heartbeat).getTime() : null
    const idleSecs = lastHb ? Math.round((now - lastHb) / 1000) : null
    let status = 'unknown'
    if (idleSecs === null) status = 'no-heartbeat'
    else if (idleSecs < 60) status = 'active'
    else if (idleSecs < 300) status = 'idle'
    else status = 'stale'

    return {
      id: a.id,
      role: a.role,
      model: a.model,
      runtime: a.runtime,
      status,
      idleSeconds: idleSecs,
      lastHeartbeat: a.last_heartbeat ?? null,
    }
  })

  return res.json({
    teamId: team.id,
    name: team.name,
    status: team.status,
    agentCount: agents.length,
    agents,
    autoNudge: team.autoNudge ?? { enabled: true },
    checkedAt: new Date().toISOString(),
  })
})

// POST /api/teams/rehydrate — rebuild in-memory store from TEAMS_DIR
// Used after Manager restart to recover team state without a database.
router.post('/rehydrate', async (_req, res) => {
  try {
    const restored = await rehydrateTeams(teamStore.restoreTeam)
    // Re-create IRC gateways for restored teams
    for (const id of restored) {
      const team = teamStore.getTeam(id)
      if (team) {
        try { createGateway(team, { onMessage: routeMessage }) } catch { /* may already exist */ }
      }
    }
    return res.json({ ok: true, restored })
  } catch (err) {
    console.error('[api/teams] rehydrate failed:', err)
    return res.status(500).json({ error: 'rehydrate failed', code: 'REHYDRATE_ERROR' })
  }
})

// DELETE /api/teams/:id — teardown compose stack + remove from store
router.delete('/:id', async (req, res) => {
  if (!checkTeamScope(req, res)) return
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  if (req.tenantId && team.tenantId && team.tenantId !== req.tenantId) {
    return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  }

  destroyGateway(req.params.id)
  try {
    await stopTeam(req.params.id)
  } catch (err) {
    console.error('[api/teams] stopTeam failed:', err)
    // Still remove from store — compose may already be gone
  }
  clearTeamBuffers(req.params.id)
  teamStore.deleteTeam(req.params.id)
  res.status(204).end()
})

export default router
