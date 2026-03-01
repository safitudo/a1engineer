import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { MANAGER_URL } from '../../../../lib/config'

export async function POST(req) {
  const { apiKey } = await req.json()

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })
  }

  // Validate against Manager
  try {
    const res = await fetch(`${MANAGER_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'invalid API key' }, { status: 401 })
    }

    const data = await res.json()

    // Set httpOnly cookie
    const cookieStore = await cookies()
    cookieStore.set('a1_api_key', apiKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return NextResponse.json({ ok: true, tenantId: data.tenantId })
  } catch (err) {
    return NextResponse.json({ error: 'could not reach manager', detail: err.message }, { status: 502 })
  }
}
