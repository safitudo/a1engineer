import { Router, Request, Response } from 'express'

const router = Router()

// In-memory heartbeat store: agentId → last seen timestamp
const heartbeats = new Map<string, string>()

interface HeartbeatBody {
  agent_id?: string
  timestamp?: string
}

// POST /heartbeat
router.post('/', (req: Request<object, object, HeartbeatBody>, res: Response) => {
  const { agent_id, timestamp } = req.body
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const at = timestamp || new Date().toISOString()
  heartbeats.set(agent_id, at)
  console.log(`[heartbeat] agent=${agent_id} at=${at}`)
  return res.json({ ok: true, agent_id, at })
})

// GET /heartbeat — list all recent heartbeats (internal use)
router.get('/', (_req: Request, res: Response) => {
  const result: Record<string, string> = {}
  for (const [id, at] of heartbeats) result[id] = at
  return res.json(result)
})

export default router
