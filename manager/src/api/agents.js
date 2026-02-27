import { Router } from 'express'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import * as teamStore from '../store/teams.js'
import { startTeam } from '../orchestrator/compose.js'
import { TEAMS_DIR } from '../constants.js'

const execFileAsync = promisify(execFile)

function composeFile(teamId) {
  return join(TEAMS_DIR, teamId, 'docker-compose.yml')
}
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

  const serviceName = `agent-${agent.id}`
  const cf = composeFile(team.id)
  try {
    await execFileAsync('docker', ['compose', '-f', cf, 'stop', serviceName])
    await execFileAsync('docker', ['compose', '-f', cf, 'rm', '-f', serviceName])
  } catch (err) {
    console.error('[api/agents] docker compose stop/rm failed:', err)
    // Container may already be gone — continue with store removal
  }

  const updatedAgents = team.agents.filter((a) => a.id !== req.params.agentId)
  teamStore.updateTeam(team.id, { agents: updatedAgents })
  res.status(204).end()
})

// ── Helper: docker exec into agent container ────────────────────────────────
async function dockerExec(teamId, agentId, cmd, opts = {}) {
  const serviceName = `agent-${agentId}`
  const cf = composeFile(teamId)
  const args = ['compose', '-f', cf, 'exec', '-T', serviceName, ...cmd]
  const { stdout } = await execFileAsync('docker', args, { timeout: opts.timeout ?? 10000 })
  return stdout
}

// ── Helper: tmux send-keys into agent session ────────────────────────────────
async function tmuxSendKeys(teamId, agentId, keys) {
  await dockerExec(teamId, agentId, ['tmux', 'send-keys', '-t', 'agent', ...keys])
}

/**
 * Send a message to the agent's interactive Claude Code prompt.
 * Clears any pending input first (Escape to dismiss, Ctrl+U to clear line),
 * then types the message and presses Enter to submit.
 */
async function sendToPrompt(teamId, agentId, message) {
  // Escape to dismiss any autocomplete/menu, then Ctrl+A Ctrl+K to clear input
  await tmuxSendKeys(teamId, agentId, ['Escape'])
  await new Promise(r => setTimeout(r, 100))
  await tmuxSendKeys(teamId, agentId, ['C-a'])
  await new Promise(r => setTimeout(r, 50))
  await tmuxSendKeys(teamId, agentId, ['C-k'])
  await new Promise(r => setTimeout(r, 100))
  // Send message as literal text, then Enter to submit
  await dockerExec(teamId, agentId, ['tmux', 'send-keys', '-t', 'agent', '-l', message])
  await new Promise(r => setTimeout(r, 50))
  await tmuxSendKeys(teamId, agentId, ['Enter'])
}

// GET /api/teams/:id/agents/:agentId/screen — capture agent's tmux screen
router.get('/:agentId/screen', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const agent = team.agents.find((a) => a.id === req.params.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found', code: 'AGENT_NOT_FOUND' })

  try {
    const output = await dockerExec(team.id, agent.id, [
      'tmux', 'capture-pane', '-t', 'agent', '-p',
    ])
    const lines = output.split('\n')
    return res.json({
      agentId: agent.id,
      role: agent.role,
      lines,
      lineCount: lines.length,
      capturedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[api/agents] screen capture failed:', err)
    return res.status(500).json({ error: 'screen capture failed', code: 'EXEC_ERROR' })
  }
})

// GET /api/teams/:id/agents/:agentId/activity — git activity for agent
router.get('/:agentId/activity', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const agent = team.agents.find((a) => a.id === req.params.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found', code: 'AGENT_NOT_FOUND' })

  try {
    const [diffStat, log, branch, status] = await Promise.all([
      dockerExec(team.id, agent.id, ['git', 'diff', '--stat']).catch(() => ''),
      dockerExec(team.id, agent.id, ['git', 'log', '--oneline', '-5']).catch(() => ''),
      dockerExec(team.id, agent.id, ['git', 'branch', '--show-current']).catch(() => ''),
      dockerExec(team.id, agent.id, ['git', 'status', '--short']).catch(() => ''),
    ])
    return res.json({
      agentId: agent.id,
      role: agent.role,
      branch: branch.trim(),
      diffStat: diffStat.trim(),
      recentCommits: log.trim().split('\n').filter(Boolean),
      status: status.trim(),
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[api/agents] activity check failed:', err)
    return res.status(500).json({ error: 'activity check failed', code: 'EXEC_ERROR' })
  }
})

// POST /api/teams/:id/agents/:agentId/nudge — send a message to agent via tmux
router.post('/:agentId/nudge', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const agent = team.agents.find((a) => a.id === req.params.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found', code: 'AGENT_NOT_FOUND' })

  const { message } = req.body ?? {}
  const nudgeMsg = (typeof message === 'string' && message)
    ? message
    : 'continue. check IRC with msg read, then resume your current task.'

  try {
    await sendToPrompt(team.id, agent.id, nudgeMsg)
    return res.json({ ok: true, message: nudgeMsg })
  } catch (err) {
    console.error('[api/agents] nudge failed:', err)
    return res.status(500).json({ error: 'nudge failed', code: 'EXEC_ERROR' })
  }
})

// POST /api/teams/:id/agents/:agentId/interrupt — send Ctrl+C to stop current execution
router.post('/:agentId/interrupt', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const agent = team.agents.find((a) => a.id === req.params.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found', code: 'AGENT_NOT_FOUND' })

  try {
    await tmuxSendKeys(team.id, agent.id, ['C-c'])
    return res.json({ ok: true, action: 'interrupt' })
  } catch (err) {
    console.error('[api/agents] interrupt failed:', err)
    return res.status(500).json({ error: 'interrupt failed', code: 'EXEC_ERROR' })
  }
})

// POST /api/teams/:id/agents/:agentId/directive — interrupt + send new instruction
router.post('/:agentId/directive', async (req, res) => {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })

  const agent = team.agents.find((a) => a.id === req.params.agentId)
  if (!agent) return res.status(404).json({ error: 'agent not found', code: 'AGENT_NOT_FOUND' })

  const { message } = req.body ?? {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required', code: 'MISSING_MESSAGE' })
  }

  try {
    // Ctrl+C to stop current work, brief pause, then new instruction
    await tmuxSendKeys(team.id, agent.id, ['C-c'])
    await new Promise(r => setTimeout(r, 500))
    await sendToPrompt(team.id, agent.id, message)
    return res.json({ ok: true, action: 'directive', message })
  } catch (err) {
    console.error('[api/agents] directive failed:', err)
    return res.status(500).json({ error: 'directive failed', code: 'EXEC_ERROR' })
  }
})

export default router
