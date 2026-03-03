import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO tenants (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
      [email, passwordHash]
    );
    const tenant = result.rows[0];

    // Create default team for tenant
    await pool.query(
      `INSERT INTO teams (tenant_id, name) VALUES ($1, 'Default')`,
      [tenant.id]
    );

    const token = jwt.sign({ tenantId: tenant.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    return res.status(201).json({ token, tenant });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  const result = await pool.query(
    `SELECT id, email, password_hash, created_at FROM tenants WHERE email = $1`,
    [email]
  );
  const tenant = result.rows[0];
  if (!tenant) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, tenant.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ tenantId: tenant.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
  return res.json({ token, tenant: { id: tenant.id, email: tenant.email, created_at: tenant.created_at } });
});

// GET /auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT id, email, created_at FROM tenants WHERE id = $1`,
    [req.tenantId]
  );
  const tenant = result.rows[0];
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  return res.json({ tenant });
});

export default router;
