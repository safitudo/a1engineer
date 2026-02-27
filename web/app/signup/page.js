'use client'

import { useState } from 'react'
import Link from 'next/link'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-[#30363d] hover:border-[#8b949e] text-[#8b949e] hover:text-white transition-colors"
      aria-label="Copy API key"
    >
      {copied ? 'copied!' : 'copy'}
    </button>
  )
}

function ApiKeyReveal({ apiKey, name }) {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#3fb950]/15 border border-[#3fb950]/30 mb-4">
            <span className="text-[#3fb950] text-xl" aria-hidden="true">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Account created</h1>
          <p className="text-[#8b949e] text-sm">
            Welcome, <span className="text-white">{name}</span>. Save your API key now.
          </p>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-[#8b949e] uppercase tracking-wider">Your API Key</span>
            <CopyButton text={apiKey} />
          </div>

          <div
            className="bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3 font-mono text-sm text-[#3fb950] break-all select-all"
            role="textbox"
            aria-label="API key"
            aria-readonly="true"
          >
            {apiKey}
          </div>
        </div>

        <div className="bg-[#ffa657]/10 border border-[#ffa657]/30 rounded-xl p-4 mb-6">
          <p className="text-[#ffa657] text-sm font-semibold mb-1">Save this key — it won&apos;t be shown again</p>
          <p className="text-[#8b949e] text-xs leading-relaxed">
            This key grants full access to your tenant. Store it in a secrets manager or environment variable.
            If you lose it, you&apos;ll need to contact support to rotate.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="block w-full text-center bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold text-sm px-6 py-3 rounded-md transition-colors"
        >
          Go to Dashboard →
        </Link>
      </div>
    </div>
  )
}

export default function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        setLoading(false)
        return
      }
      setResult(data)
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  if (result) {
    return <ApiKeyReveal apiKey={result.apiKey} name={result.name} />
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-white font-semibold text-xl mb-6">
            <span className="text-[#3fb950] font-mono">a1</span>
            <span>engineer</span>
          </Link>
          <h1 className="text-2xl font-bold text-white mt-2 mb-2">Create your account</h1>
          <p className="text-[#8b949e] text-sm">
            Get early access. Bring your own API keys. No lock-in.
          </p>
        </div>

        {/* Form */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              {/* Org name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[#e6edf3] mb-1.5">
                  Organization name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="organization"
                  required
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Acme Corp"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#3fb950] focus:ring-1 focus:ring-[#3fb950] transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#e6edf3] mb-1.5">
                  Work email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@acme.com"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#3fb950] focus:ring-1 focus:ring-[#3fb950] transition-colors"
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="bg-[#f85149]/10 border border-[#f85149]/30 rounded-md px-3 py-2.5 text-[#f85149] text-sm"
                >
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !form.name.trim() || !form.email.trim()}
                className="w-full bg-[#3fb950] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm px-6 py-2.5 rounded-md transition-colors"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center text-sm text-[#8b949e] mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-[#3fb950] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
