import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireAuth, requireTeamOwnership } from './auth.js'

vi.mock('../store/tenants.js', () => ({
  findByApiKey: vi.fn(),
  upsertTenant: vi.fn(),
}))

vi.mock('../store/teams.js', () => ({
  findByInternalToken: vi.fn(),
}))

import { upsertTenant } from '../store/tenants.js'
import { findByInternalToken } from '../store/teams.js'

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return { headers: {}, params: {}, ...overrides }
}

function makeRes() {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header does not start with Bearer', () => {
    const req = makeReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } })
    const res = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Bearer token is empty', () => {
    const req = makeReq({ headers: { authorization: 'Bearer ' } })
    const res = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('sets req.teamScope and calls next() for a valid internal team token', () => {
    findByInternalToken.mockReturnValue({ id: 'team-abc' })
    const req = makeReq({ headers: { authorization: 'Bearer internal-token-xyz' } })
    const res = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(findByInternalToken).toHaveBeenCalledWith('internal-token-xyz')
    expect(req.teamScope).toBe('team-abc')
    expect(req.tenant).toBeNull()
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('auto-provisions tenant via upsertTenant (BYOK) and calls next()', () => {
    findByInternalToken.mockReturnValue(null)
    upsertTenant.mockReturnValue({ id: 'tenant-123' })
    const req = makeReq({ headers: { authorization: 'Bearer byok-api-key' } })
    const res = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(upsertTenant).toHaveBeenCalledWith('byok-api-key')
    expect(req.tenant).toEqual({ id: 'tenant-123' })
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('does not call upsertTenant when an internal token is matched', () => {
    findByInternalToken.mockReturnValue({ id: 'team-abc' })
    const req = makeReq({ headers: { authorization: 'Bearer internal-token-xyz' } })
    const res = makeRes()
    const next = vi.fn()

    requireAuth(req, res, next)

    expect(upsertTenant).not.toHaveBeenCalled()
  })
})

// ── requireTeamOwnership ──────────────────────────────────────────────────────

describe('requireTeamOwnership', () => {
  it('returns 401 when neither req.tenant nor req.teamScope is present', () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn()

    requireTeamOwnership(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('allows internal token and sets req.tenantId to null when no team ID in path', () => {
    const req = makeReq({ teamScope: 'team-abc' })
    const res = makeRes()
    const next = vi.fn()

    requireTeamOwnership(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.tenantId).toBeNull()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('allows internal token when path team ID matches token scope', () => {
    const req = makeReq({ teamScope: 'team-abc', params: { id: 'team-abc' } })
    const res = makeRes()
    const next = vi.fn()

    requireTeamOwnership(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 403 when internal token scope does not match path team ID', () => {
    const req = makeReq({ teamScope: 'team-abc', params: { id: 'team-xyz' } })
    const res = makeRes()
    const next = vi.fn()

    requireTeamOwnership(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('sets req.tenantId from req.tenant.id for regular tenant auth', () => {
    const req = makeReq({ tenant: { id: 'tenant-abc' } })
    const res = makeRes()
    const next = vi.fn()

    requireTeamOwnership(req, res, next)

    expect(req.tenantId).toBe('tenant-abc')
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })
})
