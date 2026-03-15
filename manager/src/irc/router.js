/**
 * IrcRouter — routes incoming IRC messages from gateways to:
 *   1. In-memory ring buffer (consumed by REST API)
 *   2. WebSocket broadcast (consumed by UI — registered externally)
 *   3. Structured event extraction for tagged messages
 *
 * Message tags parsed:
 *   [ASSIGN] @nick — #NN description
 *   [ACK]
 *   [PR] link — Fixes #NN
 *   [REVIEW] verdict — PR link
 *   [BLOCK] reason
 *   [DONE] #NN description
 *   [STATUS] update
 */

import { getTeam } from '../store/teams.js'
import { listTeamChannels } from '../store/channels.js'
import { writeFifo } from '../orchestrator/fifo.js'

const TAG_RE = /^\[([A-Z]+)\]\s*(.*)/
const ALL_RE = /@all\b/i

// Per-channel ring buffer: caps at MAX_MESSAGES to bound memory usage
const MAX_MESSAGES = 500 // entries per channel
const buffers = new Map() // key: channelId (UUID) → message[]

// WebSocket broadcast callbacks registered by the WS layer
const wsBroadcasters = new Set()

function getBuffer(channelId) {
  if (!buffers.has(channelId)) buffers.set(channelId, [])
  return buffers.get(channelId)
}

function appendToBuffer(channelId, entry) {
  const buf = getBuffer(channelId)
  buf.push(entry)
  if (buf.length > MAX_MESSAGES) buf.shift()
}

/**
 * Parse a structured tag from the message text.
 * Returns { tag, body } or null if no tag found.
 */
function parseTag(text) {
  const m = TAG_RE.exec(text)
  if (!m) return null
  return { tag: m[1], body: m[2].trim() }
}

/**
 * Route a message event (emitted by IrcGateway) through the buffer and
 * WebSocket broadcast pipeline.
 *
 * @param {object} event - { teamId, teamName, channel, channelId, nick, text, time }
 */
export function routeMessage(event) {
  const { teamId, channelId, nick, channel, text } = event

  const structured = parseTag(text)
  const entry = {
    ...event,
    tag: structured?.tag ?? null,
    tagBody: structured?.body ?? null,
  }

  appendToBuffer(channelId, entry)

  for (const broadcast of wsBroadcasters) {
    try {
      broadcast(entry)
    } catch {
      // Individual broadcaster errors must not break routing
    }
  }

  // @all nudge — when a human types @all, wake every agent in the team in parallel.
  // Guards:
  //   1. Skip if the sender is itself an agent (prevents agent→agent nudge loops).
  //   2. Skip if the sender is the manager gateway nick (prevents status-broadcaster
  //      "@all statuses..." messages from FIFO-nudging all agents every 5 minutes).
  if (ALL_RE.test(text)) {
    const team = getTeam(teamId)
    const agents = team?.agents ?? []
    const agentIds = new Set(agents.map((a) => a.id))
    const gatewayNick = team ? `manager-${team.name}` : null
    if (!agentIds.has(nick) && nick !== gatewayNick) {
      Promise.allSettled(
        agents.map((a) =>
          writeFifo(teamId, a.id, `nudge @all from ${nick} in ${channel}: ${text}`)
        )
      )
    }
  }
}

/**
 * Register a WebSocket broadcast function. Called by the WS layer at startup.
 * The function receives a single message entry and is responsible for fanning
 * out to connected clients.
 */
export function registerBroadcaster(fn) {
  wsBroadcasters.add(fn)
  return () => wsBroadcasters.delete(fn)
}

/**
 * Read buffered messages for a channel by its UUID.
 *
 * @param {string} channelId - channel UUID
 * @param {object} opts
 * @param {number} [opts.limit=100] - max messages to return
 * @param {string} [opts.since] - ISO timestamp; only return messages after this
 * @returns {object[]}
 */
export function readMessages(channelId, { limit = 100, since } = {}) {
  let msgs = getBuffer(channelId)
  if (since) {
    msgs = msgs.filter((m) => m.time > since)
  }
  return msgs.slice(-limit)
}

/**
 * List configured channels for a team.
 * Returns the team's channels array from the store, or [] if the team is unknown.
 */
export function listChannels(teamId) {
  return getTeam(teamId)?.channels ?? []
}

/**
 * Clear all buffered messages for a team (call on team teardown).
 */
export function clearTeamBuffers(teamId) {
  const channels = listTeamChannels(teamId)
  for (const ch of channels) {
    buffers.delete(ch.id)
  }
}
