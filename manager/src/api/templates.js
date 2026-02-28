import { Router } from 'express'
import { listTemplates, getTemplate, loadTemplates } from '../store/templates.js'

const router = Router()

// GET /api/templates — list all templates
router.get('/', (_req, res) => {
  res.json({ templates: listTemplates() })
})

// GET /api/templates/:id — single template by id
router.get('/:id', (req, res) => {
  const tmpl = getTemplate(req.params.id)
  if (!tmpl) return res.status(404).json({ error: 'template not found', code: 'NOT_FOUND' })
  res.json(tmpl)
})

export { loadTemplates }
export default router
