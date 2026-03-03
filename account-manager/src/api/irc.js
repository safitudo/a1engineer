import { Router } from 'express'
import { createChannel, getMessages } from '../irc/ergo.js'

export const ircRouter = Router()

/**
 * POST /irc/channels
 * Body: { name }
 * Create an IRC channel on the Ergo server.
 */
ircRouter.post('/channels', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  try {
    const channel = await createChannel(name)
    res.status(201).json(channel)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /irc/messages
 * Query: { agent_id, since }
 * Return new messages for an agent since a given timestamp.
 * Called by the comm-poll PostToolUse hook.
 * Does NOT require internal service token — agents call this directly.
 */
ircRouter.get('/messages', (req, res) => {
  const { agent_id, since } = req.query
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' })

  const { messages, cursor } = getMessages(agent_id, since)
  res.json({ messages, cursor })
})
