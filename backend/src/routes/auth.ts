import { Router } from 'express'
import bcrypt from 'bcrypt'
import pool from '../db/pool'
import { requireAuth, signToken } from '../middleware/auth'

const router = Router()
const SALT_ROUNDS = 12

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const { rows } = await pool.query(
      'INSERT INTO tenants (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase(), passwordHash]
    )
    const tenant = rows[0] as { id: string; email: string; created_at: Date }

    // Create a default team for new tenant
    await pool.query(
      'INSERT INTO teams (tenant_id, name) VALUES ($1, $2)',
      [tenant.id, 'Default']
    )

    const token = signToken(tenant)
    return res.status(201).json({ token, tenant: { id: tenant.id, email: tenant.email } })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'email already registered' })
    }
    console.error('[auth] register error:', (err as Error).message)
    return res.status(500).json({ error: 'internal server error' })
  }
})

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash FROM tenants WHERE email = $1',
      [email.toLowerCase()]
    )
    if (rows.length === 0) {
      return res.status(401).json({ error: 'invalid credentials' })
    }

    const tenant = rows[0] as { id: string; email: string; password_hash: string }
    const valid = await bcrypt.compare(password, tenant.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'invalid credentials' })
    }

    const token = signToken(tenant)
    return res.json({ token, tenant: { id: tenant.id, email: tenant.email } })
  } catch (err: unknown) {
    console.error('[auth] login error:', (err as Error).message)
    return res.status(500).json({ error: 'internal server error' })
  }
})

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, created_at FROM tenants WHERE id = $1',
      [req.tenant!.id]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'tenant not found' })
    }
    return res.json({ tenant: rows[0] })
  } catch (err: unknown) {
    console.error('[auth] me error:', (err as Error).message)
    return res.status(500).json({ error: 'internal server error' })
  }
})

export default router
