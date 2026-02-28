'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

function TeamLink({ team, pathname }) {
  const href = `/dashboard/teams/${team.id}`
  const active = pathname === href

  const dotCls =
    team.status === 'running' ? 'bg-[#3fb950] animate-pulse' :
    team.status === 'creating' ? 'bg-[#79c0ff] animate-pulse' :
    team.status === 'error' ? 'bg-[#f85149]' :
    'bg-[#8b949e]'

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? 'bg-[#3fb950]/10 text-white border border-[#3fb950]/20'
          : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
      <span className="truncate">{team.name}</span>
    </Link>
  )
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname()
  const [teams, setTeams] = useState([])

  useEffect(() => {
    fetch('/api/teams')
      .then(r => r.ok ? r.json() : [])
      .then(data => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  return (
    <div className="flex min-h-screen bg-[#0d1117]">
      {/* Sidebar — fixed below the global header (h-14 = top-14) */}
      <aside className="fixed top-14 left-0 bottom-0 w-56 border-r border-[#30363d] bg-[#0d1117] flex flex-col z-40">
        {/* Teams list */}
        <div className="flex-1 overflow-y-auto px-3 pt-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
              Teams
            </span>
            <Link
              href="/dashboard/teams/new"
              className="text-[#3fb950] hover:text-white text-sm font-mono leading-none transition-colors"
              title="New team"
            >
              +
            </Link>
          </div>

          <nav className="space-y-0.5" aria-label="Teams">
            {teams.map(team => (
              <TeamLink key={team.id} team={team} pathname={pathname} />
            ))}
            {teams.length === 0 && (
              <p className="text-xs text-[#8b949e] px-3 py-2">No teams yet</p>
            )}
          </nav>
        </div>

        {/* Bottom nav */}
        <div className="border-t border-[#30363d] px-3 py-4 space-y-0.5 shrink-0">
          <Link
            href="/dashboard"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === '/dashboard'
                ? 'bg-[#21262d] text-white'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <span className="font-mono text-[#3fb950] text-xs shrink-0">⬡</span>
            All Teams
          </Link>
          <Link
            href="/dashboard/templates"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname?.startsWith('/dashboard/templates')
                ? 'bg-[#21262d] text-white'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <span className="font-mono text-[#3fb950] text-xs shrink-0">⊞</span>
            Templates
          </Link>
          <Link
            href="/dashboard/settings"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname?.startsWith('/dashboard/settings')
                ? 'bg-[#21262d] text-white'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'
            }`}
          >
            <span className="font-mono text-[#3fb950] text-xs shrink-0">⚙</span>
            Settings
          </Link>
        </div>
      </aside>

      {/* Main content — offset right by sidebar width; pages own their top padding */}
      <div className="flex-1 pl-56">
        {children}
      </div>
    </div>
  )
}
