import { Router } from 'express'

export const pluginsRouter = Router()

// In-memory plugin state: pluginId → { containerId, status }
const pluginContainers = new Map()

/**
 * POST /plugins/launch
 * Body: { plugin_id, config }
 * Start a plugin container (e.g., GitHub plugin).
 */
pluginsRouter.post('/launch', async (req, res) => {
  const { plugin_id, config = {} } = req.body
  if (!plugin_id) return res.status(400).json({ error: 'plugin_id required' })

  // TODO: implement Docker launch for plugin container
  // For now, stub returns 501 to indicate not yet implemented
  res.status(501).json({
    error: 'not implemented',
    message: 'Plugin lifecycle not yet implemented — stub endpoint',
    plugin_id,
  })
})

/**
 * POST /plugins/stop
 * Body: { plugin_id }
 * Stop a running plugin container.
 */
pluginsRouter.post('/stop', async (req, res) => {
  const { plugin_id } = req.body
  if (!plugin_id) return res.status(400).json({ error: 'plugin_id required' })

  // TODO: implement Docker stop for plugin container
  res.status(501).json({
    error: 'not implemented',
    message: 'Plugin lifecycle not yet implemented — stub endpoint',
    plugin_id,
  })
})
