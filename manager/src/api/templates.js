import { readdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Router } from 'express'

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../templates')

// In-memory store: Map<id, template>
let templateStore = new Map()

async function loadTemplates() {
  let files
  try {
    files = await readdir(TEMPLATES_DIR)
  } catch {
    console.warn('[templates] templates dir not found:', TEMPLATES_DIR)
    return
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'))
  const loaded = new Map()
  for (const file of jsonFiles) {
    try {
      const raw = await readFile(join(TEMPLATES_DIR, file), 'utf8')
      const tmpl = JSON.parse(raw)
      if (tmpl.id) loaded.set(tmpl.id, tmpl)
    } catch (err) {
      console.warn(`[templates] failed to load ${file}:`, err.message)
    }
  }
  templateStore = loaded
  console.log(`[templates] loaded ${loaded.size} template(s)`)
}

// Load templates on startup and re-read on SIGHUP
loadTemplates()
process.on('SIGHUP', () => {
  console.log('[templates] SIGHUP received — reloading templates')
  loadTemplates()
})

const router = Router()

// GET /api/templates — list all templates
router.get('/', (_req, res) => {
  res.json({ templates: Array.from(templateStore.values()) })
})

// GET /api/templates/:id — single template by id
router.get('/:id', (req, res) => {
  const tmpl = templateStore.get(req.params.id)
  if (!tmpl) return res.status(404).json({ error: 'template not found', code: 'NOT_FOUND' })
  res.json(tmpl)
})

export { loadTemplates }
export default router
