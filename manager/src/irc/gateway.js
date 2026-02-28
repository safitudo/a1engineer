import IRC from 'irc-framework'
import { EventEmitter } from 'events'
import { DEFAULT_CHANNELS } from '../store/teams.js'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const RECONNECT_FACTOR = 2

/**
 * IrcGateway — one IRC client per team.
 *
 * Connects to ergo-{teamName}:6667 as manager-{teamName}, joins all 5 channels,
 * emits 'message' events for downstream routing, and handles reconnection with
 * exponential backoff.
 *
 * Events:
 *   message  { teamId, teamName, channel, nick, text, time }
 *   connect  { teamId, teamName }
 *   disconnect { teamId, teamName }
 */
export class IrcGateway extends EventEmitter {
  #teamId
  #teamName
  #host
  #port
  #channels
  #client
  #reconnectDelay = RECONNECT_BASE_MS
  #destroyed = false
  #reconnectTimer = null

  constructor({ teamId, teamName, host, port = 6667, channels = DEFAULT_CHANNELS }) {
    super()
    this.#teamId = teamId
    this.#teamName = teamName
    this.#host = host ?? `ergo-${teamName}`
    this.#port = port
    this.#channels = channels
  }

  get channels() {
    return this.#channels
  }

  connect() {
    if (this.#destroyed) return
    this.#client = new IRC.Client()
    this.#client.connect({
      host: this.#host,
      port: this.#port,
      nick: `manager-${this.#teamName}`,
      username: 'manager',
      realname: `A1 Engineer Manager — team ${this.#teamName}`,
    })

    this.#client.on('registered', () => {
      this.#reconnectDelay = RECONNECT_BASE_MS
      for (const channel of this.#channels) {
        this.#client.join(channel)
      }
      this.emit('connect', { teamId: this.#teamId, teamName: this.#teamName })
    })

    this.#client.on('message', (event) => {
      this.emit('message', {
        teamId: this.#teamId,
        teamName: this.#teamName,
        channel: event.target,
        nick: event.nick,
        text: event.message,
        time: new Date().toISOString(),
      })
    })

    this.#client.on('socket close', () => {
      this.emit('disconnect', { teamId: this.#teamId, teamName: this.#teamName })
      if (!this.#destroyed) this.#scheduleReconnect()
    })

    this.#client.on('close', () => {
      if (!this.#destroyed) this.#scheduleReconnect()
    })
  }

  #scheduleReconnect() {
    clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = setTimeout(() => {
      this.connect()
    }, this.#reconnectDelay)
    this.#reconnectDelay = Math.min(this.#reconnectDelay * RECONNECT_FACTOR, RECONNECT_MAX_MS)
  }

  /** Send a message to a channel via IRC */
  say(channel, text) {
    if (!this.#client) throw new Error('IRC client not connected')
    this.#client.say(channel, text)
  }

  destroy() {
    this.#destroyed = true
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
    if (this.#client) {
      this.#client.quit('Manager shutting down')
      this.#client = null
    }
    this.removeAllListeners()
  }
}

// Registry of active gateways keyed by teamId
const gateways = new Map()

/**
 * Create and connect a gateway for a team. Idempotent — if one already exists
 * it is returned as-is.
 */
export function createGateway(team, { onMessage } = {}) {
  if (gateways.has(team.id)) return gateways.get(team.id)

  const gw = new IrcGateway({
    teamId: team.id,
    teamName: team.name,
    host: team.ergo?.host,
    port: team.ergo?.port,
    channels: team.channels ?? DEFAULT_CHANNELS,
  })

  if (onMessage) gw.on('message', onMessage)

  gw.connect()
  gateways.set(team.id, gw)
  return gw
}

/**
 * Destroy the gateway for a team and remove it from the registry.
 */
export function destroyGateway(teamId) {
  const gw = gateways.get(teamId)
  if (!gw) return
  gw.destroy()
  gateways.delete(teamId)
}

export function getGateway(teamId) {
  return gateways.get(teamId) ?? null
}

export function listGateways() {
  return Array.from(gateways.entries()).map(([teamId, gw]) => ({ teamId, gateway: gw }))
}
