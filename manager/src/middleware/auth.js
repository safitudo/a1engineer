import { findByApiKey, upsertTenant } from '../store/tenants.js'
import { findByInternalToken } from '../store/teams.js'

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

  // Check for internal team token (agents authenticating back to Manager)
  const teamByToken = findByInternalToken(apiKey)
  if (teamByToken) {
    req.teamScope = teamByToken.id
    req.tenant = null
    return next()
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
  if (!req.tenant && !req.teamScope) {
    return res.status(401).json({ error: 'authentication required', code: 'UNAUTHORIZED' })
  }
  if (req.teamScope) {
    // Internal token: enforce team scope for routes that expose a team ID in the path
    if (req.params.id && req.params.id !== req.teamScope) {
      return res.status(403).json({ error: 'forbidden', code: 'FORBIDDEN' })
    }
    req.tenantId = null
    return next()
  }
  // tenantId is passed through for store-level filtering
  req.tenantId = req.tenant.id
  next()
}
