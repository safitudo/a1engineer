#!/usr/bin/env node
/**
 * test/irc-check.mjs — IRC response verifier for smoke tests
 *
 * Connects to Ergo as an observer, joins a channel, and waits for any
 * PRIVMSG from a nick other than itself. Exits 0 if a response is received
 * within the timeout, exits 1 if it times out.
 *
 * Usage (run from manager/ so irc-framework resolves from node_modules):
 *   node ../test/irc-check.mjs <host> <port> <channel> <timeout_ms> [observer_nick]
 *
 * Example:
 *   cd manager && node ../test/irc-check.mjs localhost 16667 '#main' 60000 smoke-checker
 */

import IRC from 'irc-framework'

const [host, portStr, channel, timeoutMsStr, observerNick = 'smoke-checker'] = process.argv.slice(2)

if (!host || !portStr || !channel) {
  console.error('Usage: irc-check.mjs <host> <port> <channel> <timeout_ms> [observer_nick]')
  process.exit(2)
}

const port = parseInt(portStr, 10)
const timeoutMs = parseInt(timeoutMsStr || '60000', 10)

const client = new IRC.Client()

client.requestCap(['message-tags', 'server-time'])

client.connect({ host, port, nick: observerNick, username: observerNick, gecos: 'smoke test observer', auto_reconnect: false })

const timer = setTimeout(() => {
  console.error(`[irc-check] TIMEOUT — no agent response in ${channel} within ${timeoutMs}ms`)
  client.quit()
  process.exit(1)
}, timeoutMs)

client.on('registered', () => {
  client.join(channel)
})

client.on('privmsg', (event) => {
  // Any message in the target channel from a nick that isn't us
  if (event.target === channel && event.nick !== observerNick) {
    clearTimeout(timer)
    console.log(`[irc-check] PASS — got response from <${event.nick}>: ${event.message}`)
    client.quit()
    process.exit(0)
  }
})

client.on('error', (err) => {
  console.error(`[irc-check] IRC error: ${err.message || err}`)
  clearTimeout(timer)
  client.quit()
  process.exit(1)
})
