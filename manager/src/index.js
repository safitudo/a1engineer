import { readFile } from 'fs/promises'
import * as teamStore from './store/teams.js'
import { startTeam, stopTeam } from './orchestrator/compose.js'
import { createHeartbeatServer } from './watchdog/collector.js'

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
      const { config: configPath } = parseArgs(rest)
      if (!configPath) {
        console.error('Usage: create-team --config <path-to-team.json>')
        process.exit(1)
      }
      const raw = await readFile(configPath, 'utf8')
      const config = JSON.parse(raw)
      const team = teamStore.createTeam(config)
      console.log(`Creating team ${team.id} (${team.name})…`)
      await startTeam(team)
      teamStore.updateTeam(team.id, { status: 'running' })
      console.log(`Team ${team.id} is running.`)
      console.log(JSON.stringify(teamStore.getTeam(team.id), null, 2))
      break
    }

    case 'destroy-team': {
      const { id } = parseArgs(rest)
      if (!id) {
        console.error('Usage: destroy-team --id <team-id>')
        process.exit(1)
      }
      const team = teamStore.getTeam(id)
      if (!team) {
        console.error(`Team not found: ${id}`)
        process.exit(1)
      }
      console.log(`Stopping team ${id}…`)
      await stopTeam(id)
      teamStore.deleteTeam(id)
      console.log(`Team ${id} destroyed.`)
      break
    }

    case 'list-teams': {
      const teams = teamStore.listTeams()
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
      // Start heartbeat server (used when Manager runs as a daemon in Phase 2)
      const { port = '8080' } = parseArgs(rest)
      createHeartbeatServer(teamStore, Number(port))
      console.log('[manager] heartbeat server running. Ctrl-C to stop.')
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
