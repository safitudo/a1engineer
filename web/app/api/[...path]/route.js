import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { MANAGER_URL } from '../../../lib/config'

async function proxy(req) {
  const cookieStore = await cookies()
  const apiKey = cookieStore.get('a1_api_key')?.value

  const url = new URL(req.url)
  const target = `${MANAGER_URL}${url.pathname}${url.search}`

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const init = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.text()
    if (body) init.body = body
  }

  try {
    const upstream = await fetch(target, init)
    const data = await upstream.text()
    return new NextResponse(data, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: 'proxy error', detail: err.message }, { status: 502 })
  }
}

export const GET = proxy
export const POST = proxy
export const PATCH = proxy
export const PUT = proxy
export const DELETE = proxy
