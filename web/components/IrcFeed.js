'use client'

import { useState, useEffect, useRef } from 'react'

// Manager WebSocket URL — Next.js rewrites don't proxy WS upgrades,
// so connect directly to the manager. Override with NEXT_PUBLIC_WS_URL in production.
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080'

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

export default function IrcFeed({ teamId }) {
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('connecting') // 'connecting' | 'connected' | 'disconnected'
  const bottomRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!teamId) return

    setStatus('connecting')
    setMessages([])

    let cancelled = false

    // Fetch WS auth token from server (bridges httpOnly cookie)
    async function connect() {
      let token = ''
      try {
        const res = await fetch('/api/auth/ws-token')
        if (res.ok) {
          const data = await res.json()
          token = data.token ?? ''
        }
      } catch { /* proceed without token — server will reject if auth required */ }

      if (cancelled) return

      const url = token ? `${WS_BASE}/ws?token=${encodeURIComponent(token)}` : `${WS_BASE}/ws`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', teamId }))
      }

      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }

        if (msg.type === 'subscribed') {
          setStatus('connected')
        } else if (msg.type === 'message') {
          setMessages(prev => {
            const next = [...prev, msg]
            return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
          })
        }
        // heartbeat / agent_status not shown in this feed
      }

      ws.onerror = () => setStatus('disconnected')
      ws.onclose = () => setStatus('disconnected')
    }

    connect()

    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [teamId])

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const statusColor =
    status === 'connected' ? 'text-[#3fb950]' :
    status === 'connecting' ? 'text-[#79c0ff]' :
    'text-[#8b949e]'

  const statusDot =
    status === 'connected' ? 'bg-[#3fb950] animate-pulse' :
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
             status === 'connected' ? 'No messages yet' :
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
    </div>
  )
}
