/** @type {Map<string, { id: string, apiKey: string, createdAt: string }>} */
const tenants = new Map() // keyed by apiKey for fast lookup

export function findByApiKey(apiKey) {
  return tenants.get(apiKey) ?? null
}

export function upsertTenant(apiKey) {
  if (tenants.has(apiKey)) return tenants.get(apiKey)
  const tenant = {
    id: apiKey.slice(0, 12), // short id derived from key prefix
    apiKey,
    createdAt: new Date().toISOString(),
  }
  tenants.set(apiKey, tenant)
  return tenant
}

export function listTenants() {
  return [...tenants.values()]
}
