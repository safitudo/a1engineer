import Link from 'next/link'

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#30363d] bg-[#0d1117]/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-white font-semibold text-lg">
          <span className="text-[#3fb950] font-mono">a1</span>
          <span>engineer</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-[#8b949e]" aria-label="Main navigation">
          <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
          <Link href="/#how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-[#8b949e] hover:text-white transition-colors px-3 py-1.5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold px-4 py-1.5 rounded-md transition-colors"
            aria-label="Sign up for A1 Engineer"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  )
}
