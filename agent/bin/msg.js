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
  const cursors = await loadHistory()
  const results = new Map(channels.map((ch) => [ch, []]))

  // Fetch CHATHISTORY using batch events from command_handler
  await new Promise((resolve) => {
    const pending = new Set(channels)
    let resolved = false

    const done = () => {
      if (resolved) return
      resolved = true
      client.command_handler.removeListener('batch end chathistory', handler)
      resolve()
    }

    const handler = (batch) => {
      const ch = batch.params[0]
      if (!pending.has(ch)) return

      const messages = []
      for (const cmd of batch.commands) {
        if (cmd.command !== 'PRIVMSG') continue
        if (cmd.nick === 'HistServ') continue
        messages.push({
          ts: cmd.getTag('time') || new Date().toISOString(),
          nick: cmd.nick,
          text: cmd.params[cmd.params.length - 1],
          msgid: cmd.getTag('msgid') || null,
        })
      }
      results.set(ch, messages)
      pending.delete(ch)
      if (pending.size === 0) done()
    }

    client.command_handler.on('batch end chathistory', handler)

    for (const ch of channels) {
      const cursor = cursors[ch]
      if (cursor?.msgid) {
        client.raw(`CHATHISTORY AFTER ${ch} msgid=${cursor.msgid} 500`)
      } else {
        client.raw(`CHATHISTORY LATEST ${ch} * 500`)
      }
    }

    setTimeout(done, 500)
  })

  let totalNew = 0

  for (const [ch, msgs] of results) {
    if (msgs.length > 0) {
      console.log(`\n── ${ch} (${msgs.length} new) ──`)
      for (const m of msgs) {
        const time = m.ts ? m.ts.replace(/.*T/, '').replace(/\.\d+Z/, '') : '??:??'
        console.log(`  [${time}] <${m.nick}> ${m.text}`)
      }
      const last = msgs[msgs.length - 1]
      cursors[ch] = { msgid: last.msgid, ts: last.ts }
      totalNew += msgs.length
    }
  }

  if (totalNew === 0) {
    console.log('No new messages.')
  }

  await saveHistory(cursors)
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
