import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import http from 'http'
import { createApp } from './index.js'
import { listTeams, deleteTeam } from '../store/teams.js'
import { initDb, closeDb } from '../store/db.js'

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
  listChannels: vi.fn().mockReturnValue([]),
}))

// Mock channels store to provide fake channel IDs
vi.mock('../store/channels.js', () => ({
  createChannel: vi.fn().mockReturnValue({ channel: { id: 'ch-new', name: '#main' } }),
  addTeamChannel: vi.fn(),
  findTeamsByChannelId: vi.fn().mockReturnValue([]),
  listTeamChannels: vi.fn().mockReturnValue([
    { id: 'ch-main', name: '#main' },
    { id: 'ch-tasks', name: '#tasks' },
    { id: 'ch-code', name: '#code' },
    { id: 'ch-testing', name: '#testing' },
    { id: 'ch-merges', name: '#merges' },
  ]),
}))

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key-123',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
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
    if (payload) req.write(payload)
    req.end()
  })
}

function get(port, path) { return request(port, 'GET', path) }
function post(port, path, body) { return request(port, 'POST', path, body) }

// ── Test setup ─────────────────────────────────────────────────────────────────

let server
let port

function startServer() {
  return new Promise((resolve) => {
    const app = createApp()
    server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      resolve()
    })
  })
}

beforeAll(() => initDb(':memory:'))
afterAll(() => closeDb())

beforeEach(async () => {
  vi.clearAllMocks()
  await startServer()
})

afterEach(() => {
  for (const t of listTeams()) deleteTeam(t.id)
  return new Promise((resolve) => server.close(resolve))
})

// ── Shared team config ─────────────────────────────────────────────────────────

const VALID_TEAM = {
  name: 'test-team',
  repo: { url: 'https://github.com/acme/app' },
  agents: [{ role: 'dev', model: 'claude-sonnet-4-6' }],
}

async function createTeam() {
  const res = await post(port, '/api/teams', VALID_TEAM)
  return res.body.id
}

// ── GET /api/teams/:id/channels ────────────────────────────────────────────────

describe('GET /api/teams/:id/channels', () => {
  it('returns list of 5 well-known channels', async () => {
    const teamId = await createTeam()
    const res = await get(port, `/api/teams/${teamId}/channels`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(5)
    expect(res.body.map((c) => c.name)).toEqual([
      '#main', '#tasks', '#code', '#testing', '#merges',
    ])
  })

  it('each channel object includes the team id', async () => {
    const teamId = await createTeam()
    const res = await get(port, `/api/teams/${teamId}/channels`)
    expect(res.status).toBe(200)
    for (const ch of res.body) {
      expect(ch.team).toBe(teamId)
    }
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/nonexistent-id/channels')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns custom channels when team has channels configured', async () => {
    const res = await post(port, '/api/teams', {
      ...VALID_TEAM,
      channels: ['#custom', '#ops'],
    })
    expect(res.status).toBe(201)
    const teamId = res.body.id
    const chRes = await get(port, `/api/teams/${teamId}/channels`)
    expect(chRes.status).toBe(200)
    expect(chRes.body.map((c) => c.name)).toEqual(['#custom', '#ops'])
  })
})

// ── GET /api/teams/:id/channels/:name/messages ─────────────────────────────────

describe('GET /api/teams/:id/channels/:name/messages', () => {
  it('returns messages from readMessages', async () => {
    const { readMessages } = await import('../irc/router.js')
    const teamId = await createTeam()
    const messages = [
      { nick: 'alice', text: 'hello', ts: '2024-01-01T00:00:00.000Z' },
    ]
    readMessages.mockReturnValueOnce(messages)

    const res = await get(port, `/api/teams/${teamId}/channels/main/messages`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual(messages)
  })

  it('calls readMessages with channel id', async () => {
    const { readMessages } = await import('../irc/router.js')
    const teamId = await createTeam()

    await get(port, `/api/teams/${teamId}/channels/tasks/messages`)
    expect(readMessages).toHaveBeenCalledWith('ch-tasks', { limit: 100, since: undefined })
  })

  it('passes limit query param to readMessages', async () => {
    const { readMessages } = await import('../irc/router.js')
    const teamId = await createTeam()

    await get(port, `/api/teams/${teamId}/channels/main/messages?limit=50`)
    expect(readMessages).toHaveBeenCalledWith('ch-main', { limit: 50, since: undefined })
  })

  it('passes since query param to readMessages', async () => {
    const { readMessages } = await import('../irc/router.js')
    const teamId = await createTeam()
    const since = '2024-06-15T12:00:00Z'

    await get(port, `/api/teams/${teamId}/channels/main/messages?since=${encodeURIComponent(since)}`)
    expect(readMessages).toHaveBeenCalledWith('ch-main', { limit: 100, since })
  })

  it('passes both limit and since when both are provided', async () => {
    const { readMessages } = await import('../irc/router.js')
    const teamId = await createTeam()
    const since = '2024-06-15T12:00:00Z'

    await get(port, `/api/teams/${teamId}/channels/code/messages?limit=20&since=${encodeURIComponent(since)}`)
    expect(readMessages).toHaveBeenCalledWith('ch-code', { limit: 20, since })
  })

  it('returns empty array when buffer has no messages', async () => {
    const teamId = await createTeam()
    // readMessages mock returns [] by default
    const res = await get(port, `/api/teams/${teamId}/channels/main/messages`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/nonexistent-id/channels/main/messages')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── POST /api/teams/:id/channels/:name/messages ────────────────────────────────

describe('POST /api/teams/:id/channels/:name/messages', () => {
  it('returns 400 when text is missing', async () => {
    const teamId = await createTeam()
    const res = await post(port, `/api/teams/${teamId}/channels/main/messages`, {})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_TEXT')
  })

  it('returns 400 when text is not a string', async () => {
    const teamId = await createTeam()
    const res = await post(port, `/api/teams/${teamId}/channels/main/messages`, { text: 42 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_TEXT')
  })

  it('returns 400 when body is empty', async () => {
    const teamId = await createTeam()
    const res = await post(port, `/api/teams/${teamId}/channels/main/messages`, null)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_TEXT')
  })

  it('returns 503 when gateway is not connected', async () => {
    // getGateway returns null by default from mock
    const teamId = await createTeam()
    const res = await post(port, `/api/teams/${teamId}/channels/main/messages`, { text: 'hello' })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('GATEWAY_NOT_READY')
  })

  it('returns 500 when gw.say throws', async () => {
    const { getGateway } = await import('../irc/gateway.js')
    const teamId = await createTeam()
    getGateway.mockReturnValueOnce({
      say: vi.fn().mockImplementation(() => { throw new Error('send failed') }),
    })

    const res = await post(port, `/api/teams/${teamId}/channels/main/messages`, { text: 'hello' })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('SEND_ERROR')
  })

  it('sends message via gateway and returns ok', async () => {
    const { getGateway } = await import('../irc/gateway.js')
    const teamId = await createTeam()
    const say = vi.fn()
    getGateway.mockReturnValueOnce({ say })

    const res = await post(port, `/api/teams/${teamId}/channels/main/messages`, { text: 'hello world' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, channel: '#main', text: 'hello world' })
    expect(say).toHaveBeenCalledWith('#main', 'hello world')
  })

  it('sends to the correct channel derived from URL param', async () => {
    const { getGateway } = await import('../irc/gateway.js')
    const teamId = await createTeam()
    const say = vi.fn()
    getGateway.mockReturnValueOnce({ say })

    await post(port, `/api/teams/${teamId}/channels/tasks/messages`, { text: 'task update' })
    expect(say).toHaveBeenCalledWith('#tasks', 'task update')
  })

  it('returns 404 for unknown team', async () => {
    const res = await post(port, '/api/teams/nonexistent-id/channels/main/messages', { text: 'hello' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
