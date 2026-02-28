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

import { validateWsToken, signupAttempts } from './auth.js'

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

// ── Sweep interval tests ──────────────────────────────────────────────────────

describe('wsTokenStore sweep', () => {
  it('removes expired tokens after the 60s sweep fires', async () => {
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(now)

    // Issue a token (captured before time advances, so it lands in wsTokenStore)
    const { body } = await request('POST', '/api/auth/ws-token', {
      headers: { Authorization: 'Bearer key-sweep-test' },
    })
    const { token } = body
    expect(typeof token).toBe('string')

    // Advance past TTL and trigger the sweep interval
    vi.setSystemTime(now + 61_000)
    vi.runAllTimers()

    // The sweep should have evicted the token — validateWsToken must return null
    expect(validateWsToken(token)).toBeNull()
  })
})

// ── POST /api/auth/signup rate limiting ───────────────────────────────────────

describe('POST /api/auth/signup rate limiting', () => {
  // Each test uses a unique fake IP via X-Forwarded-For to avoid cross-test state
  // (signupAttempts Map persists for the lifetime of the module instance)

  it('allows up to 5 signups from the same IP', async () => {
    const ip = '10.0.0.1'
    signupAttempts.delete(ip)
    for (let i = 0; i < 5; i++) {
      const { status } = await request('POST', '/api/auth/signup', {
        headers: { 'x-forwarded-for': ip },
        body: { name: `org-rl-ok-${i}`, email: `rl-ok-${i}@example.com` },
      })
      expect(status).toBe(201)
    }
  })

  it('returns 429 on the 6th signup from the same IP within the window', async () => {
    const ip = '10.0.0.2'
    signupAttempts.delete(ip)
    for (let i = 0; i < 5; i++) {
      await request('POST', '/api/auth/signup', {
        headers: { 'x-forwarded-for': ip },
        body: { name: `org-rl-limit-${i}`, email: `rl-limit-${i}@example.com` },
      })
    }
    const { status, body } = await request('POST', '/api/auth/signup', {
      headers: { 'x-forwarded-for': ip },
      body: { name: 'blocked', email: 'blocked@example.com' },
    })
    expect(status).toBe(429)
    expect(body.code).toBe('RATE_LIMITED')
  })

  it('resets the window after 1 hour and allows signups again', async () => {
    const ip = '10.0.0.3'
    signupAttempts.delete(ip)
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await request('POST', '/api/auth/signup', {
        headers: { 'x-forwarded-for': ip },
        body: { name: `org-rl-reset-${i}`, email: `rl-reset-${i}@example.com` },
      })
    }
    const { status: blockedStatus } = await request('POST', '/api/auth/signup', {
      headers: { 'x-forwarded-for': ip },
      body: { name: 'blocked', email: 'blocked@example.com' },
    })
    expect(blockedStatus).toBe(429)

    // Advance past the 1-hour window
    vi.setSystemTime(now + 60 * 60 * 1000 + 1)

    const { status: allowedStatus } = await request('POST', '/api/auth/signup', {
      headers: { 'x-forwarded-for': ip },
      body: { name: 'after-reset', email: 'after-reset@example.com' },
    })
    expect(allowedStatus).toBe(201)
  })

  it('counts IPs independently — different IPs are not affected by each other', async () => {
    const ipA = '10.0.0.4'
    const ipB = '10.0.0.5'
    signupAttempts.delete(ipA)
    signupAttempts.delete(ipB)

    // Exhaust IP A
    for (let i = 0; i < 5; i++) {
      await request('POST', '/api/auth/signup', {
        headers: { 'x-forwarded-for': ipA },
        body: { name: `org-a-${i}`, email: `a-${i}@example.com` },
      })
    }

    // IP A is now blocked
    const { status: blockedA } = await request('POST', '/api/auth/signup', {
      headers: { 'x-forwarded-for': ipA },
      body: { name: 'org-a-6', email: 'a-6@example.com' },
    })
    expect(blockedA).toBe(429)

    // IP B is unaffected
    const { status: okB } = await request('POST', '/api/auth/signup', {
      headers: { 'x-forwarded-for': ipB },
      body: { name: 'org-b', email: 'b@example.com' },
    })
    expect(okB).toBe(201)
  })

  it('stale window entry is replaced on first request after expiry', async () => {
    const ip = '10.0.0.6'
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })

    // Seed a stale entry that is 2 hours old and nearly exhausted
    signupAttempts.set(ip, { count: 4, windowStart: now - 2 * 60 * 60 * 1000 })
    vi.setSystemTime(now)

    // Request should succeed and reset the window (not be blocked by stale count)
    const { status } = await request('POST', '/api/auth/signup', {
      headers: { 'x-forwarded-for': ip },
      body: { name: 'stale-org', email: 'stale@example.com' },
    })
    expect(status).toBe(201)

    // Window was reset — count is now 1 (fresh window)
    expect(signupAttempts.get(ip).count).toBe(1)
  })
})
