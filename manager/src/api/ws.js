import { WebSocketServer } from 'ws'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { getTeam } from '../store/teams.js'
import { registerBroadcaster } from '../irc/router.js'
import { findByApiKey } from '../store/tenants.js'
import { TEAMS_DIR } from '../constants.js'

const execFileAsync = promisify(execFile)

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

// ── console.* helpers ─────────────────────────────────────────────────────────

function composeFile(teamId) {
  return join(TEAMS_DIR, teamId, 'docker-compose.yml')
}

async function tmuxCapturePane(teamId, agentId) {
  const serviceName = `agent-${agentId}`
  const cf = composeFile(teamId)
  const args = ['compose', '-f', cf, 'exec', '-T', '-u', 'agent', serviceName,
    'tmux', 'capture-pane', '-t', 'agent', '-p', '-e']
  const { stdout } = await execFileAsync('docker', args, { timeout: 5000 })
  return stdout
}

async function tmuxSendInput(teamId, agentId, data) {
  const serviceName = `agent-${agentId}`
  const cf = composeFile(teamId)
  // Pass data via env var to avoid shell escaping issues with raw keystroke sequences
  const args = ['compose', '-f', cf, 'exec', '-T', '-u', 'agent',
    '-e', `KEYS=${data}`,
    serviceName, 'bash', '-c', 'tmux send-keys -t agent -l -- "$KEYS"']
  await execFileAsync('docker', args, { timeout: 5000 })
}

async function tmuxResize(teamId, agentId, cols, rows) {
  const serviceName = `agent-${agentId}`
  const cf = composeFile(teamId)
  const args = ['compose', '-f', cf, 'exec', '-T', '-u', 'agent', serviceName,
    'tmux', 'resize-pane', '-t', 'agent', '-x', String(cols), '-y', String(rows)]
  await execFileAsync('docker', args, { timeout: 5000 })
}

// Rate limiter: returns true if the message is allowed, false if rate-limited.
// 100 messages per second per agentId, tracked per-connection.
function checkRateLimit(rateLimiters, agentId) {
  const now = Date.now()
  const state = rateLimiters.get(agentId)
  if (!state || now - state.windowStart >= 1000) {
    rateLimiters.set(agentId, { count: 1, windowStart: now })
    return true
  }
  if (state.count >= 100) return false
  state.count++
  return true
}

/**
 * Attach a WebSocket server to an existing HTTP server (call once, after listen).
 *
 * Only upgrades on path `/ws` are accepted; all others get a 400 close.
 *
 * Client → server protocol (in order):
 *   { type: 'auth',           token: string }               — MUST be first message
 *   { type: 'subscribe',      teamId: string }              — subscribe to team IRC feed
 *   { type: 'console.attach', teamId, agentId }             — start streaming tmux output
 *   { type: 'console.input',  agentId, data: string }       — forward keystroke to tmux
 *   { type: 'console.detach', agentId }                     — stop streaming
 *   { type: 'console.resize', agentId, cols: number, rows: number } — resize pane
 *
 * Server → client protocol:
 *   { type: 'authenticated' }
 *   { type: 'subscribed',      teamId }
 *   { type: 'message',         teamId, channel, nick, text, time, tag, tagBody }
 *   { type: 'heartbeat',       teamId, agentId, timestamp }
 *   { type: 'agent_status',    teamId, agentId, status }
 *   { type: 'console.attached', agentId }
 *   { type: 'console.data',    agentId, data: string }
 *   { type: 'console.detached', agentId }
 *   { type: 'error',           code, message }
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

    // Map<agentId, { teamId, intervalId }> — active console streams for this connection
    const activeStreams = new Map()
    // Map<agentId, { count, windowStart }> — rate limit state per agent
    const inputRateLimiters = new Map()

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

      // Post-auth message dispatch
      switch (msg.type) {
        case 'subscribe': {
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
          break
        }

        case 'console.attach': {
          const { teamId, agentId } = msg
          if (!teamId || typeof teamId !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_TEAM_ID', message: 'teamId required' }))
            return
          }
          if (!agentId || typeof agentId !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_AGENT_ID', message: 'agentId required' }))
            return
          }

          const team = getTeam(teamId)
          if (!team) {
            ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND', message: 'team not found' }))
            return
          }
          if (ws.tenant && team.tenantId && ws.tenant.id !== team.tenantId) {
            ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND', message: 'team not found' }))
            return
          }
          const agent = team.agents.find((a) => a.id === agentId)
          if (!agent) {
            ws.send(JSON.stringify({ type: 'error', code: 'AGENT_NOT_FOUND', message: 'agent not found' }))
            return
          }

          // Clear any existing stream for this agentId before starting a new one
          const existing = activeStreams.get(agentId)
          if (existing) clearInterval(existing.intervalId)

          const intervalId = setInterval(async () => {
            if (ws.readyState !== WS_OPEN) return
            try {
              const data = await tmuxCapturePane(teamId, agentId)
              ws.send(JSON.stringify({ type: 'console.data', agentId, data }))
            } catch (err) {
              console.error(`[ws] console.data capture failed (${agentId}):`, err.message)
            }
          }, 500)

          activeStreams.set(agentId, { teamId, intervalId })
          ws.send(JSON.stringify({ type: 'console.attached', agentId }))
          break
        }

        case 'console.input': {
          const { agentId, data } = msg
          if (!agentId || typeof agentId !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_AGENT_ID', message: 'agentId required' }))
            return
          }
          if (typeof data !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_DATA', message: 'data required' }))
            return
          }

          const stream = activeStreams.get(agentId)
          if (!stream) {
            ws.send(JSON.stringify({ type: 'error', code: 'NOT_ATTACHED', message: 'console not attached — send console.attach first' }))
            return
          }

          if (!checkRateLimit(inputRateLimiters, agentId)) {
            ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: 'input rate limit exceeded (100/s)' }))
            return
          }

          tmuxSendInput(stream.teamId, agentId, data).catch((err) => {
            console.error(`[ws] console.input failed (${agentId}):`, err.message)
          })
          break
        }

        case 'console.detach': {
          const { agentId } = msg
          if (!agentId || typeof agentId !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_AGENT_ID', message: 'agentId required' }))
            return
          }

          const stream = activeStreams.get(agentId)
          if (stream) {
            clearInterval(stream.intervalId)
            activeStreams.delete(agentId)
          }
          inputRateLimiters.delete(agentId)
          ws.send(JSON.stringify({ type: 'console.detached', agentId }))
          break
        }

        case 'console.resize': {
          const { agentId, cols, rows } = msg
          if (!agentId || typeof agentId !== 'string') {
            ws.send(JSON.stringify({ type: 'error', code: 'MISSING_AGENT_ID', message: 'agentId required' }))
            return
          }
          if (typeof cols !== 'number' || typeof rows !== 'number' || cols < 1 || rows < 1) {
            ws.send(JSON.stringify({ type: 'error', code: 'INVALID_SIZE', message: 'cols and rows must be positive numbers' }))
            return
          }

          const stream = activeStreams.get(agentId)
          if (!stream) {
            ws.send(JSON.stringify({ type: 'error', code: 'NOT_ATTACHED', message: 'console not attached — send console.attach first' }))
            return
          }

          tmuxResize(stream.teamId, agentId, cols, rows).catch((err) => {
            console.error(`[ws] console.resize failed (${agentId}):`, err.message)
          })
          break
        }

        default:
          ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_TYPE', message: `unknown type: ${msg.type}` }))
      }
    })

    ws.on('close', () => {
      if (currentTeamId) {
        subscriptions.get(currentTeamId)?.delete(ws)
      }
      // Clean up all active console streams for this connection
      for (const { intervalId } of activeStreams.values()) {
        clearInterval(intervalId)
      }
      activeStreams.clear()
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
