import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock docker containers module — no real Docker socket needed
vi.mock('../docker/containers.js', () => ({
  launchContainer: vi.fn(async () => 'mock-container-id'),
  stopContainer: vi.fn(async () => {}),
}))

const { default: router } = await import('./plugins.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/', router)
  return app
}

describe('POST /plugins/launch', () => {
  it('returns 400 when plugin_id is missing', async () => {
    const app = buildApp()
    const res = await request(app).post('/launch').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('plugin_id required')
  })

  it('launches a plugin container and returns 201', async () => {
    const app = buildApp()
    const res = await request(app).post('/launch').send({ plugin_id: 'p1', config: { type: 'irc-bot' } })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.plugin_id).toBe('p1')
    expect(res.body.container_id).toBe('mock-container-id')
  })
})

describe('POST /plugins/stop', () => {
  it('returns 400 when plugin_id is missing', async () => {
    const app = buildApp()
    const res = await request(app).post('/stop').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('plugin_id required')
  })

  it('returns 404 when plugin not found', async () => {
    const app = buildApp()
    const res = await request(app).post('/stop').send({ plugin_id: 'unknown' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('plugin not found')
  })

  it('stops a running plugin', async () => {
    const app = buildApp()
    // Launch first so plugin is tracked
    await request(app).post('/launch').send({ plugin_id: 'p2' })
    const res = await request(app).post('/stop').send({ plugin_id: 'p2' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.plugin_id).toBe('p2')
  })
})
