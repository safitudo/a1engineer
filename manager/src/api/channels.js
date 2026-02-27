import { Router } from 'express'
import * as teamStore from '../store/teams.js'
import { readMessages } from '../irc/router.js'

const router = Router({ mergeParams: true })

const GATEWAY_NOT_READY = {
  error: 'IRC gateway send not yet implemented',
  code: 'GATEWAY_NOT_READY',
}

function requireTeam(req, res) {
  const team = teamStore.getTeam(req.params.id)
  if (!team) {
    res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
    return null
  }
  return team
}

// GET /api/teams/:id/channels — list channels for team
router.get('/', (req, res) => {
  const team = requireTeam(req, res)
  if (!team) return
  // Static list of well-known channels — gateway will provide live membership
  res.json(['#main', '#tasks', '#code', '#testing', '#merges'].map((name) => ({ name, team: team.id })))
})

// GET /api/teams/:id/channels/:name/messages — read messages (via IRC gateway)
router.get('/:name/messages', (req, res) => {
  const team = requireTeam(req, res)
  if (!team) return
  const limit = Number(req.query.limit) || 100
  const since = req.query.since || undefined
  const channel = `#${req.params.name}`
  res.json(readMessages(team.id, channel, { limit, since }))
})

// POST /api/teams/:id/channels/:name/messages — send message (via IRC gateway)
router.post('/:name/messages', (req, res) => {
  const team = requireTeam(req, res)
  if (!team) return
  const { text } = req.body ?? {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required', code: 'MISSING_TEXT' })
  }
  res.status(501).json(GATEWAY_NOT_READY)
})

export default router
