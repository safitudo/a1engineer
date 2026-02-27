'use client'

import { useState, useEffect, useRef } from 'react'

const API_BASE = ''

/**
 * AgentConsole — Phase 2 read-only terminal view.
 * Polls GET /api/teams/:teamId/agents/:agentId/screen every 2s
 * and renders the tmux capture output in a terminal-style div.
 *
 * Props: { teamId, agentId, onClose }
 */
export default function AgentConsole({ teamId, agentId, onClose }) {
  const [lines, setLines] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/teams/${teamId}/agents/${agentId}/screen`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (active) {
          setLines(data.lines ?? [])
          setError(null)
          setLoading(false)
        }
      } catch (err) {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    poll()
    const interval = setInterval(poll, 2000)
    return () => { active = false; clearInterval(interval) }
  }, [teamId, agentId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="bg-[#010409] border border-[#30363d] rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
        <span className="text-xs font-mono text-[#8b949e] truncate">
          {agentId}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#3fb950]">live</span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[#8b949e] hover:text-white text-xs px-1"
              title="Close console"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div className="flex-1 overflow-y-auto p-3 max-h-80 min-h-[160px]">
        {loading && (
          <div className="text-[#8b949e] text-xs font-mono animate-pulse">
            Connecting to agent…
          </div>
        )}
        {error && (
          <div className="text-[#f85149] text-xs font-mono">
            Error: {error}
          </div>
        )}
        {!loading && !error && lines.length === 0 && (
          <div className="text-[#8b949e] text-xs font-mono italic">
            No output captured.
          </div>
        )}
        <pre className="text-xs font-mono text-[#c9d1d9] whitespace-pre-wrap break-all leading-relaxed">
          {lines.join('\n')}
        </pre>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
