import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { initDb, closeDb, getDb } from './db.js'
import { upsertTenant, findByApiKey, createTenant, listTenants } from './tenants.js'

beforeAll(() => initDb(':memory:'))
afterAll(() => closeDb())

afterEach(() => {
  getDb().exec('DELETE FROM tenants')
})

describe('upsertTenant', () => {
  it('returns deterministic id for same key', () => {
    const t1 = upsertTenant('deterministic-test-key')
    const t2 = upsertTenant('deterministic-test-key')
    expect(t1.id).toBe(t2.id)
    expect(t1.apiKey).toBe('deterministic-test-key')
  })

  it('different keys produce different ids', () => {
    const t1 = upsertTenant('key-alpha')
    const t2 = upsertTenant('key-beta')
    expect(t1.id).not.toBe(t2.id)
  })

  it('id is a 16-char hex string', () => {
    const t = upsertTenant('hex-test-key')
    expect(t.id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('findByApiKey', () => {
  it('returns the tenant after upsert', () => {
    upsertTenant('find-test-key')
    const found = findByApiKey('find-test-key')
    expect(found).not.toBeNull()
    expect(found.apiKey).toBe('find-test-key')
  })

  it('returns null for unknown key', () => {
    expect(findByApiKey('nonexistent-key')).toBeNull()
  })
})

describe('createTenant', () => {
  it('returns a plaintext apiKey (shown once)', () => {
    const t = createTenant({ name: 'Acme', email: 'admin@acme.io' })
    expect(t.apiKey).toBeTruthy()
    expect(typeof t.apiKey).toBe('string')
    expect(t.apiKey).toHaveLength(64) // 32 random bytes as hex
  })

  it('stores name and email', () => {
    const t = createTenant({ name: 'Acme', email: 'admin@acme.io' })
    expect(t.name).toBe('Acme')
    expect(t.email).toBe('admin@acme.io')
  })

  it('id is a UUID', () => {
    const t = createTenant({ name: 'x', email: 'x@x.com' })
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('apiKey is findable via findByApiKey', () => {
    const t = createTenant({ name: 'Acme', email: 'admin@acme.io' })
    const found = findByApiKey(t.apiKey)
    expect(found).not.toBeNull()
    expect(found.id).toBe(t.id)
  })

  it('does not store plaintext key in the database', () => {
    const t = createTenant({ name: 'Sec', email: 's@s.com' })
    const row = getDb().prepare('SELECT * FROM tenants WHERE id = ?').get(t.id)
    expect(row.key_hash).not.toBe(t.apiKey)
    expect(row).not.toHaveProperty('api_key')
  })
})

describe('listTenants', () => {
  it('returns empty array when no tenants', () => {
    expect(listTenants()).toHaveLength(0)
  })

  it('returns all tenants across both BYOK and signup', () => {
    upsertTenant('byok-key-1')
    createTenant({ name: 'Signup Co', email: 's@co.com' })
    expect(listTenants()).toHaveLength(2)
  })
})

describe('SQLite persistence (same DB instance)', () => {
  it('tenant survives beyond the upsert call', () => {
    const t = upsertTenant('persist-test-key')
    // Simulate a "restart" by querying DB directly
    const row = getDb().prepare('SELECT * FROM tenants WHERE id = ?').get(t.id)
    expect(row).toBeTruthy()
    expect(row.id).toBe(t.id)
  })
})
