#!/usr/bin/env node
/**
 * test/irc-check.mjs — IRC response verifier for smoke tests
 *
 * Connects to Ergo as an observer, joins a channel, and waits for a PRIVMSG
 * that passes the filter. Exits 0 if a qualifying response is received within
 * the timeout, exits 1 if it times out.
 *
 * Usage (run from manager/ so irc-framework resolves from node_modules):
 *   node ../test/irc-check.mjs <host> <port> <channel> <timeout_ms> [observer_nick] [filter_nick]
 *
 * Arguments:
 *   host          — IRC server hostname
 *   port          — IRC server port
 *   channel       — channel to join (e.g. '#main')
 *   timeout_ms    — how long to wait in milliseconds (default: 60000)
 *   observer_nick — nick to use when connecting (default: 'smoke-checker')
 *   filter_nick   — if given, only messages FROM this nick count as a pass.
 *                   Without this arg, any PRIVMSG from any non-observer nick
 *                   counts (backward-compatible default).
 *
 * Example:
 *   cd manager && node ../test/irc-check.mjs localhost 16667 '#main' 60000 smoke-checker
 *   cd manager && node ../test/irc-check.mjs localhost 16667 '#main' 60000 smoke-checker abc123-agent-id
 */

import IRC from 'irc-framework'

const [host, portStr, channel, timeoutMsStr, observerNick = 'smoke-checker', filterNick] =
  process.argv.slice(2)

if (!host || !portStr || !channel) {
  console.error('Usage: irc-check.mjs <host> <port> <channel> <timeout_ms> [observer_nick] [filter_nick]')
  process.exit(2)
}

const port = parseInt(portStr, 10)
const timeoutMs = parseInt(timeoutMsStr || '60000', 10)

const client = new IRC.Client()

client.requestCap(['message-tags', 'server-time'])

client.connect({ host, port, nick: observerNick, username: observerNick, gecos: 'smoke test observer', auto_reconnect: false })

const timer = setTimeout(() => {
  console.error(`[irc-check] TIMEOUT — no qualifying response in ${channel} within ${timeoutMs}ms`)
  if (filterNick) {
    console.error(`[irc-check] Expected message from nick: ${filterNick}`)
  }
  client.quit()
  process.exit(1)
}, timeoutMs)

client.on('registered', () => {
  client.join(channel)
})

client.on('privmsg', (event) => {
  if (event.target !== channel) return
  if (event.nick === observerNick) return

  // If a specific nick filter is set, only accept messages from that nick.
  if (filterNick && event.nick !== filterNick) {
    console.log(`[irc-check] Ignored message from <${event.nick}> (waiting for <${filterNick}>)`)
    return
  }

  clearTimeout(timer)
  console.log(`[irc-check] PASS — got response from <${event.nick}>: ${event.message}`)
  client.quit()
  process.exit(0)
})

client.on('error', (err) => {
  console.error(`[irc-check] IRC error: ${err.message || err}`)
  clearTimeout(timer)
  client.quit()
  process.exit(1)
})
