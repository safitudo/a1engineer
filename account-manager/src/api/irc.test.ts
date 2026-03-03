import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock the ergo module so no real IRC connections are made
vi.mock('../irc/ergo.js', () => ({
  createChannel: vi.fn(async (name: string) => ({
    name: name.startsWith('#') ? name : `#${name}`,
    created: true,
  })),
}))

// Import after mock registration
const { default: router, storeMessage } = await import('./irc.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/', router)
  return app
}

describe('POST /irc/channels', () => {
  it('returns 400 when name is missing', async () => {
    const app = buildApp()
    const res = await request(app).post('/channels').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('name required')
  })

  it('creates a channel and returns 201', async () => {
    const app = buildApp()
    const res = await request(app).post('/channels').send({ name: 'general' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('#general')
    expect(res.body.created).toBe(true)
  })
})

describe('GET /irc/messages', () => {
  beforeEach(() => {
    // Store a message directly for testing retrieval
    storeMessage('#test', 'alice', 'hello world')
  })

  it('returns messages newer than since', async () => {
    const app = buildApp()
    const since = new Date(Date.now() - 5000).toISOString()
    const res = await request(app).get(`/messages?since=${since}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.messages)).toBe(true)
    const msg = res.body.messages.find((m: { text: string }) => m.text === 'hello world')
    expect(msg).toBeDefined()
    expect(msg.from).toBe('alice')
    expect(msg.channel).toBe('#test')
  })

  it('returns a cursor timestamp', async () => {
    const app = buildApp()
    const res = await request(app).get('/messages')
    expect(res.status).toBe(200)
    expect(typeof res.body.cursor).toBe('string')
  })

  it('returns empty messages array when none match since filter', async () => {
    const app = buildApp()
    const future = new Date(Date.now() + 60000).toISOString()
    const res = await request(app).get(`/messages?since=${future}`)
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(0)
  })
})
