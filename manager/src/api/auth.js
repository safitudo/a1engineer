import { Router } from 'express'
import { upsertTenant, createTenant } from '../store/tenants.js'

const router = Router()

// POST /api/auth/login — validate API key, return tenant info
router.post('/login', (req, res) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid Authorization header', code: 'UNAUTHORIZED' })
  }
  const apiKey = header.slice(7).trim()
  if (!apiKey) {
    return res.status(401).json({ error: 'empty API key', code: 'UNAUTHORIZED' })
  }

  const tenant = upsertTenant(apiKey)
  return res.json({ ok: true, tenantId: tenant.id, name: tenant.name ?? null })
})

// POST /api/auth/signup — register new tenant, return API key once
router.post('/signup', (req, res) => {
  const { name, email } = req.body ?? {}
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required', code: 'MISSING_NAME' })
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'valid email is required', code: 'MISSING_EMAIL' })
  }
  const tenant = createTenant({ name: name.trim(), email: email.trim().toLowerCase() })
  return res.status(201).json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    apiKey: tenant.apiKey,
    createdAt: tenant.createdAt,
  })
})

export default router
