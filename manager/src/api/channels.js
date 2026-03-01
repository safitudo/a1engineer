import { Router } from 'express'
import * as teamStore from '../store/teams.js'
import { DEFAULT_CHANNELS } from '../store/teams.js'
import { readMessages } from '../irc/router.js'
import { getGateway } from '../irc/gateway.js'
import { listTeamChannels } from '../store/channels.js'

const router = Router({ mergeParams: true })

// Middleware: resolve team by :id, 404 if missing
function resolveTeam(req, res, next) {
  const team = teamStore.getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
  req.team = team
  next()
}

// GET /api/teams/:id/channels — list channels for team
router.get('/', resolveTeam, (req, res) => {
  res.json((req.team.channels ?? DEFAULT_CHANNELS).map((name) => ({ name, team: req.team.id })))
})

// GET /api/teams/:id/channels/:name/messages — read messages (via IRC gateway)
router.get('/:name/messages', resolveTeam, (req, res) => {
  const limit = Number(req.query.limit) || 100
  const since = req.query.since || undefined
  const channel = `#${req.params.name}`
  const channels = listTeamChannels(req.team.id)
  const ch = channels.find(c => c.name === channel)
  if (!ch) return res.json([])
  res.json(readMessages(ch.id, { limit, since }))
})

// POST /api/teams/:id/channels/:name/messages — send message (via IRC gateway)
router.post('/:name/messages', resolveTeam, (req, res) => {
  const { text } = req.body ?? {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required', code: 'MISSING_TEXT' })
  }
  const channel = `#${req.params.name}`
  const gw = getGateway(req.team.id)
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
