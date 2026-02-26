import { readFile, mkdir, writeFile, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import ejs from 'ejs'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '../../templates/team-compose.yml.ejs')
const TEAMS_DIR = '/tmp/a1-teams'

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

export async function renderCompose(teamConfig, secretsDir = null) {
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  const secrets = await resolveSecrets(secretsDir)
  // Pass top-level vars matching the EJS template contract from #8:
  // team, ergo, repo, agents — not nested under a single key
  return ejs.render(template, {
    team: { id: teamConfig.id, name: teamConfig.name },
    ergo: teamConfig.ergo ?? {},
    repo: teamConfig.repo ?? {},
    agents: teamConfig.agents ?? [],
    secrets,
  })
}

export async function startTeam(teamConfig, secretsDir = null) {
  const rendered = await renderCompose(teamConfig, secretsDir)
  const teamDir = join(TEAMS_DIR, teamConfig.id)
  await mkdir(teamDir, { recursive: true })
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
