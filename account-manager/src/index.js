import express from 'express'
import { requireInternalToken } from './middleware/auth.js'
import { agentsRouter } from './api/agents.js'
import { heartbeatRouter } from './api/heartbeat.js'
import { ircRouter } from './api/irc.js'
import { pluginsRouter } from './api/plugins.js'

const app = express()
const PORT = process.env.PORT || 4100

app.use(express.json())

// Health endpoint — no auth required
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'account-manager',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
})

// Heartbeat and IRC messages are called by agents — no internal token required
app.use('/heartbeat', heartbeatRouter)
app.use('/irc/messages', (req, res, next) => {
  // GET /irc/messages is agent-facing — no token required
  if (req.method === 'GET') return next()
  requireInternalToken(req, res, next)
}, ircRouter)

// All other routes require the internal service token
app.use('/agents', requireInternalToken, agentsRouter)
app.use('/irc', requireInternalToken, ircRouter)
app.use('/plugins', requireInternalToken, pluginsRouter)

app.listen(PORT, () => {
  console.log(`account-manager listening on :${PORT}`)
  if (!process.env.INTERNAL_SERVICE_TOKEN) {
    console.warn('WARNING: INTERNAL_SERVICE_TOKEN not set — internal routes will reject all requests')
  }
})
