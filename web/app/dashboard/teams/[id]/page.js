'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import IrcFeed from '../../../../components/IrcFeed'
import AgentConsole from '../../../../components/AgentConsole'
import AgentActivity from '../../../../components/AgentActivity'
import { TeamWSProvider, useTeamWS } from '../../../../components/TeamWSProvider'
import AgentActions from '../../../../components/AgentActions'
import IrcConnectionInfo from '../../../../components/IrcConnectionInfo'
import IrcMessageInput from '../../../../components/IrcMessageInput'
import LogsViewer from '../../../../components/LogsViewer'

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

function HeartbeatDot({ lastHeartbeat, wsStatus }) {
  // wsStatus='stalled' overrides the computed colour immediately
  if (wsStatus === 'stalled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#8b949e]">
        <span className="w-2 h-2 rounded-full shrink-0 bg-[#f85149]" />
        stalled (nudged)
      </span>
    )
  }

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
        <HeartbeatDot lastHeartbeat={agent.last_heartbeat} wsStatus={agent.wsStatus} key={now} />
      </div>
      <div className="text-xs text-[#8b949e] font-mono">
        last seen: {timeAgo(agent.last_heartbeat)}
      </div>
      {agent.model && (
        <div className="mt-1.5 text-xs text-[#8b949e] font-mono truncate">
          model: {agent.model}
        </div>
      )}
      {agent.runtime && (
        <div className="mt-1 text-xs text-[#8b949e] font-mono truncate">
          runtime: <span className="text-[#79c0ff]">{agent.runtime}</span>
        </div>
      )}
      {agent.effort && (
        <div className="mt-1 text-xs text-[#8b949e] font-mono">
          effort: <span className="text-[#d29922]">{agent.effort}</span>
        </div>
      )}
      {agent.auth && (
        <div className="mt-1 text-xs text-[#8b949e] font-mono truncate">
          auth: <span className="text-[#e6edf3]">
            {typeof agent.auth === 'object' ? (agent.auth.mode ?? JSON.stringify(agent.auth)) : String(agent.auth)}
          </span>
        </div>
      )}
      {agent.env && Object.keys(agent.env).length > 0 && (
        <div className="mt-1.5">
          <div className="text-[10px] text-[#8b949e] font-mono mb-1">env</div>
          <div className="flex flex-wrap gap-1">
            {Object.keys(agent.env).map(k => (
              <span key={k} className="text-[9px] font-mono px-1.5 py-0.5 bg-[#161b22] border border-[#30363d] rounded text-[#8b949e]">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 text-[10px] font-mono text-[#8b949e]">
        {isSelected ? '▼ console + activity' : '▶ click for console'}
      </div>
    </div>
  )
}

// ── Team Detail Body (inside TeamWSProvider — can call useTeamWS) ─────────────

function TeamDetailBody({ team, teamId, stopping, onStop }) {
  const [agents, setAgents] = useState(team.agents ?? [])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const { addListener, status: wsStatus } = useTeamWS()

  // ── WS listeners ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubStatus = addListener('agent_status', (msg) => {
      if (msg.teamId !== teamId) return
      if (msg.status === 'spawned') {
        // New agent arrived — refetch team to get full agent object
        fetch(`/api/teams/${teamId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) setAgents(data.agents ?? []) })
          .catch(() => {})
      } else if (msg.status === 'killed') {
        setAgents(prev => prev.filter(a => a.id !== msg.agentId))
        setSelectedAgent(prev => prev === msg.agentId ? null : prev)
      } else if (msg.status === 'stalled' || msg.status === 'alive') {
        setAgents(prev => prev.map(a =>
          a.id === msg.agentId ? { ...a, wsStatus: msg.status } : a
        ))
      }
    })

    const unsubHeartbeat = addListener('heartbeat', (msg) => {
      if (msg.teamId !== teamId) return
      setAgents(prev => prev.map(a =>
        a.id === msg.agentId ? { ...a, last_heartbeat: msg.timestamp, wsStatus: 'alive' } : a
      ))
    })

    return () => {
      unsubStatus()
      unsubHeartbeat()
    }
  }, [addListener, teamId])

  return (
    <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full px-6 py-6 gap-6">

      {/* Left: agent cards + IRC info */}
      <aside className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-mono text-[#8b949e] uppercase tracking-wider">Agents</h2>
          <span className="text-xs font-mono text-[#8b949e]">{agents.length}</span>
        </div>
        {agents.length === 0 ? (
          <div className="text-xs text-[#8b949e] font-mono italic">No agents configured.</div>
        ) : (
          agents.map(agent => (
            <div key={agent.id} className="flex flex-col gap-2">
              <AgentCard
                agent={agent}
                isSelected={selectedAgent === agent.id}
                onToggle={() => setSelectedAgent(prev => prev === agent.id ? null : agent.id)}
              />
              {selectedAgent === agent.id && (
                <AgentActions teamId={teamId} agentId={agent.id} />
              )}
            </div>
          ))
        )}

        {/* IRC connection details */}
        <div className="mt-2 pt-3 border-t border-[#30363d]">
          <h2 className="text-xs font-mono text-[#8b949e] uppercase tracking-wider mb-2">IRC Server</h2>
          <IrcConnectionInfo team={team} />
        </div>
      </aside>

      {/* Right: IRC feed + agent console + activity */}
      <div className="flex-1 flex flex-col min-w-0 gap-4">
        {selectedAgent && (
          <>
            <AgentConsole
              teamId={teamId}
              agentId={selectedAgent}
              onClose={() => setSelectedAgent(null)}
            />
            <AgentActivity teamId={teamId} agentId={selectedAgent} />
          </>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <IrcFeed teamId={teamId} channels={team?.channels} />
          <IrcMessageInput teamId={teamId} channels={team?.channels} wsStatus={wsStatus} />
        </div>
        <LogsViewer teamId={teamId} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stopping, setStopping] = useState(false)

  // ── Fetch team ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/teams/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setTeam(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  // ── Stop team (non-destructive) ─────────────────────────────────────────────
  async function stopTeam() {
    if (!confirm(`Stop team "${team?.name}"? This will stop all agents but keep the team config.`)) return
    setStopping(true)
    try {
      const res = await fetch(`/api/teams/${id}/stop`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTeam(prev => ({ ...prev, status: 'stopped' }))
    } catch (err) {
      alert(`Failed to stop team: ${err.message}`)
    } finally {
      setStopping(false)
    }
  }

  // ── Start team ─────────────────────────────────────────────────────────────
  const [starting, setStarting] = useState(false)
  async function startTeam() {
    setStarting(true)
    try {
      const res = await fetch(`/api/teams/${id}/start`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTeam(prev => ({ ...prev, status: 'running' }))
    } catch (err) {
      alert(`Failed to start team: ${err.message}`)
    } finally {
      setStarting(false)
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
    <TeamWSProvider teamId={id}>
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
            <Link
              href={`/dashboard/teams/${id}/settings`}
              className="text-sm text-[#8b949e] hover:text-white border border-[#30363d] hover:border-[#8b949e] px-3 py-1.5 rounded-md transition-colors"
            >
              ⚙ Settings
            </Link>
            {team?.status === 'stopped' ? (
              <button
                onClick={startTeam}
                disabled={starting}
                className="text-sm text-[#3fb950] hover:text-white border border-[#3fb950]/40 hover:border-[#3fb950] hover:bg-[#3fb950]/10 px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {starting ? 'Starting…' : 'Start Team'}
              </button>
            ) : (
              <button
                onClick={stopTeam}
                disabled={stopping}
                className="text-sm text-[#f85149] hover:text-white border border-[#f85149]/40 hover:border-[#f85149] hover:bg-[#f85149]/10 px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {stopping ? 'Stopping…' : 'Stop Team'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body: rendered inside provider so it can call useTeamWS() */}
      <TeamDetailBody team={team} teamId={id} stopping={stopping} onStop={stopTeam} />
    </div>
    </TeamWSProvider>
  )
}
