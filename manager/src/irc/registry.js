/**
 * GatewayRegistry — abstraction layer between Manager and transport adapters.
 *
 * Adapters implement:
 *   getGateway(channelId)            → gateway instance or null
 *   broadcast(channelId, name, msg)  → void
 *
 * The IRC adapter is registered by default and wraps gateway.js.
 */
import { getChannel } from '../store/channels.js'

const adapters = new Map()

/**
 * Register a named adapter factory.
 * @param {string} type - Channel type (e.g. 'irc', 'slack', 'discord')
 * @param {{ getGateway(channelId): any, broadcast(channelId, name, msg): void }} adapter
 */
export function registerAdapter(type, adapter) {
  adapters.set(type, adapter)
}

/**
 * Look up the gateway for a channel by its UUID.
 * Returns null if the channel doesn't exist or no adapter is registered for its type.
 */
export function getGateway(channelId) {
  const ch = getChannel(channelId)
  if (!ch) return null
  const adapter = adapters.get(ch.type)
  return adapter?.getGateway(channelId) ?? null
}

/**
 * Broadcast a message to a channel by its UUID.
 * Throws if the channel or adapter is not found.
 */
export function broadcast(channelId, msg) {
  const ch = getChannel(channelId)
  if (!ch) throw new Error(`Channel ${channelId} not found`)
  const adapter = adapters.get(ch.type)
  if (!adapter) throw new Error(`No adapter registered for type '${ch.type}'`)
  adapter.broadcast(channelId, ch.name, msg)
}

/** Remove all registered adapters — used in tests. */
export function _clearAdapters() {
  adapters.clear()
}
