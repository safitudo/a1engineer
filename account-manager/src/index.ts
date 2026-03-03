import express from 'express'
import agentsRouter from './api/agents.js'
import heartbeatRouter from './api/heartbeat.js'
import ircRouter from './api/irc.js'
import pluginsRouter from './api/plugins.js'

const PORT = Number(process.env.PORT) || 4100

const app = express()
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'account-manager', ts: new Date().toISOString() })
})

// Agent lifecycle
app.use('/agents', agentsRouter)

// Heartbeat (called by agents)
app.use('/heartbeat', heartbeatRouter)

// IRC management
app.use('/irc', ircRouter)

// Plugin lifecycle
app.use('/plugins', pluginsRouter)

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' })
})

app.listen(PORT, () => {
  console.log(`[account-manager] listening on :${PORT}`)
})
