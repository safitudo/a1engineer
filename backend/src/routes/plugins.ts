import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /plugins
router.get('/', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM plugins WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [req.tenantId]
  );
  return res.json(result.rows);
});

// POST /plugins/:id/enable
router.post('/:id/enable', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM plugins WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  const plugin = result.rows[0];
  if (!plugin) return res.status(404).json({ error: 'Not found' });

  const amUrl = process.env.ACCOUNT_MANAGER_URL;
  try {
    const amRes = await fetch(`${amUrl}/plugins/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin_id: plugin.id, config: plugin.config }),
    });
    const data = await amRes.json();
    return res.status(amRes.status).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: 'Account Manager unavailable', detail: err.message });
  }
});

// POST /plugins/:id/disable
router.post('/:id/disable', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(
    `SELECT id FROM plugins WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });

  const amUrl = process.env.ACCOUNT_MANAGER_URL;
  try {
    const amRes = await fetch(`${amUrl}/plugins/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin_id: req.params.id }),
    });
    const data = await amRes.json();
    return res.status(amRes.status).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: 'Account Manager unavailable', detail: err.message });
  }
});

export default router;
