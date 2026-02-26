import express from 'express'
import { getTeam, updateTeam } from '../store/teams.js'
import { broadcastHeartbeat } from './ws.js'
import teamsRouter from './teams.js'
import agentsRouter from './agents.js'
import channelsRouter from './channels.js'

export function createApp() {
  const app = express()
  app.use(express.json())

  // POST /heartbeat/:teamId/:agentId — keep-alive from agent containers
  app.post('/heartbeat/:teamId/:agentId', (req, res) => {
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

  // REST API
  app.use('/api/teams', teamsRouter)
  app.use('/api/teams/:id/agents', agentsRouter)
  app.use('/api/teams/:id/channels', channelsRouter)

  // 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({ error: 'not found', code: 'NOT_FOUND' })
  })

  return app
}
