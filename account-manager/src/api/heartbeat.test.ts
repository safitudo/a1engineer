import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import router from './heartbeat.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/', router)
  return app
}

describe('POST /heartbeat', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(() => {
    app = buildApp()
  })

  it('returns 400 when agent_id is missing', async () => {
    const res = await request(app).post('/').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('agent_id required')
  })

  it('records heartbeat with provided timestamp', async () => {
    const ts = '2026-01-01T00:00:00.000Z'
    const res = await request(app).post('/').send({ agent_id: 'a1', timestamp: ts })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.agent_id).toBe('a1')
    expect(res.body.at).toBe(ts)
  })

  it('uses current time when timestamp omitted', async () => {
    const before = Date.now()
    const res = await request(app).post('/').send({ agent_id: 'a2' })
    const after = Date.now()
    expect(res.status).toBe(200)
    const at = new Date(res.body.at).getTime()
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(after)
  })
})

describe('GET /heartbeat', () => {
  it('returns recorded heartbeats', async () => {
    const app = buildApp()
    await request(app).post('/').send({ agent_id: 'agent-x', timestamp: '2026-01-01T00:00:00.000Z' })
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body['agent-x']).toBe('2026-01-01T00:00:00.000Z')
  })
})
