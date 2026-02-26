import { readFile } from 'fs/promises'
import { resolve } from 'path'
import * as teamStore from './store/teams.js'
import { startTeam, stopTeam } from './orchestrator/compose.js'
import { createApp } from './api/index.js'
import { attachWebSocketServer } from './api/ws.js'
import { runMigrations } from './db/migrate.js'

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
    case 'migrate': {
      await runMigrations()
      console.log('[manager] migrations complete')
      break
    }

    case 'create-team': {
      const { config: configPath, secrets: secretsArg } = parseArgs(rest)
      if (!configPath) {
        console.error('Usage: create-team --config <path-to-team.json> [--secrets <secrets-dir>]')
        process.exit(1)
      }
      const raw = await readFile(configPath, 'utf8')
      const config = JSON.parse(raw)
      const secretsDir = secretsArg ? resolve(secretsArg) : null
      const apiKey = config.auth?.apiKey ?? null  // grab before createTeam/normalizeAuth strips it
      const team = await teamStore.createTeam(config)
      console.log(`Creating team ${team.id} (${team.name})…`)
      await startTeam(team, { secretsDir, apiKey })
      await teamStore.updateTeam(team.id, { status: 'running' })
      console.log(`Team ${team.id} is running.`)
      console.log(JSON.stringify(await teamStore.getTeam(team.id), null, 2))
      break
    }

    case 'destroy-team': {
      const { id } = parseArgs(rest)
      if (!id) {
        console.error('Usage: destroy-team --id <team-id>')
        process.exit(1)
      }
      const team = await teamStore.getTeam(id)
      if (!team) {
        console.error(`Team not found: ${id}`)
        process.exit(1)
      }
      console.log(`Stopping team ${id}…`)
      await stopTeam(id)
      await teamStore.deleteTeam(id)
      console.log(`Team ${id} destroyed.`)
      break
    }

    case 'list-teams': {
      const teams = await teamStore.listTeams()
      if (teams.length === 0) {
        console.log('No running teams.')
      } else {
        for (const t of teams) {
          console.log(`${t.id}  ${t.name}  status=${t.status}  agents=${t.agents.length}`)
        }
      }
      break
    }

    case 'serve': {
      const { port = '8080' } = parseArgs(rest)
      await runMigrations()
      const app = createApp()
      const server = app.listen(Number(port), () => {
        console.log(`[manager] REST API + WebSocket listening on :${port}`)
      })
      attachWebSocketServer(server)
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      console.error('Commands: migrate, create-team, destroy-team, list-teams, serve')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
