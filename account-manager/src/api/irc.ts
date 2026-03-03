import { Router, Request, Response } from 'express'
import { createChannel } from '../irc/ergo.js'

const router = Router()

interface IrcMessage {
  from: string
  text: string
  channel: string
  ts: string
}

// In-memory message store per channel: channel → IrcMessage[]
const messageStore = new Map<string, IrcMessage[]>()

export function storeMessage(channel: string, from: string, text: string): void {
  if (!messageStore.has(channel)) messageStore.set(channel, [])
  messageStore.get(channel)!.push({ from, text, channel, ts: new Date().toISOString() })
}

// POST /irc/channels
router.post('/channels', async (req: Request<object, object, { name?: string }>, res: Response) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  try {
    const result = await createChannel(name)
    return res.status(201).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[irc/channels] ${message}`)
    return res.status(500).json({ error: message })
  }
})

// GET /irc/messages?agent_id=&since=
router.get('/messages', (req: Request, res: Response) => {
  const { agent_id, since } = req.query as { agent_id?: string; since?: string }
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 10000)

  const messages: IrcMessage[] = []
  for (const [, msgs] of messageStore) {
    for (const m of msgs) {
      if (new Date(m.ts) > sinceDate) messages.push(m)
    }
  }
  messages.sort((a, b) => a.ts.localeCompare(b.ts))

  const cursor = messages.length > 0
    ? messages[messages.length - 1].ts
    : new Date().toISOString()

  return res.json({ agent_id, messages, cursor })
})

export default router
