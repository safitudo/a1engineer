import { readFile, mkdir, writeFile } from 'fs/promises'
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

export async function renderCompose(teamConfig) {
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  // Pass top-level vars matching the EJS template contract from #8:
  // team, ergo, repo, agents — not nested under a single key
  return ejs.render(template, {
    team: { id: teamConfig.id, name: teamConfig.name },
    ergo: teamConfig.ergo ?? {},
    repo: teamConfig.repo ?? {},
    agents: teamConfig.agents ?? [],
  })
}

export async function startTeam(teamConfig) {
  const rendered = await renderCompose(teamConfig)
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
