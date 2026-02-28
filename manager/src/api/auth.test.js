import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'http'
import { createApp } from './index.js'

// Minimal express app via the real app factory — no IRC/Docker mocks needed
// because auth routes are pure in-memory (no IRC, no Docker).

// Mock compose + IRC so createApp() doesn't fail on import side-effects
vi.mock('../orchestrator/compose.js', () => ({
  startTeam: vi.fn().mockResolvedValue(undefined),
  stopTeam: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../irc/gateway.js', () => ({
  createGateway: vi.fn(),
  destroyGateway: vi.fn(),
  getGateway: vi.fn().mockReturnValue(null),
}))
vi.mock('../irc/router.js', () => ({
  routeMessage: vi.fn(),
  clearTeamBuffers: vi.fn(),
  readMessages: vi.fn().mockReturnValue([]),
  registerBroadcaster: vi.fn().mockReturnValue(() => {}),
}))

let server
let port

beforeAll(async () => {
  const app = createApp()
  server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

afterEach(() => {
  vi.useRealTimers()
})

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...headers,
        } },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          let json
          try { json = JSON.parse(data) } catch { json = null }
          resolve({ status: res.statusCode, body: json })
        })
      }
    )
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// ── validateWsToken unit tests ────────────────────────────────────────────────
// We test validateWsToken indirectly: issue a token via POST then check its
// behaviour. Direct import is also fine but would share module state with the
// HTTP-server instance — using the same in-process module is intentional.

import { validateWsToken } from './auth.js'

describe('validateWsToken', () => {
  it('returns null for an unknown token', () => {
    expect(validateWsToken('not-in-store')).toBeNull()
  })

  it('returns tenantId for a freshly issued token', async () => {
    const { status, body } = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Bearer test-key-valid' },
    })
    expect(status).toBe(200)
    const tenantId = validateWsToken(body.token)
    expect(typeof tenantId).toBe('string')
    expect(tenantId).toBeTruthy()
  })

  it('is single-use — second call returns null', async () => {
    const { body } = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Bearer test-key-single-use' },
    })
    expect(validateWsToken(body.token)).toBeTruthy()
    expect(validateWsToken(body.token)).toBeNull()
  })

  it('returns null for an expired token', async () => {
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)

    const { body } = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Bearer test-key-expiry' },
    })

    // Advance past the 60s TTL
    vi.setSystemTime(now + 61_000)
    expect(validateWsToken(body.token)).toBeNull()
  })
})

// ── POST /api/auth/ws-token HTTP tests ───────────────────────────────────────

describe('POST /api/auth/ws-token', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { status, body } = await request('POST', '/api/auth/ws-token')
    expect(status).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 when Authorization scheme is not Bearer', async () => {
    const { status, body } = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Basic abc123' },
    })
    expect(status).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns { token } with a 64-char hex string on valid auth', async () => {
    const { status, body } = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Bearer my-valid-api-key' },
    })
    expect(status).toBe(200)
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a different token on each call', async () => {
    const r1 = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Bearer key-different-1' },
    })
    const r2 = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Bearer key-different-2' },
    })
    expect(r1.body.token).not.toBe(r2.body.token)
  })
})
