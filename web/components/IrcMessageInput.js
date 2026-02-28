'use client'

import { useState } from 'react'

const DEFAULT_CHANNELS = ['#main', '#tasks', '#code', '#testing', '#merges']

export default function IrcMessageInput({ teamId, channels = DEFAULT_CHANNELS, wsStatus }) {
  const [channel, setChannel] = useState(channels[0] ?? '#main')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  const inputDisabled = wsStatus !== 'connected' || sending

  async function sendMessage() {
    const trimmed = text.trim()
    if (!trimmed || inputDisabled) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(
        `/api/teams/${teamId}/channels/${encodeURIComponent(channel.slice(1))}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setText('')
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="shrink-0 border-t border-[#30363d] bg-[#161b22] px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <select
          value={channel}
          onChange={e => { setChannel(e.target.value); setSendError(null) }}
          disabled={inputDisabled}
          className="bg-[#0d1117] border border-[#30363d] text-[#79c0ff] font-mono text-xs rounded px-2 py-1 shrink-0 disabled:opacity-50 focus:outline-none focus:border-[#388bfd]"
        >
          {channels.map(ch => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
        <span className="text-[#8b949e] font-mono text-xs shrink-0">as: web-user</span>
        <input
          type="text"
          value={text}
          onChange={e => { setText(e.target.value); setSendError(null) }}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          placeholder={wsStatus !== 'connected' ? 'Disconnected' : 'Type a message…'}
          className="flex-1 bg-[#0d1117] border border-[#30363d] text-[#e6edf3] font-mono text-xs rounded px-2.5 py-1 placeholder-[#8b949e] disabled:opacity-50 focus:outline-none focus:border-[#388bfd] min-w-0"
        />
        <button
          onClick={sendMessage}
          disabled={inputDisabled || !text.trim()}
          className="shrink-0 bg-[#238636] hover:bg-[#2ea043] text-white font-mono text-xs px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {sendError && (
        <p className="text-[#f85149] font-mono text-xs px-1">{sendError}</p>
      )}
    </div>
  )
}
