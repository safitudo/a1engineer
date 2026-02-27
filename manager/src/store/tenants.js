import { randomUUID, randomBytes, createHash } from 'crypto'

/** @type {Map<string, { id: string, apiKey: string, createdAt: string }>} */
const tenants = new Map() // keyed by apiKey for fast lookup

// ── BYOK: look up tenant by raw API key ────────────────────────────────────

export function findByApiKey(apiKey) {
  // Check BYOK tenants first
  const byok = tenants.get(apiKey)
  if (byok) return byok
  // Check signup tenants by hashed key
  return getTenantByKeyHash(apiKey)
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

// ── Signup: create tenant with generated key (key shown once, stored hashed) ─

/** @type {Map<string, { id: string, name: string, email: string, keyHash: string, createdAt: string }>} */
const signupTenants = new Map() // keyed by tenant id

function hashKey(plaintext) {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function createTenant({ name, email }) {
  const id = randomUUID()
  const plaintextKey = randomBytes(32).toString('hex')
  const keyHash = hashKey(plaintextKey)
  const tenant = { id, name, email, keyHash, createdAt: new Date().toISOString() }
  signupTenants.set(id, tenant)
  return { ...tenant, apiKey: plaintextKey }
}

function getTenantByKeyHash(plaintext) {
  const hash = hashKey(plaintext)
  for (const tenant of signupTenants.values()) {
    if (tenant.keyHash === hash) return tenant
  }
  return null
}

// Restore a tenant with a known id (used during rehydration to preserve tenantId mapping)
export function restoreTenant(apiKey, id) {
  if (tenants.has(apiKey)) return tenants.get(apiKey)
  const tenant = { id, apiKey, createdAt: new Date().toISOString() }
  tenants.set(apiKey, tenant)
  return tenant
}

export function listTenants() {
  return [...tenants.values(), ...signupTenants.values()]
}
