import { randomUUID, randomBytes, createHash } from 'crypto'

// In-memory tenant store — Phase 1 only.
// API keys are hashed (SHA-256) before storage; plaintext is returned ONCE at creation.

const store = new Map()

function hashKey(plaintext) {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Create a new tenant. Returns the full record including the plaintext API key.
 * Caller must return the key to the user — it is never retrievable again.
 */
export function createTenant({ name, email }) {
  const id = randomUUID()
  const plaintextKey = randomBytes(32).toString('hex')
  const keyHash = hashKey(plaintextKey)

  const tenant = {
    id,
    name,
    email,
    keyHash,
    createdAt: new Date().toISOString(),
  }
  store.set(id, tenant)

  // Return with plaintext key — exposed only at creation time
  return { ...tenant, apiKey: plaintextKey }
}

export function getTenantByKeyHash(plaintext) {
  const hash = hashKey(plaintext)
  for (const tenant of store.values()) {
    if (tenant.keyHash === hash) return tenant
  }
  return null
}

export function listTenants() {
  return Array.from(store.values()).map(({ keyHash: _omit, ...safe }) => safe)
}
