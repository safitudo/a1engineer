/**
 * Run migrations from the migrations/ directory in order.
 * Usage: tsx src/db/migrate.ts
 */
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import pool from './pool'

const MIGRATIONS_DIR = join(__dirname, '../../migrations')

async function migrate(): Promise<void> {
  const client = await pool.connect()
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM _migrations WHERE filename = $1',
        [file]
      )
      if (rows.length > 0) {
        console.log(`[migrate] skipping ${file} (already applied)`)
        continue
      }

      console.log(`[migrate] applying ${file}`)
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`[migrate] applied ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
    console.log('[migrate] done')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err: Error) => {
  console.error('[migrate] error:', err.message)
  process.exit(1)
})
