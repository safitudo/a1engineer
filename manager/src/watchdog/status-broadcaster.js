/**
 * status-broadcaster.js — Periodic team status broadcast watchdog
 *
 * Every 5 minutes, for each running team with an active IRC gateway and
 * statusBroadcast.enabled !== false, posts a single line to the team's
 * broadcast channel so all agents have current team context in their IRC log.
 *
 * Message format:
 *   "@all statuses | Team: {name} | Agents: {role} — {first-sentence-of-prompt}, ..."
 *
 * Per-team config (team.statusBroadcast):
 *   enabled        boolean  — default true; set false to silence broadcasts for a team
 *   channel        string   — default '#main'; channel to post into
 *   intervalSeconds number  — default 300; stored for future per-team interval support
 *
 * Note: v1 uses a single global interval (intervalMs param). Per-team intervalSeconds
 * is honoured at the enabled/channel level; custom per-team timing is a future enhancement.
 */

import * as teamStore from '../store/teams.js'
import { getGateway } from '../irc/gateway.js'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_CHANNEL = '#main'

/**
 * Extract the first sentence from a prompt string.
 * Matches up to the first '.', '!', or '?' that is followed by whitespace or end-of-string.
 * Falls back to the full trimmed text if no sentence terminator is found.
 *
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
function firstSentence(text) {
  if (!text) return null
  const m = text.match(/^(.+?[.!?])(?:\s|$)/)
  return m ? m[1] : text.trim()
}

/**
 * Build the agent roster string for the broadcast message.
 * Each agent is rendered as "role — first sentence of prompt" (or just "role" if no prompt).
 * Agents are joined by ", ".
 *
 * @param {object[]} agents
 * @returns {string}
 */
function buildAgentRoster(agents) {
  if (!agents || agents.length === 0) return 'none'
  return agents
    .map((a) => {
      const desc = firstSentence(a.prompt)
      return desc ? `${a.role} — ${desc}` : a.role
    })
    .join(', ')
}

/**
 * Build the full broadcast message for a team.
 *
 * @param {object} team — team record from the store
 * @returns {string}
 */
export function buildBroadcastMessage(team) {
  const roster = buildAgentRoster(team.agents)
  return `@all statuses | Team: ${team.name} | Agents: ${roster}`
}

/**
 * Start the status-broadcaster watchdog interval.
 *
 * On every tick, loops through all running teams. For each team:
 *   - skips if team.statusBroadcast.enabled === false
 *   - skips if no active IRC gateway (getGateway returns null)
 *   - posts buildBroadcastMessage(team) to the configured channel
 *
 * Errors from gw.say() are caught and logged; they do not halt the loop.
 *
 * @param {object} [opts]
 * @param {number} [opts.intervalMs] — override the broadcast interval in ms (useful for tests)
 * @returns {{ stop: () => void }}
 */
export function startStatusBroadcaster({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  console.log(`[status-broadcaster] started — @all statuses every ${intervalMs / 1000}s`)

  const timer = setInterval(() => {
    const teams = teamStore.listTeams()

    for (const team of teams) {
      if (team.status !== 'running') continue

      const cfg = team.statusBroadcast ?? {}
      if (cfg.enabled === false) continue

      const channel = cfg.channel ?? DEFAULT_CHANNEL

      const gw = getGateway(team.id)
      if (!gw) continue

      try {
        gw.say(channel, buildBroadcastMessage(team))
      } catch (err) {
        console.warn(
          `[status-broadcaster] failed for team ${team.id} (${team.name}): ${err.message}`,
        )
      }
    }
  }, intervalMs)

  return { stop: () => clearInterval(timer) }
}
