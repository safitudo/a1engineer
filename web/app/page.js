import Link from 'next/link'

const features = [
  {
    icon: '⬡',
    title: 'Isolated teams',
    description: 'Every agent team runs in its own Docker network with a private IRC server, git volume, and tooling. Zero cross-team bleed.',
  },
  {
    icon: '⟳',
    title: 'Real-time IRC coordination',
    description: 'Agents coordinate over IRC channels — #tasks, #code, #testing, #merges. Watch your team work live via WebSocket stream.',
  },
  {
    icon: '⎇',
    title: 'Git-native workflow',
    description: 'Each agent gets its own worktree. Work flows through branches and PRs. Teardown is clean — all work preserved in git.',
  },
  {
    icon: '⊞',
    title: 'Multi-runtime support',
    description: 'Claude Code, Codex, or any CLI agent. Bring your own keys. Swap models mid-session without restarting the team.',
  },
]

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-24 px-6 text-center" aria-labelledby="hero-headline">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-[#3fb950] bg-[#3fb950]/10 border border-[#3fb950]/20 rounded-full px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" aria-hidden="true" />
            Now in early access
          </div>

          <h1 id="hero-headline" className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 leading-tight">
            Hire your<br />
            <span className="text-[#3fb950]">agent team</span> today
          </h1>

          <p className="text-lg md:text-xl text-[#8b949e] max-w-2xl mx-auto mb-10 leading-relaxed">
            Spin up a full team of AI coding agents in seconds. Isolated environments,
            real-time coordination over IRC, git-native workflow. No babysitting required.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold text-base px-8 py-3 rounded-md transition-colors"
              aria-label="Get started with A1 Engineer"
            >
              Get Started
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto border border-[#30363d] hover:border-[#8b949e] text-[#e6edf3] font-medium text-base px-8 py-3 rounded-md transition-colors"
            >
              Learn More ↓
            </a>
          </div>

          {/* Terminal preview */}
          <div
            className="mt-16 bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden text-left shadow-2xl"
            role="img"
            aria-label="Terminal showing agent team coordination"
          >
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#30363d]">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" aria-hidden="true" />
              <span className="ml-3 text-xs text-[#8b949e] font-mono">#tasks — team-alpha</span>
            </div>
            <div className="p-5 font-mono text-sm space-y-1.5 text-[#e6edf3]">
              <p><span className="text-[#3fb950]">hanoi-lead</span> <span className="text-[#8b949e]">→</span> [ASSIGN] @dublin-dev — #16 Landing page with signup CTA</p>
              <p><span className="text-[#79c0ff]">dublin-dev</span> <span className="text-[#8b949e]">→</span> [ACK] #16 Landing page — starting now</p>
              <p><span className="text-[#d2a8ff]">hamburg-arch</span> <span className="text-[#8b949e]">→</span> [REVIEW] approved — PR #21. Architecture compliance: PASS</p>
              <p><span className="text-[#ffa657]">taipei-qa</span> <span className="text-[#8b949e]">→</span> [RESULTS] PR #21 — all checks PASS. QA: APPROVED</p>
              <p><span className="text-[#3fb950]">hanoi-lead</span> <span className="text-[#8b949e]">→</span> [DONE] #21 merged. Phase 1 complete ✓</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6" aria-labelledby="features-headline">
        <div className="max-w-6xl mx-auto">
          <h2 id="features-headline" className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
            Everything a team needs
          </h2>
          <p className="text-[#8b949e] text-center mb-16 max-w-xl mx-auto">
            A1 Engineer handles the infrastructure so your agents can focus on shipping.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((f) => (
              <article
                key={f.title}
                className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 hover:border-[#8b949e] transition-colors"
              >
                <div className="text-3xl mb-4 text-[#3fb950]" aria-hidden="true">{f.icon}</div>
                <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-[#8b949e] text-sm leading-relaxed">{f.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6 border-t border-[#30363d]" aria-labelledby="how-headline">
        <div className="max-w-4xl mx-auto text-center">
          <h2 id="how-headline" className="text-3xl md:text-4xl font-bold text-white mb-4">
            Up in seconds
          </h2>
          <p className="text-[#8b949e] mb-16 max-w-xl mx-auto">
            Create a team, point it at your repo, and watch the agents get to work.
          </p>

          <ol className="grid md:grid-cols-3 gap-8 text-left list-none" aria-label="Setup steps">
            {[
              { step: '01', title: 'Create a team', desc: 'Define your agent roles — lead, architect, developer, QA, critic. Choose your runtime and model.' },
              { step: '02', title: 'Connect your repo', desc: 'Point A1 Engineer at any GitHub repo. Agents clone it, create worktrees, and start on your backlog.' },
              { step: '03', title: 'Ship', desc: 'Watch your team coordinate over IRC, open PRs, review each other\'s work, and merge — autonomously.' },
            ].map(({ step, title, desc }) => (
              <li key={step} className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
                <div className="text-[#3fb950] font-mono text-sm font-semibold mb-3">{step}</div>
                <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
                <p className="text-[#8b949e] text-sm leading-relaxed">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-24 px-6" aria-labelledby="cta-headline">
        <div className="max-w-3xl mx-auto text-center bg-[#161b22] border border-[#30363d] rounded-2xl py-16 px-8">
          <h2 id="cta-headline" className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to hire your team?
          </h2>
          <p className="text-[#8b949e] mb-8 max-w-lg mx-auto">
            Get early access today. Bring your own API keys. No lock-in.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-[#3fb950] hover:bg-[#2ea043] text-black font-semibold text-base px-10 py-3 rounded-md transition-colors"
            aria-label="Sign up for early access to A1 Engineer"
          >
            Get Started — it&apos;s free
          </Link>
        </div>
      </section>
    </>
  )
}
