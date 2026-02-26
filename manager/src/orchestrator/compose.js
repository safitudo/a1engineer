import { readFile, mkdir, writeFile, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { homedir } from 'os'
import ejs from 'ejs'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../templates/team-compose.yml.ejs')
const ERGO_TEMPLATE_PATH = join(__dirname, '../../templates/ergo/ircd.yaml')
const TEAMS_DIR = '/tmp/a1-teams'
const ERGO_IMAGE = 'ghcr.io/ergochat/ergo:stable'

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

export async function renderCompose(teamConfig, secretsDir = null, apiKey = null) {
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

  const secrets = await resolveSecrets(secretsDir)
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  return ejs.render(template, {
    team: { id: teamConfig.id, name: teamConfig.name },
    ergo: teamConfig.ergo ?? {},
    repo: teamConfig.repo ?? {},
    agents: teamConfig.agents ?? [],
    auth: authContext,
    secrets,
  })
}

export async function startTeam(teamConfig, opts = {}) {
  const secretsDir = opts.secretsDir ?? null
  const teamDir = join(TEAMS_DIR, teamConfig.id)
  await mkdir(teamDir, { recursive: true })

  // Write ergo IRC config into team dir so it can be bind-mounted
  const ergoConfigPath = join(teamDir, 'ircd.yaml')
  await writeFile(ergoConfigPath, await readFile(ERGO_TEMPLATE_PATH, 'utf8'), 'utf8')

  // Apply ergo defaults (allow teamConfig.ergo to override image/port)
  const ergo = { image: ERGO_IMAGE, configPath: ergoConfigPath, port: 6667, ...teamConfig.ergo }
  const rendered = await renderCompose({ ...teamConfig, ergo }, secretsDir, opts.apiKey ?? null)
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
