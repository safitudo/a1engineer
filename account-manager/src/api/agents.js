import { Router } from 'express'
import {
  launchContainer,
  stopContainer,
  killContainer,
  captureScreen,
  sendDirective,
  listAgentContainers,
} from '../docker/containers.js'
import { extractClaudeSession } from '../session/keychain.js'

export const agentsRouter = Router()

// In-memory map: agentId → containerId
// In Phase 2, persist this to a state file or query Docker labels.
const agentContainers = new Map()

/**
 * POST /agents/launch
 * Body: { agent_id, config: { image, env }, secrets: { auth_mode } }
 * Launch an agent container.
 */
agentsRouter.post('/launch', async (req, res) => {
  const { agent_id, config = {}, secrets = {} } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const image = config.image || 'a1engineer/agent-claude:latest'
  const env = { AGENT_ID: agent_id, ...config.env }

  // Inject session credentials if auth_mode is session
  if (secrets.auth_mode === 'session' || env.AUTH_MODE === 'session') {
    const session = await extractClaudeSession()
    if (session) {
      env.CLAUDE_SESSION = session
    }
  }

  try {
    const containerId = await launchContainer({ agentId: agent_id, image, env })
    agentContainers.set(agent_id, containerId)
    res.status(201).json({ agent_id, container_id: containerId, status: 'starting' })
  } catch (err) {
    console.error('launch error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /agents/stop
 * Body: { agent_id }
 * Gracefully stop an agent container.
 */
agentsRouter.post('/stop', async (req, res) => {
  const { agent_id } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    await stopContainer(containerId)
    agentContainers.delete(agent_id)
    res.json({ agent_id, status: 'stopped' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /agents/kill
 * Body: { agent_id }
 * Kill an agent container immediately.
 */
agentsRouter.post('/kill', async (req, res) => {
  const { agent_id } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    await killContainer(containerId)
    agentContainers.delete(agent_id)
    res.json({ agent_id, status: 'killed' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /agents/directive
 * Body: { agent_id, message }
 * Send a directive to a running agent via tmux send-keys.
 */
agentsRouter.post('/directive', async (req, res) => {
  const { agent_id, message } = req.body
  if (!agent_id || !message) return res.status(400).json({ error: 'agent_id and message required' })

  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    await sendDirective(containerId, message)
    res.json({ agent_id, status: 'directive_sent' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /agents/screen/:id
 * Capture tmux pane output for an agent.
 */
agentsRouter.get('/screen/:id', async (req, res) => {
  const agent_id = req.params.id
  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    const output = await captureScreen(containerId)
    res.json({ agent_id, output })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /agents/status
 * List all agent containers and their current statuses.
 */
agentsRouter.get('/status', async (req, res) => {
  try {
    const containers = await listAgentContainers()
    res.json({ agents: containers })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
