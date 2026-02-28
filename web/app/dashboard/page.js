'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080'

function StatusBadge({ status }) {
  const styles = {
    running: 'bg-[#3fb950]/15 text-[#3fb950] border-[#3fb950]/30',
    stopped: 'bg-[#8b949e]/15 text-[#8b949e] border-[#8b949e]/30',
    creating: 'bg-[#79c0ff]/15 text-[#79c0ff] border-[#79c0ff]/30',
    error: 'bg-[#f85149]/15 text-[#f85149] border-[#f85149]/30',
  }
  const dots = {
    running: 'bg-[#3fb950] animate-pulse',
    stopped: 'bg-[#8b949e]',
    creating: 'bg-[#79c0ff] animate-pulse',
    error: 'bg-[#f85149]',
  }
  const cls = styles[status] ?? styles.stopped
  const dot = dots[status] ?? dots.stopped
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status ?? 'unknown'}
    </span>
  )
}

function TeamCard({ team }) {
  const agentCount = team.agents?.length ?? 0
  const repoUrl = team.repo?.url ?? null

  return (
    <Link href={`/dashboard/teams/${team.id}`}>
      <article className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 hover:border-[#8b949e] transition-colors cursor-pointer group h-full">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-white font-semibold text-base group-hover:text-[#3fb950] transition-colors truncate">
            {team.name}
          </h2>
          <StatusBadge status={team.status} />
        </div>

        <div className="space-y-2 text-sm text-[#8b949e]">
          <div className="flex items-center gap-2">
            <span className="text-[#3fb950] font-mono text-xs">agents</span>
            <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
          </div>

          {repoUrl && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#3fb950] font-mono text-xs shrink-0">repo</span>
              <span className="truncate font-mono text-xs">{repoUrl}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[#3fb950] font-mono text-xs">created</span>
            <span className="text-xs">{new Date(team.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </article>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="text-4xl mb-4 text-[#30363d]">⬡</div>
      <h3 className="text-white font-semibold text-lg mb-2">No teams yet</h3>
      <p className="text-[#8b949e] text-sm mb-6 max-w-xs">
        Create your first agent team to get started. Bring your own API key.
      </p>
      <Link
        href="/dashboard/teams/new"
        className="bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold text-sm px-5 py-2 rounded-md transition-colors"
      >
        Create team
      </Link>
    </div>
  )
}

export default function DashboardPage() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/teams')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setTeams(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // ── Real-time team status via WebSocket ───────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let retryTimeout = null
    let retryDelay = 1000

    async function connect() {
      let token = ''
      try {
        const res = await fetch('/api/auth/ws-token')
        if (res.ok) {
          const data = await res.json()
          token = data.token ?? ''
        }
      } catch {}
      if (cancelled) return

      const ws = new WebSocket(`${WS_BASE}/ws`)

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }))
      }

      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }

        if (msg.type === 'authenticated') {
          retryDelay = 1000
        }

        if (msg.type === 'team_status') {
          setTeams(prev => {
            if (msg.status === 'deleted') {
              return prev.filter(t => t.id !== msg.teamId)
            }
            const idx = prev.findIndex(t => t.id === msg.teamId)
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = { ...updated[idx], status: msg.status }
              return updated
            }
            // New team created — refetch full list to get complete data
            if (msg.status === 'running' && idx < 0) {
              fetch('/api/teams')
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data && !cancelled) setTeams(Array.isArray(data) ? data : []) })
                .catch(() => {})
            }
            return prev
          })
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        retryTimeout = setTimeout(() => {
          if (!cancelled) {
            retryDelay = Math.min(retryDelay * 2, 30_000)
            connect()
          }
        }, retryDelay)
      }

      ws.onerror = () => {}

      wsRef.current = ws
    }

    const wsRef = { current: null }
    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimeout)
      wsRef.current?.close()
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#0d1117] pt-20 px-6 pb-16">
      <div className="max-w-6xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Teams</h1>
            {!loading && !error && (
              <p className="text-[#8b949e] text-sm mt-0.5">
                {teams.length} team{teams.length !== 1 ? 's' : ''} running
              </p>
            )}
          </div>
          <Link
            href="/dashboard/teams/new"
            className="bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold text-sm px-4 py-2 rounded-md transition-colors"
          >
            + New Team
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 h-36 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[#f85149]/10 border border-[#f85149]/30 rounded-xl p-5 text-[#f85149] text-sm font-mono">
            Failed to load teams: {error}
          </div>
        )}

        {/* Teams grid */}
        {!loading && !error && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.length === 0 ? (
              <EmptyState />
            ) : (
              teams.map(team => <TeamCard key={team.id} team={team} />)
            )}
          </div>
        )}
      </div>
    </div>
  )
}
