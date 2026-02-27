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
  const cursors = await loadHistory()
  const results = new Map(config.channels.map((ch) => [ch, []]))

  // Fetch CHATHISTORY using command_handler batch events
  await new Promise((resolve) => {
    const pending = new Set(config.channels)
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

    for (const ch of config.channels) {
      const cursor = cursors[ch]
      if (cursor?.msgid) {
        client.raw(`CHATHISTORY AFTER ${ch} msgid=${cursor.msgid} 500`)
      } else {
        client.raw(`CHATHISTORY LATEST ${ch} * 500`)
      }
    }

    setTimeout(done, 500)
  })

  const lines = []

  for (const [ch, msgs] of results) {
    if (msgs.length > 0) {
      lines.push(`── ${ch} (${msgs.length} new) ──`)
      for (const m of msgs) {
        const time = m.ts ? m.ts.replace(/.*T/, '').replace(/\.\d+Z/, '') : '??:??'
        lines.push(`  [${time}] <${m.nick}> ${m.text}`)
      }
      const last = msgs[msgs.length - 1]
      cursors[ch] = { msgid: last.msgid, ts: last.ts }
    }
  }

  await saveHistory(cursors)
  await disconnect(client)

  // PostToolUse hooks require JSON with additionalContext to be visible to the agent
  if (lines.length > 0) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: lines.join('\n'),
      },
    }))
  }
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
