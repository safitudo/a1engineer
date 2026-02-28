'use client'

import { useState, useEffect, useCallback } from 'react'

const POLL_INTERVAL = 20_000 // 20 seconds

function timeAgo(ts) {
  if (!ts) return 'never'
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

// Parse diff stat summary line: "3 files changed, 45 insertions(+), 12 deletions(-)"
function DiffStatLine({ line }) {
  if (!line) return null
  const parts = line.split(',').map(s => s.trim())
  return (
    <div className="text-xs font-mono leading-relaxed">
      {parts.map((part, i) => {
        if (part.includes('insertion')) {
          return <span key={i} className="text-[#3fb950]">{(i > 0 ? ' ' : '') + part}</span>
        }
        if (part.includes('deletion')) {
          return <span key={i} className="text-[#f85149]">{(i > 0 ? ' ' : '') + part}</span>
        }
        return <span key={i} className="text-[#8b949e]">{(i > 0 ? ' ' : '') + part}</span>
      })}
    </div>
  )
}

// Parse diff stat per-file lines: " src/foo.js | 3 ++-"
function DiffFileLines({ diffStat }) {
  if (!diffStat) return null
  const lines = diffStat.split('\n').filter(Boolean)
  // Last line is summary; file lines have "|"
  const fileLines = lines.filter(l => l.includes('|'))
  const summary = lines.find(l => !l.includes('|') && l.trim())
  return (
    <div className="space-y-0.5">
      {fileLines.map((line, i) => {
        const [file, rest] = line.split('|')
        return (
          <div key={i} className="flex items-center gap-2 text-xs font-mono">
            <span className="text-[#8b949e] truncate max-w-[180px]" title={file?.trim()}>{file?.trim()}</span>
            <span className="text-[#30363d]">|</span>
            <span className="text-[#e6edf3]">{rest?.trim()}</span>
          </div>
        )
      })}
      {summary && <DiffStatLine line={summary} />}
    </div>
  )
}

// git status --short output: "M  src/foo.js", "A  src/new.js", etc.
function WorkingTreeStatus({ status }) {
  if (!status) return null
  const lines = status.split('\n').filter(Boolean)
  if (lines.length === 0) return null

  const colorFor = (xy) => {
    const code = xy?.trim()
    if (!code) return 'text-[#8b949e]'
    if (code.startsWith('A')) return 'text-[#3fb950]'
    if (code.startsWith('D')) return 'text-[#f85149]'
    if (code.startsWith('R')) return 'text-[#d29922]'
    if (code.startsWith('?')) return 'text-[#8b949e]'
    return 'text-[#d29922]' // M = modified
  }

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const xy = line.slice(0, 2)
        const file = line.slice(3)
        return (
          <div key={i} className="flex items-center gap-2 text-xs font-mono">
            <span className={`w-4 shrink-0 font-bold ${colorFor(xy)}`}>{xy.trim() || '?'}</span>
            <span className="text-[#e6edf3] truncate">{file}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function AgentActivity({ teamId, agentId }) {
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)

  const fetchActivity = useCallback(() => {
    fetch(`/api/teams/${teamId}/agents/${agentId}/activity`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setActivity(data)
        setError(null)
        setLastFetched(Date.now())
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [teamId, agentId])

  useEffect(() => {
    fetchActivity()
    const t = setInterval(fetchActivity, POLL_INTERVAL)
    return () => clearInterval(t)
  }, [fetchActivity])

  const isEmpty = activity && !activity.branch && !activity.recentCommits?.length && !activity.diffStat && !activity.status

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 text-xs font-mono space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[#8b949e] text-[10px] uppercase tracking-wider">Activity</span>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[#8b949e] text-[10px]">checked {timeAgo(lastFetched)}</span>
          )}
          <button
            onClick={fetchActivity}
            className="text-[10px] text-[#8b949e] hover:text-[#e6edf3] transition-colors px-1.5 py-0.5 rounded border border-[#30363d] hover:border-[#8b949e]/50"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-[#8b949e] animate-pulse">loading activity…</div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-[#f85149] text-xs">
          failed to load: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && isEmpty && (
        <div className="text-[#8b949e] italic">no git activity yet</div>
      )}

      {/* Activity data */}
      {!loading && !error && activity && !isEmpty && (
        <div className="space-y-4">

          {/* Branch */}
          {activity.branch && (
            <div>
              <div className="text-[#8b949e] text-[10px] mb-1">branch</div>
              <span className="text-[#79c0ff] bg-[#79c0ff]/10 border border-[#79c0ff]/20 px-2 py-0.5 rounded-full text-xs">
                {activity.branch}
              </span>
            </div>
          )}

          {/* Recent commits */}
          {activity.recentCommits?.length > 0 && (
            <div>
              <div className="text-[#8b949e] text-[10px] mb-1.5">recent commits</div>
              <div className="space-y-1">
                {activity.recentCommits.map((commit, i) => {
                  const spaceIdx = commit.indexOf(' ')
                  const hash = spaceIdx > 0 ? commit.slice(0, spaceIdx) : commit
                  const msg = spaceIdx > 0 ? commit.slice(spaceIdx + 1) : ''
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[#8b949e] shrink-0">{hash}</span>
                      <span className="text-[#e6edf3] truncate" title={msg}>{msg}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Diff stat */}
          {activity.diffStat && (
            <div>
              <div className="text-[#8b949e] text-[10px] mb-1.5">uncommitted changes</div>
              <DiffFileLines diffStat={activity.diffStat} />
            </div>
          )}

          {/* Working tree status */}
          {activity.status && (
            <div>
              <div className="text-[#8b949e] text-[10px] mb-1.5">working tree</div>
              <WorkingTreeStatus status={activity.status} />
            </div>
          )}

        </div>
      )}
    </div>
  )
}
