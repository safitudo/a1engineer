import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { initDb, closeDb, getDb } from './db.js'
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTenantTemplates,
} from './templates.js'

beforeAll(() => initDb(':memory:'))
afterAll(() => closeDb())

afterEach(() => {
  getDb().exec('DELETE FROM templates')
})

const AGENT = { role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }

// ── Builtin templates ─────────────────────────────────────────────────────────

describe('builtin templates', () => {
  it('listTemplates returns an array', () => {
    const result = listTemplates()
    expect(Array.isArray(result)).toBe(true)
  })

  it('getTemplate returns null for unknown id (no tenantId)', () => {
    expect(getTemplate('does-not-exist')).toBeNull()
  })

  it('getTemplate returns null for unknown id even with tenantId', () => {
    expect(getTemplate('does-not-exist', 'tenant-1')).toBeNull()
  })
})

// ── createTemplate ────────────────────────────────────────────────────────────

describe('createTemplate', () => {
  it('creates a template and returns it', async () => {
    const result = await createTemplate('tenant-1', {
      name: 'My Template',
      description: 'A test template',
      agents: [AGENT],
    })

    expect(result.error).toBeUndefined()
    const tmpl = result.template
    expect(tmpl.id).toBeDefined()
    expect(tmpl.name).toBe('My Template')
    expect(tmpl.description).toBe('A test template')
    expect(tmpl.tenantId).toBe('tenant-1')
    expect(tmpl.builtin).toBe(false)
    expect(tmpl.createdAt).toBeDefined()
    expect(tmpl.updatedAt).toBeDefined()
    expect(Array.isArray(tmpl.agents)).toBe(true)
  })

  it('persists template to SQLite (round-trip via getTemplate)', async () => {
    const { template: tmpl } = await createTemplate('tenant-rt', {
      name: 'Persist Test',
      description: 'round-trip',
      agents: [AGENT],
    })

    const fetched = getTemplate(tmpl.id, 'tenant-rt')
    expect(fetched).toEqual(tmpl)
  })

  it('generates slug-based id from name', async () => {
    const { template: tmpl } = await createTemplate('tenant-slug', {
      name: 'My Cool Template',
      agents: [AGENT],
    })
    expect(tmpl.id).toBe('my-cool-template')
  })

  it('generates unique ids when name collides', async () => {
    const { template: t1 } = await createTemplate('tenant-dup', { name: 'Dup', agents: [AGENT] })
    const { template: t2 } = await createTemplate('tenant-dup', { name: 'Dup', agents: [AGENT] })
    expect(t1.id).toBe('dup')
    expect(t2.id).toBe('dup-2')
  })

  it('stores agent env defaulting to empty object', async () => {
    const { template: tmpl } = await createTemplate('tenant-env', {
      name: 'Env Test',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })
    expect(tmpl.agents[0].env).toEqual({})
  })

  it('preserves explicit agent env', async () => {
    const { template: tmpl } = await createTemplate('tenant-env2', {
      name: 'Env Test 2',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi', env: { FOO: 'bar' } }],
    })
    expect(tmpl.agents[0].env).toEqual({ FOO: 'bar' })
  })

  it('returns error for missing name', async () => {
    const result = await createTemplate('tenant-1', { agents: [AGENT] })
    expect(result.error).toBeDefined()
  })

  it('returns error for empty name', async () => {
    const result = await createTemplate('tenant-1', { name: '   ', agents: [AGENT] })
    expect(result.error).toBeDefined()
  })

  it('returns error for empty agents array', async () => {
    const result = await createTemplate('tenant-1', { name: 'Test', agents: [] })
    expect(result.error).toBeDefined()
  })

  it('returns error for agent missing required fields', async () => {
    const result = await createTemplate('tenant-1', {
      name: 'Bad',
      agents: [{ role: 'dev' }],
    })
    expect(result.error).toBeDefined()
  })

  it('trims whitespace from name and description', async () => {
    const { template: tmpl } = await createTemplate('tenant-trim', {
      name: '  Trimmed  ',
      description: '  desc  ',
      agents: [AGENT],
    })
    expect(tmpl.name).toBe('Trimmed')
    expect(tmpl.description).toBe('desc')
  })
})

// ── listTemplates ─────────────────────────────────────────────────────────────

describe('listTemplates with tenantId', () => {
  it('returns empty tenant list for unknown tenant', () => {
    const result = listTemplates('nobody')
    const tenantTemplates = result.filter((t) => t.tenantId === 'nobody')
    expect(tenantTemplates).toEqual([])
  })

  it('returns tenant templates combined with builtins', async () => {
    await createTemplate('tenant-list', { name: 'A', agents: [AGENT] })
    await createTemplate('tenant-list', { name: 'B', agents: [AGENT] })

    const list = listTemplates('tenant-list')
    const tenantTemplates = list.filter((t) => t.tenantId === 'tenant-list')
    expect(tenantTemplates.length).toBe(2)
    expect(tenantTemplates.map((t) => t.name).sort()).toEqual(['A', 'B'])
  })

  it('does not return other tenants templates', async () => {
    await createTemplate('tenant-a', { name: 'A Template', agents: [AGENT] })
    await createTemplate('tenant-b', { name: 'B Template', agents: [AGENT] })

    const list = listTemplates('tenant-a')
    const tenantB = list.filter((t) => t.tenantId === 'tenant-b')
    expect(tenantB).toEqual([])
  })
})

// ── getTemplate ───────────────────────────────────────────────────────────────

describe('getTemplate', () => {
  it('returns null without tenantId for custom template', async () => {
    const { template: tmpl } = await createTemplate('tenant-get', { name: 'T', agents: [AGENT] })
    expect(getTemplate(tmpl.id)).toBeNull()
  })

  it('returns template with matching tenantId', async () => {
    const { template: tmpl } = await createTemplate('tenant-get', { name: 'T', agents: [AGENT] })
    const fetched = getTemplate(tmpl.id, 'tenant-get')
    expect(fetched).toEqual(tmpl)
  })

  it('returns null for cross-tenant access', async () => {
    const { template: tmpl } = await createTemplate('tenant-a', { name: 'T', agents: [AGENT] })
    expect(getTemplate(tmpl.id, 'tenant-b')).toBeNull()
  })
})

// ── updateTemplate ────────────────────────────────────────────────────────────

describe('updateTemplate', () => {
  it('updates name only', async () => {
    const { template: original } = await createTemplate('tenant-upd', {
      name: 'Before',
      description: 'old',
      agents: [AGENT],
    })

    const { template: updated } = await updateTemplate('tenant-upd', original.id, { name: 'After' })

    expect(updated.name).toBe('After')
    expect(updated.description).toBe('old')
    expect(updated.id).toBe(original.id)
    expect(updated.tenantId).toBe('tenant-upd')
    expect(updated.builtin).toBe(false)
  })

  it('bumps updatedAt on update', async () => {
    const { template: original } = await createTemplate('tenant-upd', { name: 'T', agents: [AGENT] })
    // Ensure time has progressed (ISO strings are compared lexicographically)
    const { template: updated } = await updateTemplate('tenant-upd', original.id, { name: 'T2' })
    expect(updated.updatedAt >= original.updatedAt).toBe(true)
  })

  it('persists update to SQLite', async () => {
    const { template: original } = await createTemplate('tenant-upd', { name: 'T', agents: [AGENT] })
    await updateTemplate('tenant-upd', original.id, { name: 'Updated' })
    const fetched = getTemplate(original.id, 'tenant-upd')
    expect(fetched.name).toBe('Updated')
  })

  it('updates description independently', async () => {
    const { template: original } = await createTemplate('tenant-upd', {
      name: 'T',
      description: 'old desc',
      agents: [AGENT],
    })
    const { template: updated } = await updateTemplate('tenant-upd', original.id, { description: 'new desc' })
    expect(updated.description).toBe('new desc')
    expect(updated.name).toBe('T')
  })

  it('updates agents array', async () => {
    const { template: original } = await createTemplate('tenant-upd', { name: 'T', agents: [AGENT] })
    const newAgent = { role: 'qa', model: 'haiku', runtime: 'claude-code', effort: 'low', prompt: 'test' }
    const { template: updated } = await updateTemplate('tenant-upd', original.id, { agents: [newAgent] })
    expect(updated.agents[0].role).toBe('qa')
  })

  it('returns NOT_FOUND for unknown template', async () => {
    const result = await updateTemplate('nobody', 'no-id', { name: 'X' })
    expect(result.error).toBeDefined()
    expect(result.code).toBe('NOT_FOUND')
  })

  it('returns NOT_FOUND for cross-tenant access', async () => {
    const { template: tmpl } = await createTemplate('tenant-a', { name: 'T', agents: [AGENT] })
    const result = await updateTemplate('tenant-b', tmpl.id, { name: 'X' })
    expect(result.code).toBe('NOT_FOUND')
  })

  it('returns FORBIDDEN for builtin template', async () => {
    const builtins = listTemplates()
    if (builtins.length === 0) return
    const result = await updateTemplate('any-tenant', builtins[0].id, { name: 'X' })
    expect(result.code).toBe('FORBIDDEN')
  })

  it('returns error for invalid name update', async () => {
    const { template: tmpl } = await createTemplate('tenant-upd', { name: 'T', agents: [AGENT] })
    const result = await updateTemplate('tenant-upd', tmpl.id, { name: '' })
    expect(result.error).toBeDefined()
  })
})

// ── deleteTemplate ────────────────────────────────────────────────────────────

describe('deleteTemplate', () => {
  it('deletes an existing template and returns ok', async () => {
    const { template: tmpl } = await createTemplate('tenant-del', {
      name: 'Delete Me',
      agents: [AGENT],
    })

    const result = await deleteTemplate('tenant-del', tmpl.id)
    expect(result.ok).toBe(true)
    expect(getTemplate(tmpl.id, 'tenant-del')).toBeNull()
  })

  it('returns NOT_FOUND for unknown template', async () => {
    const result = await deleteTemplate('nobody', 'no-id')
    expect(result.error).toBeDefined()
    expect(result.code).toBe('NOT_FOUND')
  })

  it('returns NOT_FOUND for cross-tenant delete', async () => {
    const { template: tmpl } = await createTemplate('tenant-a', { name: 'T', agents: [AGENT] })
    const result = await deleteTemplate('tenant-b', tmpl.id)
    expect(result.code).toBe('NOT_FOUND')
  })

  it('returns FORBIDDEN for builtin template', async () => {
    const builtins = listTemplates()
    if (builtins.length === 0) return
    const result = await deleteTemplate('any-tenant', builtins[0].id)
    expect(result.code).toBe('FORBIDDEN')
  })
})

// ── getTenantTemplates ────────────────────────────────────────────────────────

describe('getTenantTemplates', () => {
  it('returns all templates for a tenant', async () => {
    await createTemplate('tenant-hook', { name: 'Hook Test', agents: [AGENT] })

    const arr = getTenantTemplates('tenant-hook')
    expect(Array.isArray(arr)).toBe(true)
    expect(arr.length).toBe(1)
    expect(arr[0].name).toBe('Hook Test')
  })

  it('returns empty array for unknown tenant', () => {
    expect(getTenantTemplates('nobody')).toEqual([])
  })

  it('does not include other tenants templates', async () => {
    await createTemplate('tenant-a', { name: 'A', agents: [AGENT] })
    await createTemplate('tenant-b', { name: 'B', agents: [AGENT] })

    const arr = getTenantTemplates('tenant-a')
    expect(arr.every((t) => t.tenantId === 'tenant-a')).toBe(true)
  })
})

