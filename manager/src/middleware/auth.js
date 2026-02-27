import { findByApiKey, upsertTenant } from '../store/tenants.js'

/**
 * Tenant auth middleware.
 * Expects: Authorization: Bearer <api-key>
 * Auto-provisions tenant on first use (BYOK model).
 * Attaches req.tenant = { id, apiKey, createdAt }
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid Authorization header', code: 'UNAUTHORIZED' })
  }

  const apiKey = header.slice(7).trim()
  if (!apiKey) {
    return res.status(401).json({ error: 'empty API key', code: 'UNAUTHORIZED' })
  }

  // Auto-provision tenant on first request (BYOK)
  const tenant = upsertTenant(apiKey)
  req.tenant = tenant
  next()
}

/**
 * Team ownership filter — ensures tenant can only access their own teams.
 * Must be applied AFTER requireAuth.
 * Attaches req.tenantId for use by downstream handlers.
 */
export function requireTeamOwnership(req, res, next) {
  if (!req.tenant) {
    return res.status(401).json({ error: 'authentication required', code: 'UNAUTHORIZED' })
  }
  // tenantId is passed through for store-level filtering
  req.tenantId = req.tenant.id
  next()
}
