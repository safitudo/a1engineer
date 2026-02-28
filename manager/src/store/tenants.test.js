import { describe, it, expect } from 'vitest'
import { upsertTenant, findByApiKey } from './tenants.js'

describe('tenants store', () => {
  it('upsertTenant returns deterministic id for same key', () => {
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

  it('findByApiKey returns the tenant', () => {
    upsertTenant('find-test-key')
    const found = findByApiKey('find-test-key')
    expect(found).not.toBeNull()
    expect(found.apiKey).toBe('find-test-key')
  })

  it('findByApiKey returns null for unknown key', () => {
    expect(findByApiKey('nonexistent-key')).toBeNull()
  })
})
