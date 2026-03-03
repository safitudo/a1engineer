import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /agents
router.get('/', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM agents WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [req.tenantId]
  );
  return res.json(result.rows);
});

// POST /agents
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, role, mode, keep_context, runtime, model, effort, auth_mode, team_id, channel_subscriptions, plugins, config } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name required' });
  }

  // Resolve team_id — default to tenant's default team if not provided
  let resolvedTeamId = team_id;
  if (!resolvedTeamId) {
    const teamResult = await pool.query(
      `SELECT id FROM teams WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [req.tenantId]
    );
    resolvedTeamId = teamResult.rows[0]?.id;
  }

  const result = await pool.query(
    `INSERT INTO agents (tenant_id, team_id, name, role, mode, keep_context, runtime, model, effort, auth_mode, channel_subscriptions, plugins, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      req.tenantId,
      resolvedTeamId,
      name,
      role ?? null,
      mode ?? 'persistent',
      keep_context ?? false,
      runtime ?? 'claude-code',
      model ?? 'claude-sonnet-4-20250514',
      effort ?? 'high',
      auth_mode ?? 'session',
      channel_subscriptions ?? [],
      plugins ?? [],
      config ? JSON.stringify(config) : '{}',
    ]
  );
  return res.status(201).json(result.rows[0]);
});

// GET /agents/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM agents WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.json(result.rows[0]);
});

// PATCH /agents/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const fields = ['name', 'role', 'mode', 'keep_context', 'runtime', 'model', 'effort', 'auth_mode', 'status', 'container_id', 'channel_subscriptions', 'plugins', 'config'];
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

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push(`updated_at = now()`);
  values.push(req.params.id, req.tenantId);

  const result = await pool.query(
    `UPDATE agents SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    values
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.json(result.rows[0]);
});

// DELETE /agents/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `DELETE FROM agents WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.id, req.tenantId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  return res.status(204).send();
});

// POST /agents/:id/launch
router.post('/:id/launch', async (req: AuthRequest, res: Response) => {
  const agentResult = await pool.query(
    `SELECT * FROM agents WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  const agent = agentResult.rows[0];
  if (!agent) return res.status(404).json({ error: 'Not found' });

  const amUrl = process.env.ACCOUNT_MANAGER_URL;
  try {
    const amRes = await fetch(`${amUrl}/agents/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.id, config: agent.config }),
    });
    const data = await amRes.json();
    return res.status(amRes.status).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: 'Account Manager unavailable', detail: err.message });
  }
});

// POST /agents/:id/stop
router.post('/:id/stop', async (req: AuthRequest, res: Response) => {
  const agentResult = await pool.query(
    `SELECT id FROM agents WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!agentResult.rows[0]) return res.status(404).json({ error: 'Not found' });

  const amUrl = process.env.ACCOUNT_MANAGER_URL;
  try {
    const amRes = await fetch(`${amUrl}/agents/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: req.params.id }),
    });
    const data = await amRes.json();
    return res.status(amRes.status).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: 'Account Manager unavailable', detail: err.message });
  }
});

// POST /agents/:id/directive
router.post('/:id/directive', async (req: AuthRequest, res: Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const agentResult = await pool.query(
    `SELECT id FROM agents WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!agentResult.rows[0]) return res.status(404).json({ error: 'Not found' });

  const amUrl = process.env.ACCOUNT_MANAGER_URL;
  try {
    const amRes = await fetch(`${amUrl}/agents/directive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: req.params.id, message }),
    });
    const data = await amRes.json();
    return res.status(amRes.status).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: 'Account Manager unavailable', detail: err.message });
  }
});

export default router;
