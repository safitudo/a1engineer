'use client'

import Link from 'next/link'

export default function Header() {
  return (
    <header className="border-b border-[#30363d] bg-[#161b22]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-white font-semibold">
          <span className="text-[#3fb950] font-mono text-lg">a1</span>
          <span>engineer</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-[#8b949e]">
          <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
          <Link href="/login" className="hover:text-white transition-colors">Login</Link>
        </nav>
      </div>
    </header>
  )
}
