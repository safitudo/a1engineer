'use client'

import { useState } from 'react'

/**
 * Displays Ergo IRC server connection details for a team:
 *   - Host + port (external hostPort if configured, else internal)
 *   - Copy host:port button
 *   - irc:// URI copy button
 *   - Channel list with per-channel copy-to-clipboard
 *
 * Props:
 *   team  — team object containing { name, ergo: { hostPort?, port? }, channels? }
 */
export default function IrcConnectionInfo({ team }) {
  const [copied, setCopied] = useState(null)

  const ergo         = team?.ergo ?? {}
  const hostPort     = ergo.hostPort ?? null          // e.g. "irc.example.com:6697" (external)
  const internalPort = ergo.port ?? 6667
  const hostname     = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

  // Resolve the display host + port used for connection
  const displayHost = hostPort
    ? hostPort.includes(':') ? hostPort.split(':')[0] : hostPort
    : `ergo-${team?.name ?? 'team'}`
  const displayPort = hostPort
    ? hostPort.includes(':') ? hostPort.split(':')[1] : String(internalPort)
    : String(internalPort)

  // For external access, prefer hostPort as-is; otherwise use window hostname + internal port
  const connectAddr = hostPort ?? `${hostname}:${internalPort}`
  const ircUri      = `irc://${connectAddr}`

  const channels = team?.channels ?? ['#main', '#tasks', '#code', '#testing', '#merges']

  function copy(text, key) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="text-xs font-mono space-y-3">

      {/* Server address */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#8b949e]">host</span>
          <span className="text-[#e6edf3] truncate max-w-[160px]" title={displayHost}>{displayHost}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#8b949e]">port</span>
          <span className="text-[#e6edf3]">{displayPort}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#8b949e]">TLS</span>
          <span className="text-[#8b949e] text-[10px]">none (plain IRC)</span>
        </div>
      </div>

      {/* Copy buttons */}
      <div className="space-y-1">
        <button
          onClick={() => copy(connectAddr, 'addr')}
          className="w-full text-left px-2 py-1 rounded bg-[#0d1117] border border-[#30363d] hover:border-[#3fb950]/40 text-[#8b949e] hover:text-[#3fb950] transition-colors"
        >
          {copied === 'addr' ? '✓ copied' : `⎘  ${connectAddr}`}
        </button>
        <button
          onClick={() => copy(ircUri, 'uri')}
          className="w-full text-left px-2 py-1 rounded bg-[#0d1117] border border-[#30363d] hover:border-[#79c0ff]/40 text-[#8b949e] hover:text-[#79c0ff] transition-colors"
        >
          {copied === 'uri' ? '✓ copied' : `⎘  ${ircUri}`}
        </button>
      </div>

      {/* Notice when only internal access */}
      {!hostPort && (
        <div className="text-[#8b949e] text-[10px] leading-relaxed">
          internal only — set <span className="text-[#e6edf3]">ergo.hostPort</span> to expose
        </div>
      )}

      {/* Channels */}
      <div>
        <div className="text-[#8b949e] mb-1.5">channels</div>
        <div className="flex flex-wrap gap-1">
          {channels.map(ch => (
            <button
              key={ch}
              onClick={() => copy(ch, ch)}
              title={`Copy ${ch}`}
              className="px-1.5 py-0.5 rounded bg-[#0d1117] border border-[#30363d] text-[#79c0ff] hover:border-[#79c0ff]/40 hover:bg-[#79c0ff]/5 transition-colors"
            >
              {copied === ch ? '✓' : ch}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
