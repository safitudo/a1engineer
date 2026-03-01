import { Router } from 'express'
import { spawn } from 'child_process'
import { join } from 'path'
import * as teamStore from '../store/teams.js'
import { startTeam, stopTeam, rehydrateTeams } from '../orchestrator/compose.js'
import { createGateway, destroyGateway, getGateway } from '../irc/gateway.js'
import { broadcastTeamStatus } from './ws.js'
import { routeMessage, clearTeamBuffers } from '../irc/router.js'
import { TEAMS_DIR } from '../constants.js'

const router = Router()

// Middleware: resolve team by :id, enforce scope + tenant isolation, auto-adopt
function requireTeam(req, res, next) {
  if (req.teamScope && req.params.id !== req.teamScope) {
    return res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' })
  }
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  if (req.tenantId && team.tenantId && team.tenantId !== req.tenantId) {
    return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  }
  if (req.tenantId && !team.tenantId) {
    teamStore.updateTeam(team.id, { tenantId: req.tenantId })
  }
  req.team = team
  next()
}

// POST /api/teams — create team + spin up compose stack
// Accepts the full team config (same schema as JSON config files)
router.post('/', async (req, res) => {
  if (req.teamScope) {
    return res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' })
  }
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
    // Inject fresh GitHub tokens into containers (5s delay for containers to be ready)
    const tokenRefresh = req.app.get('tokenRefresh')
    if (tokenRefresh?.refreshNow) tokenRefresh.refreshNow()
    broadcastTeamStatus(team.id, 'running', team.tenantId, { name: team.name })
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
router.get('/:id', requireTeam, (req, res) => {
  res.json(req.team)
})

// PATCH /api/teams/:id — update team config (name, apiKeys only — agents/repo require re-create)
router.patch('/:id', requireTeam, (req, res) => {
  const { name, auth, channels } = req.body ?? {}
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
  if (channels !== undefined) {
    if (!Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({ error: 'channels must be a non-empty array', code: 'INVALID_CHANNELS' })
    }
    if (!channels.every((c) => typeof c === 'string' && c.startsWith('#') && c.length > 1)) {
      return res.status(400).json({ error: 'each channel must start with # and have a name', code: 'INVALID_CHANNELS' })
    }
    if (channels.length > 20) {
      return res.status(400).json({ error: 'maximum 20 channels allowed', code: 'INVALID_CHANNELS' })
    }
    updates.channels = channels
  }

  const updated = teamStore.updateTeam(req.params.id, updates)
  if (updates.channels) {
    getGateway(req.params.id)?.updateChannels(updates.channels)
  }
  res.json(updated)
})

// GET /api/teams/:id/overview — high-level status of all agents (for Chuck orchestrator)
router.get('/:id/overview', requireTeam, (req, res) => {
  const team = req.team
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

// GET /api/teams/:id/logs — stream docker compose logs as SSE
router.get('/:id/logs', requireTeam, (req, res) => {
  const follow = req.query.follow === 'true'
  const tail = Math.max(1, parseInt(req.query.tail ?? '100', 10) || 100)
  const composePath = join(TEAMS_DIR, req.params.id, 'docker-compose.yml')

  const args = ['compose', '-f', composePath, 'logs', '--no-color', `--tail=${tail}`]
  if (follow) args.push('--follow')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const proc = spawn('docker', args)

  function sendLines(chunk) {
    const lines = chunk.toString().split('\n')
    for (const line of lines) {
      if (line) res.write(`data: ${line}\n\n`)
    }
  }

  proc.stdout.on('data', sendLines)
  proc.stderr.on('data', sendLines)

  proc.on('close', () => {
    res.write('event: done\ndata: end\n\n')
    res.end()
  })

  req.on('close', () => proc.kill())
})

// POST /api/teams/rehydrate — rebuild in-memory store from TEAMS_DIR
// Used after Manager restart to recover team state without a database.
router.post('/rehydrate', async (req, res) => {
  if (req.teamScope) {
    return res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' })
  }
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

// POST /api/teams/:id/stop — non-destructive stop (keeps team in store)
router.post('/:id/stop', requireTeam, async (req, res) => {
  const { team } = req
  if (team.status === 'stopped') {
    return res.status(409).json({ error: 'team is already stopped', code: 'ALREADY_STOPPED' })
  }

  destroyGateway(req.params.id)
  try {
    await stopTeam(req.params.id)
  } catch (err) {
    console.error('[api/teams] stopTeam failed:', err)
  }
  teamStore.updateTeam(req.params.id, { status: 'stopped' })
  broadcastTeamStatus(req.params.id, 'stopped', team.tenantId)
  res.json({ ok: true, status: 'stopped' })
})

// POST /api/teams/:id/start — restart a stopped team
router.post('/:id/start', requireTeam, async (req, res) => {
  const { team } = req
  if (team.status !== 'stopped') {
    return res.status(409).json({ error: 'team is not stopped', code: 'NOT_STOPPED' })
  }

  try {
    await startTeam(team, { apiKey: team.auth?.apiKey })
    teamStore.updateTeam(req.params.id, { status: 'running' })
    createGateway(teamStore.getTeam(req.params.id), { onMessage: routeMessage })
    const tokenRefresh = req.app.get('tokenRefresh')
    if (tokenRefresh?.refreshNow) tokenRefresh.refreshNow()
    broadcastTeamStatus(req.params.id, 'running', team.tenantId)
    res.json({ ok: true, status: 'running' })
  } catch (err) {
    console.error('[api/teams] startTeam failed:', err)
    teamStore.updateTeam(req.params.id, { status: 'error' })
    broadcastTeamStatus(req.params.id, 'error', team.tenantId)
    res.status(500).json({ error: 'failed to start team', code: 'COMPOSE_ERROR' })
  }
})

// DELETE /api/teams/:id — teardown compose stack + remove from store
router.delete('/:id', requireTeam, async (req, res) => {
  const { team } = req
  destroyGateway(req.params.id)
  try {
    await stopTeam(req.params.id)
  } catch (err) {
    console.error('[api/teams] stopTeam failed:', err)
    // Still remove from store — compose may already be gone
  }
  clearTeamBuffers(req.params.id)
  teamStore.deleteTeam(req.params.id)
  broadcastTeamStatus(req.params.id, 'deleted', team.tenantId)
  res.status(204).end()
})

export default router
