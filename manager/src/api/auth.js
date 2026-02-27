import { Router } from 'express'
import { createTenant } from '../store/tenants.js'

const router = Router()

// POST /api/auth/signup — register a new tenant, return API key once
router.post('/signup', (req, res) => {
  const { name, email } = req.body ?? {}

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required', code: 'MISSING_NAME' })
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'valid email is required', code: 'MISSING_EMAIL' })
  }

  const tenant = createTenant({ name: name.trim(), email: email.trim().toLowerCase() })

  // Return the plaintext key exactly once — it is not stored and cannot be retrieved later
  return res.status(201).json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    apiKey: tenant.apiKey,
    createdAt: tenant.createdAt,
  })
})

export default router
