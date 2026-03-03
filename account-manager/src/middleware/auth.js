/**
 * Internal service token auth middleware.
 * Rejects requests that don't present a valid INTERNAL_SERVICE_TOKEN.
 */

const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN

export function requireInternalToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!INTERNAL_SERVICE_TOKEN) {
    console.error('INTERNAL_SERVICE_TOKEN is not set — rejecting all requests')
    return res.status(503).json({ error: 'Service misconfigured: missing internal token' })
  }

  if (!token || token !== INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing internal service token' })
  }

  next()
}
