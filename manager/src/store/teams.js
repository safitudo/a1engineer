import { randomUUID } from 'crypto'

// In-memory store — Phase 1 only. Graduated to SQLite/Postgres in Phase 2.

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
const store = new Map()

export function createTeam(config) {
  const id = randomUUID()
  const team = {
    id,
    name: config.name,
    repo: config.repo,
    agents: (config.agents ?? []).map((a, i) => ({
      id: a.id ?? `${config.name}-${a.role}${i > 0 ? `-${i}` : ''}`,
      role: a.role,
      model: a.model,
      runtime: a.runtime ?? 'claude-code',
      prompt: a.prompt ?? '',
      env: a.env ?? {},
      last_heartbeat: null,
    })),
    auth: normalizeAuth(config.auth),
    status: 'creating',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.set(id, team)
  return team
}

export function getTeam(id) {
  return store.get(id) ?? null
}

export function listTeams() {
  return Array.from(store.values())
}

export function updateTeam(id, updates) {
  const team = store.get(id)
  if (!team) throw new Error(`Team not found: ${id}`)
  const updated = { ...team, ...updates, updatedAt: new Date().toISOString() }
  store.set(id, updated)
  return updated
}

export function deleteTeam(id) {
  store.delete(id)
}
