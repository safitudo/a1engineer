import { DatabaseSync } from 'node:sqlite'

let _db = null

// Ordered migrations — append only, never modify existing entries.
const MIGRATIONS = [
  {
    name: '001_create_teams',
    sql: `
      CREATE TABLE IF NOT EXISTS teams (
        id             TEXT PRIMARY KEY,
        tenant_id      TEXT,
        internal_token TEXT,
        data           TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_teams_tenant_id      ON teams(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_teams_internal_token ON teams(internal_token);
    `,
  },
]

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)
  for (const { name, sql } of MIGRATIONS) {
    const exists = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(name)
    if (!exists) {
      db.exec(sql)
      db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(
        name,
        new Date().toISOString()
      )
    }
  }
}

/**
 * Open (or create) the SQLite database, enable WAL, and run pending migrations.
 * Accepts an explicit path — tests pass ':memory:' for isolation.
 * Closes any previously open database before opening the new one.
 */
export function initDb(path) {
  if (_db) {
    _db.close()
    _db = null
  }
  const db = new DatabaseSync(path ?? process.env.DB_PATH ?? './a1engineer.db')
  db.exec('PRAGMA journal_mode = WAL')
  runMigrations(db)
  _db = db
  return db
}

/** Return the current database instance. Throws if initDb() has not been called. */
export function getDb() {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

/** Close the current database (no-op if none is open). Used by tests and shutdown. */
export function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}
