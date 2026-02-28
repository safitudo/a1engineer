import { Router } from 'express'
import {
  listTemplates,
  getTemplate,
  loadTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../store/templates.js'
import { findByApiKey } from '../store/tenants.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

/**
 * Resolve tenant from Authorization header without auto-provisioning.
 * Used by read-only public endpoints to optionally include tenant templates.
 */
function resolveTenant(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  const apiKey = header.slice(7).trim()
  return apiKey ? (findByApiKey(apiKey) ?? null) : null
}

// ── Public read endpoints ──────────────────────────────────────────────────

// GET /api/templates — list all templates (builtins always; + tenant customs if authenticated)
router.get('/', (req, res) => {
  const tenant = resolveTenant(req)
  res.json({ templates: listTemplates(tenant?.id ?? null) })
})

// GET /api/templates/:id — single template by id
router.get('/:id', (req, res) => {
  const tenant = resolveTenant(req)
  const tmpl = getTemplate(req.params.id, tenant?.id ?? null)
  if (!tmpl) return res.status(404).json({ error: 'template not found', code: 'NOT_FOUND' })
  res.json(tmpl)
})

// ── Authenticated write endpoints ──────────────────────────────────────────

// POST /api/templates — create custom template (tenant-scoped)
router.post('/', requireAuth, (req, res) => {
  if (!req.tenant) {
    return res.status(403).json({ error: 'only tenant accounts can create templates', code: 'FORBIDDEN' })
  }
  const result = createTemplate(req.tenant.id, req.body)
  if (result.error) {
    return res.status(400).json({ error: result.error, code: 'VALIDATION_ERROR' })
  }
  res.status(201).json(result.template)
})

// PUT /api/templates/:id — update custom template
router.put('/:id', requireAuth, (req, res) => {
  if (!req.tenant) {
    return res.status(403).json({ error: 'only tenant accounts can update templates', code: 'FORBIDDEN' })
  }
  const result = updateTemplate(req.tenant.id, req.params.id, req.body)
  if (result.error) {
    const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'FORBIDDEN' ? 403 : 400
    return res.status(status).json({ error: result.error, code: result.code ?? 'VALIDATION_ERROR' })
  }
  res.json(result.template)
})

// DELETE /api/templates/:id — delete custom template
router.delete('/:id', requireAuth, (req, res) => {
  if (!req.tenant) {
    return res.status(403).json({ error: 'only tenant accounts can delete templates', code: 'FORBIDDEN' })
  }
  const result = deleteTemplate(req.tenant.id, req.params.id)
  if (result.error) {
    const status = result.code === 'NOT_FOUND' ? 404 : 403
    return res.status(status).json({ error: result.error, code: result.code })
  }
  res.status(204).end()
})

export { loadTemplates }
export default router
