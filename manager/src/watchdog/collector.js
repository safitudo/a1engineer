import http from 'http'
import { getTeam, updateTeam } from '../store/teams.js'

export function createHeartbeatServer(port = 8080) {
  const server = http.createServer((req, res) => {
    // POST /heartbeat/:teamId/:agentId
    const match = req.url?.match(/^\/heartbeat\/([^/]+)\/([^/]+)$/)
    if (req.method === 'POST' && match) {
      const [, teamId, agentId] = match
      const team = getTeam(teamId)
      if (!team) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'team not found' }))
        return
      }
      const now = new Date().toISOString()
      const agents = team.agents.map((a) =>
        a.id === agentId
          ? { ...a, last_heartbeat: now }
          : a
      )
      updateTeam(teamId, { agents })
      console.log(`[heartbeat] team=${teamId} agent=${agentId} at=${now}`)
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, at: now }))
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ error: 'not found' }))
  })

  server.listen(port, () => {
    console.log(`[heartbeat] listening on :${port}`)
  })

  return server
}
