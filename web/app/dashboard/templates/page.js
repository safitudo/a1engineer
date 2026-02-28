'use client'

import { useState, useEffect } from 'react'

const ROLES = ['dev', 'lead', 'arch', 'qa', 'critic']
const MODELS = ['sonnet', 'opus', 'haiku']
const RUNTIMES = ['claude-code']
const EFFORTS = ['high', 'medium', 'low']

function emptyAgent() {
  return { role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: '' }
}

function emptyForm() {
  return { name: '', description: '', agents: [emptyAgent()] }
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ tmpl, onEdit, onDelete }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white truncate">{tmpl.name}</h3>
            {tmpl.builtin ? (
              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#79c0ff]/10 text-[#79c0ff] border border-[#79c0ff]/20 rounded-full shrink-0">
                builtin
              </span>
            ) : (
              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#3fb950]/10 text-[#3fb950] border border-[#3fb950]/20 rounded-full shrink-0">
                custom
              </span>
            )}
          </div>
          {tmpl.description && (
            <p className="text-xs text-[#8b949e] mt-1 leading-relaxed">{tmpl.description}</p>
          )}
        </div>
        {!tmpl.builtin && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onEdit(tmpl)}
              className="text-xs text-[#8b949e] hover:text-white border border-[#30363d] hover:border-[#8b949e] px-2 py-1 rounded-md transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(tmpl)}
              className="text-xs text-[#f85149] hover:text-white border border-[#f85149]/30 hover:border-[#f85149] hover:bg-[#f85149]/10 px-2 py-1 rounded-md transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(tmpl.agents ?? []).map((a, i) => (
          <span
            key={i}
            className="text-[10px] font-mono px-2 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-[#8b949e]"
          >
            {a.role}:{a.model}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Agent row form ────────────────────────────────────────────────────────────

function AgentRow({ agent, index, onChange, onRemove, canRemove }) {
  const [promptOpen, setPromptOpen] = useState(false)

  function field(key, value) {
    onChange(index, { ...agent, [key]: value })
  }

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#8b949e]">Agent {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-xs text-[#f85149] hover:text-white transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: 'role', options: ROLES },
          { key: 'model', options: MODELS },
          { key: 'runtime', options: RUNTIMES },
          { key: 'effort', options: EFFORTS },
        ].map(({ key, options }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs text-[#8b949e] capitalize">{key}</label>
            <select
              value={agent[key]}
              onChange={e => field(key, e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] focus:outline-none focus:border-[#3fb950] transition-colors"
            >
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-[#8b949e]">Prompt</label>
          <button
            type="button"
            onClick={() => setPromptOpen(o => !o)}
            className="text-[10px] text-[#8b949e] hover:text-white transition-colors"
          >
            {promptOpen ? '▲ collapse' : '▼ expand'}
          </button>
        </div>
        {promptOpen ? (
          <textarea
            value={agent.prompt}
            onChange={e => field('prompt', e.target.value)}
            rows={3}
            placeholder="Role instructions for this agent…"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e6edf3] font-mono placeholder-[#8b949e]/50 focus:outline-none focus:border-[#3fb950] resize-y transition-colors"
          />
        ) : (
          <div
            onClick={() => setPromptOpen(true)}
            className="cursor-pointer bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs font-mono text-[#8b949e] min-h-[32px] hover:border-[#8b949e] whitespace-pre-line truncate transition-colors"
          >
            {agent.prompt || <span className="italic">click to add prompt…</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create / edit form ────────────────────────────────────────────────────────

function TemplateForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => initial ?? emptyForm())

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function setAgent(index, agent) {
    setForm(f => {
      const agents = [...f.agents]
      agents[index] = agent
      return { ...f, agents }
    })
  }

  function addAgent() {
    setForm(f => ({ ...f, agents: [...f.agents, emptyAgent()] }))
  }

  function removeAgent(index) {
    setForm(f => ({ ...f, agents: f.agents.filter((_, i) => i !== index) }))
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSave(form) }}
      className="bg-[#161b22] border border-[#3fb950]/30 rounded-xl p-6 flex flex-col gap-5"
    >
      <h3 className="text-sm font-semibold text-white">
        {initial ? 'Edit Template' : 'New Template'}
      </h3>

      {error && (
        <div className="text-xs text-[#f85149] bg-[#f85149]/10 border border-[#f85149]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#8b949e] font-medium">
          Name <span className="text-[#3fb950]">*</span>
        </label>
        <input
          value={form.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="e.g. Full-Stack Team"
          required
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#8b949e]/50 focus:outline-none focus:border-[#3fb950] transition-colors"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#8b949e] font-medium">Description</label>
        <input
          value={form.description}
          onChange={e => setField('description', e.target.value)}
          placeholder="Short description of this team template"
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#8b949e]/50 focus:outline-none focus:border-[#3fb950] transition-colors"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#8b949e] font-medium">
            Agents <span className="text-[#3fb950]">*</span>
          </span>
          <button
            type="button"
            onClick={addAgent}
            className="text-xs text-[#3fb950] hover:text-white border border-[#3fb950]/30 hover:border-[#3fb950] px-2 py-1 rounded-md transition-colors"
          >
            + Add Agent
          </button>
        </div>
        {form.agents.map((agent, i) => (
          <AgentRow
            key={i}
            agent={agent}
            index={i}
            onChange={setAgent}
            onRemove={removeAgent}
            canRemove={form.agents.length > 1}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#30363d]">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-[#8b949e] hover:text-white border border-[#30363d] hover:border-[#8b949e] px-4 py-2 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-sm text-black bg-[#3fb950] hover:bg-[#3fb950]/80 px-4 py-2 rounded-md transition-colors disabled:opacity-50 font-medium"
        >
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [mode, setMode] = useState(null) // null | 'create' | { template }
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => {
        setTemplates(data.templates ?? [])
        setLoading(false)
      })
      .catch(err => {
        setLoadError(String(err))
        setLoading(false)
      })
  }, [])

  async function handleCreate(form) {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setFormError(body.error ?? `HTTP ${res.status}`)
        setSaving(false)
        return
      }
      const tmpl = await res.json()
      setTemplates(ts => [...ts, tmpl])
      setMode(null)
    } catch (err) {
      setFormError(err.message)
    }
    setSaving(false)
  }

  async function handleUpdate(form) {
    const id = mode.template.id
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setFormError(body.error ?? `HTTP ${res.status}`)
        setSaving(false)
        return
      }
      const updated = await res.json()
      setTemplates(ts => ts.map(t => t.id === id ? updated : t))
      setMode(null)
    } catch (err) {
      setFormError(err.message)
    }
    setSaving(false)
  }

  async function handleDelete(tmpl) {
    if (!confirm(`Delete template "${tmpl.name}"?`)) return
    try {
      const res = await fetch(`/api/templates/${tmpl.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? `HTTP ${res.status}`)
        return
      }
      setTemplates(ts => ts.filter(t => t.id !== tmpl.id))
    } catch (err) {
      alert(err.message)
    }
  }

  function openCreate() {
    setMode('create')
    setFormError(null)
  }

  function openEdit(tmpl) {
    setMode({ template: tmpl })
    setFormError(null)
  }

  function closeForm() {
    setMode(null)
    setFormError(null)
  }

  const builtins = templates.filter(t => t.builtin)
  const customs = templates.filter(t => !t.builtin)

  return (
    <div className="min-h-screen bg-[#0d1117] pt-14">
      {/* Header */}
      <div className="border-b border-[#30363d] bg-[#0d1117] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-semibold text-base">Team Templates</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">Reusable agent configurations for new teams</p>
          </div>
          {!mode && (
            <button
              onClick={openCreate}
              className="text-sm text-black bg-[#3fb950] hover:bg-[#3fb950]/80 px-4 py-1.5 rounded-md transition-colors font-medium"
            >
              + New Template
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-8">

        {/* Loading / error states */}
        {loading && (
          <div className="text-[#8b949e] text-sm font-mono animate-pulse">Loading templates…</div>
        )}
        {loadError && (
          <div className="bg-[#f85149]/10 border border-[#f85149]/30 rounded-xl p-4 text-[#f85149] text-sm font-mono">
            Failed to load templates: {loadError}
          </div>
        )}

        {/* Inline form */}
        {mode === 'create' && (
          <TemplateForm
            initial={null}
            onSave={handleCreate}
            onCancel={closeForm}
            saving={saving}
            error={formError}
          />
        )}
        {mode !== null && mode !== 'create' && (
          <TemplateForm
            initial={mode.template}
            onSave={handleUpdate}
            onCancel={closeForm}
            saving={saving}
            error={formError}
          />
        )}

        {!loading && !loadError && (
          <>
            {/* Custom templates section */}
            <section>
              <h2 className="text-xs font-mono text-[#8b949e] uppercase tracking-wider mb-3">
                Custom Templates ({customs.length})
              </h2>
              {customs.length === 0 && !mode ? (
                <div className="text-xs text-[#8b949e] font-mono italic border border-dashed border-[#30363d] rounded-xl p-6 text-center">
                  No custom templates yet — click &quot;+ New Template&quot; to create one.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customs.map(t => (
                    <TemplateCard
                      key={t.id}
                      tmpl={t}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Builtin templates section */}
            <section>
              <h2 className="text-xs font-mono text-[#8b949e] uppercase tracking-wider mb-3">
                Builtin Templates ({builtins.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {builtins.map(t => (
                  <TemplateCard
                    key={t.id}
                    tmpl={t}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
