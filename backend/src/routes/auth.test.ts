import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createServer, request as httpRequest } from 'http'
import type { RequestOptions, IncomingMessage } from 'http'

// Mock pg pool before importing routes
vi.mock('../db/pool', () => ({
  default: {
    query: vi.fn(),
  },
}))

// Mock bcrypt for speed
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashed'),
    compare: vi.fn(),
  },
}))

import express from 'express'
import authRouter from './auth'
import pool from '../db/pool'
import bcrypt from 'bcrypt'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRouter)
  return app
}

describe('POST /auth/register', () => {
  let app: ReturnType<typeof express>

  beforeEach(() => {
    app = buildApp()
    vi.clearAllMocks()
  })

  it('returns 400 when email is missing', async () => {
    const res = await fetch_local(app, 'POST', '/auth/register', { password: 'secret123' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when password is missing', async () => {
    const res = await fetch_local(app, 'POST', '/auth/register', { email: 'a@b.com' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when password too short', async () => {
    const res = await fetch_local(app, 'POST', '/auth/register', { email: 'a@b.com', password: 'short' })
    expect(res.status).toBe(400)
  })

  it('returns 201 and token on success', async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ id: 'tid-1', email: 'a@b.com', created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] }) // insert team

    const res = await fetch_local(app, 'POST', '/auth/register', {
      email: 'a@b.com',
      password: 'password123',
    })
    expect(res.status).toBe(201)
    const body = res.json() as { token: string; tenant: { email: string } }
    expect(body.token).toBeDefined()
    expect(body.tenant.email).toBe('a@b.com')
  })

  it('returns 409 when email already registered', async () => {
    const err = Object.assign(new Error('duplicate'), { code: '23505' });
    (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err)

    const res = await fetch_local(app, 'POST', '/auth/register', {
      email: 'exists@b.com',
      password: 'password123',
    })
    expect(res.status).toBe(409)
  })
})

describe('POST /auth/login', () => {
  let app: ReturnType<typeof express>

  beforeEach(() => {
    app = buildApp()
    vi.clearAllMocks()
  })

  it('returns 400 when fields missing', async () => {
    const res = await fetch_local(app, 'POST', '/auth/login', {})
    expect(res.status).toBe(400)
  })

  it('returns 401 when tenant not found', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] })
    const res = await fetch_local(app, 'POST', '/auth/login', {
      email: 'nope@x.com',
      password: 'password123',
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when password is wrong', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ id: 'tid-1', email: 'a@b.com', password_hash: '$2b$12$hashed' }],
    });
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false)

    const res = await fetch_local(app, 'POST', '/auth/login', {
      email: 'a@b.com',
      password: 'wrongpass',
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 and token on success', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ id: 'tid-1', email: 'a@b.com', password_hash: '$2b$12$hashed' }],
    });
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)

    const res = await fetch_local(app, 'POST', '/auth/login', {
      email: 'a@b.com',
      password: 'password123',
    })
    expect(res.status).toBe(200)
    const body = res.json() as { token: string }
    expect(body.token).toBeDefined()
  })
})

describe('GET /auth/me', () => {
  let app: ReturnType<typeof express>

  beforeEach(() => {
    app = buildApp()
    vi.clearAllMocks()
  })

  it('returns 401 with no token', async () => {
    const res = await fetch_local(app, 'GET', '/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 200 with tenant data when authenticated', async () => {
    const { signToken } = await import('../middleware/auth')
    const token = signToken({ id: 'tid-1', email: 'a@b.com' })

    ;(pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ id: 'tid-1', email: 'a@b.com', created_at: new Date() }],
    })

    const res = await fetch_local(app, 'GET', '/auth/me', null, {
      Authorization: `Bearer ${token}`,
    })
    expect(res.status).toBe(200)
    const body = res.json() as { tenant: { id: string } }
    expect(body.tenant.id).toBe('tid-1')
  })
})

// Minimal fetch helper using Node's built-in http module
type AppLike = Parameters<typeof createServer>[0]

async function fetch_local(
  app: AppLike,
  method: string,
  path: string,
  body?: object | null,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: () => unknown; text: () => string }> {
  return new Promise((resolve) => {
    const server = createServer(app)
    server.listen(0, () => {
      const addr = server.address() as { port: number }
      const port = addr.port
      const payload = body ? JSON.stringify(body) : null
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      }
      if (!payload) delete reqHeaders['Content-Type']

      const options: RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders,
      }

      const req = httpRequest(options, (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          server.close()
          const text = Buffer.concat(chunks).toString()
          resolve({
            status: res.statusCode ?? 0,
            json: () => JSON.parse(text),
            text: () => text,
          })
        })
      })

      if (payload) req.write(payload)
      req.end()
    })
  })
}
