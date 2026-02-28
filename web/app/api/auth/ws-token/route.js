import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const MANAGER_URL = process.env.MANAGER_API_URL ?? 'http://localhost:8080'

/**
 * GET /api/auth/ws-token — exchange httpOnly API key cookie for a single-use
 * opaque WS token (60s TTL). The raw API key is never exposed to client-side JS.
 */
export async function GET() {
  const cookieStore = await cookies()
  const apiKey = cookieStore.get('a1_api_key')?.value
  if (!apiKey) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  let resp
  try {
    resp = await fetch(`${MANAGER_URL}/api/auth/ws-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  } catch (err) {
    return NextResponse.json({ error: 'manager unreachable', detail: err.message }, { status: 502 })
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    return NextResponse.json({ error: body.error ?? 'token request failed' }, { status: resp.status })
  }

  const { token } = await resp.json()
  return NextResponse.json({ token })
}
