import { Router } from 'express'
import * as teamStore from '../store/teams.js'
import { startTeam, stopTeam } from '../orchestrator/compose.js'

const router = Router()

// POST /api/teams — create team + spin up compose stack
router.post('/', async (req, res) => {
  const { name, repo, agents, apiKeys } = req.body ?? {}
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

  const team = teamStore.createTeam({ name, repo, agents, apiKeys })
  try {
    await startTeam(team)
    teamStore.updateTeam(team.id, { status: 'running' })
    return res.status(201).json(teamStore.getTeam(team.id))
  } catch (err) {
    teamStore.deleteTeam(team.id)
    console.error('[api/teams] startTeam failed:', err)
    return res.status(500).json({ error: 'failed to start team', code: 'COMPOSE_ERROR' })
  }
})

// GET /api/teams — list all teams
router.get('/', (_req, res) => {
  res.json(teamStore.listTeams())
})

// GET /api/teams/:id — team detail
router.get('/:id', (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  res.json(team)
})

// PATCH /api/teams/:id — update team config (name, apiKeys only — agents/repo require re-create)
router.patch('/:id', (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const { name, apiKeys } = req.body ?? {}
  const updates = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name must be a non-empty string', code: 'INVALID_NAME' })
    }
    updates.name = name.trim()
  }
  if (apiKeys !== undefined) {
    if (typeof apiKeys !== 'object' || Array.isArray(apiKeys)) {
      return res.status(400).json({ error: 'apiKeys must be an object', code: 'INVALID_API_KEYS' })
    }
    updates.apiKeys = apiKeys
  }

  const updated = teamStore.updateTeam(req.params.id, updates)
  res.json(updated)
})

// DELETE /api/teams/:id — teardown compose stack + remove from store
router.delete('/:id', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  try {
    await stopTeam(req.params.id)
  } catch (err) {
    console.error('[api/teams] stopTeam failed:', err)
    // Still remove from store — compose may already be gone
  }
  teamStore.deleteTeam(req.params.id)
  res.status(204).end()
})

export default router
