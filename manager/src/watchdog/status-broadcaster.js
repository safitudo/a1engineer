import { listTeams } from '../store/teams.js'
import { listTeamChannels } from '../store/channels.js'
import { getGateway } from '../irc/gateway.js'
import { routeMessage } from '../irc/router.js'

const TICK_INTERVAL_MS = 60_000 // check every 60 s; actual broadcast rate governed by intervalSeconds
const DEFAULT_INTERVAL_SECONDS = 300 // 5 minutes

/**
 * Extract the first sentence from a prompt string.
 * A sentence ends at the first `.`, `!`, or `?`.
 * Returns empty string when prompt is absent or empty.
 */
export function firstSentence(text) {
  if (!text) return ''
  const end = text.search(/[.!?]/)
  if (end === -1) return text.trim()
  return text.slice(0, end + 1).trim()
}

/**
 * Build a human-readable agent roster string.
 * Format per agent: "role — first sentence of prompt" (or just "role" if no prompt).
 * Returns "(no agents)" when the team has no agents.
 *
 * @param {object[]} agents
 * @returns {string}
 */
export function buildRoster(agents) {
  if (!agents?.length) return '(no agents)'
  return agents
    .map((a) => {
      const desc = firstSentence(a.prompt)
      return desc ? `${a.role} — ${desc}` : a.role
    })
    .join(', ')
}

/**
 * Start the status-broadcaster watchdog.
 *
 * For each running team with statusBroadcast enabled, posts:
 *   "@all statuses | Team: {name} | Agents: {role} — {first sentence of prompt}, ..."
 * to the configured channel (default: #main) at the configured interval
 * (default 300 s = 5 min) via the team's IRC gateway.
 *
 * Per-team config (team.statusBroadcast):
 *   { enabled: boolean, intervalSeconds: 300, channel: 'main' }
 *   - enabled:         true by default (explicit false to opt out; mirrors autoNudge)
 *   - intervalSeconds: 300 by default (5 min)
 *   - channel:         'main' by default (leading # is optional)
 *
 * Guards:
 *   - Skips teams not in 'running' status.
 *   - Skips teams where the IRC gateway is not yet connected (retries next tick).
 *
 * @returns {{ stop: () => void }}
 */
export function startStatusBroadcaster() {
  console.log('[status-broadcaster] started')

  const startTime = Date.now()
  // teamId → last-broadcast timestamp (ms).
  // Defaults to startTime so the first broadcast fires after one full interval,
  // not immediately on startup.
  const lastBroadcast = new Map()

  const interval = setInterval(() => {
    const now = Date.now()
    const teams = listTeams()

    for (const team of teams) {
      if (team.status !== 'running') continue

      const cfg = team.statusBroadcast ?? { enabled: true }
      if (cfg.enabled === false) continue

      const intervalMs = (cfg.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS) * 1000
      const last = lastBroadcast.get(team.id) ?? startTime
      if (now - last < intervalMs) continue

      const gw = getGateway(team.id)
      if (!gw) continue // gateway not connected yet — will retry next tick

      // Record broadcast time after the null-gw check so a missing gateway does
      // not delay the retry by a full interval.  Avoids double-fire on slow gateways
      // once connected.
      lastBroadcast.set(team.id, now)

      const rawChannel = cfg.channel ?? 'main'
      const channelName = rawChannel.startsWith('#') ? rawChannel : `#${rawChannel}`
      const roster = buildRoster(team.agents)
      const msg = `@all statuses | Team: ${team.name} | Agents: ${roster}`

      try {
        gw.say(channelName, msg)
        // Also populate the ring buffer so agents can read status via msg read.
        // The @all guard in router.js excludes manager-{teamName} from FIFO nudge,
        // so this call does NOT cause a feedback loop.
        const teamChannels = listTeamChannels(team.id)
        const ch = teamChannels.find(c => c.name === channelName)
        routeMessage({
          teamId: team.id,
          teamName: team.name,
          channel: channelName,
          channelId: ch?.id ?? null,
          nick: `manager-${team.name}`,
          text: msg,
          time: new Date().toISOString(),
        })
        console.log(`[status-broadcaster] ${team.name} → ${channelName}`)
      } catch (err) {
        console.warn(`[status-broadcaster] failed for team ${team.name}: ${err.message}`)
      }
    }
  }, TICK_INTERVAL_MS)

  return { stop: () => clearInterval(interval) }
}
