import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'http'
import { createApp } from './index.js'
import { listTeams, deleteTeam } from '../store/teams.js'

// Mock compose to avoid Docker calls
vi.mock('../orchestrator/compose.js', () => ({
  startTeam: vi.fn().mockResolvedValue(undefined),
  stopTeam: vi.fn().mockResolvedValue(undefined),
}))

// Mock IRC gateway to avoid real TCP connections to ergo-* in tests
vi.mock('../irc/gateway.js', () => ({
  createGateway: vi.fn(),
  destroyGateway: vi.fn(),
}))

// Mock IRC router (in-memory, but mock for isolation)
vi.mock('../irc/router.js', () => ({
  routeMessage: vi.fn(),
  clearTeamBuffers: vi.fn(),
  readMessages: vi.fn().mockReturnValue([]),
}))

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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
function patch(port, path, body) { return request(port, 'PATCH', path, body) }
function del(port, path) { return request(port, 'DELETE', path) }

function requestNoAuth(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
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

// ── Test setup ────────────────────────────────────────────────────────────────

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

beforeEach(async () => {
  vi.clearAllMocks()
  await startServer()
})

afterEach(() => {
  for (const t of listTeams()) deleteTeam(t.id)
  return new Promise((resolve) => server.close(resolve))
})

// ── Shared valid team config ──────────────────────────────────────────────────

const VALID_TEAM = {
  name: 'test-team',
  repo: { url: 'https://github.com/acme/app' },
  agents: [{ role: 'dev', model: 'claude-sonnet-4-6' }],
}

// ── POST /api/teams ───────────────────────────────────────────────────────────

describe('POST /api/teams', () => {
  it('creates team and returns 201 with team object', async () => {
    const res = await post(port, '/api/teams', VALID_TEAM)
    expect(res.status).toBe(201)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.name).toBe('test-team')
    expect(res.body.status).toBe('running')
    expect(res.body.agents).toHaveLength(1)
    expect(res.body.agents[0].role).toBe('dev')
  })

  it('returns 400 when name is missing', async () => {
    const res = await post(port, '/api/teams', { repo: { url: 'x' }, agents: [{ role: 'dev' }] })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_NAME')
  })

  it('returns 400 when repo.url is missing', async () => {
    const res = await post(port, '/api/teams', { name: 'x', agents: [{ role: 'dev' }] })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_REPO_URL')
  })

  it('returns 400 when agents array is empty', async () => {
    const res = await post(port, '/api/teams', { name: 'x', repo: { url: 'x' }, agents: [] })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_AGENTS')
  })

  it('returns 400 when agents is not an array', async () => {
    const res = await post(port, '/api/teams', { name: 'x', repo: { url: 'x' }, agents: null })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_AGENTS')
  })

  it('returns 400 when an agent is missing role', async () => {
    const res = await post(port, '/api/teams', {
      name: 'x', repo: { url: 'x' }, agents: [{ model: 'claude-sonnet-4-6' }],
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_AGENT_ROLE')
  })

  it('returns 500 when compose startTeam throws', async () => {
    const { startTeam } = await import('../orchestrator/compose.js')
    startTeam.mockRejectedValueOnce(new Error('docker error'))
    const res = await post(port, '/api/teams', VALID_TEAM)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('COMPOSE_ERROR')
  })

  it('rolls back store on compose failure', async () => {
    const { startTeam } = await import('../orchestrator/compose.js')
    startTeam.mockRejectedValueOnce(new Error('docker error'))
    await post(port, '/api/teams', VALID_TEAM)
    expect(listTeams()).toHaveLength(0)
  })
})

// ── GET /api/teams ────────────────────────────────────────────────────────────

describe('GET /api/teams', () => {
  it('returns empty array when no teams', async () => {
    const res = await get(port, '/api/teams')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns all teams after creation', async () => {
    await post(port, '/api/teams', VALID_TEAM)
    await post(port, '/api/teams', { ...VALID_TEAM, name: 'team-2' })
    const res = await get(port, '/api/teams')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

// ── GET /api/teams/:id ────────────────────────────────────────────────────────

describe('GET /api/teams/:id', () => {
  it('returns team by id', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await get(port, `/api/teams/${teamId}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(teamId)
    expect(res.body.name).toBe('test-team')
  })

  it('returns 404 for unknown id', async () => {
    const res = await get(port, '/api/teams/nonexistent-id')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── PATCH /api/teams/:id ──────────────────────────────────────────────────────

describe('PATCH /api/teams/:id', () => {
  it('updates team name', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await patch(port, `/api/teams/${teamId}`, { name: 'renamed' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('renamed')
  })

  it('updates auth config', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await patch(port, `/api/teams/${teamId}`, { auth: { mode: 'api-key' } })
    expect(res.status).toBe(200)
    expect(res.body.auth).toEqual({ mode: 'api-key' })
  })

  it('returns 404 for unknown team', async () => {
    const res = await patch(port, '/api/teams/nope', { name: 'x' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 400 for empty name string', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await patch(port, `/api/teams/${teamId}`, { name: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_NAME')
  })

  it('returns 400 when auth is an array', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await patch(port, `/api/teams/${teamId}`, { auth: ['bad'] })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_AUTH')
  })
})

// ── DELETE /api/teams/:id ─────────────────────────────────────────────────────

describe('DELETE /api/teams/:id', () => {
  it('destroys team and returns 204', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await del(port, `/api/teams/${teamId}`)
    expect(res.status).toBe(204)
    expect(listTeams()).toHaveLength(0)
  })

  it('still removes team from store if stopTeam throws', async () => {
    const { stopTeam } = await import('../orchestrator/compose.js')
    stopTeam.mockRejectedValueOnce(new Error('compose gone'))
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await del(port, `/api/teams/${teamId}`)
    expect(res.status).toBe(204)
    expect(listTeams()).toHaveLength(0)
  })

  it('returns 404 for unknown team', async () => {
    const res = await del(port, '/api/teams/nope')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── GET /api/teams/:id/overview ───────────────────────────────────────────────

describe('GET /api/teams/:id/overview', () => {
  it('returns agent status summary', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await get(port, `/api/teams/${teamId}/overview`)
    expect(res.status).toBe(200)
    expect(res.body.teamId).toBe(teamId)
    expect(res.body.agentCount).toBe(1)
    expect(Array.isArray(res.body.agents)).toBe(true)
    expect(res.body.agents[0].status).toBe('no-heartbeat')
    expect(res.body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/nope/overview')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── GET /api/teams/:id/agents ─────────────────────────────────────────────────

describe('GET /api/teams/:id/agents', () => {
  it('returns agents list', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await get(port, `/api/teams/${teamId}/agents`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0].role).toBe('dev')
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/nope/agents')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── GET /api/teams/:id/channels ───────────────────────────────────────────────

describe('GET /api/teams/:id/channels', () => {
  it('returns standard channel list for a valid team', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await get(port, `/api/teams/${teamId}/channels`)
    expect(res.status).toBe(200)
    expect(res.body.map(c => c.name)).toContain('#main')
    expect(res.body.map(c => c.name)).toContain('#tasks')
    expect(res.body.map(c => c.name)).toContain('#code')
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/nope/channels')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── POST /api/teams/:id/channels/:name/messages (stub) ───────────────────────

describe('POST /api/teams/:id/channels/:name/messages', () => {
  it('returns 501 GATEWAY_NOT_READY when text provided', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await post(port, `/api/teams/${teamId}/channels/%23main/messages`, { text: 'hello' })
    expect(res.status).toBe(501)
    expect(res.body.code).toBe('GATEWAY_NOT_READY')
  })

  it('returns 400 when text is missing', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const teamId = created.body.id
    const res = await post(port, `/api/teams/${teamId}/channels/%23main/messages`, {})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_TEXT')
  })
})

// ── POST /heartbeat/:teamId/:agentId ──────────────────────────────────────────

describe('POST /heartbeat/:teamId/:agentId', () => {
  it('returns 200 and updates agent heartbeat', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const team = created.body
    const agentId = team.agents[0].id

    const res = await post(port, `/heartbeat/${team.id}/${agentId}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns 404 for unknown team', async () => {
    const res = await post(port, '/heartbeat/nope/agent-1')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── Tenant auth ──────────────────────────────────────────────────────────────

describe('tenant auth', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await requestNoAuth(port, 'GET', '/api/teams')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 for empty Bearer token', async () => {
    const res = await requestNoAuth(port, 'GET', '/api/teams')
    expect(res.status).toBe(401)
  })

  it('heartbeat does not require auth', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    const team = created.body
    const agentId = team.agents[0].id
    const res = await requestNoAuth(port, 'POST', `/heartbeat/${team.id}/${agentId}`)
    expect(res.status).toBe(200)
  })

  it('tenant isolation — different key cannot see other teams', async () => {
    const created = await post(port, '/api/teams', VALID_TEAM)
    expect(created.status).toBe(201)

    // Request with different key
    const res = await new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1', port, path: `/api/teams/${created.body.id}`, method: 'GET',
        headers: { 'Authorization': 'Bearer other-tenant-key-456', 'Content-Type': 'application/json' },
      }
      const req = http.request(opts, (r) => {
        let data = ''
        r.on('data', (c) => { data += c })
        r.on('end', () => { resolve({ status: r.statusCode, body: JSON.parse(data) }) })
      })
      req.on('error', reject)
      req.end()
    })
    expect(res.status).toBe(404)
  })
})

// ── 404 catch-all ─────────────────────────────────────────────────────────────

describe('catch-all', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await get(port, '/api/unknown-route')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
