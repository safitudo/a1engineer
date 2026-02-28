import { Router } from 'express'
import * as teamStore from '../store/teams.js'
import { DEFAULT_CHANNELS } from '../store/teams.js'
import { readMessages } from '../irc/router.js'
import { getGateway } from '../irc/gateway.js'

const router = Router({ mergeParams: true })

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
  res.json((team.channels ?? DEFAULT_CHANNELS).map((name) => ({ name, team: team.id })))
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
  const channel = `#${req.params.name}`
  const gw = getGateway(team.id)
  if (!gw) {
    return res.status(503).json({ error: 'IRC gateway not connected for this team', code: 'GATEWAY_NOT_READY' })
  }
  try {
    gw.say(channel, text)
    return res.json({ ok: true, channel, text })
  } catch (err) {
    return res.status(500).json({ error: 'failed to send message', code: 'SEND_ERROR' })
  }
})

export default router
