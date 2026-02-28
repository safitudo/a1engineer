import { randomBytes } from 'crypto'
import { Router } from 'express'
import { upsertTenant, createTenant } from '../store/tenants.js'

const router = Router()

// ── Signup rate limiter ───────────────────────────────────────────────────────
/** @type {Map<string, { count: number, windowStart: number }>} */
export const signupAttempts = new Map()
const SIGNUP_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const SIGNUP_MAX = 5

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim()
    ?? req.socket?.remoteAddress
    ?? 'unknown'
}

function checkSignupRateLimit(ip) {
  const now = Date.now()
  const entry = signupAttempts.get(ip)
  if (!entry || now - entry.windowStart >= SIGNUP_WINDOW_MS) {
    signupAttempts.set(ip, { count: 1, windowStart: now })
    return false // not limited
  }
  if (entry.count >= SIGNUP_MAX) return true // limited
  entry.count++
  return false
}

// Sweep stale entries every hour to prevent unbounded memory growth
const _signupSweep = setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of signupAttempts) {
    if (now - entry.windowStart >= SIGNUP_WINDOW_MS) signupAttempts.delete(ip)
  }
}, SIGNUP_WINDOW_MS)
_signupSweep.unref()

// ── Single-use WS token store ─────────────────────────────────────────────────
/** @type {Map<string, { tenantId: string, expiresAt: number }>} */
const wsTokenStore = new Map()

// Sweep expired tokens every 60s to prevent unbounded memory growth from
// tokens that were issued but never consumed (client disconnected, etc.).
const _sweepInterval = setInterval(() => {
  const now = Date.now()
  for (const [token, entry] of wsTokenStore) {
    if (now > entry.expiresAt) wsTokenStore.delete(token)
  }
}, 60_000)
// Allow the process to exit without this timer keeping the event loop alive
_sweepInterval.unref()

/**
 * Validate a single-use WS token.
 * Returns tenantId if valid and unexpired, null otherwise.
 * Deletes the token on first use (single-use).
 */
export function validateWsToken(token) {
  const entry = wsTokenStore.get(token)
  if (!entry) return null
  wsTokenStore.delete(token)
  if (Date.now() > entry.expiresAt) return null
  return entry.tenantId
}

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
  const ip = getClientIp(req)
  if (checkSignupRateLimit(ip)) {
    return res.status(429).json({ error: 'too many signup attempts, try again later', code: 'RATE_LIMITED' })
  }
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

// POST /api/auth/ws-token — generate single-use opaque WS token (60s TTL)
router.post('/ws-token', (req, res) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid Authorization header', code: 'UNAUTHORIZED' })
  }
  const apiKey = header.slice(7).trim()
  if (!apiKey) {
    return res.status(401).json({ error: 'empty API key', code: 'UNAUTHORIZED' })
  }
  const tenant = upsertTenant(apiKey)
  const token = randomBytes(32).toString('hex')
  wsTokenStore.set(token, { tenantId: tenant.id, expiresAt: Date.now() + 60_000 })
  return res.json({ token })
})

export default router
