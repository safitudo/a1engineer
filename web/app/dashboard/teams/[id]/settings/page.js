'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const ROLES = ['dev', 'lead', 'arch', 'qa', 'critic']
const MODELS = [
  { id: 'sonnet', label: 'sonnet (default)' },
  { id: 'opus', label: 'opus' },
  { id: 'haiku', label: 'haiku' },
]
const RUNTIMES = [
  { id: 'claude-code', label: 'Claude Code' },
]

// ── Shared input component ─────────────────────────────────────────────────────

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-[#8b949e] font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#8b949e]/50 focus:outline-none focus:border-[#3fb950] transition-colors font-mono"
      />
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <h2 className="text-sm font-semibold text-white font-mono mb-4 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}

// ── Save button ────────────────────────────────────────────────────────────────

function SaveButton({ onClick, saving, saved, label = 'Save' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="px-4 py-2 text-sm font-mono rounded-md bg-[#3fb950]/10 border border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/20 hover:border-[#3fb950] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {saving ? 'Saving…' : saved ? '✓ Saved' : label}
    </button>
  )
}

// ── General section ────────────────────────────────────────────────────────────

function GeneralSection({ team, onSaved }) {
  const [name, setName] = useState(team.name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const updated = await res.json()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="General">
      <div className="flex flex-col gap-4 max-w-md">
        <Input label="Team name" value={name} onChange={setName} placeholder="e.g. alpha-squad" />
        {error && <p className="text-xs text-[#f85149] font-mono">{error}</p>}
        <div>
          <SaveButton onClick={save} saving={saving} saved={saved} />
        </div>
      </div>
    </Section>
  )
}

// ── Channels section ───────────────────────────────────────────────────────────

function ChannelsSection({ team, onSaved }) {
  const [value, setValue] = useState((team.channels ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const isRunning = team.status === 'running'

  async function save() {
    const parsed = value.split(',').map((c) => c.trim()).filter((c) => c.startsWith('#') && c.length > 1)
    if (parsed.length === 0) {
      setError('At least one valid channel (e.g. #main) is required.')
      return
    }
    if (parsed.length > 20) {
      setError('Maximum 20 channels allowed.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: parsed }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const updated = await res.json()
      setValue((updated.channels ?? []).join(', '))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="Channels">
      <div className="flex flex-col gap-4 max-w-md">
        {isRunning && (
          <div className="flex items-center gap-2 bg-[#d29922]/10 border border-[#d29922]/30 rounded-md px-3 py-2 text-xs text-[#d29922] font-mono">
            <span>⚠</span>
            <span>Channel changes require a stopped team. Stop the team first, then edit channels.</span>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[#8b949e] font-medium">IRC channels</label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isRunning}
            placeholder="#main, #tasks, #code, #testing, #merges"
            className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#8b949e]/50 focus:outline-none focus:border-[#3fb950] transition-colors font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-[#8b949e]">Comma-separated channel names with # prefix. Min 1, max 20 channels.</p>
        </div>
        {error && <p className="text-xs text-[#f85149] font-mono">{error}</p>}
        <div>
          <button
            onClick={save}
            disabled={saving || isRunning}
            className="px-4 py-2 text-sm font-mono rounded-md bg-[#3fb950]/10 border border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/20 hover:border-[#3fb950] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </Section>
  )
}

// ── Agents section ─────────────────────────────────────────────────────────────

function AgentsSection({ team, onSaved }) {
  const [agents, setAgents] = useState(team.agents ?? [])
  const [removing, setRemoving] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addRole, setAddRole] = useState('dev')
  const [addModel, setAddModel] = useState('sonnet')
  const [addRuntime, setAddRuntime] = useState('claude-code')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  async function removeAgent(agentId) {
    if (!confirm(`Remove agent "${agentId}"? This will stop the container.`)) return
    setRemoving(agentId)
    try {
      const res = await fetch(`/api/teams/${team.id}/agents/${agentId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
      const updated = agents.filter((a) => a.id !== agentId)
      setAgents(updated)
      onSaved({ ...team, agents: updated })
    } catch (err) {
      alert(`Failed to remove agent: ${err.message}`)
    } finally {
      setRemoving(null)
    }
  }

  async function addAgent() {
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch(`/api/teams/${team.id}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: addRole, model: addModel, runtime: addRuntime }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const newAgent = await res.json()
      const updated = [...agents, newAgent]
      setAgents(updated)
      onSaved({ ...team, agents: updated })
      setShowAdd(false)
      setAddRole('dev')
      setAddModel('sonnet')
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Section title="Agents">
      <div className="flex flex-col gap-3">
        {agents.length === 0 ? (
          <p className="text-xs text-[#8b949e] font-mono italic">No agents configured.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-3 bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white font-mono truncate">{agent.id}</div>
                  <div className="text-xs text-[#8b949e] mt-0.5 font-mono">
                    {agent.role}
                    {agent.model && <span className="ml-2 text-[#79c0ff]">{agent.model}</span>}
                    {agent.runtime && <span className="ml-2 text-[#8b949e]">· {agent.runtime}</span>}
                  </div>
                </div>
                <button
                  onClick={() => removeAgent(agent.id)}
                  disabled={removing === agent.id}
                  className="shrink-0 text-xs font-mono px-3 py-1.5 rounded-md border border-[#f85149]/30 text-[#f85149] hover:bg-[#f85149]/10 hover:border-[#f85149] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {removing === agent.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Agent */}
        {showAdd ? (
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 flex flex-col gap-3 max-w-sm">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8b949e] font-mono">Role</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#3fb950] transition-colors font-mono"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8b949e] font-mono">Model</label>
              <select
                value={addModel}
                onChange={(e) => setAddModel(e.target.value)}
                className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#3fb950] transition-colors font-mono"
              >
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8b949e] font-mono">Runtime</label>
              <select
                value={addRuntime}
                onChange={(e) => setAddRuntime(e.target.value)}
                className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#3fb950] transition-colors font-mono"
              >
                {RUNTIMES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            {addError && <p className="text-xs text-[#f85149] font-mono">{addError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={addAgent}
                disabled={adding}
                className="px-4 py-2 text-sm font-mono rounded-md bg-[#3fb950]/10 border border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/20 hover:border-[#3fb950] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {adding ? 'Adding…' : 'Add Agent'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddError(null) }}
                className="px-4 py-2 text-sm font-mono rounded-md border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#8b949e] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 text-sm font-mono rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#3fb950] hover:border-[#3fb950]/40 transition-colors"
            >
              + Add Agent
            </button>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Danger zone ────────────────────────────────────────────────────────────────

function DangerZone({ team, onTeamUpdated }) {
  const router = useRouter()
  const [stopping, setStopping] = useState(false)
  const [starting, setStarting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function stopTeam() {
    if (!confirm(`Stop team "${team.name}"? This will stop all agents but keep the team config.`)) return
    setStopping(true)
    try {
      const res = await fetch(`/api/teams/${team.id}/stop`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onTeamUpdated?.({ ...team, status: 'stopped' })
    } catch (err) {
      alert(`Failed to stop team: ${err.message}`)
    } finally {
      setStopping(false)
    }
  }

  async function startTeam() {
    setStarting(true)
    try {
      const res = await fetch(`/api/teams/${team.id}/start`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onTeamUpdated?.({ ...team, status: 'running' })
    } catch (err) {
      alert(`Failed to start team: ${err.message}`)
    } finally {
      setStarting(false)
    }
  }

  async function deleteTeam() {
    if (!confirm(`DELETE team "${team.name}"? This will permanently remove all data. This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      router.push('/dashboard')
    } catch (err) {
      alert(`Failed to delete team: ${err.message}`)
      setDeleting(false)
    }
  }

  return (
    <div className="bg-[#161b22] border border-[#f85149]/30 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-[#f85149] font-mono mb-1 uppercase tracking-wider">Danger Zone</h2>
      <div className="flex flex-col gap-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-[#e6edf3] font-mono">Stop / Start Team</div>
            <div className="text-xs text-[#8b949e] mt-0.5">Stop all agent containers. Team config is preserved and can be restarted.</div>
          </div>
          {team.status === 'stopped' ? (
            <button
              onClick={startTeam}
              disabled={starting}
              className="px-4 py-2 text-sm font-mono rounded-md border border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/10 hover:border-[#3fb950] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {starting ? 'Starting…' : 'Start Team'}
            </button>
          ) : (
            <button
              onClick={stopTeam}
              disabled={stopping}
              className="px-4 py-2 text-sm font-mono rounded-md border border-[#d29922]/40 text-[#d29922] hover:bg-[#d29922]/10 hover:border-[#d29922] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {stopping ? 'Stopping…' : 'Stop Team'}
            </button>
          )}
        </div>
        <div className="border-t border-[#f85149]/20" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-[#e6edf3] font-mono">Delete Team</div>
            <div className="text-xs text-[#8b949e] mt-0.5">Permanently remove team, all agents, and configuration. This cannot be undone.</div>
          </div>
          <button
            onClick={deleteTeam}
            disabled={deleting}
            className="px-4 py-2 text-sm font-mono rounded-md border border-[#f85149]/40 text-[#f85149] hover:bg-[#f85149]/10 hover:border-[#f85149] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {deleting ? 'Deleting…' : 'Delete Team'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { id } = useParams()
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/teams/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => { setTeam(data); setLoading(false) })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] pt-20 flex items-center justify-center">
        <div className="text-[#8b949e] text-sm font-mono animate-pulse">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] pt-20 px-6">
        <div className="max-w-2xl mx-auto">
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
        <div className="max-w-3xl mx-auto flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="text-[#8b949e] hover:text-white transition-colors text-sm shrink-0">
            ← Teams
          </Link>
          <span className="text-[#30363d]">/</span>
          <Link
            href={`/dashboard/teams/${id}`}
            className="text-[#8b949e] hover:text-white transition-colors text-sm truncate"
          >
            {team.name}
          </Link>
          <span className="text-[#30363d]">/</span>
          <span className="text-white text-sm font-semibold">Settings</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          <GeneralSection team={team} onSaved={setTeam} />
          <AgentsSection team={team} onSaved={setTeam} />
          <ChannelsSection team={team} onSaved={setTeam} />
          <DangerZone team={team} onTeamUpdated={setTeam} />
        </div>
      </div>
    </div>
  )
}
