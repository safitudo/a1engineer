import { createHash } from 'crypto'

/** @type {Map<string, { id: string, apiKey: string, createdAt: string }>} */
const tenants = new Map() // keyed by apiKey for fast lookup

export function findByApiKey(apiKey) {
  return tenants.get(apiKey) ?? null
}

export function upsertTenant(apiKey) {
  if (tenants.has(apiKey)) return tenants.get(apiKey)
  const tenant = {
    id: createHash('sha256').update(apiKey).digest('hex').slice(0, 16),
    apiKey,
    createdAt: new Date().toISOString(),
  }
  tenants.set(apiKey, tenant)
  return tenant
}

export function listTenants() {
  return [...tenants.values()]
}
