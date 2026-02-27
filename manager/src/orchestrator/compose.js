import { readFile, mkdir, writeFile, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { homedir } from 'os'
import ejs from 'ejs'
import { resolveGitHubToken } from '../github/app.js'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../templates/team-compose.yml.ejs')
const TEAMS_DIR = '/tmp/a1-teams'

const DEFAULT_ERGO_IMAGE = 'a1-ergo:latest'
const DEFAULT_ERGO_CONFIG = join(__dirname, '../../../templates/ergo/ircd.yaml')
const VALID_AUTH_MODES = ['session', 'api-key']

// Known Docker secrets: logical name → filename in secretsDir
const KNOWN_SECRETS = {
  anthropic_key: 'anthropic_key.txt',
  github_token: 'github_token.txt',
}

async function fileExists(p) {
  try { await access(p); return true } catch { return false }
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
  const auth = teamConfig.auth ?? { mode: 'session', sessionPath: '~/.claude' }

  if (!VALID_AUTH_MODES.includes(auth.mode)) {
    throw new Error(`Unknown auth mode: ${auth.mode}. Must be one of: ${VALID_AUTH_MODES.join(', ')}`)
  }

  let authContext
  if (auth.mode === 'session') {
    const resolvedPath = (auth.sessionPath ?? '~/.claude').replace(/^~/, homedir())
    await access(resolvedPath).catch(() =>
      console.warn(`[compose] Warning: session path does not exist: ${auth.sessionPath}`)
    )
    authContext = { mode: 'session', resolvedPath }
  } else {
    // api-key: write key to secrets file — never injected as plain env var
    authContext = { mode: 'api-key' }
    if (secretsDir) {
      const key = apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
      await writeFile(join(secretsDir, KNOWN_SECRETS.anthropic_key), key, 'utf8')
    }
  }

  // Write GitHub token to secrets dir if available
  if (secretsDir && githubToken) {
    await writeFile(join(secretsDir, KNOWN_SECRETS.github_token), githubToken, 'utf8')
  }

  const secrets = await resolveSecrets(secretsDir)
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  return ejs.render(template, {
    team: { id: teamConfig.id, name: teamConfig.name },
    ergo: {
      image: DEFAULT_ERGO_IMAGE,
      configPath: DEFAULT_ERGO_CONFIG,
      port: 6667,
      ...teamConfig.ergo,
    },
    repo: { ...teamConfig.repo, githubToken: githubToken || teamConfig.repo?.githubToken },
    agents: teamConfig.agents ?? [],
    auth: authContext,
    secrets,
  })
}

export async function startTeam(teamConfig, opts = {}) {
  const teamDir = join(TEAMS_DIR, teamConfig.id)
  await mkdir(teamDir, { recursive: true })
  // Auto-create secretsDir for api-key mode so secrets flow works without --secrets flag
  const auth = teamConfig.auth ?? {}
  const secretsDir = opts.secretsDir ?? (auth.mode === 'api-key' || teamConfig.github ? teamDir : null)

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
  const composePath = join(TEAMS_DIR, teamId, 'docker-compose.yml')
  await execFileAsync('docker', ['compose', '-f', composePath, 'down', '--remove-orphans'])
  console.log(`[compose] team ${teamId} stopped`)
}
