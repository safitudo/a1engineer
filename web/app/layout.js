import './globals.css'
import Header from '@/components/Header'

export const metadata = {
  title: 'A1 Engineer — Hire your agent team today',
  description: 'Containerized orchestration platform for AI coding agent teams. Isolated environments, real-time IRC coordination, git-native workflow.',
  keywords: ['AI agents', 'coding agents', 'Claude Code', 'orchestration', 'developer tools'],
  openGraph: {
    title: 'A1 Engineer — Hire your agent team today',
    description: 'Containerized orchestration platform for AI coding agent teams.',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <footer className="border-t border-[#30363d] py-10 mt-20">
          <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[#8b949e]">
            <div className="flex items-center gap-2">
              <span className="text-[#3fb950] font-mono font-semibold">a1</span>
              <span>engineer</span>
              <span className="mx-2">·</span>
              <span>© 2026</span>
            </div>
            <nav className="flex items-center gap-6" aria-label="Footer navigation">
              <a href="/docs" className="hover:text-white transition-colors">Docs</a>
              <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms</a>
              <a href="https://github.com/safitudo/a1engineer" className="hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">GitHub</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  )
}
