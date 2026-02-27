import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import http from 'http'
import WebSocket from 'ws'
import { createApp } from './index.js'
import { attachWebSocketServer } from './ws.js'
import { listTeams, deleteTeam } from '../store/teams.js'
import { findByApiKey } from '../store/tenants.js'

// Mock compose to avoid Docker calls
vi.mock('../orchestrator/compose.js', () => ({
  startTeam: vi.fn().mockResolvedValue(undefined),
  stopTeam: vi.fn().mockResolvedValue(undefined),
}))

// Mock IRC gateway to avoid real TCP connections
vi.mock('../irc/gateway.js', () => ({
  createGateway: vi.fn(),
  destroyGateway: vi.fn(),
  getGateway: vi.fn().mockReturnValue(null),
}))

// Mock IRC router for isolation
vi.mock('../irc/router.js', () => ({
  routeMessage: vi.fn(),
  clearTeamBuffers: vi.fn(),
  readMessages: vi.fn().mockReturnValue([]),
  registerBroadcaster: vi.fn().mockReturnValue(() => {}),
}))

// Mock tenant store so we control findByApiKey
vi.mock('../store/tenants.js', () => ({
  findByApiKey: vi.fn(),
  upsertTenant: vi.fn(),
}))

// ── Test setup ────────────────────────────────────────────────────────────────

let server
let port

beforeAll(async () => {
  const app = createApp()
  server = http.createServer(app)
  attachWebSocketServer(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterAll(() => {
  for (const t of listTeams()) deleteTeam(t.id)
  return new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  vi.clearAllMocks()
})

function wsConnect(path = '/ws') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)
    ws.on('open', () => resolve({ ws, code: null }))
    ws.on('unexpected-response', (req, res) => resolve({ ws: null, code: res.statusCode }))
    ws.on('error', () => resolve({ ws: null, code: null }))
  })
}

function sendAndReceive(ws, msg) {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data)))
    ws.send(JSON.stringify(msg))
  })
}

// ── WS Auth tests ─────────────────────────────────────────────────────────────

describe('WebSocket first-message auth', () => {
  it('accepts upgrade without token in URL (auth via first message)', async () => {
    const { ws, code } = await wsConnect()
    expect(code).toBeNull()
    expect(ws).not.toBeNull()
    ws?.close()
  })

  it('rejects non-/ws path with 400', async () => {
    const { code } = await wsConnect('/other')
    expect(code).toBe(400)
  })

  it('rejects non-auth first message', async () => {
    const { ws } = await wsConnect()
    const resp = await sendAndReceive(ws, { type: 'subscribe', teamId: 'test' })
    expect(resp.type).toBe('error')
    expect(resp.code).toBe('UNAUTHENTICATED')
    ws.close()
  })

  it('rejects auth with missing token', async () => {
    const { ws } = await wsConnect()
    const resp = await sendAndReceive(ws, { type: 'auth' })
    expect(resp.type).toBe('error')
    expect(resp.code).toBe('MISSING_TOKEN')
    ws.close()
  })

  it('rejects auth with unknown token', async () => {
    findByApiKey.mockReturnValue(null)
    const { ws } = await wsConnect()
    const resp = await sendAndReceive(ws, { type: 'auth', token: 'bad-key' })
    expect(resp.type).toBe('error')
    expect(resp.code).toBe('UNAUTHORIZED')
    ws.close()
  })

  it('accepts auth with valid token', async () => {
    const tenant = { id: 'tenant-uuid-1', apiKey: 'valid-key-123' }
    findByApiKey.mockReturnValue(tenant)
    const { ws } = await wsConnect()
    const resp = await sendAndReceive(ws, { type: 'auth', token: 'valid-key-123' })
    expect(resp.type).toBe('authenticated')
    ws.close()
  })
})
