// WARNING: Templates must not contain secrets.
// The agent env field is for non-sensitive config only (e.g. CLAUDE_AUTOCOMPACT_PCT_OVERRIDE).
import { readFile, writeFile, mkdir, readdir, access } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { TEAMS_DIR } from '../constants.js'

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../data/templates.json')

// ── Builtin templates (read-only) ────────────────────────────────────────────

/** @type {Map<string, object>} */
let builtinStore = new Map()

/**
 * Per-tenant custom templates.
 * Map<tenantId, Map<templateId, template>>
 */
const tenantStore = new Map()

// ── Builtin templates ──────────────────────────────────────────────────────

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
  const tenantMap = tenantStore.get(tenantId)
  return tenantMap?.get(id) ?? null
}

// ── Tenant CRUD ────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function generateId(tenantId, name) {
  const base = slugify(name) || 'template'
  let id = base
  let i = 2
  while (builtinStore.has(id) || tenantStore.get(tenantId)?.has(id)) {
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  if (!tenantStore.has(tenantId)) tenantStore.set(tenantId, new Map())
  tenantStore.get(tenantId).set(id, template)
  await persistTenantTemplates(tenantId)
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
  const tenantMap = tenantStore.get(tenantId)
  const existing = tenantMap?.get(id)
  if (!existing) {
    return { error: 'template not found', code: 'NOT_FOUND' }
  }

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
  tenantMap.set(id, updated)
  await persistTenantTemplates(tenantId)
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
  const tenantMap = tenantStore.get(tenantId)
  if (!tenantMap?.has(id)) {
    return { error: 'template not found', code: 'NOT_FOUND' }
  }
  tenantMap.delete(id)
  await persistTenantTemplates(tenantId)
  return { ok: true }
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * Get all custom templates for a tenant (used by persistence layer).
 */
export function getTenantTemplates(tenantId) {
  const tenantMap = tenantStore.get(tenantId)
  if (!tenantMap) return []
  return Array.from(tenantMap.values())
}

/**
 * Restore persisted custom templates for a tenant (called on startup).
 */
export function restoreTenantTemplates(tenantId, templates) {
  tenantStore.set(tenantId, new Map(templates.map((t) => [t.id, t])))
}

function tenantTemplatesPath(tenantId) {
  return join(TEAMS_DIR, tenantId, 'templates.json')
}

async function persistTenantTemplates(tenantId) {
  const templates = getTenantTemplates(tenantId)
  const dir = join(TEAMS_DIR, tenantId)
  await mkdir(dir, { recursive: true })
  await writeFile(tenantTemplatesPath(tenantId), JSON.stringify(templates, null, 2), 'utf8')
}

export async function loadTenantTemplates(tenantId) {
  try {
    const raw = await readFile(tenantTemplatesPath(tenantId), 'utf8')
    const arr = JSON.parse(raw)
    restoreTenantTemplates(tenantId, arr.filter((t) => t.id))
  } catch {
    // File doesn't exist yet — start empty
    if (!tenantStore.has(tenantId)) tenantStore.set(tenantId, new Map())
  }
}

/**
 * Scan TEAMS_DIR for per-tenant templates.json files and load them.
 * Call once on server startup after teams are rehydrated.
 * Returns array of tenantIds that were loaded.
 */
export async function rehydrateTenantTemplates() {
  let dirs
  try {
    dirs = await readdir(TEAMS_DIR)
  } catch {
    return []
  }
  const loaded = []
  for (const dir of dirs) {
    try {
      await access(tenantTemplatesPath(dir))
      await loadTenantTemplates(dir)
      loaded.push(dir)
    } catch {
      // No templates.json for this tenant dir — skip
    }
  }
  return loaded
}

// Load builtins on startup
loadTemplates()
