import { Router } from 'express'
import { upsertTenant } from '../store/tenants.js'

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

export default router
