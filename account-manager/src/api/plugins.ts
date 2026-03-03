import { Router, Request, Response } from 'express'
import { launchContainer, stopContainer } from '../docker/containers.js'

const router = Router()

// In-memory map of pluginId → containerId
const pluginContainers = new Map<string, string>()

interface PluginLaunchBody {
  plugin_id?: string
  config?: {
    image?: string
    type?: string
    env?: Record<string, string>
  }
}

// POST /plugins/launch
router.post('/launch', async (req: Request<object, object, PluginLaunchBody>, res: Response) => {
  const { plugin_id, config = {} } = req.body
  if (!plugin_id) return res.status(400).json({ error: 'plugin_id required' })

  try {
    const image = config.image || `a1engineer/plugin-${config.type || 'generic'}:latest`
    const env = Object.entries(config.env || {}).map(([k, v]) => `${k}=${v}`)
    const containerId = await launchContainer({ agentId: plugin_id, image, env, name: `plugin-${plugin_id}` })
    pluginContainers.set(plugin_id, containerId)
    return res.status(201).json({ ok: true, plugin_id, container_id: containerId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[plugins/launch] ${message}`)
    return res.status(500).json({ error: message })
  }
})

// POST /plugins/stop
router.post('/stop', async (req: Request<object, object, { plugin_id?: string }>, res: Response) => {
  const { plugin_id } = req.body
  if (!plugin_id) return res.status(400).json({ error: 'plugin_id required' })

  const containerId = pluginContainers.get(plugin_id)
  if (!containerId) return res.status(404).json({ error: 'plugin not found' })

  try {
    await stopContainer(containerId)
    pluginContainers.delete(plugin_id)
    return res.json({ ok: true, plugin_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[plugins/stop] ${message}`)
    return res.status(500).json({ error: message })
  }
})

export default router
