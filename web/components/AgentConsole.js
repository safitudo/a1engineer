'use client'

import { useEffect, useRef } from 'react'
import { useTeamWS } from './TeamWSProvider'

/**
 * AgentConsole — Phase 3 interactive terminal (shared WS via TeamWSProvider).
 * Uses useTeamWS() context for attachConsole/detachConsole/sendInput/resizeConsole
 * instead of managing its own WebSocket connection.
 *
 * Props: { teamId, agentId, onClose }
 */
export default function AgentConsole({ teamId, agentId, onClose }) {
  const containerRef = useRef(null)
  const { attachConsole, detachConsole, sendInput, resizeConsole, addListener } = useTeamWS()

  useEffect(() => {
    if (!containerRef.current) return

    let terminal = null
    let fitAddon = null
    let disposed = false
    let attached = false
    let lastData = null
    let dataUnsubscribe = null
    let attachedUnsubscribe = null
    let observer = null

    async function init() {
      // Dynamic import — xterm.js is browser-only
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      await import('@xterm/xterm/css/xterm.css')

      if (disposed) return

      terminal = new Terminal({
        cursorBlink: true,
        theme: {
          background: '#010409',
          foreground: '#c9d1d9',
          cursor: '#3fb950',
          selectionBackground: '#264f78',
        },
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 12,
        scrollback: 1000,
      })
      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(containerRef.current)
      fitAddon.fit()

      // Listen for console.attached to know when streaming starts
      attachedUnsubscribe = addListener('console.attached', (msg) => {
        if (msg.agentId !== agentId) return
        attached = true
        terminal.clear()
      })

      // Listen for console.data frames — full tmux snapshot every 500ms
      dataUnsubscribe = addListener('console.data', (msg) => {
        if (msg.agentId !== agentId || !terminal) return
        if (msg.data === lastData) return
        lastData = msg.data
        // Overwrite visible area, preserve scrollback
        terminal.write('\x1b[2J\x1b[H')
        terminal.write(msg.data)
      })

      // Forward keystrokes to tmux via shared WS
      terminal.onData((data) => {
        if (attached) sendInput(agentId, data)
      })

      // Resize terminal when container changes — notify server via shared WS
      observer = new ResizeObserver(() => {
        if (!terminal || !fitAddon) return
        try { fitAddon.fit() } catch { /* container may be hidden */ }
        if (attached) resizeConsole(agentId, terminal.cols, terminal.rows)
      })
      observer.observe(containerRef.current)

      terminal.writeln('\x1b[90mAttaching…\x1b[0m')
      attachConsole(teamId, agentId)
    }

    init()

    return () => {
      disposed = true
      dataUnsubscribe?.()
      attachedUnsubscribe?.()
      observer?.disconnect()
      detachConsole(agentId)
      terminal?.dispose()
    }
  }, [teamId, agentId, attachConsole, detachConsole, sendInput, resizeConsole, addListener])

  return (
    <div className="bg-[#010409] border border-[#30363d] rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
        <span className="text-xs font-mono text-[#8b949e] truncate">
          {agentId}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#3fb950]">live</span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[#8b949e] hover:text-white text-xs px-1"
              title="Close console"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* xterm.js mounts here — needs explicit height for FitAddon */}
      <div
        ref={containerRef}
        style={{ minHeight: '200px', padding: '4px' }}
      />
    </div>
  )
}
