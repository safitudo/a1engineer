import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /channels
router.get('/', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM channels WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [req.tenantId]
  );
  return res.json(result.rows);
});

// POST /channels
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, adapter, config } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const result = await pool.query(
    `INSERT INTO channels (tenant_id, name, adapter, config) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.tenantId, name, adapter ?? 'irc', config ? JSON.stringify(config) : '{}']
  );
  return res.status(201).json(result.rows[0]);
});

export default router;
