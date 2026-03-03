/**
 * Ergo IRC channel management.
 * Manages channels on the Ergo IRC server running in the account-manager network.
 */

const ERGO_HOST = process.env.ERGO_HOST || 'ergo'
const ERGO_PORT = parseInt(process.env.ERGO_PORT || '6667', 10)

// In-memory store of messages indexed by channel and agent subscriptions.
// MVP: simple in-memory buffer. Replace with persistent store in Phase 2.
const messageBuffer = new Map() // channel → [{ from, text, timestamp }]

/**
 * Create a channel on the Ergo IRC server.
 * In MVP, channels are created by joining — Ergo auto-creates on join.
 * @param {string} name - channel name (with or without #)
 * @returns {Promise<{ name: string }>}
 */
export async function createChannel(name) {
  const channelName = name.startsWith('#') ? name : `#${name}`
  if (!messageBuffer.has(channelName)) {
    messageBuffer.set(channelName, [])
  }
  // TODO: Join the channel via the IRC gateway client to ensure it exists on Ergo
  return { name: channelName }
}

/**
 * Get messages from a channel since a given timestamp.
 * @param {string} agentId
 * @param {string} since - ISO timestamp
 * @returns {{ messages: Array, cursor: string }}
 */
export function getMessages(agentId, since) {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 10_000)
  const now = new Date().toISOString()

  // Collect messages from all channels since the given timestamp
  const messages = []
  for (const [channel, msgs] of messageBuffer.entries()) {
    for (const msg of msgs) {
      if (new Date(msg.timestamp) > sinceDate) {
        messages.push({ channel, ...msg })
      }
    }
  }
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  return { messages, cursor: now }
}

/**
 * Buffer an incoming IRC message (called by the IRC gateway when a message arrives).
 * @param {string} channel
 * @param {string} from
 * @param {string} text
 */
export function bufferMessage(channel, from, text) {
  if (!messageBuffer.has(channel)) {
    messageBuffer.set(channel, [])
  }
  const msgs = messageBuffer.get(channel)
  msgs.push({ from, text, timestamp: new Date().toISOString() })
  // Keep last 500 messages per channel
  if (msgs.length > 500) msgs.splice(0, msgs.length - 500)
}
