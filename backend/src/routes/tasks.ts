import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /tasks
router.get('/', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM tasks WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [req.tenantId]
  );
  return res.json(result.rows);
});

// POST /tasks
router.post('/', async (req: AuthRequest, res: Response) => {
  const { title, description, agent_id, team_id, acceptance_criteria, context_md, constraints, parent_task_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const result = await pool.query(
    `INSERT INTO tasks (tenant_id, team_id, agent_id, title, description, acceptance_criteria, context_md, constraints, parent_task_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      req.tenantId,
      team_id ?? null,
      agent_id ?? null,
      title,
      description ?? null,
      acceptance_criteria ?? [],
      context_md ?? null,
      constraints ? JSON.stringify(constraints) : '{}',
      parent_task_id ?? null,
    ]
  );
  return res.status(201).json(result.rows[0]);
});

// PATCH /tasks/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const fields = ['status', 'agent_id', 'artifacts', 'context_md', 'constraints', 'completed_at'];
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${idx}`);
      values.push(req.body[field]);
      idx++;
    }
  }

  // Auto-set completed_at when status is done/failed
  if (req.body.status === 'done' || req.body.status === 'failed') {
    if (req.body.completed_at === undefined) {
      updates.push(`completed_at = now()`);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id, req.tenantId);
  const result = await pool.query(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    values
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.json(result.rows[0]);
});

export default router;
