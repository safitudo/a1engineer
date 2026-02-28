import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import http from 'http'
import WebSocket from 'ws'
import { createApp } from './index.js'
import { attachWebSocketServer } from './ws.js'
import { createTeam, listTeams, deleteTeam } from '../store/teams.js'
import { findByApiKey, upsertTenant } from '../store/tenants.js'
import { execFile } from 'child_process'

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

// Mock tenant store — only findByApiKey is used by ws.js (#63: upsertTenant
// must never be called on WS connect, as it auto-creates tenants for any key)
vi.mock('../store/tenants.js', () => ({
  findByApiKey: vi.fn(),
  upsertTenant: vi.fn(),
}))

// Mock child_process to prevent real docker exec calls
vi.mock('child_process', () => {
  const execFileFn = vi.fn()
  execFileFn[Symbol.for('nodejs.util.promisify.custom')] = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
  return { execFile: execFileFn }
})

// Reference to the promisified mock for per-test control
const execFileAsync = execFile[Symbol.for('nodejs.util.promisify.custom')]

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

function receiveNext(ws) {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data)))
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

  // Regression test for #63: upsertTenant() auto-creates tenants for any key,
  // so it must never be called during WS auth. Only findByApiKey() is allowed —
  // it returns null for unknown keys, closing the connection.
  it('never calls upsertTenant during auth (regression #63)', async () => {
    findByApiKey.mockReturnValue(null)
    const { ws } = await wsConnect()
    await sendAndReceive(ws, { type: 'auth', token: 'arbitrary-key' })
    expect(upsertTenant).not.toHaveBeenCalled()
    ws.close()
  })
})

// ── subscribe tenant scoping tests ───────────────────────────────────────────

// Regression tests for #99: the old guard in the subscribe handler short-
// circuited when team.tenantId was falsy, allowing any authenticated client to
// subscribe to unclaimed teams. The fix inverts the check so that a null
// tenantId always returns NOT_FOUND.

describe('WebSocket subscribe — tenant scoping', () => {
  const TENANT = { id: 'scoping-tenant-1', apiKey: 'scoping-key-1' }

  beforeEach(() => {
    findByApiKey.mockReturnValue(TENANT)
  })

  async function authenticatedWs() {
    const { ws } = await wsConnect()
    const resp = await sendAndReceive(ws, { type: 'auth', token: TENANT.apiKey })
    expect(resp.type).toBe('authenticated')
    return ws
  }

  it('rejects subscribe to a team with tenantId=null (regression #99)', async () => {
    // createTeam without a tenantId option defaults to null — simulates a
    // rehydrated team before the tenantId-preservation fix, or any unclaimed team.
    const team = createTeam({ name: 'unclaimed', agents: [] })
    expect(team.tenantId).toBeNull()

    const ws = await authenticatedWs()
    const resp = await sendAndReceive(ws, { type: 'subscribe', teamId: team.id })
    expect(resp.type).toBe('error')
    expect(resp.code).toBe('NOT_FOUND')

    deleteTeam(team.id)
    ws.close()
  })
})

// ── console.* handler tests ───────────────────────────────────────────────────

describe('WebSocket console.* handlers', () => {
  const TENANT = { id: 'console-tenant-1', apiKey: 'console-key' }
  let testTeam
  let testAgent

  beforeEach(() => {
    // Restore default mock (clearAllMocks resets it each time)
    vi.mocked(execFileAsync).mockResolvedValue({ stdout: '', stderr: '' })
    findByApiKey.mockReturnValue(TENANT)

    testTeam = createTeam({
      name: 'console-test-team',
      agents: [{ id: 'agent-console-1', role: 'dev', model: 'claude-opus-4-6' }],
    }, { tenantId: TENANT.id })
    testAgent = testTeam.agents[0]
  })

  afterEach(() => {
    vi.useRealTimers()
    deleteTeam(testTeam.id)
  })

  async function authenticatedWs() {
    const { ws } = await wsConnect()
    const resp = await sendAndReceive(ws, { type: 'auth', token: TENANT.apiKey })
    expect(resp.type).toBe('authenticated')
    return ws
  }

  // ── console.attach ──────────────────────────────────────────────────────────

  describe('console.attach', () => {
    it('rejects missing teamId', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.attach', agentId: testAgent.id })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('MISSING_TEAM_ID')
      ws.close()
    })

    it('rejects missing agentId', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('MISSING_AGENT_ID')
      ws.close()
    })

    it('rejects unknown team', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.attach', teamId: 'no-such-team', agentId: testAgent.id })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('NOT_FOUND')
      ws.close()
    })

    it('rejects unknown agent', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: 'no-such-agent' })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('AGENT_NOT_FOUND')
      ws.close()
    })

    it('sends console.attached on success', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      expect(resp.type).toBe('console.attached')
      expect(resp.agentId).toBe(testAgent.id)
      ws.close()
    })

    it('streams console.data every 500ms', async () => {
      vi.useFakeTimers()
      vi.mocked(execFileAsync).mockResolvedValue({ stdout: 'pane output\n', stderr: '' })

      const ws = await authenticatedWs()

      // Attach (sendAndReceive uses once('message') so we don't need real timer here)
      // Temporarily restore real timers for the async WS round-trip, then fake again
      vi.useRealTimers()
      const attachResp = await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      expect(attachResp.type).toBe('console.attached')
      vi.useFakeTimers()

      const dataPromise = receiveNext(ws)
      await vi.advanceTimersByTimeAsync(500)
      const dataMsg = await dataPromise

      expect(dataMsg.type).toBe('console.data')
      expect(dataMsg.agentId).toBe(testAgent.id)
      expect(dataMsg.data).toBe('pane output\n')

      ws.close()
      vi.useRealTimers()
    })

    it('replaces existing stream on re-attach (only one stream per agentId)', async () => {
      vi.useFakeTimers()
      vi.mocked(execFileAsync).mockResolvedValue({ stdout: '', stderr: '' })

      const ws = await authenticatedWs()

      // Both attaches happen while fake timers are active — setInterval creates a fake timer
      const r1 = await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      expect(r1.type).toBe('console.attached')

      // Second attach — should clear the first interval and start a new one
      const r2 = await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      expect(r2.type).toBe('console.attached')

      // Advance 500ms — only one interval should fire (not two from doubled-up streams)
      let msgCount = 0
      ws.on('message', () => msgCount++)
      await vi.advanceTimersByTimeAsync(500)
      expect(msgCount).toBe(1)

      ws.close()
      vi.useRealTimers()
    })
  })

  // ── console.input ───────────────────────────────────────────────────────────

  describe('console.input', () => {
    it('rejects missing agentId', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.input', data: 'hello' })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('MISSING_AGENT_ID')
      ws.close()
    })

    it('rejects missing data', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.input', agentId: testAgent.id })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('MISSING_DATA')
      ws.close()
    })

    it('rejects when not attached', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.input', agentId: testAgent.id, data: 'ls\r' })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('NOT_ATTACHED')
      ws.close()
    })

    it('calls execFileAsync with send-keys command when attached', async () => {
      const ws = await authenticatedWs()
      await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })

      // Send input — no response expected on success, so just send and wait briefly
      ws.send(JSON.stringify({ type: 'console.input', agentId: testAgent.id, data: 'ls\r' }))
      await new Promise((resolve) => setTimeout(resolve, 50))

      // execFileAsync should have been called (once for attach capture-pane, once for input)
      const calls = vi.mocked(execFileAsync).mock.calls
      const inputCall = calls.find((c) => {
        const args = c[1]
        return Array.isArray(args) && args.some((a) => typeof a === 'string' && a.includes('send-keys'))
      })
      expect(inputCall).toBeDefined()
      ws.close()
    })

    it('rate-limits input at 100 msgs/sec', async () => {
      vi.useFakeTimers()
      const ws = await authenticatedWs()
      vi.useRealTimers()

      await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })

      vi.useFakeTimers()

      // Send 100 messages — all should be forwarded (no response on success)
      for (let i = 0; i < 100; i++) {
        ws.send(JSON.stringify({ type: 'console.input', agentId: testAgent.id, data: 'x' }))
      }

      // 101st should be rate-limited
      const rateLimitedResp = await sendAndReceive(ws, { type: 'console.input', agentId: testAgent.id, data: 'x' })
      expect(rateLimitedResp.type).toBe('error')
      expect(rateLimitedResp.code).toBe('RATE_LIMITED')

      // Advance 1 second to reset window — next message should succeed
      await vi.advanceTimersByTimeAsync(1000)
      ws.send(JSON.stringify({ type: 'console.input', agentId: testAgent.id, data: 'y' }))
      // No error response means it was accepted (just fire-and-forget in this window)

      ws.close()
      vi.useRealTimers()
    })
  })

  // ── console.detach ──────────────────────────────────────────────────────────

  describe('console.detach', () => {
    it('rejects missing agentId', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.detach' })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('MISSING_AGENT_ID')
      ws.close()
    })

    it('sends console.detached even when not attached', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.detach', agentId: testAgent.id })
      expect(resp.type).toBe('console.detached')
      expect(resp.agentId).toBe(testAgent.id)
      ws.close()
    })

    it('sends console.detached after detaching an active stream', async () => {
      const ws = await authenticatedWs()
      await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      const resp = await sendAndReceive(ws, { type: 'console.detach', agentId: testAgent.id })
      expect(resp.type).toBe('console.detached')
      expect(resp.agentId).toBe(testAgent.id)
      ws.close()
    })

    it('stops streaming after detach', async () => {
      vi.useFakeTimers()
      const ws = await authenticatedWs()
      vi.useRealTimers()

      await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      await sendAndReceive(ws, { type: 'console.detach', agentId: testAgent.id })

      vi.useFakeTimers()
      let msgCount = 0
      ws.on('message', () => msgCount++)
      await vi.advanceTimersByTimeAsync(1000)
      expect(msgCount).toBe(0)

      ws.close()
      vi.useRealTimers()
    })
  })

  // ── console.resize ──────────────────────────────────────────────────────────

  describe('console.resize', () => {
    it('rejects missing agentId', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.resize', cols: 80, rows: 24 })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('MISSING_AGENT_ID')
      ws.close()
    })

    it('rejects invalid dimensions (non-number)', async () => {
      const ws = await authenticatedWs()
      await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      const resp = await sendAndReceive(ws, { type: 'console.resize', agentId: testAgent.id, cols: 'wide', rows: 24 })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('INVALID_SIZE')
      ws.close()
    })

    it('rejects invalid dimensions (zero or negative)', async () => {
      const ws = await authenticatedWs()
      await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })
      const resp = await sendAndReceive(ws, { type: 'console.resize', agentId: testAgent.id, cols: 0, rows: 24 })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('INVALID_SIZE')
      ws.close()
    })

    it('rejects when not attached', async () => {
      const ws = await authenticatedWs()
      const resp = await sendAndReceive(ws, { type: 'console.resize', agentId: testAgent.id, cols: 80, rows: 24 })
      expect(resp.type).toBe('error')
      expect(resp.code).toBe('NOT_ATTACHED')
      ws.close()
    })

    it('calls execFileAsync with resize-pane command when attached', async () => {
      const ws = await authenticatedWs()
      await sendAndReceive(ws, { type: 'console.attach', teamId: testTeam.id, agentId: testAgent.id })

      ws.send(JSON.stringify({ type: 'console.resize', agentId: testAgent.id, cols: 120, rows: 40 }))
      await new Promise((resolve) => setTimeout(resolve, 50))

      const calls = vi.mocked(execFileAsync).mock.calls
      const resizeCall = calls.find((c) => {
        const args = c[1]
        return Array.isArray(args) && args.includes('resize-pane')
      })
      expect(resizeCall).toBeDefined()
      expect(resizeCall[1]).toContain('120')
      expect(resizeCall[1]).toContain('40')
      ws.close()
    })
  })
})
