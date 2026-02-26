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

const TAG_RE = /^\[([A-Z]+)\]\s*(.*)/

// Ring buffer per (teamId, channel), capped at MAX_MESSAGES entries
const MAX_MESSAGES = 500
const buffers = new Map() // key: `${teamId}:${channel}`

// WebSocket broadcast callbacks registered by the WS layer
const wsBroadcasters = new Set()

function bufferKey(teamId, channel) {
  return `${teamId}:${channel}`
}

function getBuffer(teamId, channel) {
  const key = bufferKey(teamId, channel)
  if (!buffers.has(key)) buffers.set(key, [])
  return buffers.get(key)
}

function appendToBuffer(teamId, channel, entry) {
  const buf = getBuffer(teamId, channel)
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
 * @param {object} event - { teamId, teamName, channel, nick, text, time }
 */
export function routeMessage(event) {
  const { teamId, channel, text, time } = event

  const structured = parseTag(text)
  const entry = {
    ...event,
    tag: structured?.tag ?? null,
    tagBody: structured?.body ?? null,
  }

  appendToBuffer(teamId, channel, entry)

  for (const broadcast of wsBroadcasters) {
    try {
      broadcast(entry)
    } catch {
      // Individual broadcaster errors must not break routing
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
 * Read buffered messages for a team's channel.
 *
 * @param {string} teamId
 * @param {string} channel - e.g. '#main'
 * @param {object} opts
 * @param {number} [opts.limit=100] - max messages to return
 * @param {string} [opts.since] - ISO timestamp; only return messages after this
 * @returns {object[]}
 */
export function readMessages(teamId, channel, { limit = 100, since } = {}) {
  let msgs = getBuffer(teamId, channel)
  if (since) {
    msgs = msgs.filter((m) => m.time > since)
  }
  return msgs.slice(-limit)
}

/**
 * List all channels that have buffered messages for a team.
 */
export function listChannels(teamId) {
  const prefix = `${teamId}:`
  const channels = []
  for (const key of buffers.keys()) {
    if (key.startsWith(prefix)) {
      channels.push(key.slice(prefix.length))
    }
  }
  return channels
}

/**
 * Clear all buffered messages for a team (call on team teardown).
 */
export function clearTeamBuffers(teamId) {
  const prefix = `${teamId}:`
  for (const key of [...buffers.keys()]) {
    if (key.startsWith(prefix)) buffers.delete(key)
  }
}
