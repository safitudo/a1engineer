import { Router } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as teamStore from '../store/teams.js'
import { startTeam } from '../orchestrator/compose.js'

const execFileAsync = promisify(execFile)
const router = Router({ mergeParams: true })

// GET /api/teams/:id/agents — list agents in team
router.get('/', (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  res.json(team.agents)
})

// POST /api/teams/:id/agents — spawn a new agent into the running team
router.post('/', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const { role, model, runtime, prompt, env } = req.body ?? {}
  if (!role || typeof role !== 'string') {
    return res.status(400).json({ error: 'role is required', code: 'MISSING_ROLE' })
  }

  const agentId = `${team.name}-${role}-${Date.now()}`
  const newAgent = {
    id: agentId,
    role,
    model: model ?? 'claude-opus-4-6',
    runtime: runtime ?? 'claude-code',
    prompt: prompt ?? '',
    env: env ?? {},
    last_heartbeat: null,
  }

  const updatedAgents = [...team.agents, newAgent]
  const updatedTeam = teamStore.updateTeam(team.id, { agents: updatedAgents })

  try {
    // Re-render and apply compose — new service will be added, existing ones untouched
    await startTeam(updatedTeam)
    return res.status(201).json(newAgent)
  } catch (err) {
    // Roll back store addition
    teamStore.updateTeam(team.id, { agents: team.agents })
    console.error('[api/agents] spawn failed:', err)
    return res.status(500).json({ error: 'failed to spawn agent', code: 'COMPOSE_ERROR' })
  }
})

// DELETE /api/teams/:id/agents/:agentId — kill a single agent container
router.delete('/:agentId', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const agent = team.agents.find((a) => a.id === req.params.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found', code: 'AGENT_NOT_FOUND' })

  const containerName = `agent-${agent.id}`
  try {
    await execFileAsync('docker', ['stop', containerName])
    await execFileAsync('docker', ['rm', containerName])
  } catch (err) {
    console.error('[api/agents] docker stop/rm failed:', err)
    // Container may already be gone — continue with store removal
  }

  const updatedAgents = team.agents.filter((a) => a.id !== req.params.agentId)
  teamStore.updateTeam(team.id, { agents: updatedAgents })
  res.status(204).end()
})

// POST /api/teams/:id/agents/:agentId/nudge — send a message to agent via docker exec
router.post('/:agentId/nudge', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const agent = team.agents.find((a) => a.id === req.params.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found', code: 'AGENT_NOT_FOUND' })

  const { message } = req.body ?? {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required', code: 'MISSING_MESSAGE' })
  }

  const containerName = `agent-${agent.id}`
  try {
    await execFileAsync('docker', [
      'exec', '-i', containerName,
      'sh', '-c', 'cat >> /tmp/nudge.txt',
    ], { input: message + '\n' })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[api/agents] nudge failed:', err)
    return res.status(500).json({ error: 'nudge failed', code: 'EXEC_ERROR' })
  }
})

export default router
