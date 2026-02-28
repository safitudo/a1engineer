import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import http from 'http'
import { execFile } from 'child_process'
import { createApp } from './index.js'
import { listTeams, deleteTeam, createTeam } from '../store/teams.js'
import { initDb, closeDb } from '../store/db.js'

// Mock compose to avoid Docker calls
vi.mock('../orchestrator/compose.js', () => ({
  startTeam: vi.fn().mockResolvedValue(undefined),
  stopTeam: vi.fn().mockResolvedValue(undefined),
  rewriteCompose: vi.fn().mockResolvedValue(undefined),
  startAgentService: vi.fn().mockResolvedValue(undefined),
}))

// Mock ws to avoid real WebSocket broadcasts
vi.mock('./ws.js', () => ({
  broadcastAgentStatus: vi.fn(),
  broadcastHeartbeat: vi.fn(),
  broadcastTeamStatus: vi.fn(),
}))

// Mock IRC gateway to avoid real TCP connections
vi.mock('../irc/gateway.js', () => ({
  createGateway: vi.fn(),
  destroyGateway: vi.fn(),
  getGateway: vi.fn().mockReturnValue(null),
}))

// Mock IRC router for isolation
vi.mock('../irc/router.js', () => ({
  routeMessage: vi.fn(),
  clearTeamBuffers: vi.fn(),
  readMessages: vi.fn().mockReturnValue([]),
  registerBroadcaster: vi.fn().mockReturnValue(() => {}),
}))

// Mock child_process — execFileAsync is promisify(execFile), which uses the
// Symbol.for('nodejs.util.promisify.custom') hook to find the promisified fn.
vi.mock('child_process', () => {
  const execFileFn = vi.fn()
  execFileFn[Symbol.for('nodejs.util.promisify.custom')] = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
  return { execFile: execFileFn, spawn: vi.fn() }
})

// Reference to the promisified mock for per-test control
const execFileAsync = execFile[Symbol.for('nodejs.util.promisify.custom')]

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key-agents',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const req = http.request(opts, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(data) } catch { parsed = data }
        resolve({ status: res.statusCode, body: parsed })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function get(port, path) { return request(port, 'GET', path) }
function post(port, path, body) { return request(port, 'POST', path, body) }
function del(port, path) { return request(port, 'DELETE', path) }

// ── Test setup ────────────────────────────────────────────────────────────────

let server
let port

function startServer() {
  return new Promise((resolve) => {
    const app = createApp()
    server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      resolve()
    })
  })
}

beforeAll(() => initDb(':memory:'))
afterAll(() => closeDb())

beforeEach(async () => {
  vi.clearAllMocks()
  // Re-apply default after clearAllMocks wipes the implementation
  execFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
  await startServer()
})

afterEach(() => {
  for (const t of listTeams()) deleteTeam(t.id)
  return new Promise((resolve) => server.close(resolve))
})

// ── Shared fixture ────────────────────────────────────────────────────────────

// upsertTenant is called by requireAuth on first request — we rely on that
// auto-provisioning to get a tenantId. We create teams with createTeam() using
// the real store so the middleware can look them up.
const TENANT_KEY = 'test-api-key-agents'

// Create a team with one agent directly in the store, owned by the test tenant.
// Must be called AFTER the server starts (to ensure any prior state is cleared).
async function createTeamWithAgent() {
  // First request provisions the tenant — extract tenantId by hitting any endpoint
  // Actually, we can just call createTeam with a dummy tenantId that matches what
  // upsertTenant would create from TENANT_KEY. Since upsertTenant uses the raw key
  // as the tenant identifier in memory, we instead create the team after the first
  // HTTP request so auth middleware provisions the tenant, then we can attach.
  //
  // Simpler approach: create a team via HTTP POST /api/teams, which auto-provisions
  // the tenant, and returns a team with the correct tenantId.
  //
  // We need a team created through the API to be properly owned. However, we don't
  // want to depend on teams API for agents tests. Instead, create via the store
  // directly using upsertTenant logic. Looking at requireTeamOwnership: it sets
  // req.tenantId = req.tenant.id. requireAuth calls upsertTenant(apiKey) which
  // returns/creates a tenant using a deterministic id derived from the key.
  //
  // The simplest fixture: POST /api/teams to create a team (which runs through auth)
  // and return the parsed team so tests can use it.
  const { startTeam } = await import('../orchestrator/compose.js')
  const res = await post(port, '/api/teams', {
    name: 'agent-test-team',
    repo: { url: 'https://github.com/acme/app' },
    agents: [{ id: 'agent-test-1', role: 'dev', model: 'claude-sonnet-4-6' }],
  })
  expect(res.status).toBe(201)
  // Clear startTeam calls from fixture setup
  vi.mocked(startTeam).mockClear()
  return res.body
}

// ── GET /api/teams/:id/agents ─────────────────────────────────────────────────

describe('GET /api/teams/:id/agents', () => {
  it('returns agents array for known team', async () => {
    const team = await createTeamWithAgent()
    const res = await get(port, `/api/teams/${team.id}/agents`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/no-such-team/agents')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ── GET /:agentId/screen ──────────────────────────────────────────────────────

describe('GET /api/teams/:id/agents/:agentId/screen', () => {
  it('returns screen capture for valid team + agent', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    execFileAsync.mockResolvedValueOnce({ stdout: 'hello world\nline2\n', stderr: '' })

    const res = await get(port, `/api/teams/${team.id}/agents/${agent.id}/screen`)
    expect(res.status).toBe(200)
    expect(res.body.agentId).toBe(agent.id)
    expect(res.body.role).toBe(agent.role)
    expect(Array.isArray(res.body.lines)).toBe(true)
    expect(res.body.lineCount).toBeGreaterThan(0)
    expect(res.body.capturedAt).toBeDefined()
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/no-such-team/agents/some-agent/screen')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown agent', async () => {
    const team = await createTeamWithAgent()
    const res = await get(port, `/api/teams/${team.id}/agents/no-such-agent/screen`)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('AGENT_NOT_FOUND')
  })

  it('returns 500 when dockerExec fails', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    execFileAsync.mockRejectedValueOnce(new Error('container not running'))

    const res = await get(port, `/api/teams/${team.id}/agents/${agent.id}/screen`)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('EXEC_ERROR')
  })
})

// ── GET /:agentId/activity ────────────────────────────────────────────────────

describe('GET /api/teams/:id/agents/:agentId/activity', () => {
  it('returns activity data for valid team + agent', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    // 4 parallel dockerExec calls: diffStat, log, branch, status
    execFileAsync
      .mockResolvedValueOnce({ stdout: ' 1 file changed', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'abc1234 fix bug', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'M file.js\n', stderr: '' })

    const res = await get(port, `/api/teams/${team.id}/agents/${agent.id}/activity`)
    expect(res.status).toBe(200)
    expect(res.body.agentId).toBe(agent.id)
    expect(res.body.role).toBe(agent.role)
    expect(res.body.branch).toBe('main')
    expect(res.body.diffStat).toBe('1 file changed')
    expect(Array.isArray(res.body.recentCommits)).toBe(true)
    expect(res.body.status).toBe('M file.js')
    expect(res.body.checkedAt).toBeDefined()
  })

  it('returns 200 with empty fields when all dockerExec calls fail', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    // All 4 calls fail — individual .catch(() => '') swallows them
    execFileAsync.mockRejectedValue(new Error('docker unavailable'))

    const res = await get(port, `/api/teams/${team.id}/agents/${agent.id}/activity`)
    expect(res.status).toBe(200)
    expect(res.body.branch).toBe('')
    expect(res.body.diffStat).toBe('')
    expect(res.body.recentCommits).toEqual([])
    expect(res.body.status).toBe('')

    // Restore default for subsequent tests
    execFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
  })

  it('returns 404 for unknown team', async () => {
    const res = await get(port, '/api/teams/no-such-team/agents/some-agent/activity')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown agent', async () => {
    const team = await createTeamWithAgent()
    const res = await get(port, `/api/teams/${team.id}/agents/no-such-agent/activity`)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('AGENT_NOT_FOUND')
  })
})

// ── POST /:agentId/nudge ──────────────────────────────────────────────────────

describe('POST /api/teams/:id/agents/:agentId/nudge', () => {
  it('sends default nudge message when none provided', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/nudge`, {})
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.message).toContain('continue')
  })

  it('sends custom nudge message when provided', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/nudge`, { message: 'please check #tasks' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.message).toBe('please check #tasks')

    // Verify writeFifo was called with nudge prefix
    const calls = vi.mocked(execFileAsync).mock.calls
    const fifoCall = calls.find((c) => Array.isArray(c[1]) && c[1].some((a) => typeof a === 'string' && a.includes('nudge.fifo')))
    expect(fifoCall).toBeDefined()
  })

  it('returns 404 for unknown team', async () => {
    const res = await post(port, '/api/teams/no-such-team/agents/some-agent/nudge', {})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown agent', async () => {
    const team = await createTeamWithAgent()
    const res = await post(port, `/api/teams/${team.id}/agents/no-such-agent/nudge`, {})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('AGENT_NOT_FOUND')
  })

  it('returns 500 when writeFifo fails', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    execFileAsync.mockRejectedValueOnce(new Error('container not running'))

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/nudge`, {})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('EXEC_ERROR')
  })
})

// ── POST /:agentId/interrupt ──────────────────────────────────────────────────

describe('POST /api/teams/:id/agents/:agentId/interrupt', () => {
  it('returns ok: true on success', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/interrupt`, {})
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.action).toBe('interrupt')
  })

  it('returns 404 for unknown team', async () => {
    const res = await post(port, '/api/teams/no-such-team/agents/some-agent/interrupt', {})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown agent', async () => {
    const team = await createTeamWithAgent()
    const res = await post(port, `/api/teams/${team.id}/agents/no-such-agent/interrupt`, {})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('AGENT_NOT_FOUND')
  })

  it('returns 500 when writeFifo fails', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    execFileAsync.mockRejectedValueOnce(new Error('container not running'))

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/interrupt`, {})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('EXEC_ERROR')
  })
})

// ── POST /:agentId/directive ──────────────────────────────────────────────────

describe('POST /api/teams/:id/agents/:agentId/directive', () => {
  it('sends directive message and returns ok', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/directive`, { message: 'fix the bug in auth.js' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.action).toBe('directive')
    expect(res.body.message).toBe('fix the bug in auth.js')
  })

  it('returns 400 when message is missing', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/directive`, {})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_MESSAGE')
  })

  it('returns 400 when message is not a string', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/directive`, { message: 42 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_MESSAGE')
  })

  it('returns 404 for unknown team', async () => {
    const res = await post(port, '/api/teams/no-such-team/agents/some-agent/directive', { message: 'do something' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown agent', async () => {
    const team = await createTeamWithAgent()
    const res = await post(port, `/api/teams/${team.id}/agents/no-such-agent/directive`, { message: 'do something' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('AGENT_NOT_FOUND')
  })

  it('returns 500 when writeFifo fails', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    execFileAsync.mockRejectedValueOnce(new Error('container not running'))

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/directive`, { message: 'do something' })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('EXEC_ERROR')
  })
})

// ── POST /:agentId/exec ───────────────────────────────────────────────────────

describe('POST /api/teams/:id/agents/:agentId/exec', () => {
  it('returns ok: true with output on success', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    execFileAsync.mockResolvedValueOnce({ stdout: 'total 0\n', stderr: '' })

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/exec`, { command: ['ls', '-la'] })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.output).toBe('total 0')
  })

  it('returns 200 ok: false (not 500) when docker exec exits non-zero', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    const err = Object.assign(new Error('exit 1'), { stderr: 'permission denied', code: 1 })
    execFileAsync.mockRejectedValueOnce(err)

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/exec`, { command: ['cat', '/etc/shadow'] })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.output).toBe('permission denied')
    expect(res.body.code).toBe(1)
  })

  it('returns 400 when command is missing', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/exec`, {})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_COMMAND')
  })

  it('returns 400 when command is not an array', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/exec`, { command: 'ls -la' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_COMMAND')
  })

  it('returns 400 when command array is empty', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await post(port, `/api/teams/${team.id}/agents/${agent.id}/exec`, { command: [] })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_COMMAND')
  })

  it('returns 404 for unknown team', async () => {
    const res = await post(port, '/api/teams/no-such-team/agents/some-agent/exec', { command: ['ls'] })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown agent', async () => {
    const team = await createTeamWithAgent()
    const res = await post(port, `/api/teams/${team.id}/agents/no-such-agent/exec`, { command: ['ls'] })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('AGENT_NOT_FOUND')
  })
})

// ── POST /api/teams/:id/agents (spawn) ────────────────────────────────────────

describe('POST /api/teams/:id/agents (spawn)', () => {
  it('adds agent to team and returns 201', async () => {
    const team = await createTeamWithAgent()

    const res = await post(port, `/api/teams/${team.id}/agents`, { role: 'qa', model: 'claude-haiku-4-5-20251001' })
    expect(res.status).toBe(201)
    expect(res.body.role).toBe('qa')
    expect(res.body.model).toBe('claude-haiku-4-5-20251001')
    expect(res.body.id).toContain('qa')
  })

  it('uses default model when not specified', async () => {
    const team = await createTeamWithAgent()

    const res = await post(port, `/api/teams/${team.id}/agents`, { role: 'dev' })
    expect(res.status).toBe(201)
    expect(res.body.model).toBe('claude-opus-4-6')
  })

  it('returns 400 when role is missing', async () => {
    const team = await createTeamWithAgent()

    const res = await post(port, `/api/teams/${team.id}/agents`, { model: 'claude-opus-4-6' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_ROLE')
  })

  it('returns 404 for unknown team', async () => {
    const res = await post(port, '/api/teams/no-such-team/agents', { role: 'dev' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 500 when rewriteCompose fails', async () => {
    const team = await createTeamWithAgent()
    // Set rejection AFTER creating the team, so fixture creation is not affected
    const { rewriteCompose } = await import('../orchestrator/compose.js')
    vi.mocked(rewriteCompose).mockRejectedValueOnce(new Error('docker daemon unavailable'))

    const res = await post(port, `/api/teams/${team.id}/agents`, { role: 'dev' })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('COMPOSE_ERROR')
  })

  it('rolls back agent addition when rewriteCompose fails', async () => {
    const team = await createTeamWithAgent()
    const originalAgentCount = team.agents.length

    const { rewriteCompose } = await import('../orchestrator/compose.js')
    vi.mocked(rewriteCompose).mockRejectedValueOnce(new Error('docker daemon unavailable'))

    await post(port, `/api/teams/${team.id}/agents`, { role: 'dev' })

    // Agent list should be restored to original length
    const agentsRes = await get(port, `/api/teams/${team.id}/agents`)
    expect(agentsRes.body.length).toBe(originalAgentCount)
  })

  it('calls startAgentService with correct teamId and agentId', async () => {
    const team = await createTeamWithAgent()
    const { startAgentService } = await import('../orchestrator/compose.js')
    vi.mocked(startAgentService).mockClear()

    const res = await post(port, `/api/teams/${team.id}/agents`, { role: 'qa' })
    expect(res.status).toBe(201)
    expect(vi.mocked(startAgentService)).toHaveBeenCalledWith(team.id, res.body.id)
  })

  it('broadcasts spawned status after successful spawn', async () => {
    const team = await createTeamWithAgent()
    const { broadcastAgentStatus } = await import('./ws.js')
    vi.mocked(broadcastAgentStatus).mockClear()

    const res = await post(port, `/api/teams/${team.id}/agents`, { role: 'qa' })
    expect(res.status).toBe(201)
    expect(vi.mocked(broadcastAgentStatus)).toHaveBeenCalledWith(team.id, res.body.id, 'spawned')
  })
})

// ── DELETE /api/teams/:id/agents/:agentId ────────────────────────────────────

describe('DELETE /api/teams/:id/agents/:agentId', () => {
  it('removes agent from team and returns 204', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]

    const res = await del(port, `/api/teams/${team.id}/agents/${agent.id}`)
    expect(res.status).toBe(204)

    // Agent should be gone from the store
    const agentsRes = await get(port, `/api/teams/${team.id}/agents`)
    expect(agentsRes.body.find((a) => a.id === agent.id)).toBeUndefined()
  })

  it('returns 204 even when docker stop/rm fails (container already gone)', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    // Both docker calls fail
    execFileAsync
      .mockRejectedValueOnce(new Error('no such container'))
      .mockRejectedValueOnce(new Error('no such container'))

    const res = await del(port, `/api/teams/${team.id}/agents/${agent.id}`)
    expect(res.status).toBe(204)
  })

  it('returns 404 for unknown team', async () => {
    const res = await del(port, '/api/teams/no-such-team/agents/some-agent')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown agent', async () => {
    const team = await createTeamWithAgent()
    const res = await del(port, `/api/teams/${team.id}/agents/no-such-agent`)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('AGENT_NOT_FOUND')
  })

  it('broadcasts killed status after removing agent', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    const { broadcastAgentStatus } = await import('./ws.js')
    vi.mocked(broadcastAgentStatus).mockClear()

    const res = await del(port, `/api/teams/${team.id}/agents/${agent.id}`)
    expect(res.status).toBe(204)
    expect(vi.mocked(broadcastAgentStatus)).toHaveBeenCalledWith(team.id, agent.id, 'killed')
  })

  it('rewrites compose after removing agent', async () => {
    const team = await createTeamWithAgent()
    const agent = team.agents[0]
    const { rewriteCompose } = await import('../orchestrator/compose.js')
    vi.mocked(rewriteCompose).mockClear()

    const res = await del(port, `/api/teams/${team.id}/agents/${agent.id}`)
    expect(res.status).toBe(204)
    expect(vi.mocked(rewriteCompose)).toHaveBeenCalledOnce()
    // Confirm compose was written without the deleted agent
    const callArg = vi.mocked(rewriteCompose).mock.calls[0][0]
    expect(callArg.agents.find((a) => a.id === agent.id)).toBeUndefined()
  })
})
