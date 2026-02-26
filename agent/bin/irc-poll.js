#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { config } from '../lib/config.js'
import { connect, disconnect } from '../lib/connection.js'

const HISTORY_FILE = join(homedir(), '.chathistory')
const POLL_TIMEOUT = 1500 // ms — must exit fast for PostToolUse hook

async function loadHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf8'))
  } catch {
    return {}
  }
}

async function saveHistory(history) {
  await writeFile(HISTORY_FILE, JSON.stringify(history), 'utf8')
}

async function poll() {
  const client = await connect(config, { timeout: POLL_TIMEOUT })
  const history = await loadHistory()
  const results = new Map()

  for (const ch of config.channels) {
    results.set(ch, [])
  }

  await new Promise((resolve) => {
    let pending = config.channels.length

    client.on('batch end', (batch) => {
      if (batch.type === 'chathistory') {
        const msgs = (batch.messages || []).map((m) => ({
          time: m.tags?.time || new Date().toISOString(),
          nick: m.nick,
          text: m.params?.[1] || m.message || '',
          channel: m.target || m.params?.[0],
        }))
        for (const msg of msgs) {
          const ch = msg.channel
          if (results.has(ch)) {
            results.get(ch).push(msg)
          }
        }
        pending--
        if (pending <= 0) resolve()
      }
    })

    for (const ch of config.channels) {
      const since = history[ch]
      const ref = since ? `timestamp=${since}` : '*'
      client.raw(`CHATHISTORY LATEST ${ch} ${ref} 50`)
    }

    setTimeout(resolve, 1000)
  })

  const now = new Date().toISOString()
  let hasOutput = false

  for (const [ch, msgs] of results) {
    const since = history[ch]
    const newMsgs = since
      ? msgs.filter((m) => m.time > since)
      : msgs

    if (newMsgs.length > 0) {
      if (!hasOutput) hasOutput = true
      console.log(`── ${ch} (${newMsgs.length} new) ──`)
      for (const m of newMsgs) {
        const ts = new Date(m.time).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
        console.log(`  [${ts}] <${m.nick}> ${m.text}`)
      }
    }

    if (msgs.length > 0) {
      history[ch] = msgs[msgs.length - 1].time
    } else if (!history[ch]) {
      history[ch] = now
    }
  }

  await saveHistory(history)
  await disconnect(client)
}

// Promise.race with timeout — never block the agent
try {
  await Promise.race([
    poll(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), POLL_TIMEOUT)
    ),
  ])
} catch {
  // Swallow all errors — exit 0 always, never block the agent
}
