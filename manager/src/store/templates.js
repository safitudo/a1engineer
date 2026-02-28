// WARNING: Templates must not contain secrets.
// The agent env field is for non-sensitive config only (e.g. CLAUDE_AUTOCOMPACT_PCT_OVERRIDE).
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDb } from './db.js'

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../data/templates.json')

// ── Builtin templates (read-only) ────────────────────────────────────────────

/** @type {Map<string, object>} */
let builtinStore = new Map()

export async function loadTemplates() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const templates = JSON.parse(raw)
    builtinStore = new Map(templates.map((t) => [t.id, t]))
    console.log(`[templates] loaded ${builtinStore.size} builtin template(s)`)
  } catch (err) {
    console.warn('[templates] failed to load templates.json:', err.message)
  }
}

// ── Row hydration ─────────────────────────────────────────────────────────────

function rowToTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    agents: JSON.parse(row.agents),
    builtin: false,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * List templates.
 * @param {string|null} tenantId — if provided, also includes tenant's custom templates
 */
export function listTemplates(tenantId = null) {
  const builtins = Array.from(builtinStore.values())
  if (!tenantId) return builtins
  const customs = getTenantTemplates(tenantId)
  return [...builtins, ...customs]
}

/**
 * Get a single template by id.
 * @param {string} id
 * @param {string|null} tenantId — if provided, also searches tenant's custom templates
 */
export function getTemplate(id, tenantId = null) {
  const builtin = builtinStore.get(id)
  if (builtin) return builtin
  if (!tenantId) return null
  const row = getDb().prepare('SELECT * FROM templates WHERE id = ? AND tenant_id = ?').get(id, tenantId)
  return row ? rowToTemplate(row) : null
}

// ── Tenant CRUD ────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function generateId(tenantId, name) {
  const base = slugify(name) || 'template'
  let id = base
  let i = 2
  while (builtinStore.has(id) || getDb().prepare('SELECT 1 FROM templates WHERE id = ?').get(id)) {
    id = `${base}-${i++}`
  }
  return id
}

function validateAgents(agents) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return 'agents must be a non-empty array'
  }
  for (const [i, agent] of agents.entries()) {
    for (const field of ['role', 'model', 'runtime', 'effort', 'prompt']) {
      if (typeof agent[field] !== 'string' || !agent[field]) {
        return `agents[${i}].${field} must be a non-empty string`
      }
    }
  }
  return null
}

/**
 * Create a custom template for a tenant.
 * @param {string} tenantId
 * @param {{ name: string, description?: string, agents: object[] }} data
 * @returns {Promise<{ template: object }|{ error: string }>}
 */
export async function createTemplate(tenantId, data) {
  const { name, description = '', agents } = data ?? {}

  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'name is required' }
  }
  const agentError = validateAgents(agents)
  if (agentError) return { error: agentError }

  const id = generateId(tenantId, name.trim())
  const now = new Date().toISOString()
  const template = {
    id,
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    agents: agents.map((a) => ({
      role: a.role,
      model: a.model,
      runtime: a.runtime,
      effort: a.effort,
      prompt: a.prompt,
      env: a.env ?? {},
    })),
    builtin: false,
    tenantId,
    createdAt: now,
    updatedAt: now,
  }

  getDb().prepare(`
    INSERT INTO templates (id, tenant_id, name, description, agents, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, template.name, template.description, JSON.stringify(template.agents), template.createdAt, template.updatedAt)

  return { template }
}

/**
 * Update a custom template owned by a tenant.
 * Builtin templates cannot be updated.
 * @param {string} tenantId
 * @param {string} id
 * @param {{ name?: string, description?: string, agents?: object[] }} updates
 * @returns {Promise<{ template: object }|{ error: string, code: string }>}
 */
export async function updateTemplate(tenantId, id, updates) {
  if (builtinStore.has(id)) {
    return { error: 'builtin templates are read-only', code: 'FORBIDDEN' }
  }
  const row = getDb().prepare('SELECT * FROM templates WHERE id = ? AND tenant_id = ?').get(id, tenantId)
  if (!row) {
    return { error: 'template not found', code: 'NOT_FOUND' }
  }
  const existing = rowToTemplate(row)

  const { name, description, agents } = updates ?? {}

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return { error: 'name must be a non-empty string' }
  }
  if (agents !== undefined) {
    const agentError = validateAgents(agents)
    if (agentError) return { error: agentError }
  }

  const updated = {
    ...existing,
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description: typeof description === 'string' ? description.trim() : '' }),
    ...(agents !== undefined && {
      agents: agents.map((a) => ({
        role: a.role,
        model: a.model,
        runtime: a.runtime,
        effort: a.effort,
        prompt: a.prompt,
        env: a.env ?? {},
      })),
    }),
    updatedAt: new Date().toISOString(),
  }

  getDb().prepare(`
    UPDATE templates SET name = ?, description = ?, agents = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).run(updated.name, updated.description, JSON.stringify(updated.agents), updated.updatedAt, id, tenantId)

  return { template: updated }
}

/**
 * Delete a custom template owned by a tenant.
 * Builtin templates cannot be deleted.
 * @param {string} tenantId
 * @param {string} id
 * @returns {Promise<{ ok: true }|{ error: string, code: string }>}
 */
export async function deleteTemplate(tenantId, id) {
  if (builtinStore.has(id)) {
    return { error: 'builtin templates are read-only', code: 'FORBIDDEN' }
  }
  const row = getDb().prepare('SELECT 1 FROM templates WHERE id = ? AND tenant_id = ?').get(id, tenantId)
  if (!row) {
    return { error: 'template not found', code: 'NOT_FOUND' }
  }
  getDb().prepare('DELETE FROM templates WHERE id = ? AND tenant_id = ?').run(id, tenantId)
  return { ok: true }
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * Get all custom templates for a tenant.
 */
export function getTenantTemplates(tenantId) {
  return getDb().prepare('SELECT * FROM templates WHERE tenant_id = ?').all(tenantId).map(rowToTemplate)
}

/**
 * Restore persisted custom templates for a tenant (called on startup / import).
 */
export function restoreTenantTemplates(tenantId, templates) {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO templates (id, tenant_id, name, description, agents, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  for (const t of templates) {
    stmt.run(t.id, tenantId, t.name, t.description ?? '', JSON.stringify(t.agents ?? []), t.createdAt, t.updatedAt)
  }
}

/**
 * No-op: SQLite persists across restarts, no file loading needed.
 */
export async function loadTenantTemplates(_tenantId) {
  // SQLite persists across restarts — nothing to do
}

/**
 * No-op: SQLite persists across restarts, no directory scan needed.
 * Returns empty array for startup compatibility.
 */
export async function rehydrateTenantTemplates() {
  return []
}

// Load builtins on startup
loadTemplates()
