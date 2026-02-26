import pg from 'pg'

const { Pool } = pg

let _pool = null

export function getPool() {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required')
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 })
    _pool.on('error', (err) => {
      console.error('[db] idle client error:', err.message)
    })
  }
  return _pool
}
