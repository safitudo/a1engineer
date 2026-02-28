'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function Section({ title, children }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <h2 className="text-sm font-semibold text-white font-mono mb-4 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [teamCount, setTeamCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then(r => r.json()),
      fetch('/api/teams').then(r => r.ok ? r.json() : []),
    ])
      .then(([meData, teamsData]) => {
        if (meData.error) {
          setError(meData.error)
        } else {
          setMe(meData)
          setTeamCount(Array.isArray(teamsData) ? teamsData.length : 0)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  function copyKey() {
    if (!me?.maskedKey) return
    navigator.clipboard?.writeText(me.maskedKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function logout() {
    if (!confirm('Log out? You will need your API key to log back in.')) return
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // proceed to redirect regardless
    }
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#0d1117] pt-14 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-[#30363d] bg-[#0d1117] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-[#8b949e] hover:text-white transition-colors text-sm shrink-0">
            ← Dashboard
          </Link>
          <span className="text-[#30363d]">/</span>
          <h1 className="text-white font-semibold text-base">Settings</h1>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {loading && (
            <div className="text-[#8b949e] text-sm font-mono animate-pulse">Loading…</div>
          )}

          {!loading && error && (
            <div className="bg-[#f85149]/10 border border-[#f85149]/30 rounded-xl p-5 text-[#f85149] text-sm font-mono">
              Failed to load settings: {error}
            </div>
          )}

          {!loading && !error && me && (
            <>
              {/* API Key */}
              <Section title="API Key">
                <p className="text-xs text-[#8b949e] mb-4">
                  Your API key is stored in an encrypted cookie. This is a read-only view — to change it, log out and log back in with a new key.
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 font-mono text-sm text-[#e6edf3] select-all">
                    {me.maskedKey}
                  </div>
                  <button
                    onClick={copyKey}
                    className="px-3 py-2 rounded-md border border-[#30363d] text-sm text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8b949e]/50 transition-colors font-mono shrink-0"
                  >
                    {copied ? '✓ copied' : 'Copy'}
                  </button>
                </div>
              </Section>

              {/* Tenant Info */}
              <Section title="Account">
                <dl className="space-y-3 text-sm font-mono">
                  <div className="flex items-center justify-between">
                    <dt className="text-[#8b949e]">Tenant ID</dt>
                    <dd className="text-[#e6edf3]">{me.tenantId ?? <span className="text-[#8b949e] italic">unavailable</span>}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[#8b949e]">Teams owned</dt>
                    <dd className="text-[#e6edf3]">{teamCount ?? '—'}</dd>
                  </div>
                </dl>
              </Section>

              {/* Danger Zone */}
              <div className="bg-[#161b22] border border-[#f85149]/30 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-[#f85149] font-mono mb-1 uppercase tracking-wider">
                  Danger Zone
                </h2>
                <p className="text-xs text-[#8b949e] mb-4">
                  Logging out will clear your session. You will need your API key to log back in.
                </p>
                <button
                  onClick={logout}
                  disabled={loggingOut}
                  className="px-4 py-2 rounded-md border border-[#f85149]/50 text-[#f85149] hover:bg-[#f85149]/10 hover:border-[#f85149] transition-colors text-sm font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
