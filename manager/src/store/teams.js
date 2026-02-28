import { randomUUID, randomBytes } from 'crypto'
import { getDb } from './db.js'

export const DEFAULT_CHANNELS = ['#main', '#tasks', '#code', '#testing', '#merges']

// Normalize auth config — never persist raw API keys.
function normalizeAuth(auth) {
  const mode = auth?.mode ?? 'session'
  if (mode === 'session') {
    return { mode: 'session', sessionPath: auth?.sessionPath ?? '~/.claude' }
  }
  if (mode === 'api-key') {
    // API key is read from env at render time; store only the mode.
    return { mode: 'api-key' }
  }
  return { mode }
}

// Hydrate a DB row into a full team object.
function rowToTeam(row) {
  const blob = JSON.parse(row.data)
  return {
    ...blob,
    id: row.id,
    tenantId: row.tenant_id,
    internalToken: row.internal_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Column-level fields stored outside the JSON blob.
const COLUMN_FIELDS = new Set(['id', 'tenantId', 'internalToken', 'createdAt', 'updatedAt'])

// Split a team object into { columns, blob } for DB writes.
function splitTeam(team) {
  const blob = {}
  for (const [k, v] of Object.entries(team)) {
    if (!COLUMN_FIELDS.has(k)) blob[k] = v
  }
  return {
    columns: {
      id: team.id,
      tenant_id: team.tenantId ?? null,
      internal_token: team.internalToken ?? null,
      created_at: team.createdAt,
      updated_at: team.updatedAt,
    },
    blob,
  }
}

export function createTeam(config, { tenantId = null } = {}) {
  const id = randomUUID()
  const now = new Date().toISOString()
  const team = {
    id,
    tenantId,
    internalToken: randomBytes(32).toString('hex'),
    name: config.name,
    repo: config.repo,
    github: config.github ?? null,
    ergo: config.ergo ?? null,
    channels: config.channels ?? DEFAULT_CHANNELS,
    agents: (config.agents ?? []).map((a, i) => ({
      id: a.id ?? `${config.name}-${a.role}${i > 0 ? `-${i}` : ''}`,
      role: a.role,
      model: a.model,
      runtime: a.runtime ?? 'claude-code',
      effort: a.effort ?? 'high',
      prompt: a.prompt ?? '',
      auth: a.auth ?? null,
      env: a.env ?? {},
      last_heartbeat: null,
    })),
    auth: normalizeAuth(config.auth),
    status: 'creating',
    createdAt: now,
    updatedAt: now,
  }

  const { columns, blob } = splitTeam(team)
  getDb().prepare(`
    INSERT INTO teams (id, tenant_id, internal_token, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(columns.id, columns.tenant_id, columns.internal_token, JSON.stringify(blob), columns.created_at, columns.updated_at)

  return team
}

export function getTeam(id) {
  const row = getDb().prepare('SELECT * FROM teams WHERE id = ?').get(id)
  return row ? rowToTeam(row) : null
}

export function listTeams({ tenantId = null } = {}) {
  let rows
  if (tenantId) {
    rows = getDb().prepare('SELECT * FROM teams WHERE tenant_id = ?').all(tenantId)
  } else {
    rows = getDb().prepare('SELECT * FROM teams').all()
  }
  return rows.map(rowToTeam)
}

export function updateTeam(id, updates) {
  const team = getTeam(id)
  if (!team) throw new Error(`Team not found: ${id}`)
  const updated = { ...team, ...updates, updatedAt: new Date().toISOString() }
  const { columns, blob } = splitTeam(updated)
  getDb().prepare(`
    UPDATE teams
    SET tenant_id = ?, internal_token = ?, data = ?, updated_at = ?
    WHERE id = ?
  `).run(columns.tenant_id, columns.internal_token, JSON.stringify(blob), columns.updated_at, columns.id)
  return updated
}

export function deleteTeam(id) {
  getDb().prepare('DELETE FROM teams WHERE id = ?').run(id)
}

// Re-insert a team object directly (used by rehydration on startup).
// Skips createTeam logic — the team already has an id and normalized shape.
export function restoreTeam(team) {
  const now = new Date().toISOString()
  // Backfill internalToken for teams created before MANAGER_TOKEN feature
  if (!team.internalToken) {
    team = { ...team, internalToken: randomBytes(32).toString('hex') }
  }
  // Backfill channels for teams created before configurable-channels feature
  if (!team.channels) {
    team = { ...team, channels: DEFAULT_CHANNELS }
  }
  // Backfill timestamps for teams loaded from legacy formats without them
  if (!team.createdAt) {
    team = { ...team, createdAt: now }
  }
  if (!team.updatedAt) {
    team = { ...team, updatedAt: now }
  }
  const { columns, blob } = splitTeam(team)
  getDb().prepare(`
    INSERT OR REPLACE INTO teams (id, tenant_id, internal_token, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(columns.id, columns.tenant_id, columns.internal_token, JSON.stringify(blob), columns.created_at, columns.updated_at)
  return team
}

export function findByInternalToken(token) {
  const row = getDb().prepare('SELECT * FROM teams WHERE internal_token = ?').get(token)
  return row ? rowToTeam(row) : null
}
