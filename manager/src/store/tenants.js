import { randomUUID, randomBytes, createHash } from 'crypto'

/** @type {Map<string, { id: string, apiKey: string, createdAt: string }>} */
const tenants = new Map() // keyed by apiKey for fast lookup

// ── BYOK: look up tenant by raw API key ────────────────────────────────────

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

export function getTenantByKeyHash(plaintext) {
  const hash = hashKey(plaintext)
  for (const tenant of signupTenants.values()) {
    if (tenant.keyHash === hash) return tenant
  }
  return null
}

export function listTenants() {
  return [...tenants.values()]
}
