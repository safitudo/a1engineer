import { Router } from 'express'

export const heartbeatRouter = Router()

// In-memory heartbeat store: agentId → { timestamp, count }
const heartbeats = new Map()

/**
 * POST /heartbeat
 * Body: { agent_id, timestamp }
 * Called by agent PostToolUse hooks to report liveness.
 * Does NOT require internal service token — agents call this directly.
 */
heartbeatRouter.post('/', (req, res) => {
  const { agent_id, timestamp } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const ts = timestamp || new Date().toISOString()
  const existing = heartbeats.get(agent_id) || { count: 0 }
  heartbeats.set(agent_id, { timestamp: ts, count: existing.count + 1 })

  res.json({ ok: true, agent_id, timestamp: ts })
})

/**
 * GET /heartbeat
 * List all recent heartbeats. Useful for monitoring.
 */
heartbeatRouter.get('/', (req, res) => {
  const result = {}
  for (const [agentId, data] of heartbeats.entries()) {
    result[agentId] = data
  }
  res.json(result)
})
