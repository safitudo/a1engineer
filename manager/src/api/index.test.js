import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'http'
import { execFile } from 'child_process'
import { createApp } from './index.js'
import { createTeam, deleteTeam } from '../store/teams.js'
import { initDb, closeDb } from '../store/db.js'

// Mock compose to avoid Docker calls
vi.mock('../orchestrator/compose.js', () => ({
  startTeam: vi.fn().mockResolvedValue(undefined),
  stopTeam: vi.fn().mockResolvedValue(undefined),
  rewriteCompose: vi.fn().mockResolvedValue(undefined),
  startAgentService: vi.fn().mockResolvedValue(undefined),
}))

// Mock ws to avoid real WebSocket broadcasts
vi.mock('./ws.js', () => ({
  broadcastAgentStatus: vi.fn(),
  broadcastHeartbeat: vi.fn(),
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

// Mock child_process to avoid accidental Docker/compose invocations
vi.mock('child_process', () => {
  const execFileFn = vi.fn()
  execFileFn[Symbol.for('nodejs.util.promisify.custom')] = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
  return { execFile: execFileFn, spawn: vi.fn() }
})

// Mock GitHub token resolution so /github-token tests don't need real app creds
vi.mock('../github/app.js', () => ({
  resolveGitHubToken: vi.fn().mockResolvedValue('gh-fresh-token-xyz'),
}))

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function rawRequest(port, method, path, { auth } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' }
    if (auth) headers['Authorization'] = `Bearer ${auth}`
    const opts = { hostname: '127.0.0.1', port, path, method, headers }
    const req = http.request(opts, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(data) } catch { parsed = data }
        resolve({ status: res.statusCode, body: parsed })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let server, port, team1, team2

beforeAll(async () => {
  await initDb()
  team1 = createTeam({ name: 'Auth Test Team One', repo: 'org/one', agents: [{ id: 'agent-1', role: 'dev' }] })
  team2 = createTeam({ name: 'Auth Test Team Two', repo: 'org/two', agents: [] })
  const app = createApp()
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  port = server.address().port
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  deleteTeam(team1.id)
  deleteTeam(team2.id)
  await closeDb()
})

// ── GET /github-token/:teamId ─────────────────────────────────────────────────

describe('GET /github-token/:teamId', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await rawRequest(port, 'GET', `/github-token/${team1.id}`)
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid team internalToken', async () => {
    const res = await rawRequest(port, 'GET', `/github-token/${team1.id}`, { auth: team1.internalToken })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token', 'gh-fresh-token-xyz')
  })

  it('returns 403 when token belongs to a different team', async () => {
    const res = await rawRequest(port, 'GET', `/github-token/${team1.id}`, { auth: team2.internalToken })
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' })
  })
})

// ── POST /heartbeat/:teamId/:agentId ─────────────────────────────────────────

describe('POST /heartbeat/:teamId/:agentId', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await rawRequest(port, 'POST', `/heartbeat/${team1.id}/agent-1`)
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid team internalToken', async () => {
    const res = await rawRequest(port, 'POST', `/heartbeat/${team1.id}/agent-1`, { auth: team1.internalToken })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
    expect(res.body).toHaveProperty('at')
  })

  it('returns 403 when token belongs to a different team', async () => {
    const res = await rawRequest(port, 'POST', `/heartbeat/${team1.id}/agent-1`, { auth: team2.internalToken })
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' })
  })
})
