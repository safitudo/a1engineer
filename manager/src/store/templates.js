// WARNING: Templates must not contain secrets.
// The agent env field is for non-sensitive config only (e.g. CLAUDE_AUTOCOMPACT_PCT_OVERRIDE).
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../data/templates.json')

/** @type {Map<string, object>} */
let store = new Map()

export async function loadTemplates() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const templates = JSON.parse(raw)
    store = new Map(templates.map((t) => [t.id, t]))
    console.log(`[templates] loaded ${store.size} template(s)`)
  } catch (err) {
    console.warn('[templates] failed to load templates.json:', err.message)
  }
}

export function listTemplates() {
  return Array.from(store.values())
}

export function getTemplate(id) {
  return store.get(id) ?? null
}

// Load on startup
loadTemplates()
