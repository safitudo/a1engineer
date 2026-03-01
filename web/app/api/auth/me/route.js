import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { MANAGER_URL } from '../../../../lib/config'

function maskKey(key) {
  if (!key || key.length < 8) return '***'
  return 'sk-...' + key.slice(-4)
}

export async function GET() {
  const cookieStore = await cookies()
  const apiKey = cookieStore.get('a1_api_key')?.value
  if (!apiKey) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  let tenantId = null
  try {
    const res = await fetch(`${MANAGER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) {
      const data = await res.json()
      tenantId = data.tenantId ?? null
    }
  } catch {
    // tenantId remains null
  }

  return NextResponse.json({ maskedKey: maskKey(apiKey), tenantId })
}
