import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import http from 'http'
import { createApp } from './index.js'
import { loadTemplates } from './templates.js'
import { initDb, closeDb } from '../store/db.js'

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

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => {
          let parsed
          try { parsed = JSON.parse(data) } catch { parsed = data }
          resolve({ status: res.statusCode, body: parsed })
        })
      }
    )
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

const get = (path, headers) => request('GET', path, { headers })
const post = (path, body, headers) => request('POST', path, { body, headers })
const put = (path, body, headers) => request('PUT', path, { body, headers })
const del = (path, headers) => request('DELETE', path, { headers })

const AUTH = { Authorization: 'Bearer test-api-key-tmpl' }
const OTHER_AUTH = { Authorization: 'Bearer other-tenant-key' }

const VALID_AGENT = {
  role: 'dev',
  model: 'sonnet',
  runtime: 'claude-code',
  effort: 'high',
  prompt: 'You are a dev agent.',
}

const VALID_TEMPLATE = {
  name: 'My Custom Team',
  description: 'A custom template for testing.',
  agents: [VALID_AGENT],
}

// ── Test setup ────────────────────────────────────────────────────────────────

let server
let port

beforeAll(() => initDb(':memory:'))
afterAll(() => closeDb())

beforeAll(async () => {
  await loadTemplates()
})

beforeEach(() => {
  return new Promise((resolve) => {
    const app = createApp()
    server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      resolve()
    })
  })
})

afterEach(() => new Promise((resolve) => server.close(resolve)))

// ── GET /api/templates ────────────────────────────────────────────────────────

describe('GET /api/templates', () => {
  it('returns 200 with templates array', async () => {
    const res = await get('/api/templates')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('templates')
    expect(Array.isArray(res.body.templates)).toBe(true)
  })

  it('includes all five built-in templates', async () => {
    const res = await get('/api/templates')
    const ids = res.body.templates.map(t => t.id)
    expect(ids).toContain('solo-dev')
    expect(ids).toContain('pair-programming')
    expect(ids).toContain('code-review')
    expect(ids).toContain('minimal-team')
    expect(ids).toContain('full-team')
  })

  it('each template has required fields', async () => {
    const res = await get('/api/templates')
    for (const tmpl of res.body.templates) {
      expect(typeof tmpl.id).toBe('string')
      expect(typeof tmpl.name).toBe('string')
      expect(typeof tmpl.description).toBe('string')
      expect(Array.isArray(tmpl.agents)).toBe(true)
      expect(tmpl.agents.length).toBeGreaterThan(0)
      expect(tmpl.builtin).toBe(true)
    }
  })

  it('each agent has role, model, runtime, effort, and prompt', async () => {
    const res = await get('/api/templates')
    for (const tmpl of res.body.templates) {
      for (const agent of tmpl.agents) {
        expect(typeof agent.role).toBe('string')
        expect(typeof agent.model).toBe('string')
        expect(typeof agent.runtime).toBe('string')
        expect(typeof agent.effort).toBe('string')
        expect(typeof agent.prompt).toBe('string')
      }
    }
  })

  it('is accessible without authentication', async () => {
    const res = await get('/api/templates')
    expect(res.status).toBe(200)
  })

  it('includes custom templates when authenticated', async () => {
    // Create a custom template first
    await post('/api/templates', VALID_TEMPLATE, AUTH)
    const res = await get('/api/templates', AUTH)
    expect(res.status).toBe(200)
    const customIds = res.body.templates.filter(t => !t.builtin).map(t => t.id)
    expect(customIds.length).toBeGreaterThan(0)
  })

  it('does not include other tenant custom templates', async () => {
    await post('/api/templates', VALID_TEMPLATE, AUTH)
    const res = await get('/api/templates', OTHER_AUTH)
    const customs = res.body.templates.filter(t => !t.builtin)
    expect(customs.length).toBe(0)
  })
})

// ── GET /api/templates/:id ────────────────────────────────────────────────────

describe('GET /api/templates/:id', () => {
  it('returns solo-dev template with 1 agent', async () => {
    const res = await get('/api/templates/solo-dev')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('solo-dev')
    expect(res.body.agents.length).toBe(1)
  })

  it('returns pair-programming template with 2 agents', async () => {
    const res = await get('/api/templates/pair-programming')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('pair-programming')
    expect(res.body.agents.length).toBe(2)
  })

  it('returns code-review template with 2 agents', async () => {
    const res = await get('/api/templates/code-review')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('code-review')
    expect(res.body.agents.length).toBe(2)
  })

  it('returns minimal-team template with 3 agents', async () => {
    const res = await get('/api/templates/minimal-team')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('minimal-team')
    expect(res.body.agents.length).toBe(3)
  })

  it('returns full-team template with 6 agents', async () => {
    const res = await get('/api/templates/full-team')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('full-team')
    expect(res.body.agents.length).toBe(6)
  })

  it('returns 404 for unknown template id', async () => {
    const res = await get('/api/templates/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('is accessible without authentication', async () => {
    const res = await get('/api/templates/solo-dev')
    expect(res.status).toBe(200)
  })

  it('returns tenant custom template when authenticated', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const res = await get(`/api/templates/${created.body.id}`, AUTH)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(created.body.id)
  })

  it('returns 404 for custom template accessed without auth', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const res = await get(`/api/templates/${created.body.id}`)
    expect(res.status).toBe(404)
  })
})

// ── Template content spot-checks ──────────────────────────────────────────────

describe('template content', () => {
  it('full-team has lead, arch, dev, qa, critic roles', async () => {
    const res = await get('/api/templates/full-team')
    const roles = res.body.agents.map(a => a.role)
    expect(roles).toContain('lead')
    expect(roles).toContain('arch')
    expect(roles).toContain('dev')
    expect(roles).toContain('qa')
    expect(roles).toContain('critic')
  })

  it('minimal-team has lead and two devs', async () => {
    const res = await get('/api/templates/minimal-team')
    const roles = res.body.agents.map(a => a.role)
    expect(roles).toContain('lead')
    expect(roles.filter(r => r === 'dev').length).toBe(2)
  })

  it('code-review has dev and critic roles', async () => {
    const res = await get('/api/templates/code-review')
    const roles = res.body.agents.map(a => a.role)
    expect(roles).toContain('dev')
    expect(roles).toContain('critic')
  })

  it('lead and arch agents use opus model', async () => {
    const res = await get('/api/templates/full-team')
    for (const agent of res.body.agents) {
      if (agent.role === 'lead' || agent.role === 'arch') {
        expect(agent.model).toBe('opus')
      }
    }
  })

  it('all agents use claude-code runtime', async () => {
    const res = await get('/api/templates')
    for (const tmpl of res.body.templates) {
      for (const agent of tmpl.agents) {
        expect(agent.runtime).toBe('claude-code')
      }
    }
  })
})

// ── POST /api/templates ───────────────────────────────────────────────────────

describe('POST /api/templates', () => {
  it('returns 401 without auth', async () => {
    const res = await post('/api/templates', VALID_TEMPLATE)
    expect(res.status).toBe(401)
  })

  it('creates a custom template and returns 201', async () => {
    const res = await post('/api/templates', VALID_TEMPLATE, AUTH)
    expect(res.status).toBe(201)
    expect(typeof res.body.id).toBe('string')
    expect(res.body.name).toBe(VALID_TEMPLATE.name)
    expect(res.body.builtin).toBe(false)
    expect(Array.isArray(res.body.agents)).toBe(true)
    expect(res.body.agents.length).toBe(1)
  })

  it('created template has tenantId set', async () => {
    const res = await post('/api/templates', VALID_TEMPLATE, AUTH)
    expect(res.status).toBe(201)
    expect(typeof res.body.tenantId).toBe('string')
  })

  it('created template has per-agent runtime field', async () => {
    const multiRuntime = {
      name: 'Multi Runtime Team',
      description: 'Test',
      agents: [
        { ...VALID_AGENT, role: 'lead', runtime: 'claude-code' },
        { ...VALID_AGENT, role: 'dev', runtime: 'codex' },
      ],
    }
    const res = await post('/api/templates', multiRuntime, AUTH)
    expect(res.status).toBe(201)
    expect(res.body.agents[0].runtime).toBe('claude-code')
    expect(res.body.agents[1].runtime).toBe('codex')
  })

  it('returns 400 when name is missing', async () => {
    const res = await post('/api/templates', { agents: [VALID_AGENT] }, AUTH)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when agents is empty', async () => {
    const res = await post('/api/templates', { name: 'Test', agents: [] }, AUTH)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when agent is missing required field', async () => {
    const badAgent = { role: 'dev', model: 'sonnet' } // missing runtime/effort/prompt
    const res = await post('/api/templates', { name: 'Test', agents: [badAgent] }, AUTH)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when agents is not an array', async () => {
    const res = await post('/api/templates', { name: 'Test', agents: 'bad' }, AUTH)
    expect(res.status).toBe(400)
  })

  it('generated id is slugified from name', async () => {
    const res = await post('/api/templates', { ...VALID_TEMPLATE, name: 'My Cool Team!' }, AUTH)
    expect(res.status).toBe(201)
    expect(res.body.id).toBe('my-cool-team')
  })
})

// ── PUT /api/templates/:id ────────────────────────────────────────────────────

describe('PUT /api/templates/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await put('/api/templates/solo-dev', { name: 'Hack' })
    expect(res.status).toBe(401)
  })

  it('returns 403 when trying to update a builtin template', async () => {
    const res = await put('/api/templates/solo-dev', { name: 'Hacked' }, AUTH)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('updates name of a custom template', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const id = created.body.id
    const res = await put(`/api/templates/${id}`, { name: 'Updated Name' }, AUTH)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Name')
    expect(res.body.id).toBe(id)
  })

  it('updates agents — including per-agent runtime', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const id = created.body.id
    const newAgents = [
      { ...VALID_AGENT, role: 'lead', runtime: 'claude-code' },
      { ...VALID_AGENT, role: 'dev', runtime: 'codex' },
    ]
    const res = await put(`/api/templates/${id}`, { agents: newAgents }, AUTH)
    expect(res.status).toBe(200)
    expect(res.body.agents.length).toBe(2)
    expect(res.body.agents[1].runtime).toBe('codex')
  })

  it('returns 404 for non-existent template', async () => {
    const res = await put('/api/templates/no-such-id', { name: 'X' }, AUTH)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when trying to update another tenant template', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const res = await put(`/api/templates/${created.body.id}`, { name: 'Stolen' }, OTHER_AUTH)
    expect(res.status).toBe(404)
  })

  it('returns 400 when agents update is invalid', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const res = await put(`/api/templates/${created.body.id}`, { agents: [] }, AUTH)
    expect(res.status).toBe(400)
  })
})

// ── DELETE /api/templates/:id ─────────────────────────────────────────────────

describe('DELETE /api/templates/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await del('/api/templates/solo-dev')
    expect(res.status).toBe(401)
  })

  it('returns 403 when trying to delete a builtin template', async () => {
    const res = await del('/api/templates/solo-dev', AUTH)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('deletes a custom template and returns 204', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const id = created.body.id
    const res = await del(`/api/templates/${id}`, AUTH)
    expect(res.status).toBe(204)
  })

  it('template is gone after delete', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const id = created.body.id
    await del(`/api/templates/${id}`, AUTH)
    const res = await get(`/api/templates/${id}`, AUTH)
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-existent template', async () => {
    const res = await del('/api/templates/no-such-id', AUTH)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when trying to delete another tenant template', async () => {
    const created = await post('/api/templates', VALID_TEMPLATE, AUTH)
    const res = await del(`/api/templates/${created.body.id}`, OTHER_AUTH)
    expect(res.status).toBe(404)
  })
})
