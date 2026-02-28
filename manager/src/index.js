import { readFile, readdir, access } from 'fs/promises'
import { readFileSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as teamStore from './store/teams.js'
import { TEAMS_DIR } from './constants.js'

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
import { startTeam, stopTeam, rehydrateTeams } from './orchestrator/compose.js'
import { rehydrateTenantTemplates } from './store/templates.js'
import { createApp } from './api/index.js'
import { attachWebSocketServer } from './api/ws.js'
import { startNudger } from './watchdog/nudger.js'
import { startTokenRefresh } from './watchdog/token-refresh.js'

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
      const { id: rawId, port = '8080' } = parseArgs(rest)
      if (!rawId) {
        console.error('Usage: destroy-team --id <team-id-or-name>')
        process.exit(1)
      }

      // Resolve name → id via Manager API if available
      let teamId = rawId
      try {
        const listResp = await fetch(`http://localhost:${port}/api/teams`)
        if (listResp.ok) {
          const teams = await listResp.json()
          const match = teams.find(t => t.id === rawId || t.name === rawId)
          if (match) {
            teamId = match.id
            const delResp = await fetch(`http://localhost:${port}/api/teams/${teamId}`, { method: 'DELETE' })
            if (delResp.ok || delResp.status === 204) {
              console.log(`Team ${teamId} (${match.name}) destroyed via Manager API.`)
              break
            }
          } else {
            console.error(`No team matching "${rawId}" in Manager.`)
          }
        }
      } catch { /* Manager not running — fall through */ }

      // Fallback: direct mode — resolve name by scanning compose dirs
      let resolvedId = teamId
      const composePath = join(TEAMS_DIR, teamId, 'docker-compose.yml')
      try { await access(composePath) } catch {
        // Not a UUID match — scan dirs for team name
        let found = false
        try {
          const dirs = await readdir(TEAMS_DIR)
          for (const d of dirs) {
            const cp = join(TEAMS_DIR, d, 'docker-compose.yml')
            try {
              const yml = await readFile(cp, 'utf8')
              const nameMatch = yml.match(/^# Team: (.+?) \(/m)
              if (nameMatch && nameMatch[1] === rawId) {
                resolvedId = d
                found = true
                break
              }
            } catch { /* skip */ }
          }
        } catch { /* dir doesn't exist */ }
        if (!found) {
          console.error(`Team not found: ${rawId}`)
          process.exit(1)
        }
      }
      console.log(`Stopping team ${resolvedId}…`)
      await stopTeam(resolvedId)
      teamStore.deleteTeam(resolvedId)
      console.log(`Team ${resolvedId} destroyed.`)
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
      const server = app.listen(Number(port), async () => {
        console.log(`[manager] REST API + WebSocket listening on :${port}`)
        // Rehydrate teams from disk on startup
        try {
          const restored = await rehydrateTeams(teamStore.restoreTeam)
          if (restored.length > 0) {
            console.log(`[manager] rehydrated ${restored.length} team(s) from disk`)
          }
        } catch (err) {
          console.error('[manager] rehydration failed:', err)
        }
        try {
          const restoredTemplates = await rehydrateTenantTemplates()
          if (restoredTemplates.length > 0) {
            console.log(`[manager] rehydrated templates for ${restoredTemplates.length} tenant(s)`)
          }
        } catch (err) {
          console.error('[manager] template rehydration failed:', err)
        }
      })
      attachWebSocketServer(server)
      startNudger()
      const tokenRefresh = startTokenRefresh()
      // Expose refreshNow so team creation can trigger immediate token injection
      app.set('tokenRefresh', tokenRefresh)
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
