import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /teams
router.get('/', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM teams WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [req.tenantId]
  );
  return res.json(result.rows);
});

// POST /teams
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const result = await pool.query(
    `INSERT INTO teams (tenant_id, name) VALUES ($1, $2) RETURNING *`,
    [req.tenantId, name]
  );
  return res.status(201).json(result.rows[0]);
});

// PATCH /teams/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { name, memory_md } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
  if (memory_md !== undefined) { updates.push(`memory_md = $${idx++}`); values.push(memory_md); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id, req.tenantId);
  const result = await pool.query(
    `UPDATE teams SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    values
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.json(result.rows[0]);
});

export default router;
