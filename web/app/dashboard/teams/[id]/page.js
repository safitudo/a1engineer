'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import IrcFeed from '../../../../components/IrcFeed'
import AgentConsole from '../../../../components/AgentConsole'

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    running:  'bg-[#3fb950]/15 text-[#3fb950] border-[#3fb950]/30',
    stopped:  'bg-[#8b949e]/15 text-[#8b949e] border-[#8b949e]/30',
    creating: 'bg-[#79c0ff]/15 text-[#79c0ff] border-[#79c0ff]/30',
    error:    'bg-[#f85149]/15 text-[#f85149] border-[#f85149]/30',
  }
  const dots = {
    running:  'bg-[#3fb950] animate-pulse',
    stopped:  'bg-[#8b949e]',
    creating: 'bg-[#79c0ff] animate-pulse',
    error:    'bg-[#f85149]',
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

// ── Heartbeat indicator ───────────────────────────────────────────────────────

function heartbeatColor(lastHeartbeat) {
  if (!lastHeartbeat) return 'red'
  const age = (Date.now() - new Date(lastHeartbeat).getTime()) / 1000
  if (age < 30) return 'green'
  if (age < 120) return 'yellow'
  return 'red'
}

function HeartbeatDot({ lastHeartbeat }) {
  const color = heartbeatColor(lastHeartbeat)
  const cls = {
    green:  'bg-[#3fb950] animate-pulse',
    yellow: 'bg-[#d29922] animate-pulse',
    red:    'bg-[#f85149]',
  }[color]
  const label = {
    green:  'active',
    yellow: 'slow',
    red:    lastHeartbeat ? 'stalled' : 'no heartbeat',
  }[color]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#8b949e]">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />
      {label}
    </span>
  )
}

function timeAgo(ts) {
  if (!ts) return 'never'
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({ agent, isSelected, onToggle }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className={`bg-[#0d1117] border rounded-lg p-4 cursor-pointer transition-colors ${
        isSelected ? 'border-[#3fb950]/60 ring-1 ring-[#3fb950]/20' : 'border-[#30363d] hover:border-[#8b949e]/50'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold text-white font-mono">{agent.id}</div>
          <div className="text-xs text-[#8b949e] mt-0.5">{agent.role}</div>
        </div>
        <HeartbeatDot lastHeartbeat={agent.last_heartbeat} key={now} />
      </div>
      <div className="text-xs text-[#8b949e] font-mono">
        last seen: {timeAgo(agent.last_heartbeat)}
      </div>
      {agent.model && (
        <div className="mt-1.5 text-xs text-[#8b949e] font-mono truncate">
          model: {agent.model}
        </div>
      )}
      <div className="mt-2 text-[10px] font-mono text-[#8b949e]">
        {isSelected ? '▼ console open' : '▶ click for console'}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [team, setTeam] = useState(null)
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stopping, setStopping] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)

  // ── Fetch team ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/teams/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setTeam(data)
        setAgents(data.agents ?? [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  // ── Stop team ───────────────────────────────────────────────────────────────
  async function stopTeam() {
    if (!confirm(`Stop team "${team?.name}"? This will terminate all agents.`)) return
    setStopping(true)
    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      router.push('/dashboard')
    } catch (err) {
      alert(`Failed to stop team: ${err.message}`)
      setStopping(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] pt-20 px-6 pb-16 flex items-center justify-center">
        <div className="text-[#8b949e] text-sm font-mono animate-pulse">Loading team…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] pt-20 px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#f85149]/10 border border-[#f85149]/30 rounded-xl p-5 text-[#f85149] text-sm font-mono">
            Failed to load team: {error}
          </div>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-[#8b949e] hover:text-white transition-colors">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] pt-14 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-[#30363d] bg-[#0d1117] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="text-[#8b949e] hover:text-white transition-colors text-sm shrink-0">
              ← Teams
            </Link>
            <span className="text-[#30363d]">/</span>
            <h1 className="text-white font-semibold text-base truncate">{team?.name}</h1>
            <StatusBadge status={team?.status} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={stopTeam}
              disabled={stopping || team?.status === 'stopped'}
              className="text-sm text-[#f85149] hover:text-white border border-[#f85149]/40 hover:border-[#f85149] hover:bg-[#f85149]/10 px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {stopping ? 'Stopping…' : 'Stop Team'}
            </button>
          </div>
        </div>
      </div>

      {/* Body: 2-panel layout */}
      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full px-6 py-6 gap-6">

        {/* Left: agent cards */}
        <aside className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-mono text-[#8b949e] uppercase tracking-wider">Agents</h2>
            <span className="text-xs font-mono text-[#8b949e]">{agents.length}</span>
          </div>
          {agents.length === 0 ? (
            <div className="text-xs text-[#8b949e] font-mono italic">No agents configured.</div>
          ) : (
            agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={selectedAgent === agent.id}
                onToggle={() => setSelectedAgent(prev => prev === agent.id ? null : agent.id)}
              />
            ))
          )}
        </aside>

        {/* Right: IRC feed + agent console */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          {selectedAgent && (
            <AgentConsole
              teamId={id}
              agentId={selectedAgent}
              onClose={() => setSelectedAgent(null)}
            />
          )}
          <div className="flex-1 flex flex-col min-w-0">
            <IrcFeed teamId={id} />
          </div>
        </div>
      </div>
    </div>
  )
}
