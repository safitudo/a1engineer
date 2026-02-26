import { describe, it, expect, afterEach } from 'vitest'
import { createHeartbeatServer } from './collector.js'
import { createTeam, getTeam, listTeams, deleteTeam } from '../store/teams.js'

let server

afterEach(() => {
  if (server) {
    server.close()
    server = null
  }
  for (const team of listTeams()) deleteTeam(team.id)
})

async function post(port, path) {
  const { default: http } = await import('http')
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST' },
      (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function listeningAsync(srv) {
  return new Promise((resolve) => srv.once('listening', resolve))
}

describe('createHeartbeatServer', () => {
  it('returns 200 and updates agent last_heartbeat', async () => {
    const team = createTeam({
      name: 'naples',
      agents: [{ id: 'naples-dev', role: 'dev', model: 'claude-sonnet-4-6' }],
    })

    server = createHeartbeatServer(0)
    await listeningAsync(server)
    const { port } = server.address()

    const res = await post(port, `/heartbeat/${team.id}/naples-dev`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const updated = getTeam(team.id)
    const agent = updated.agents.find((a) => a.id === 'naples-dev')
    expect(agent.last_heartbeat).not.toBeNull()
    expect(agent.last_heartbeat).toBe(res.body.at)
  })

  it('only updates the matched agent, not others', async () => {
    const team = createTeam({
      name: 'naples',
      agents: [
        { id: 'naples-dev', role: 'dev', model: 'claude-sonnet-4-6' },
        { id: 'naples-arch', role: 'arch', model: 'claude-opus-4-6' },
      ],
    })

    server = createHeartbeatServer(0)
    await listeningAsync(server)
    const { port } = server.address()

    await post(port, `/heartbeat/${team.id}/naples-dev`)

    const updated = getTeam(team.id)
    const dev = updated.agents.find((a) => a.id === 'naples-dev')
    const arch = updated.agents.find((a) => a.id === 'naples-arch')
    expect(dev.last_heartbeat).not.toBeNull()
    expect(arch.last_heartbeat).toBeNull()
  })

  it('returns 404 when team not found', async () => {
    server = createHeartbeatServer(0)
    await listeningAsync(server)
    const { port } = server.address()

    const res = await post(port, `/heartbeat/nonexistent/agent-1`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('team not found')
  })

  it('returns 404 for unmatched routes', async () => {
    server = createHeartbeatServer(0)
    await listeningAsync(server)
    const { port } = server.address()

    const res = await post(port, `/unknown/path`)
    expect(res.status).toBe(404)
  })
})
