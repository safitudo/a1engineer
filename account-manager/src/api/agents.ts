import { Router, Request, Response } from 'express'
import {
  launchContainer,
  stopContainer,
  killContainer,
  captureScreen,
  listAgentContainers,
  execInContainer,
} from '../docker/containers.js'
import { extractClaudeSession } from '../session/keychain.js'

const router = Router()

// In-memory map of agentId → containerId
const agentContainers = new Map<string, string>()

interface LaunchBody {
  agent_id?: string
  config?: {
    auth_mode?: 'session' | 'api-key'
    irc_channels?: string[]
    name?: string
    role?: string
    image?: string
  }
  secrets?: {
    api_key?: string
  }
}

// POST /agents/launch
router.post('/launch', async (req: Request<object, object, LaunchBody>, res: Response) => {
  const { agent_id, config = {}, secrets = {} } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  try {
    const env: string[] = [
      `AGENT_ID=${agent_id}`,
      `ACCOUNT_MANAGER_URL=http://account-manager:4100`,
      `BACKEND_URL=${process.env.BACKEND_URL ?? 'http://backend:4000'}`,
    ]

    if (config.auth_mode === 'session' || !config.auth_mode) {
      const session = await extractClaudeSession()
      if (session) env.push(`CLAUDE_SESSION=${session}`)
    } else if (config.auth_mode === 'api-key' && secrets.api_key) {
      env.push(`ANTHROPIC_API_KEY=${secrets.api_key}`)
    }

    if (config.irc_channels) env.push(`IRC_CHANNELS=${config.irc_channels.join(',')}`)
    if (config.name) env.push(`AGENT_NAME=${config.name}`)
    if (config.role) env.push(`AGENT_ROLE=${config.role}`)

    const image = config.image ?? 'a1engineer/agent-claude:latest'
    const containerId = await launchContainer({ agentId: agent_id, image, env, name: `agent-${agent_id}` })
    agentContainers.set(agent_id, containerId)

    notifyBackend(agent_id, 'running').catch(() => {})

    return res.status(201).json({ ok: true, agent_id, container_id: containerId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agents/launch] ${message}`)
    return res.status(500).json({ error: message })
  }
})

// POST /agents/stop
router.post('/stop', async (req: Request<object, object, { agent_id?: string }>, res: Response) => {
  const { agent_id } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    await stopContainer(containerId)
    agentContainers.delete(agent_id)
    notifyBackend(agent_id, 'stopped').catch(() => {})
    return res.json({ ok: true, agent_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agents/stop] ${message}`)
    return res.status(500).json({ error: message })
  }
})

// POST /agents/kill
router.post('/kill', async (req: Request<object, object, { agent_id?: string }>, res: Response) => {
  const { agent_id } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    await killContainer(containerId)
    agentContainers.delete(agent_id)
    notifyBackend(agent_id, 'stopped').catch(() => {})
    return res.json({ ok: true, agent_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agents/kill] ${message}`)
    return res.status(500).json({ error: message })
  }
})

// POST /agents/directive
router.post('/directive', async (req: Request<object, object, { agent_id?: string; message?: string }>, res: Response) => {
  const { agent_id, message } = req.body
  if (!agent_id || !message) return res.status(400).json({ error: 'agent_id and message required' })

  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    const escaped = message.replace(/'/g, "'\\''")
    await execInContainer(containerId, `tmux send-keys -t agent '${escaped}' Enter`)
    return res.json({ ok: true, agent_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agents/directive] ${message}`)
    return res.status(500).json({ error: message })
  }
})

// GET /agents/screen/:id
router.get('/screen/:id', async (req: Request, res: Response) => {
  const agent_id = req.params.id as string
  const containerId = agentContainers.get(agent_id)
  if (!containerId) return res.status(404).json({ error: 'agent not found' })

  try {
    const output = await captureScreen(containerId)
    return res.json({ agent_id, output })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agents/screen] ${message}`)
    return res.status(500).json({ error: message })
  }
})

// GET /agents/status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const containers = await listAgentContainers()
    return res.json({ agents: containers })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agents/status] ${message}`)
    return res.status(500).json({ error: message })
  }
})

async function notifyBackend(agentId: string, status: string): Promise<void> {
  const backendUrl = process.env.BACKEND_URL ?? 'http://backend:4000'
  await fetch(`${backendUrl}/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

export default router
