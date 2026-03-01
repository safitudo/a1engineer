import express from 'express'
import { getTeam, updateTeam } from '../store/teams.js'
import { broadcastHeartbeat } from './ws.js'
import { requireAuth, requireTeamOwnership } from '../middleware/auth.js'
import { resolveGitHubToken } from '../github/app.js'
import teamsRouter from './teams.js'
import agentsRouter from './agents.js'
import channelsRouter from './channels.js'
import authRouter from './auth.js'
import templatesRouter from './templates.js'
import { registerAdapter } from '../irc/registry.js'
import { getGateway as getIrcGateway } from '../irc/gateway.js'
import { findTeamsByChannelId } from '../store/channels.js'

export function createApp() {
  const app = express()
  app.use(express.json())

  registerAdapter('irc', {
    getGateway(channelId) {
      const [teamId] = findTeamsByChannelId(channelId)
      return teamId ? getIrcGateway(teamId) : null
    },
    broadcast(channelId, channelName, msg) {
      for (const teamId of findTeamsByChannelId(channelId)) {
        getIrcGateway(teamId)?.say(channelName, msg)
      }
    },
  })

  // GET /github-token/:teamId — fresh GitHub token for agent git operations
  app.get('/github-token/:teamId', requireAuth, async (req, res) => {
    if (req.teamScope && req.params.teamId !== req.teamScope) {
      return res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' })
    }
    const team = getTeam(req.params.teamId)
    if (!team) return res.status(404).json({ error: 'team not found' })
    try {
      const token = await resolveGitHubToken(team)
      if (!token) return res.status(404).json({ error: 'no github config for team' })
      return res.json({ token })
    } catch (err) {
      console.error('[github-token] refresh failed:', err.message)
      return res.status(500).json({ error: 'token refresh failed' })
    }
  })

  // POST /heartbeat/:teamId/:agentId — keep-alive from agent containers
  app.post('/heartbeat/:teamId/:agentId', requireAuth, (req, res) => {
    if (req.teamScope && req.params.teamId !== req.teamScope) {
      return res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' })
    }
    const { teamId, agentId } = req.params
    const team = getTeam(teamId)
    if (!team) {
      return res.status(404).json({ error: 'team not found', code: 'NOT_FOUND' })
    }
    const now = new Date().toISOString()
    const agents = team.agents.map((a) =>
      a.id === agentId ? { ...a, last_heartbeat: now } : a
    )
    updateTeam(teamId, { agents })
    broadcastHeartbeat(teamId, agentId, now)
    console.log(`[heartbeat] team=${teamId} agent=${agentId} at=${now}`)
    return res.json({ ok: true, at: now })
  })

  // Templates — public, no auth required
  app.use('/api/templates', templatesRouter)

  // Auth routes — no tenant middleware (login is public-ish)
  app.use('/api/auth', authRouter)

  // REST API — tenant-scoped
  app.use('/api/teams', requireAuth, requireTeamOwnership, teamsRouter)
  app.use('/api/teams/:id/agents', requireAuth, requireTeamOwnership, agentsRouter)
  app.use('/api/teams/:id/channels', requireAuth, requireTeamOwnership, channelsRouter)

  // 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({ error: 'not found', code: 'NOT_FOUND' })
  })

  return app
}
