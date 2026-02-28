'use client'

import { useState, useEffect, useRef } from 'react'
import { useTeamWS } from './TeamWSProvider'
import IrcMessageInput from './IrcMessageInput'

// Deterministic color per nick
const NICK_COLORS = ['#3fb950', '#79c0ff', '#d2a8ff', '#ffa657', '#ff7b72', '#a5d6ff']
function nickColor(nick) {
  let h = 0
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) & 0xffff
  return NICK_COLORS[h % NICK_COLORS.length]
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return '--:--:--'
  }
}

const MAX_MESSAGES = 500

export default function IrcFeed({ teamId, channels }) {
  const { status, addListener } = useTeamWS()
  const [messages, setMessages] = useState([])
  const bottomRef = useRef(null)

  // Register IRC message listener via the shared WS context
  useEffect(() => {
    if (!addListener) return
    return addListener('message', (msg) => {
      setMessages(prev => {
        const next = [...prev, msg]
        return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
      })
    })
  }, [addListener])

  // Clear message log when switching teams
  useEffect(() => {
    setMessages([])
  }, [teamId])

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const statusColor =
    status === 'connected'  ? 'text-[#3fb950]' :
    status === 'connecting' ? 'text-[#79c0ff]' :
    'text-[#8b949e]'

  const statusDot =
    status === 'connected'  ? 'bg-[#3fb950] animate-pulse' :
    status === 'connecting' ? 'bg-[#79c0ff] animate-pulse' :
    'bg-[#8b949e]'

  return (
    <div className="flex flex-col h-full bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#30363d] shrink-0">
        <span className="text-sm font-semibold text-white">IRC Feed</span>
        <span className={`flex items-center gap-1.5 text-xs font-mono ${statusColor}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          {status}
        </span>
      </div>

      {/* Message log */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 font-mono text-xs">
        {messages.length === 0 ? (
          <p className="text-[#8b949e] text-center py-8">
            {status === 'connecting' ? 'Connecting…' :
             status === 'connected'  ? 'No messages yet' :
             'Disconnected'}
          </p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="flex gap-2 leading-relaxed min-w-0">
              <span className="text-[#8b949e] shrink-0 tabular-nums">{formatTime(msg.time)}</span>
              <span className="text-[#8b949e] shrink-0">{msg.channel}</span>
              <span
                style={{ color: nickColor(msg.nick ?? '') }}
                className="shrink-0 font-semibold"
              >
                {msg.nick}
              </span>
              <span className="text-[#8b949e] shrink-0">→</span>
              <span className="text-[#e6edf3] break-words min-w-0">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <IrcMessageInput teamId={teamId} channels={channels} wsStatus={status} />
    </div>
  )
}
