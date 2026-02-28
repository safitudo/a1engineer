'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

// Manager WebSocket URL — Next.js rewrites don't proxy WS upgrades,
// so connect directly to the manager. Override with NEXT_PUBLIC_WS_URL in production.
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080'

const TeamWSContext = createContext(null)

/**
 * useTeamWS — consume the shared WS connection.
 * Returns: { status, subscribe, attachConsole, detachConsole, sendInput, resizeConsole, addListener }
 */
export function useTeamWS() {
  return useContext(TeamWSContext)
}

/**
 * TeamWSProvider — manages a single authenticated WebSocket connection for a team.
 *
 * Wrap the team detail page with this provider so that IrcFeed and AgentConsole
 * share one connection instead of each opening their own.
 *
 * WS lifecycle: connect → {type:'auth'} → {type:'authenticated'} →
 *               {type:'subscribe', teamId} → {type:'subscribed'} → ready
 *
 * Reconnects with exponential backoff (1 s → 2 s → 4 s → … → 30 s max).
 * Resets backoff on successful auth.
 */
export function TeamWSProvider({ teamId, children }) {
  const [status, setStatus] = useState('connecting')
  const wsRef = useRef(null)
  // Map<type, Set<callback>> — listeners registered by child components
  const listenersRef = useRef(new Map())

  // ── Listener registry ─────────────────────────────────────────────────────

  /**
   * Register a handler for a specific WS message type.
   * Returns an unsubscribe function for use in useEffect cleanup.
   */
  const addListener = useCallback((type, callback) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set())
    }
    listenersRef.current.get(type).add(callback)
    return () => listenersRef.current.get(type)?.delete(callback)
  }, [])

  // ── Low-level send ────────────────────────────────────────────────────────

  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  // ── Public API ────────────────────────────────────────────────────────────

  const subscribe = useCallback((tid) => {
    send({ type: 'subscribe', teamId: tid })
  }, [send])

  const attachConsole = useCallback((tid, agentId) => {
    send({ type: 'console.attach', teamId: tid, agentId })
  }, [send])

  const detachConsole = useCallback((agentId) => {
    send({ type: 'console.detach', agentId })
  }, [send])

  const sendInput = useCallback((agentId, data) => {
    send({ type: 'console.input', agentId, data })
  }, [send])

  const resizeConsole = useCallback((agentId, cols, rows) => {
    send({ type: 'console.resize', agentId, cols, rows })
  }, [send])

  // ── WS lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!teamId) return

    let cancelled = false
    let retryTimeout = null
    let retryDelay = 1000
    const MAX_DELAY = 30_000

    async function connect() {
      // Fetch WS auth token — bridges httpOnly cookie to the WS frame;
      // token is NEVER placed in the URL query string.
      let token = ''
      try {
        const res = await fetch('/api/auth/ws-token')
        if (res.ok) {
          const data = await res.json()
          token = data.token ?? ''
        }
      } catch { /* proceed without token — server will reject if auth fails */ }

      if (cancelled) return

      const ws = new WebSocket(`${WS_BASE}/ws`)
      wsRef.current = ws
      setStatus('connecting')

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }))
      }

      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }

        if (msg.type === 'authenticated') {
          // Auth accepted — reset backoff and auto-subscribe to this team's feed
          retryDelay = 1000
          ws.send(JSON.stringify({ type: 'subscribe', teamId }))
        } else if (msg.type === 'subscribed') {
          setStatus('connected')
        }

        // Dispatch to all listeners registered for this message type
        const cbs = listenersRef.current.get(msg.type)
        if (cbs) {
          for (const cb of cbs) {
            try { cb(msg) } catch (err) {
              console.error('[TeamWSProvider] listener error:', err)
            }
          }
        }
      }

      ws.onerror = () => {
        // onerror is always followed by onclose; just mark the status
        if (!cancelled) setStatus('error')
      }

      ws.onclose = () => {
        if (cancelled) return
        setStatus('disconnected')
        // Reconnect with exponential backoff
        retryTimeout = setTimeout(() => {
          if (!cancelled) {
            retryDelay = Math.min(retryDelay * 2, MAX_DELAY)
            connect()
          }
        }, retryDelay)
      }
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimeout)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [teamId])

  // ── Context value ─────────────────────────────────────────────────────────

  const value = {
    status,
    subscribe,
    attachConsole,
    detachConsole,
    sendInput,
    resizeConsole,
    addListener,
  }

  return (
    <TeamWSContext.Provider value={value}>
      {children}
    </TeamWSContext.Provider>
  )
}
