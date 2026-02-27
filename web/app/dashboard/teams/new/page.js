'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const ROLES = ['dev', 'lead', 'arch', 'qa', 'critic']

const RUNTIMES = [
  { id: 'claude-code', label: 'Claude Code', available: true },
  { id: 'codex', label: 'Codex', available: false },
]

const MODELS = [
  { id: '', label: 'Default (claude-sonnet-4-6)' },
  { id: 'claude-opus-4-6', label: 'claude-opus-4-6' },
  { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
  { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5-20251001' },
]

const STEPS = ['Team', 'Runtime', 'Agents', 'API Key', 'Review']

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-semibold border transition-colors
                  ${done ? 'bg-[#3fb950] border-[#3fb950] text-black' : ''}
                  ${active ? 'border-[#3fb950] text-[#3fb950] bg-transparent' : ''}
                  ${!done && !active ? 'border-[#30363d] text-[#8b949e] bg-transparent' : ''}`}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className={`text-[10px] font-mono whitespace-nowrap
                  ${active ? 'text-[#3fb950]' : done ? 'text-[#3fb950]/70' : 'text-[#8b949e]'}`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-10 sm:w-16 mx-1 mb-5 transition-colors
                  ${i < current ? 'bg-[#3fb950]/50' : 'bg-[#30363d]'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text', required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-[#8b949e] font-medium">
        {label}
        {required && <span className="text-[#3fb950] ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#8b949e]/50 focus:outline-none focus:border-[#3fb950] transition-colors"
      />
    </div>
  )
}

function Select({ label, value, onChange, options, required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-[#8b949e] font-medium">
        {label}
        {required && <span className="text-[#3fb950] ml-1">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#3fb950] transition-colors appearance-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Step 1: Team name + repo URL
function Step1({ name, setName, repoUrl, setRepoUrl, error }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Name your team</h2>
        <p className="text-sm text-[#8b949e]">Give your team a name and point it at a git repository.</p>
      </div>
      <Input
        label="Team name"
        value={name}
        onChange={setName}
        placeholder="e.g. alpha-squad"
        required
      />
      <Input
        label="Git repository URL"
        value={repoUrl}
        onChange={setRepoUrl}
        placeholder="https://github.com/org/repo"
        required
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

// Step 2: Runtime selection
function Step2({ runtime, setRuntime }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Choose a runtime</h2>
        <p className="text-sm text-[#8b949e]">Select the AI runtime your agents will use.</p>
      </div>
      <div className="flex flex-col gap-3">
        {RUNTIMES.map(({ id, label, available }) => (
          <button
            key={id}
            type="button"
            onClick={() => available && setRuntime(id)}
            className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors
              ${!available ? 'opacity-40 cursor-not-allowed border-[#30363d]' : ''}
              ${available && runtime === id ? 'border-[#3fb950] bg-[#3fb950]/5' : ''}
              ${available && runtime !== id ? 'border-[#30363d] hover:border-[#8b949e]' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center
                  ${runtime === id && available ? 'border-[#3fb950]' : 'border-[#8b949e]'}`}
              >
                {runtime === id && available && (
                  <div className="w-2 h-2 rounded-full bg-[#3fb950]" />
                )}
              </div>
              <span className="text-sm font-medium text-[#e6edf3]">{label}</span>
            </div>
            {!available && (
              <span className="text-[10px] font-mono text-[#8b949e] border border-[#30363d] rounded px-2 py-0.5">
                coming soon
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// Step 3: Add agents
function Step3({ agents, setAgents, error }) {
  function addAgent() {
    setAgents([...agents, { role: 'dev', model: '' }])
  }

  function removeAgent(i) {
    setAgents(agents.filter((_, idx) => idx !== i))
  }

  function updateAgent(i, field, value) {
    setAgents(agents.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Add agents</h2>
        <p className="text-sm text-[#8b949e]">Configure the agents on your team. At least one is required.</p>
      </div>

      <div className="flex flex-col gap-3">
        {agents.map((agent, i) => (
          <div key={i} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-[#8b949e]">Agent {i + 1}</span>
              {agents.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAgent(i)}
                  className="text-xs text-[#8b949e] hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Role"
                value={agent.role}
                onChange={(v) => updateAgent(i, 'role', v)}
                options={ROLES.map((r) => ({ value: r, label: r }))}
                required
              />
              <Select
                label="Model"
                value={agent.model}
                onChange={(v) => updateAgent(i, 'model', v)}
                options={MODELS.map((m) => ({ value: m.id, label: m.label }))}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addAgent}
        className="flex items-center gap-2 text-sm text-[#3fb950] hover:text-[#2ea043] transition-colors font-medium"
      >
        <span className="text-lg leading-none">+</span> Add agent
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

// Step 4: API key
function Step4({ runtime, apiKey, setApiKey, error }) {
  const [show, setShow] = useState(false)
  const runtimeLabel = RUNTIMES.find((r) => r.id === runtime)?.label ?? runtime
  const placeholder = runtime === 'claude-code' ? 'sk-ant-api03-...' : 'sk-...'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Your API key</h2>
        <p className="text-sm text-[#8b949e]">
          Provide your {runtimeLabel} API key. It's sent directly to your agents and never stored on our servers.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#8b949e] font-medium">
          {runtimeLabel} API key <span className="text-[#3fb950]">*</span>
        </label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 pr-16 text-sm text-[#e6edf3] placeholder-[#8b949e]/50 focus:outline-none focus:border-[#3fb950] transition-colors font-mono"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8b949e] hover:text-white transition-colors"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-[#8b949e] bg-[#161b22] border border-[#30363d] rounded-lg p-3">
        <span className="mt-0.5 shrink-0">🔑</span>
        <span>
          Your key is passed to agent containers at launch time only. A1 Engineer does not log or persist API keys.
        </span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

// Step 5: Review + Launch
function Step5({ name, repoUrl, runtime, agents, loading }) {
  const runtimeLabel = RUNTIMES.find((r) => r.id === runtime)?.label ?? runtime

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Review & launch</h2>
        <p className="text-sm text-[#8b949e]">Check your configuration before spinning up the team.</p>
      </div>

      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg divide-y divide-[#30363d]">
        <div className="flex justify-between px-4 py-3">
          <span className="text-xs text-[#8b949e] font-mono">Team</span>
          <span className="text-sm text-[#e6edf3] font-medium">{name}</span>
        </div>
        <div className="flex justify-between px-4 py-3">
          <span className="text-xs text-[#8b949e] font-mono">Repo</span>
          <span className="text-sm text-[#79c0ff] font-mono truncate max-w-[220px]">{repoUrl}</span>
        </div>
        <div className="flex justify-between px-4 py-3">
          <span className="text-xs text-[#8b949e] font-mono">Runtime</span>
          <span className="text-sm text-[#e6edf3]">{runtimeLabel}</span>
        </div>
        <div className="flex justify-between px-4 py-3">
          <span className="text-xs text-[#8b949e] font-mono">Agents</span>
          <span className="text-sm text-[#e6edf3]">{agents.length}</span>
        </div>
        <div className="px-4 py-3">
          <span className="text-xs text-[#8b949e] font-mono block mb-2">Agent roles</span>
          <div className="flex flex-wrap gap-2">
            {agents.map((a, i) => (
              <span key={i} className="text-xs font-mono bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-[#3fb950]">
                {a.role}{a.model ? ` · ${a.model}` : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="flex justify-between px-4 py-3">
          <span className="text-xs text-[#8b949e] font-mono">API key</span>
          <span className="text-sm text-[#e6edf3] font-mono">••••••••</span>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[#8b949e]">
          <span className="w-3 h-3 rounded-full bg-[#3fb950] animate-pulse" />
          Spinning up your team…
        </div>
      )}
    </div>
  )
}

export default function NewTeamPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)

  // Form state
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [runtime, setRuntime] = useState('claude-code')
  const [agents, setAgents] = useState([{ role: 'dev', model: '' }])
  const [apiKey, setApiKey] = useState('')

  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function validate() {
    setError(null)
    if (step === 0) {
      if (!name.trim()) return setError('Team name is required') || false
      if (!repoUrl.trim()) return setError('Repository URL is required') || false
      try { new URL(repoUrl.trim()) } catch { return setError('Enter a valid URL') || false }
    }
    if (step === 2) {
      if (agents.length === 0) return setError('Add at least one agent') || false
    }
    if (step === 3) {
      if (!apiKey.trim()) return setError('API key is required') || false
    }
    return true
  }

  function next() {
    if (!validate()) return
    setStep((s) => s + 1)
  }

  function back() {
    setError(null)
    setStep((s) => s - 1)
  }

  async function launch() {
    setError(null)
    setLoading(true)

    const body = {
      name: name.trim(),
      repo: { url: repoUrl.trim() },
      agents: agents.map((a) => ({
        role: a.role,
        runtime,
        ...(a.model ? { model: a.model } : {}),
      })),
      auth: {
        mode: 'api-key',
        apiKey: apiKey.trim(),
      },
    }

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Server error ${res.status}`)
      }
      const team = await res.json()
      router.push('/dashboard')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] pt-20 pb-16 px-6">
      <div className="max-w-lg mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[#8b949e] mb-8 font-mono">
          <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-[#e6edf3]">New team</span>
        </nav>

        <StepIndicator current={step} />

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-6">
          {step === 0 && (
            <Step1
              name={name}
              setName={setName}
              repoUrl={repoUrl}
              setRepoUrl={setRepoUrl}
              error={error}
            />
          )}
          {step === 1 && (
            <Step2 runtime={runtime} setRuntime={setRuntime} />
          )}
          {step === 2 && (
            <Step3 agents={agents} setAgents={setAgents} error={error} />
          )}
          {step === 3 && (
            <Step4
              runtime={runtime}
              apiKey={apiKey}
              setApiKey={setApiKey}
              error={error}
            />
          )}
          {step === 4 && (
            <Step5
              name={name}
              repoUrl={repoUrl}
              runtime={runtime}
              agents={agents}
              loading={loading}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              disabled={loading}
              className="text-sm text-[#8b949e] hover:text-white transition-colors disabled:opacity-40"
            >
              ← Back
            </button>
          ) : (
            <Link href="/dashboard" className="text-sm text-[#8b949e] hover:text-white transition-colors">
              Cancel
            </Link>
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold text-sm px-6 py-2 rounded-md transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={launch}
              disabled={loading}
              className="bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold text-sm px-8 py-2 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Launching…' : 'Launch team'}
            </button>
          )}
        </div>

        {/* Launch error (shown below nav) */}
        {step === 4 && error && !loading && (
          <p className="text-sm text-red-400 mt-4 text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
