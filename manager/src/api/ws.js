import { WebSocketServer } from 'ws'
import { getTeam } from '../store/teams.js'
import { registerBroadcaster } from '../irc/router.js'
import { findByApiKey } from '../store/tenants.js'

// WebSocket.OPEN numeric value (avoids importing the class just for the constant)
const WS_OPEN = 1

// Per-team subscriber sets  —  Map<teamId, Set<WebSocket>>
const subscriptions = new Map()

let _unregisterBroadcaster = null

/**
 * Send a JSON payload to all clients subscribed to a team.
 * Messages are dropped (not buffered) when the socket is busy — backpressure.
 */
function fanOut(teamId, payload) {
  const clients = subscriptions.get(teamId)
  if (!clients) return
  for (const ws of clients) {
    if (ws.readyState === WS_OPEN && ws.bufferedAmount === 0) {
      ws.send(payload)
    }
  }
}

/**
 * Broadcast a heartbeat event to clients subscribed to a team.
 * Safe to call before attachWebSocketServer — fanOut is a no-op until
 * subscriptions are populated.
 */
export function broadcastHeartbeat(teamId, agentId, timestamp) {
  fanOut(teamId, JSON.stringify({ type: 'heartbeat', teamId, agentId, timestamp }))
}

/**
 * Broadcast an agent lifecycle status change to clients subscribed to a team.
 * status: 'spawned' | 'killed' | 'stalled'
 */
export function broadcastAgentStatus(teamId, agentId, status) {
  fanOut(teamId, JSON.stringify({ type: 'agent_status', teamId, agentId, status }))
}

/**
 * Attach a WebSocket server to an existing HTTP server (call once, after listen).
 *
 * Only upgrades on path `/ws` are accepted; all others get a 400 close.
 *
 * Client → server protocol (in order):
 *   { type: 'auth',      token: string }     — MUST be first message; authenticates the connection
 *   { type: 'subscribe', teamId: string }    — subscribe (or re-subscribe) to a team
 *
 * Server → client protocol:
 *   { type: 'authenticated' }                — auth accepted
 *   { type: 'subscribed', teamId }           — subscription confirmed
 *   { type: 'message',    teamId, channel, nick, text, time, tag, tagBody }
 *   { type: 'heartbeat',  teamId, agentId, timestamp }
 *   { type: 'agent_status', teamId, agentId, status }
 *   { type: 'error',      code, message }    — fatal errors close the connection
 *
 * Auth: the client sends { type: 'auth', token } as its first message.
 * The token never appears in the URL — it stays in the WS frame payload only.
 * Idempotent — calling again after the first attach is a no-op.
 */
export function attachWebSocketServer(server) {
  if (_unregisterBroadcaster) return // already attached

  const wss = new WebSocketServer({ noServer: true })

  // Hook into IrcRouter — fan out every incoming IRC message to subscribed clients
  _unregisterBroadcaster = registerBroadcaster((entry) => {
    fanOut(entry.teamId, JSON.stringify({ type: 'message', ...entry }))
  })

  wss.on('connection', (ws) => {
    let currentTeamId = null
    let authenticated = false

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON', message: 'message must be JSON' }))
        ws.close()
        return
      }

      // Auth handshake — must be first message
      if (!authenticated) {
        if (msg.type !== 'auth') {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHENTICATED', message: 'first message must be { type: "auth", token }' }))
          ws.close()
          return
        }
        const token = msg.token
        if (!token || typeof token !== 'string') {
          ws.send(JSON.stringify({ type: 'error', code: 'MISSING_TOKEN', message: 'token required' }))
          ws.close()
          return
        }
        const tenant = findByApiKey(token)
        if (!tenant) {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'invalid token' }))
          ws.close()
          return
        }
        ws.tenant = tenant
        authenticated = true
        ws.send(JSON.stringify({ type: 'authenticated' }))
        return
      }

      // Post-auth messages
      if (msg.type !== 'subscribe') {
        ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_TYPE', message: `unknown type: ${msg.type}` }))
        return
      }

      const newTeamId = msg.teamId
      if (!newTeamId || typeof newTeamId !== 'string') {
        ws.send(JSON.stringify({ type: 'error', code: 'MISSING_TEAM_ID', message: 'teamId required' }))
        return
      }

      const team = getTeam(newTeamId)
      if (!team) {
        ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND', message: 'team not found' }))
        return
      }

      // Tenant scoping — only allow subscribing to own teams
      if (ws.tenant && team.tenantId && ws.tenant.id !== team.tenantId) {
        ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND', message: 'team not found' }))
        return
      }

      // Unsubscribe from previous team when switching
      if (currentTeamId) {
        subscriptions.get(currentTeamId)?.delete(ws)
      }

      currentTeamId = newTeamId
      if (!subscriptions.has(currentTeamId)) subscriptions.set(currentTeamId, new Set())
      subscriptions.get(currentTeamId).add(ws)

      ws.send(JSON.stringify({ type: 'subscribed', teamId: currentTeamId }))
    })

    ws.on('close', () => {
      if (currentTeamId) {
        subscriptions.get(currentTeamId)?.delete(ws)
      }
    })

    ws.on('error', (err) => {
      console.error('[ws] client error:', err.message)
    })
  })

  // Only accept upgrades on /ws — destroy anything else
  server.on('upgrade', (req, socket, head) => {
    let pathname
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      socket.destroy()
      return
    }

    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }

    // Accept upgrade — auth happens via first WS message (token never in URL)
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })
}
