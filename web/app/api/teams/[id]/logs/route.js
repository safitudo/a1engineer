import { cookies } from 'next/headers'

const MANAGER_URL = process.env.MANAGER_API_URL ?? 'http://localhost:8080'

export async function GET(req, { params }) {
  const cookieStore = await cookies()
  const apiKey = cookieStore.get('a1_api_key')?.value

  const { id } = await params
  const url = new URL(req.url)
  const search = url.searchParams.toString()
  const target = `${MANAGER_URL}/api/teams/${id}/logs${search ? '?' + search : ''}`

  try {
    const upstream = await fetch(target, {
      headers: { Authorization: apiKey ? `Bearer ${apiKey}` : '' },
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    return Response.json({ error: 'proxy error', detail: err.message }, { status: 502 })
  }
}
