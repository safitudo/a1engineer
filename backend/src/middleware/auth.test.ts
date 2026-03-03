import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireAuth, signToken } from './auth'

describe('requireAuth middleware', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let req: any, res: any, next: any

  beforeEach(() => {
    req = { headers: {} }
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    next = vi.fn()
  })

  it('returns 401 when Authorization header is missing', () => {
    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header does not start with Bearer', () => {
    req.headers.authorization = 'Basic abc'
    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for an invalid token', () => {
    req.headers.authorization = 'Bearer invalidtoken'
    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next and attaches tenant for a valid token', () => {
    const token = signToken({ id: 'tenant-123', email: 'test@example.com' })
    req.headers.authorization = `Bearer ${token}`
    requireAuth(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.tenant).toMatchObject({ id: 'tenant-123', email: 'test@example.com' })
  })
})

describe('signToken', () => {
  it('produces a string token', () => {
    const token = signToken({ id: 'abc', email: 'a@b.com' })
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
  })
})
