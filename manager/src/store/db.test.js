import { describe, it, expect, afterEach } from 'vitest'
import { initDb, getDb, closeDb } from './db.js'

afterEach(() => closeDb())

describe('initDb', () => {
  it('returns a database instance', () => {
    const db = initDb(':memory:')
    expect(db).toBeTruthy()
  })

  it('creates the migrations table', () => {
    initDb(':memory:')
    const row = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get()
    expect(row).toBeTruthy()
  })

  it('creates the teams table', () => {
    initDb(':memory:')
    const row = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'").get()
    expect(row).toBeTruthy()
  })

  it('creates indexes on tenant_id and internal_token', () => {
    initDb(':memory:')
    const indexes = getDb().prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='teams'").all()
    const names = indexes.map(r => r.name)
    expect(names).toContain('idx_teams_tenant_id')
    expect(names).toContain('idx_teams_internal_token')
  })

  it('records the migration in the migrations table', () => {
    initDb(':memory:')
    const row = getDb().prepare("SELECT name FROM migrations WHERE name='001_create_teams'").get()
    expect(row).toBeTruthy()
  })

  it('closes and replaces an existing open database', () => {
    initDb(':memory:')
    const db2 = initDb(':memory:')
    expect(getDb()).toBe(db2)
  })
})

describe('getDb', () => {
  it('throws if initDb has not been called', () => {
    expect(() => getDb()).toThrow('Database not initialized')
  })

  it('returns the same instance after initDb', () => {
    const db = initDb(':memory:')
    expect(getDb()).toBe(db)
  })
})

describe('closeDb', () => {
  it('is a no-op when no database is open', () => {
    expect(() => closeDb()).not.toThrow()
  })

  it('causes getDb to throw after close', () => {
    initDb(':memory:')
    closeDb()
    expect(() => getDb()).toThrow('Database not initialized')
  })
})

describe('migrations idempotency', () => {
  it('applying migrations twice does not throw', () => {
    const db = initDb(':memory:')
    // Calling initDb again re-opens the DB and re-runs migration check
    expect(() => initDb(':memory:')).not.toThrow()
  })
})
