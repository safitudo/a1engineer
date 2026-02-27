import { readFile, mkdir, writeFile, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import ejs from 'ejs'
import { resolveGitHubToken } from '../github/app.js'
import { TEAMS_DIR } from '../constants.js'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../templates/team-compose.yml.ejs')

const DEFAULT_ERGO_IMAGE = 'a1-ergo:latest'
const DEFAULT_ERGO_CONFIG = join(__dirname, '../../../templates/ergo/ircd.yaml')
const VALID_AUTH_MODES = ['session', 'api-key']

// Known Docker secrets: logical name → filename in secretsDir
const KNOWN_SECRETS = {
  anthropic_key: 'anthropic_key.txt',
  anthropic_session: 'anthropic_session.txt',
  github_token: 'github_token.txt',
}

async function fileExists(p) {
  try { await access(p); return true } catch { return false }
}

// Extract OAuth credentials JSON from macOS Keychain (Claude Code stores it there).
// Returns the full credentials JSON string or null if unavailable.
async function extractSessionCredentials() {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password', '-s', 'Claude Code-credentials', '-w',
    ])
    const creds = JSON.parse(stdout.trim())
    if (creds?.claudeAiOauth?.accessToken) return stdout.trim()
    console.warn('[compose] Keychain entry found but no accessToken in claudeAiOauth')
    return null
  } catch (err) {
    // Not on macOS or no Keychain entry — check env fallback
    if (process.env.CLAUDE_SESSION_CREDENTIALS) return process.env.CLAUDE_SESSION_CREDENTIALS
    return null
  }
}

// Returns { secretName: absoluteFilePath } for secrets present in secretsDir.
async function resolveSecrets(secretsDir) {
  if (!secretsDir) return {}
  const result = {}
  for (const [name, filename] of Object.entries(KNOWN_SECRETS)) {
    const filePath = join(secretsDir, filename)
    if (await fileExists(filePath)) result[name] = filePath
  }
  return result
}

export async function renderCompose(teamConfig, secretsDir = null, apiKey = null, githubToken = null) {
  const teamAuth = teamConfig.auth ?? { mode: 'session', sessionPath: '~/.claude' }

  if (!VALID_AUTH_MODES.includes(teamAuth.mode)) {
    throw new Error(`Unknown auth mode: ${teamAuth.mode}. Must be one of: ${VALID_AUTH_MODES.join(', ')}`)
  }

  // Resolve per-agent effective auth mode (agent.auth overrides team auth)
  const agents = (teamConfig.agents ?? []).map(a => ({
    ...a,
    _authMode: a.auth ?? teamAuth.mode,
  }))

  const hasApiKeyAgent = agents.some(a => a._authMode === 'api-key')
  const hasSessionAgent = agents.some(a => a._authMode === 'session')

  // Resolve session path if any agent uses session auth
  let sessionResolvedPath = null
  if (hasSessionAgent) {
    sessionResolvedPath = (teamAuth.sessionPath ?? '~/.claude').replace(/^~/, homedir())
    await access(sessionResolvedPath).catch(() =>
      console.warn(`[compose] Warning: session path does not exist: ${sessionResolvedPath}`)
    )
    // Extract OAuth token from macOS Keychain and write as secret
    if (secretsDir) {
      const oauthToken = await extractSessionCredentials()
      if (oauthToken) {
        await writeFile(join(secretsDir, KNOWN_SECRETS.anthropic_session), oauthToken, 'utf8')
        console.log('[compose] OAuth session token extracted for session-auth agents')
      } else {
        console.warn('[compose] Warning: could not extract OAuth token from Keychain. Session-auth agents will not authenticate.')
      }
    }
  }

  // Write API key to secrets if any agent uses api-key auth
  if (hasApiKeyAgent && secretsDir) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
    await writeFile(join(secretsDir, KNOWN_SECRETS.anthropic_key), key, 'utf8')
  }

  // Write GitHub token to secrets dir if available
  if (secretsDir && githubToken) {
    await writeFile(join(secretsDir, KNOWN_SECRETS.github_token), githubToken, 'utf8')
  }

  const secrets = await resolveSecrets(secretsDir)
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  // Merge ergo config; resolve relative configPath to absolute
  const ergoMerged = {
    image: DEFAULT_ERGO_IMAGE,
    configPath: DEFAULT_ERGO_CONFIG,
    port: 6667,
    ...teamConfig.ergo,
  }
  if (ergoMerged.configPath && !ergoMerged.configPath.startsWith('/')) {
    ergoMerged.configPath = resolve(ergoMerged.configPath)
  }
  return ejs.render(template, {
    team: { id: teamConfig.id, name: teamConfig.name },
    ergo: ergoMerged,
    repo: { ...teamConfig.repo, githubToken: githubToken || teamConfig.repo?.githubToken },
    agents,
    sessionResolvedPath,
    secrets,
  })
}

export async function startTeam(teamConfig, opts = {}) {
  const teamDir = join(TEAMS_DIR, teamConfig.id)
  await mkdir(teamDir, { recursive: true })
  // Auto-create secretsDir if any agent needs secrets (api-key, session OAuth, or github)
  const teamAuthMode = teamConfig.auth?.mode ?? 'session'
  const anySecretsNeeded = (teamConfig.agents ?? []).some(a => {
    const mode = a.auth ?? teamAuthMode
    return mode === 'api-key' || mode === 'session'
  }) || !!teamConfig.github
  const secretsDir = opts.secretsDir ?? (anySecretsNeeded ? teamDir : null)

  // Resolve GitHub token: App mode (auto-generate) or PAT fallback
  let githubToken = opts.githubToken ?? null
  if (!githubToken) {
    try {
      githubToken = await resolveGitHubToken(teamConfig)
    } catch (err) {
      console.warn(`[compose] GitHub token not available: ${err.message}`)
    }
  }

  const rendered = await renderCompose(teamConfig, secretsDir, opts.apiKey ?? null, githubToken)
  const composePath = join(teamDir, 'docker-compose.yml')
  await writeFile(composePath, rendered, 'utf8')
  await execFileAsync('docker', ['compose', '-f', composePath, 'up', '-d'])
  console.log(`[compose] team ${teamConfig.id} started`)
}

export async function stopTeam(teamId) {
  const teamDir = join(TEAMS_DIR, teamId)
  const composePath = join(teamDir, 'docker-compose.yml')
  await execFileAsync('docker', ['compose', '-f', composePath, 'down', '--remove-orphans'])
  // Clean up team directory so list-teams doesn't show stale entries
  const { rm } = await import('fs/promises')
  await rm(teamDir, { recursive: true, force: true })
  console.log(`[compose] team ${teamId} stopped`)
}
