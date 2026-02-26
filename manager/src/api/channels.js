import { Router } from 'express'
import * as teamStore from '../store/teams.js'

const router = Router({ mergeParams: true })

// Channels API depends on IRC gateway (#14 — not yet implemented).
// These endpoints return 501 until the gateway is wired in.
// Once gateway.js is available, replace the stub body with gateway calls.

const GATEWAY_NOT_READY = {
  error: 'IRC gateway not yet available — depends on issue #14',
  code: 'GATEWAY_NOT_READY',
}

async function requireTeam(req, res) {
  const team = await teamStore.getTeam(req.params.id)
  if (!team) {
    res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
    return null
  }
  return team
}

// GET /api/teams/:id/channels — list channels for team
router.get('/', async (req, res) => {
  const team = await requireTeam(req, res)
  if (!team) return
  // Static list of well-known channels — gateway will provide live membership
  res.json(['#main', '#tasks', '#code', '#testing', '#merges'].map((name) => ({ name, team: team.id })))
})

// GET /api/teams/:id/channels/:name/messages — read messages (via IRC gateway)
router.get('/:name/messages', async (req, res) => {
  const team = await requireTeam(req, res)
  if (!team) return
  res.status(501).json(GATEWAY_NOT_READY)
})

// POST /api/teams/:id/channels/:name/messages — send message (via IRC gateway)
router.post('/:name/messages', async (req, res) => {
  const team = await requireTeam(req, res)
  if (!team) return
  const { text } = req.body ?? {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required', code: 'MISSING_TEXT' })
  }
  res.status(501).json(GATEWAY_NOT_READY)
})

export default router
