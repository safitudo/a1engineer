import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

// Extract Claude session credentials from macOS Keychain or local config file
export async function extractClaudeSession(): Promise<string | null> {
  // Try macOS Keychain first (works on host Mac)
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password', '-s', 'claude.ai', '-w',
      ])
      if (stdout.trim()) return stdout.trim()
    } catch { /* not in keychain */ }
  }

  // Fall back to Claude Code credentials file
  const credPath = join(homedir(), '.claude', '.credentials.json')
  try {
    const raw = await readFile(credPath, 'utf8')
    return raw.trim()
  } catch { /* not found */ }

  return null
}
