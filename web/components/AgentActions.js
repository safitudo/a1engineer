'use client'

import { useState } from 'react'

export default function AgentActions({ teamId, agentId }) {
  const [toast, setToast]               = useState(null)  // { type: 'ok'|'err', msg }
  const [loading, setLoading]           = useState(null)  // action name
  const [directiveOpen, setDirectiveOpen] = useState(false)
  const [directiveText, setDirectiveText] = useState('')
  const [execOpen, setExecOpen]         = useState(false)
  const [execCommand, setExecCommand]   = useState('')
  const [execOutput, setExecOutput]     = useState(null)  // { ok, output, code? }

  const base = `/api/teams/${teamId}/agents/${agentId}`

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  async function post(action, body) {
    setLoading(action)
    setToast(null)
    try {
      const res = await fetch(`${base}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body != null ? { body: JSON.stringify(body) } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, err: err.message }
    } finally {
      setLoading(null)
    }
  }

  async function handleNudge() {
    const r = await post('nudge')
    if (r.ok) showToast('ok', r.data.message ?? 'nudged')
    else showToast('err', r.err)
  }

  async function handleInterrupt() {
    if (!confirm('Send Ctrl+C interrupt to this agent?')) return
    const r = await post('interrupt')
    if (r.ok) showToast('ok', 'interrupted')
    else showToast('err', r.err)
  }

  async function handleDirective() {
    const msg = directiveText.trim()
    if (!msg) return
    const r = await post('directive', { message: msg })
    if (r.ok) {
      showToast('ok', 'directive sent')
      setDirectiveText('')
      setDirectiveOpen(false)
    } else {
      showToast('err', r.err)
    }
  }

  async function handleExec() {
    const cmd = execCommand.trim()
    if (!cmd) return
    setExecOutput(null)
    const parts = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(p =>
      p.replace(/^["']|["']$/g, '')
    ) ?? [cmd]
    const r = await post('exec', { command: parts })
    if (r.ok) {
      setExecOutput(r.data)
    } else {
      setExecOutput({ ok: false, output: r.err })
    }
  }

  const busy = !!loading

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 space-y-2">

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={handleNudge}
          disabled={busy}
          className="text-xs font-mono px-2 py-1.5 rounded border border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/10 hover:border-[#3fb950] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading === 'nudge' ? '…' : '▶ nudge'}
        </button>

        <button
          onClick={handleInterrupt}
          disabled={busy}
          className="text-xs font-mono px-2 py-1.5 rounded border border-[#d29922]/40 text-[#d29922] hover:bg-[#d29922]/10 hover:border-[#d29922] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading === 'interrupt' ? '…' : '⊘ interrupt'}
        </button>

        <button
          onClick={() => { setDirectiveOpen(d => !d); setExecOpen(false) }}
          disabled={busy}
          className="text-xs font-mono px-2 py-1.5 rounded border border-[#79c0ff]/40 text-[#79c0ff] hover:bg-[#79c0ff]/10 hover:border-[#79c0ff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ✎ directive
        </button>

        <button
          onClick={() => { setExecOpen(e => !e); setDirectiveOpen(false) }}
          disabled={busy}
          className="text-xs font-mono px-2 py-1.5 rounded border border-[#8b949e]/40 text-[#8b949e] hover:bg-[#8b949e]/10 hover:border-[#8b949e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          $ exec
        </button>
      </div>

      {/* ── Directive input ──────────────────────────────────────────────── */}
      {directiveOpen && (
        <div className="space-y-1.5">
          <textarea
            value={directiveText}
            onChange={e => setDirectiveText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleDirective() }}
            placeholder="Enter directive for agent…"
            rows={2}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded text-xs font-mono text-[#e6edf3] placeholder-[#8b949e] px-2 py-1.5 resize-none focus:outline-none focus:border-[#79c0ff]/50"
          />
          <button
            onClick={handleDirective}
            disabled={!directiveText.trim() || busy}
            className="w-full text-xs font-mono py-1 rounded bg-[#79c0ff]/10 border border-[#79c0ff]/40 text-[#79c0ff] hover:bg-[#79c0ff]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading === 'directive' ? 'sending…' : 'send directive  ↵ Ctrl+Enter'}
          </button>
        </div>
      )}

      {/* ── Exec input + output ──────────────────────────────────────────── */}
      {execOpen && (
        <div className="space-y-1.5">
          <div className="flex gap-1 items-center">
            <span className="text-xs font-mono text-[#8b949e]">$</span>
            <input
              value={execCommand}
              onChange={e => setExecCommand(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleExec() }}
              placeholder="ls -la /git"
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded text-xs font-mono text-[#e6edf3] placeholder-[#8b949e] px-2 py-1.5 focus:outline-none focus:border-[#8b949e]/50"
            />
            <button
              onClick={handleExec}
              disabled={!execCommand.trim() || busy}
              className="text-xs font-mono px-2 py-1.5 rounded border border-[#8b949e]/40 text-[#8b949e] hover:bg-[#8b949e]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading === 'exec' ? '…' : 'run'}
            </button>
          </div>
          {execOutput && (
            <div className={`rounded border text-xs font-mono p-2 whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed ${
              execOutput.ok !== false
                ? 'border-[#30363d] bg-[#0d1117] text-[#e6edf3]'
                : 'border-[#f85149]/30 bg-[#f85149]/5 text-[#f85149]'
            }`}>
              {execOutput.output || (execOutput.ok !== false ? '(no output)' : 'exec failed')}
              {execOutput.code != null && ` [exit ${execOutput.code}]`}
            </div>
          )}
        </div>
      )}

      {/* ── Toast feedback ───────────────────────────────────────────────── */}
      {toast && (
        <div className={`text-xs font-mono px-2 py-1 rounded ${
          toast.type === 'ok'
            ? 'bg-[#3fb950]/10 text-[#3fb950]'
            : 'bg-[#f85149]/10 text-[#f85149]'
        }`}>
          {toast.type === 'ok' ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}
    </div>
  )
}
