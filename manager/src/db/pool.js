import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
})

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message)
})
