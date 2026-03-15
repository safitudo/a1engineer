import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const HISTORY_FILE = join(homedir(), '.chathistory')

export async function loadHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf8'))
  } catch {
    return {}
  }
}

export async function saveHistory(history) {
  await writeFile(HISTORY_FILE, JSON.stringify(history), 'utf8')
}
