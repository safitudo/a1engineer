import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdir, writeFile, rm } from 'fs/promises'

// ── Setup ─────────────────────────────────────────────────────────────────────

let testDir

beforeEach(async () => {
  testDir = join(tmpdir(), `tmpl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  vi.resetModules()
  try { await rm(testDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

// ── Import helpers ─────────────────────────────────────────────────────────────

async function getStore() {
  vi.resetModules()
  vi.doMock('../constants.js', () => ({ TEAMS_DIR: testDir }))
  const mod = await import('../store/templates.js?' + Date.now())
  return mod
}

// ── Builtin template tests ────────────────────────────────────────────────────

describe('builtin templates', () => {
  it('listTemplates returns array', async () => {
    const { listTemplates } = await import('./templates.js')
    const result = listTemplates()
    expect(Array.isArray(result)).toBe(true)
  })

  it('getTemplate returns null for unknown id', async () => {
    const { getTemplate } = await import('./templates.js')
    expect(getTemplate('does-not-exist')).toBeNull()
  })
})

// ── Per-tenant template tests ─────────────────────────────────────────────────

describe('createTemplate', () => {
  it('creates a template and returns it', async () => {
    const { createTemplate, getTemplate } = await getStore()

    const result = await createTemplate('tenant-1', {
      name: 'My Template',
      description: 'A test template',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })

    expect(result.error).toBeUndefined()
    const tmpl = result.template
    expect(tmpl.id).toBeDefined()
    expect(tmpl.name).toBe('My Template')
    expect(tmpl.tenantId).toBe('tenant-1')
    expect(tmpl.builtin).toBe(false)
    expect(tmpl.createdAt).toBeDefined()
    expect(tmpl.updatedAt).toBeDefined()

    const fetched = getTemplate(tmpl.id, 'tenant-1')
    expect(fetched).toEqual(tmpl)
  })

  it('returns error for missing name', async () => {
    const { createTemplate } = await getStore()
    const result = await createTemplate('tenant-1', { agents: [] })
    expect(result.error).toBeDefined()
  })

  it('returns error for invalid agents', async () => {
    const { createTemplate } = await getStore()
    const result = await createTemplate('tenant-1', {
      name: 'Bad',
      agents: [{ role: 'dev' }], // missing required fields
    })
    expect(result.error).toBeDefined()
  })

  it('persists template to disk', async () => {
    const { createTemplate } = await getStore()

    await createTemplate('tenant-3', {
      name: 'Persist Test',
      description: 'should hit disk',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })

    const { readFile } = await import('fs/promises')
    const raw = await readFile(join(testDir, 'tenant-3', 'templates.json'), 'utf8')
    const arr = JSON.parse(raw)
    expect(arr.length).toBe(1)
    expect(arr[0].name).toBe('Persist Test')
  })
})

describe('listTemplates with tenantId', () => {
  it('returns empty builtins + empty tenant for unknown tenant', async () => {
    const { listTemplates } = await getStore()
    const result = listTemplates('nobody')
    expect(Array.isArray(result)).toBe(true)
    // Only builtins (from data/templates.json), no tenant-specific ones
  })

  it('returns builtins + tenant templates', async () => {
    const { createTemplate, listTemplates } = await getStore()

    await createTemplate('tenant-list', {
      name: 'A',
      description: '',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })
    await createTemplate('tenant-list', {
      name: 'B',
      description: '',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })

    const list = listTemplates('tenant-list')
    const tenantTemplates = list.filter(t => t.tenantId === 'tenant-list')
    expect(tenantTemplates.length).toBe(2)
    expect(tenantTemplates.map(t => t.name).sort()).toEqual(['A', 'B'])
  })
})

describe('updateTemplate', () => {
  it('updates existing template fields', async () => {
    const { createTemplate, updateTemplate, getTemplate } = await getStore()

    const { template: original } = await createTemplate('tenant-upd', {
      name: 'Before',
      description: 'old',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })

    const { template: updated } = await updateTemplate('tenant-upd', original.id, { name: 'After' })

    expect(updated.name).toBe('After')
    expect(updated.description).toBe('old')
    expect(updated.id).toBe(original.id)
    expect(updated.tenantId).toBe('tenant-upd')
    expect(updated.builtin).toBe(false)
    expect(updated.updatedAt >= original.updatedAt).toBe(true)

    const fetched = getTemplate(original.id, 'tenant-upd')
    expect(fetched.name).toBe('After')
  })

  it('returns NOT_FOUND for unknown template', async () => {
    const { updateTemplate } = await getStore()
    const result = await updateTemplate('nobody', 'no-id', { name: 'X' })
    expect(result.error).toBeDefined()
    expect(result.code).toBe('NOT_FOUND')
  })

  it('returns FORBIDDEN for builtin template', async () => {
    const { updateTemplate, listTemplates } = await getStore()
    const builtins = listTemplates()
    if (builtins.length === 0) return // skip if no builtins loaded
    const result = await updateTemplate('any-tenant', builtins[0].id, { name: 'X' })
    expect(result.code).toBe('FORBIDDEN')
  })
})

describe('deleteTemplate', () => {
  it('deletes an existing template and returns ok', async () => {
    const { createTemplate, deleteTemplate, getTemplate } = await getStore()

    const { template: tmpl } = await createTemplate('tenant-del', {
      name: 'Delete Me',
      description: '',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })

    const result = await deleteTemplate('tenant-del', tmpl.id)
    expect(result.ok).toBe(true)
    expect(getTemplate(tmpl.id, 'tenant-del')).toBeNull()
  })

  it('returns NOT_FOUND for unknown template', async () => {
    const { deleteTemplate } = await getStore()
    const result = await deleteTemplate('nobody', 'no-id')
    expect(result.error).toBeDefined()
    expect(result.code).toBe('NOT_FOUND')
  })

  it('returns FORBIDDEN for builtin template', async () => {
    const { deleteTemplate, listTemplates } = await getStore()
    const builtins = listTemplates()
    if (builtins.length === 0) return // skip if no builtins loaded
    const result = await deleteTemplate('any-tenant', builtins[0].id)
    expect(result.code).toBe('FORBIDDEN')
  })
})

describe('loadTenantTemplates', () => {
  it('loads templates from disk into memory', async () => {
    const { loadTenantTemplates, getTemplate } = await getStore()
    const tenantId = 'tenant-load'
    const dir = join(testDir, tenantId)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'templates.json'),
      JSON.stringify([
        { id: 'disk-tmpl', name: 'From Disk', description: 'loaded', agents: [], tenantId, builtin: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]),
      'utf8'
    )

    await loadTenantTemplates(tenantId)

    const tmpl = getTemplate('disk-tmpl', tenantId)
    expect(tmpl).not.toBeNull()
    expect(tmpl.name).toBe('From Disk')
  })

  it('handles missing file gracefully (starts empty)', async () => {
    const { loadTenantTemplates, listTemplates } = await getStore()
    await loadTenantTemplates('no-such-tenant')
    const list = listTemplates('no-such-tenant')
    const tenantTemplates = list.filter(t => t.tenantId === 'no-such-tenant')
    expect(tenantTemplates).toEqual([])
  })
})

describe('rehydrateTenantTemplates', () => {
  it('scans TEAMS_DIR and loads all tenant template files', async () => {
    const { rehydrateTenantTemplates, getTemplate } = await getStore()

    // Create two tenant dirs with templates.json
    for (const tid of ['t-a', 't-b']) {
      const dir = join(testDir, tid)
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, 'templates.json'),
        JSON.stringify([
          { id: `tmpl-${tid}`, name: tid, description: '', agents: [], tenantId: tid, builtin: false, createdAt: '', updatedAt: '' },
        ]),
        'utf8'
      )
    }

    const loaded = await rehydrateTenantTemplates()

    expect(loaded.sort()).toEqual(['t-a', 't-b'])
    expect(getTemplate('tmpl-t-a', 't-a')).not.toBeNull()
    expect(getTemplate('tmpl-t-b', 't-b')).not.toBeNull()
  })

  it('returns empty array when TEAMS_DIR does not exist', async () => {
    vi.resetModules()
    const missingDir = join(testDir, 'no-such-dir')
    vi.doMock('../constants.js', () => ({ TEAMS_DIR: missingDir }))
    const { rehydrateTenantTemplates } = await import('../store/templates.js?' + Date.now())
    const loaded = await rehydrateTenantTemplates()
    expect(loaded).toEqual([])
  })

  it('skips tenant dirs without templates.json', async () => {
    const { rehydrateTenantTemplates, getTemplate } = await getStore()

    // One tenant with templates, one without
    await mkdir(join(testDir, 't-has'), { recursive: true })
    await writeFile(
      join(testDir, 't-has', 'templates.json'),
      JSON.stringify([{ id: 'x', name: 'X', description: '', agents: [], tenantId: 't-has', builtin: false, createdAt: '', updatedAt: '' }]),
      'utf8'
    )
    await mkdir(join(testDir, 't-empty'), { recursive: true })
    // No templates.json for t-empty

    const loaded = await rehydrateTenantTemplates()

    expect(loaded).toContain('t-has')
    expect(loaded).not.toContain('t-empty')
  })
})

describe('getTenantTemplates (persistence hook)', () => {
  it('returns all templates for a tenant as array', async () => {
    const { createTemplate, getTenantTemplates } = await getStore()

    await createTemplate('tenant-hook', {
      name: 'Hook Test',
      description: '',
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: 'hi' }],
    })

    const arr = getTenantTemplates('tenant-hook')
    expect(Array.isArray(arr)).toBe(true)
    expect(arr.length).toBe(1)
    expect(arr[0].name).toBe('Hook Test')
  })

  it('returns empty array for unknown tenant', async () => {
    const { getTenantTemplates } = await getStore()
    expect(getTenantTemplates('nobody')).toEqual([])
  })
})
