#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { config } from '../lib/config.js'
import { connect, disconnect } from '../lib/connection.js'

const HISTORY_FILE = join(homedir(), '.chathistory')

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

async function sendMessage(channel, text) {
  const client = await connect({ ...config, channels: [channel] })
  client.say(channel, text)
  console.log(`[${config.nick}] → ${channel}: ${text}`)
  // Brief delay to ensure message is sent before disconnect
  await new Promise((r) => setTimeout(r, 300))
  await disconnect(client)
}

async function readMessages(channel) {
  const channels = channel ? [channel] : config.channels
  const client = await connect({ ...config, channels })
  const history = await loadHistory()
  const results = new Map()

  for (const ch of channels) {
    results.set(ch, [])
  }

  // Request CHATHISTORY for each channel
  await new Promise((resolve) => {
    let pending = channels.length

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

    for (const ch of channels) {
      const since = history[ch]
      const ref = since ? `timestamp=${since}` : '*'
      client.raw(`CHATHISTORY LATEST ${ch} ${ref} 50`)
    }

    // Fallback if no batch events fire
    setTimeout(resolve, 3000)
  })

  // Filter to only new messages and print
  const now = new Date().toISOString()
  let hasOutput = false

  for (const [ch, msgs] of results) {
    const since = history[ch]
    const newMsgs = since
      ? msgs.filter((m) => m.time > since)
      : msgs

    if (newMsgs.length > 0) {
      hasOutput = true
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

    // Update history to latest timestamp
    if (msgs.length > 0) {
      history[ch] = msgs[msgs.length - 1].time
    } else if (!history[ch]) {
      history[ch] = now
    }
  }

  if (!hasOutput) {
    console.log('No new messages.')
  }

  await saveHistory(history)
  await disconnect(client)
}

// --- CLI ---
const [cmd, ...args] = process.argv.slice(2)

try {
  if (cmd === 'send') {
    const [channel, ...words] = args
    if (!channel || words.length === 0) {
      console.error("Usage: msg send '#channel' \"message\"")
      process.exit(1)
    }
    await sendMessage(channel, words.join(' '))
  } else if (cmd === 'read') {
    await readMessages(args[0] || null)
  } else {
    console.error('Usage: msg <send|read> [args]')
    process.exit(1)
  }
} catch (err) {
  console.error(`msg error: ${err.message}`)
  process.exit(1)
}
