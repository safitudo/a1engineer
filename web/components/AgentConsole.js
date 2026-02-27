'use client'

import { useEffect, useRef } from 'react'

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080'

/**
 * AgentConsole — Phase 3 interactive terminal.
 * Connects to Manager WS (/ws), sends console.attach to stream tmux output
 * via xterm.js, and forwards keystrokes via console.input.
 *
 * Props: { teamId, agentId, onClose }
 */
export default function AgentConsole({ teamId, agentId, onClose }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    let terminal = null
    let fitAddon = null
    let ws = null
    let attached = false
    let disposed = false
    let lastData = null
    let dataDisposable = null
    let observer = null

    async function init() {
      // Dynamic import — xterm.js is browser-only
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      // Load xterm CSS once
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

      // Forward keystrokes to tmux via WS
      dataDisposable = terminal.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN && attached) {
          ws.send(JSON.stringify({ type: 'console.input', agentId, data }))
        }
      })

      // Resize terminal when container size changes
      observer = new ResizeObserver(() => {
        if (!terminal || !fitAddon) return
        try { fitAddon.fit() } catch { /* container may be hidden */ }
        const { cols, rows } = terminal
        if (ws?.readyState === WebSocket.OPEN && attached) {
          ws.send(JSON.stringify({ type: 'console.resize', agentId, cols, rows }))
        }
      })
      observer.observe(containerRef.current)

      terminal.writeln('\x1b[90mConnecting…\x1b[0m')

      // Fetch WS token (bridges httpOnly cookie)
      let token
      try {
        const res = await fetch('/api/auth/ws-token')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        ;({ token } = await res.json())
      } catch (err) {
        terminal.writeln(`\x1b[31m[error] Failed to get token: ${err.message}\x1b[0m`)
        return
      }

      if (disposed) return

      ws = new WebSocket(`${WS_BASE}/ws`)

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }))
      }

      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }

        switch (msg.type) {
          case 'authenticated':
            ws.send(JSON.stringify({ type: 'console.attach', teamId, agentId }))
            break

          case 'console.attached':
            attached = true
            terminal.clear()
            break

          case 'console.data': {
            if (msg.data === lastData) break
            lastData = msg.data
            // Full tmux snapshot — overwrite visible area, preserve scrollback
            terminal.write('\x1b[2J\x1b[H')
            terminal.write(msg.data)
            break
          }

          case 'console.detached':
            attached = false
            terminal.writeln('\r\n\x1b[33m[detached]\x1b[0m')
            break

          case 'error':
            terminal.writeln(`\r\n\x1b[31m[error] ${msg.code}: ${msg.message}\x1b[0m`)
            break
        }
      }

      ws.onclose = () => {
        if (!disposed && terminal) {
          terminal.writeln('\r\n\x1b[33m[disconnected]\x1b[0m')
        }
      }

      ws.onerror = () => {
        if (terminal) terminal.writeln('\r\n\x1b[31m[connection error]\x1b[0m')
      }
    }

    init()

    return () => {
      disposed = true
      dataDisposable?.dispose()
      observer?.disconnect()
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'console.detach', agentId }))
          ws.close()
        } else {
          ws.close()
        }
      }
      terminal?.dispose()
    }
  }, [teamId, agentId])

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
