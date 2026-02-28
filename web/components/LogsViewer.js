'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const MAX_LINES = 1000

export default function LogsViewer({ teamId }) {
  const [lines, setLines] = useState([])
  const [filter, setFilter] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const esRef = useRef(null)
  const autoScrollRef = useRef(true)

  const startStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setLines([])
    setError(null)
    setStreaming(true)

    const es = new EventSource(`/api/teams/${teamId}/logs?follow=true&tail=100`)
    esRef.current = es

    es.onmessage = (e) => {
      if (e.data === 'end') return
      setLines(prev => {
        const next = [...prev, e.data]
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
      })
    }

    es.addEventListener('done', () => {
      setStreaming(false)
      es.close()
    })

    es.onerror = () => {
      setError('Stream disconnected.')
      setStreaming(false)
      es.close()
    }
  }, [teamId])

  const stopStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setStreaming(false)
  }, [])

  // Auto-start on mount
  useEffect(() => {
    startStream()
    return () => {
      if (esRef.current) esRef.current.close()
    }
  }, [startStream])

  // Auto-scroll when new lines arrive
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [lines])

  const filtered = filter
    ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
    : lines

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col" style={{ height: '320px' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#30363d] shrink-0">
        <span className="text-xs font-mono font-semibold text-[#8b949e] uppercase tracking-wider flex-1">
          Docker Logs
        </span>
        <input
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-0.5 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#8b949e] w-32"
        />
        <button
          onClick={streaming ? stopStream : startStream}
          className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
            streaming
              ? 'border-[#f85149]/50 text-[#f85149] hover:bg-[#f85149]/10'
              : 'border-[#3fb950]/50 text-[#3fb950] hover:bg-[#3fb950]/10'
          }`}
        >
          {streaming ? 'Stop' : 'Start'}
        </button>
      </div>

      {/* Log output */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs text-[#e6edf3] leading-relaxed"
        onScroll={e => {
          const el = e.currentTarget
          autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {error && (
          <div className="text-[#f85149] mb-1">{error}</div>
        )}
        {filtered.length === 0 && !error && (
          <div className="text-[#484f58]">{streaming ? 'Waiting for logs…' : 'No logs.'}</div>
        )}
        {filtered.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            <LogLine text={line} />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// Colorize service-prefix portion (e.g. "agent-dev-1  | ...")
function LogLine({ text }) {
  const match = text.match(/^([^\s|]+\s*\|\s*)(.*)$/)
  if (!match) return <span className="text-[#8b949e]">{text}</span>
  return (
    <>
      <span className="text-[#79c0ff]">{match[1]}</span>
      <span>{match[2]}</span>
    </>
  )
}
