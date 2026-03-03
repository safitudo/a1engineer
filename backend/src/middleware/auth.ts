import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod'

export interface TenantPayload {
  id: string
  email: string
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantPayload
    }
  }
}

/**
 * Verify JWT from Authorization: Bearer <token>.
 * Attaches req.tenant = { id, email } on success.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing or invalid Authorization header' })
    return
  }

  const token = header.slice(7).trim()
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string }
    req.tenant = { id: payload.sub, email: payload.email }
    next()
  } catch {
    res.status(401).json({ error: 'invalid or expired token' })
  }
}

export function signToken(tenant: TenantPayload): string {
  return jwt.sign(
    { sub: tenant.id, email: tenant.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}
