import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * GET /api/auth/ws-token — return the API key for WebSocket authentication.
 * The httpOnly cookie can't be read by client JS, so this endpoint
 * bridges the gap for the WS connection which needs the token as a query param.
 */
export async function GET() {
  const cookieStore = await cookies()
  const apiKey = cookieStore.get('a1_api_key')?.value
  if (!apiKey) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }
  return NextResponse.json({ token: apiKey })
}
