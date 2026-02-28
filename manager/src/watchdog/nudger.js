import * as teamStore from '../store/teams.js'
import { writeFifo } from '../orchestrator/fifo.js'
import { broadcastAgentStatus } from '../api/ws.js'

const DEFAULT_IDLE_THRESHOLD = 300 // 5 min
const DEFAULT_NUDGE_MSG = 'continue. check IRC with msg read, then resume your current task.'
const CHECK_INTERVAL = 15_000 // 15 seconds

/**
 * Auto-nudge loop. Checks heartbeat staleness for all teams with autoNudge enabled.
 * Sends nudge commands via FIFO sidecar (works for all agent modes).
 * Broadcasts 'stalled'/'alive' WS events when agent stall state changes.
 *
 * Does NOT run for teams where autoNudge.enabled === false (Chuck handles those).
 */
export function startNudger() {
  console.log('[nudger] started')

  // Tracks agents currently considered stalled: "${teamId}:${agentId}"
  const stalledSet = new Set()

  const interval = setInterval(async () => {
    const teams = teamStore.listTeams()

    for (const team of teams) {
      if (team.status !== 'running') continue

      const nudgeConfig = team.autoNudge ?? { enabled: true }
      if (nudgeConfig.enabled === false) continue

      const threshold = (nudgeConfig.idleThresholdSeconds ?? DEFAULT_IDLE_THRESHOLD) * 1000
      const nudgeMsg = nudgeConfig.nudgeMessage ?? DEFAULT_NUDGE_MSG
      const now = Date.now()

      for (const agent of team.agents ?? []) {
        // Skip chuck unless explicitly opted in via autoNudge.includeChuck
        if (agent.role === 'chuck' && !nudgeConfig.includeChuck) continue

        if (!agent.last_heartbeat) continue
        const lastHb = new Date(agent.last_heartbeat).getTime()
        const idleMs = now - lastHb
        const key = `${team.id}:${agent.id}`

        if (idleMs >= threshold) {
          const alreadyStalled = stalledSet.has(key)
          if (!alreadyStalled) {
            stalledSet.add(key)
            broadcastAgentStatus(team.id, agent.id, 'stalled')
          }
          try {
            await writeFifo(team.id, agent.id, `nudge ${nudgeMsg}`)
            console.log(`[nudger] nudged ${agent.id} (idle ${Math.round(idleMs / 1000)}s)`)
          } catch (err) {
            console.warn(`[nudger] failed to nudge ${agent.id}: ${err.message}`)
          }
        } else if (stalledSet.has(key)) {
          stalledSet.delete(key)
          broadcastAgentStatus(team.id, agent.id, 'alive')
        }
      }
    }
  }, CHECK_INTERVAL)

  return { stop: () => clearInterval(interval) }
}
