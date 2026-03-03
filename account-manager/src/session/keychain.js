import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

/**
 * Extract Claude session credentials from macOS Keychain or local config file.
 * Returns null if not found (e.g., on Linux in CI).
 * @returns {Promise<string|null>} JSON credentials string or null
 */
export async function extractClaudeSession() {
  // Try macOS Keychain first
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password', '-s', 'claude.ai', '-w',
      ])
      if (stdout.trim()) return stdout.trim()
    } catch {
      // Not in Keychain — fall through to file
    }
  }

  // Try Claude Code's credentials file
  try {
    const credPath = join(homedir(), '.claude', '.credentials.json')
    const content = await readFile(credPath, 'utf8')
    return content.trim()
  } catch {
    return null
  }
}
