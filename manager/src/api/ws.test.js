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

// attachWebSocketServer is idempotent (module-level singleton) — use one server
// for all WS tests to avoid the guard preventing attachment on fresh servers.
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

function wsConnect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    ws.on('open', () => resolve({ ws, code: null }))
    ws.on('unexpected-response', (req, res) => resolve({ ws: null, code: res.statusCode }))
    ws.on('error', () => resolve({ ws: null, code: null }))
  })
}

// ── WS Auth tests ─────────────────────────────────────────────────────────────

describe('WebSocket auth upgrade', () => {
  it('rejects upgrade with 401 when no token provided', async () => {
    const { code } = await wsConnect(`ws://127.0.0.1:${port}/ws`)
    expect(code).toBe(401)
  })

  it('rejects upgrade with 401 when token is unknown (not in tenant store)', async () => {
    findByApiKey.mockReturnValue(null)
    const { code } = await wsConnect(`ws://127.0.0.1:${port}/ws?token=unknown-key`)
    expect(code).toBe(401)
  })

  it('allows upgrade when token matches a known tenant', async () => {
    const tenant = { id: 'tenant-uuid-1', apiKey: 'valid-key-123' }
    findByApiKey.mockReturnValue(tenant)
    const { ws, code } = await wsConnect(`ws://127.0.0.1:${port}/ws?token=valid-key-123`)
    expect(code).toBeNull()
    expect(ws).not.toBeNull()
    ws?.close()
  })

  it('rejects non-/ws path with 400', async () => {
    const { code } = await wsConnect(`ws://127.0.0.1:${port}/other?token=any`)
    expect(code).toBe(400)
  })
})
