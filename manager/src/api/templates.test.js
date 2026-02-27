import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import http from 'http'
import { createApp } from './index.js'
import { loadTemplates } from './templates.js'

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
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
    req.end()
  })
}

// ── Test setup ────────────────────────────────────────────────────────────────

let server
let port

beforeAll(async () => {
  // Ensure templates are loaded from disk before any test runs
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
    const res = await get(port, '/api/templates')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('templates')
    expect(Array.isArray(res.body.templates)).toBe(true)
  })

  it('includes all four built-in templates', async () => {
    const res = await get(port, '/api/templates')
    const ids = res.body.templates.map(t => t.id)
    expect(ids).toContain('full-team')
    expect(ids).toContain('lean-duo')
    expect(ids).toContain('review-only')
    expect(ids).toContain('codex-team')
  })

  it('each template has required fields', async () => {
    const res = await get(port, '/api/templates')
    for (const tmpl of res.body.templates) {
      expect(typeof tmpl.id).toBe('string')
      expect(typeof tmpl.name).toBe('string')
      expect(typeof tmpl.description).toBe('string')
      expect(Array.isArray(tmpl.agents)).toBe(true)
      expect(tmpl.agents.length).toBeGreaterThan(0)
    }
  })

  it('each agent has role, model, and prompt', async () => {
    const res = await get(port, '/api/templates')
    for (const tmpl of res.body.templates) {
      for (const agent of tmpl.agents) {
        expect(typeof agent.role).toBe('string')
        expect(typeof agent.model).toBe('string')
        expect(typeof agent.prompt).toBe('string')
      }
    }
  })

  it('is accessible without authentication', async () => {
    // Templates endpoint is public — no Authorization header needed
    const res = await get(port, '/api/templates')
    expect(res.status).toBe(200)
  })
})

// ── GET /api/templates/:id ────────────────────────────────────────────────────

describe('GET /api/templates/:id', () => {
  it('returns full-team template', async () => {
    const res = await get(port, '/api/templates/full-team')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('full-team')
    expect(res.body.agents.length).toBe(5)
  })

  it('returns lean-duo template with 2 agents', async () => {
    const res = await get(port, '/api/templates/lean-duo')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('lean-duo')
    expect(res.body.agents.length).toBe(2)
  })

  it('returns review-only template with 1 agent', async () => {
    const res = await get(port, '/api/templates/review-only')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('review-only')
    expect(res.body.agents.length).toBe(1)
  })

  it('returns codex-team template with 3 agents', async () => {
    const res = await get(port, '/api/templates/codex-team')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('codex-team')
    expect(res.body.agents.length).toBe(3)
  })

  it('returns 404 for unknown template id', async () => {
    const res = await get(port, '/api/templates/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('is accessible without authentication', async () => {
    const res = await get(port, '/api/templates/full-team')
    expect(res.status).toBe(200)
  })
})

// ── Template content spot-checks ──────────────────────────────────────────────

describe('template content', () => {
  it('full-team has lead, arch, dev, qa, critic roles', async () => {
    const res = await get(port, '/api/templates/full-team')
    const roles = res.body.agents.map(a => a.role)
    expect(roles).toContain('lead')
    expect(roles).toContain('arch')
    expect(roles).toContain('dev')
    expect(roles).toContain('qa')
    expect(roles).toContain('critic')
  })

  it('full-team has recommended tag', async () => {
    const res = await get(port, '/api/templates/full-team')
    expect(res.body.tags).toContain('recommended')
  })

  it('codex-team uses codex runtime', async () => {
    const res = await get(port, '/api/templates/codex-team')
    expect(res.body.runtime).toBe('codex')
  })
})
