import { randomUUID, randomBytes, createHash } from 'crypto'
import { getDb } from './db.js'

function hashKey(plaintext) {
  return createHash('sha256').update(plaintext).digest('hex')
}

function rowToTenant(row) {
  return {
    id: row.id,
    name: row.name ?? undefined,
    email: row.email ?? undefined,
    keyHash: row.key_hash,
    createdAt: row.created_at,
  }
}

// ── BYOK: look up or create tenant by raw API key ───────────────────────────
// ID is derived from the key hash (first 16 hex chars) — deterministic and
// collision-free without storing the plaintext key.

export function upsertTenant(apiKey) {
  const db = getDb()
  const keyHash = hashKey(apiKey)
  const existing = db.prepare('SELECT * FROM tenants WHERE key_hash = ?').get(keyHash)
  if (existing) return { ...rowToTenant(existing), apiKey }
  const id = keyHash.slice(0, 16)
  const now = new Date().toISOString()
  db.prepare('INSERT INTO tenants (id, key_hash, name, email, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, keyHash, null, null, now)
  return { id, apiKey, createdAt: now }
}

export function findByApiKey(apiKey) {
  const db = getDb()
  const keyHash = hashKey(apiKey)
  const row = db.prepare('SELECT * FROM tenants WHERE key_hash = ?').get(keyHash)
  if (!row) return null
  return { ...rowToTenant(row), apiKey }
}

// ── Signup: create tenant with generated key (shown once, stored hashed) ────

export function createTenant({ name, email }) {
  const db = getDb()
  const id = randomUUID()
  const plaintextKey = randomBytes(32).toString('hex')
  const keyHash = hashKey(plaintextKey)
  const now = new Date().toISOString()
  db.prepare('INSERT INTO tenants (id, key_hash, name, email, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, keyHash, name, email, now)
  return { id, name, email, keyHash, createdAt: now, apiKey: plaintextKey }
}

export function listTenants() {
  return getDb().prepare('SELECT * FROM tenants').all().map(rowToTenant)
}
