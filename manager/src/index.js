import { readFile, readdir, access } from 'fs/promises'
import { readFileSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as teamStore from './store/teams.js'

// ── Load .env from project root ──────────────────────────────────────────────
const __dirname_idx = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname_idx, '../../.env')
try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const val = trimmed.slice(eq + 1)
    if (!process.env[key]) process.env[key] = val  // don't override existing
  }
} catch { /* .env not found — that's fine */ }
import { startTeam, stopTeam } from './orchestrator/compose.js'
import { createApp } from './api/index.js'
import { attachWebSocketServer } from './api/ws.js'
import { startNudger } from './watchdog/nudger.js'

const TEAMS_DIR = '/tmp/a1-teams'

const [, , command, ...rest] = process.argv

function parseArgs(args) {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      result[key] = args[i + 1] ?? true
      i++
    }
  }
  return result
}

async function main() {
  switch (command) {
    case 'create-team': {
      const { config: configPath, secrets: secretsArg, port = '8080' } = parseArgs(rest)
      if (!configPath) {
        console.error('Usage: create-team --config <path-to-team.json> [--secrets <secrets-dir>]')
        process.exit(1)
      }
      const raw = await readFile(configPath, 'utf8')
      const config = JSON.parse(raw)

      // Try the running Manager API first — so it stays aware of the team
      const managerUrl = `http://localhost:${port}/api/teams`
      try {
        const resp = await fetch(managerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: raw,
        })
        if (resp.ok) {
          const team = await resp.json()
          console.log(`Team ${team.id} (${team.name}) created via Manager API.`)
          console.log(JSON.stringify(team, null, 2))
          break
        }
        console.error(`Manager API returned ${resp.status}, falling back to direct mode…`)
      } catch {
        console.error(`Manager not reachable at ${managerUrl}, using direct mode…`)
      }

      // Fallback: direct mode (Manager won't know about this team)
      const secretsDir = secretsArg ? resolve(secretsArg) : null
      const apiKey = config.auth?.apiKey ?? null
      const team = teamStore.createTeam(config)
      console.log(`Creating team ${team.id} (${team.name})…`)
      await startTeam(team, { secretsDir, apiKey })
      teamStore.updateTeam(team.id, { status: 'running' })
      console.log(`Team ${team.id} is running.`)
      console.log(JSON.stringify(teamStore.getTeam(team.id), null, 2))
      break
    }

    case 'destroy-team': {
      const { id, port = '8080' } = parseArgs(rest)
      if (!id) {
        console.error('Usage: destroy-team --id <team-id>')
        process.exit(1)
      }

      // Try Manager API first
      try {
        const resp = await fetch(`http://localhost:${port}/api/teams/${id}`, { method: 'DELETE' })
        if (resp.ok || resp.status === 204) {
          console.log(`Team ${id} destroyed via Manager API.`)
          break
        }
      } catch { /* Manager not running — fall through */ }

      // Fallback: direct mode
      const composePath = join(TEAMS_DIR, id, 'docker-compose.yml')
      try { await access(composePath) } catch {
        console.error(`Team not found: ${id} (no compose file at ${composePath})`)
        process.exit(1)
      }
      console.log(`Stopping team ${id}…`)
      await stopTeam(id)
      teamStore.deleteTeam(id)
      console.log(`Team ${id} destroyed.`)
      break
    }

    case 'list-teams': {
      // Scan filesystem for team compose dirs (works across processes)
      let dirs = []
      try { dirs = await readdir(TEAMS_DIR) } catch { /* dir may not exist */ }
      const teamDirs = []
      for (const d of dirs) {
        const cp = join(TEAMS_DIR, d, 'docker-compose.yml')
        try { await access(cp); teamDirs.push(d) } catch { /* skip */ }
      }
      if (teamDirs.length === 0) {
        console.log('No teams found.')
      } else {
        for (const id of teamDirs) {
          // Read team name from compose file header comment
          const yml = await readFile(join(TEAMS_DIR, id, 'docker-compose.yml'), 'utf8')
          const nameMatch = yml.match(/^# Team: (.+?) \(/m)
          const name = nameMatch ? nameMatch[1] : '?'
          console.log(`${id}  ${name}`)
        }
      }
      break
    }

    case 'serve': {
      const { port = '8080' } = parseArgs(rest)
      const app = createApp()
      const server = app.listen(Number(port), () => {
        console.log(`[manager] REST API + WebSocket listening on :${port}`)
      })
      attachWebSocketServer(server)
      startNudger()
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      console.error('Commands: create-team, destroy-team, list-teams, serve')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
