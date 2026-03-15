import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startStatusBroadcaster, buildRoster, firstSentence } from './status-broadcaster.js'

vi.mock('../store/teams.js', () => ({
  listTeams: vi.fn(),
}))

vi.mock('../store/channels.js', () => ({
  listTeamChannels: vi.fn(),
}))

vi.mock('../irc/gateway.js', () => ({
  getGateway: vi.fn(),
}))

vi.mock('../irc/router.js', () => ({
  routeMessage: vi.fn(),
}))

import { listTeams } from '../store/teams.js'
import { listTeamChannels } from '../store/channels.js'
import { getGateway } from '../irc/gateway.js'
import { routeMessage } from '../irc/router.js'

const NOW = new Date('2024-01-01T12:00:00.000Z').getTime()
const DEFAULT_INTERVAL_MS = 300_000 // 5 minutes — must match DEFAULT_INTERVAL_SECONDS * 1000

function makeTeam(overrides = {}) {
  return {
    id: 'team-1',
    name: 'myteam',
    status: 'running',
    agents: [
      { id: 'agent-dev', role: 'dev', prompt: 'Write clean code. Follow best practices.' },
      { id: 'agent-qa', role: 'qa', prompt: 'Test everything carefully.' },
    ],
    ...overrides,
  }
}

// Advance time by the full default broadcast interval (5 min)
// The internal tick is every 60 s so we advance 5 × 60 s = 300 s in one call.
async function tick() {
  await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  // Default: no channels in store (channelId will be null)
  listTeamChannels.mockReturnValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Pure helper tests ────────────────────────────────────────────────────────

describe('firstSentence', () => {
  it('extracts first sentence ending with period', () => {
    expect(firstSentence('Write clean code. Follow best practices.')).toBe('Write clean code.')
  })

  it('extracts first sentence ending with exclamation', () => {
    expect(firstSentence('Ship it! No time to waste.')).toBe('Ship it!')
  })

  it('extracts first sentence ending with question mark', () => {
    expect(firstSentence('Why test? Because bugs.')).toBe('Why test?')
  })

  it('returns the whole string when there is no sentence terminator', () => {
    expect(firstSentence('Write clean code')).toBe('Write clean code')
  })

  it('returns empty string for null prompt', () => {
    expect(firstSentence(null)).toBe('')
  })

  it('returns empty string for undefined prompt', () => {
    expect(firstSentence(undefined)).toBe('')
  })

  it('returns empty string for empty string prompt', () => {
    expect(firstSentence('')).toBe('')
  })
})

describe('buildRoster', () => {
  it('formats each agent as "role — first sentence" when prompt is present', () => {
    const agents = [
      { role: 'dev', prompt: 'Write clean code. Follow best practices.' },
      { role: 'qa', prompt: 'Test everything carefully.' },
    ]
    expect(buildRoster(agents)).toBe('dev — Write clean code., qa — Test everything carefully.')
  })

  it('uses just "role" when agent has no prompt', () => {
    const agents = [
      { role: 'dev', prompt: null },
      { role: 'qa' },
    ]
    expect(buildRoster(agents)).toBe('dev, qa')
  })

  it('returns "(no agents)" for an empty array', () => {
    expect(buildRoster([])).toBe('(no agents)')
  })

  it('returns "(no agents)" for null/undefined agents', () => {
    expect(buildRoster(null)).toBe('(no agents)')
    expect(buildRoster(undefined)).toBe('(no agents)')
  })
})

// ── Interval behaviour tests ─────────────────────────────────────────────────

describe('startStatusBroadcaster', () => {
  it('calls gw.say with "@all statuses" message on #main after 5 minutes', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    expect(mockSay).toHaveBeenCalledOnce()
    const [channel, msg] = mockSay.mock.calls[0]
    expect(channel).toBe('#main')
    expect(msg).toBe(
      '@all statuses | Team: myteam | Agents: dev — Write clean code., qa — Test everything carefully.'
    )
  })

  it('uses custom channel from statusBroadcast config (with # prefix)', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam({ statusBroadcast: { enabled: true, channel: '#testing' } })])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    const [channel] = mockSay.mock.calls[0]
    expect(channel).toBe('#testing')
  })

  it('auto-adds # prefix when channel config omits it', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam({ statusBroadcast: { enabled: true, channel: 'tasks' } })])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    const [channel] = mockSay.mock.calls[0]
    expect(channel).toBe('#tasks')
  })

  it('skips teams not in running status', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam({ status: 'stopped' })])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    expect(mockSay).not.toHaveBeenCalled()
  })

  it('skips teams with statusBroadcast.enabled === false', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam({ statusBroadcast: { enabled: false } })])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    expect(mockSay).not.toHaveBeenCalled()
  })

  it('defaults to enabled when team has no statusBroadcast property', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam({ statusBroadcast: undefined })])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    expect(mockSay).toHaveBeenCalledOnce()
  })

  it('does not broadcast before the interval has elapsed (no early fire)', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startStatusBroadcaster()
    // Advance slightly less than the full interval — no broadcast should fire
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS - 1)
    stop()

    expect(mockSay).not.toHaveBeenCalled()
  })

  it('skips teams with no IRC gateway', async () => {
    getGateway.mockReturnValue(null)
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    // Gateway was attempted — just not connected yet
    expect(getGateway).toHaveBeenCalledWith('team-1')
  })

  it('continues broadcasting to other teams when say() throws', async () => {
    const mockSay = vi.fn()
      .mockImplementationOnce(() => { throw new Error('IRC not connected') })
      .mockReturnValue(undefined)

    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([
      makeTeam({ id: 'team-1', name: 'alpha' }),
      makeTeam({ id: 'team-2', name: 'beta' }),
    ])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    // Both teams were attempted — first threw, second succeeded
    expect(mockSay).toHaveBeenCalledTimes(2)
  })

  it('broadcasts to all running teams in one tick', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([
      makeTeam({ id: 'team-1', name: 'alpha' }),
      makeTeam({ id: 'team-2', name: 'beta' }),
      makeTeam({ id: 'team-3', name: 'gamma', status: 'stopped' }),
    ])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    // Only the two running teams
    expect(mockSay).toHaveBeenCalledTimes(2)
    const messages = mockSay.mock.calls.map(([, msg]) => msg)
    expect(messages).toContainEqual(expect.stringContaining('Team: alpha'))
    expect(messages).toContainEqual(expect.stringContaining('Team: beta'))
  })

  it('broadcasts again after the second 5-minute interval', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startStatusBroadcaster()
    await tick()             // first broadcast at 5 min
    await tick()             // second broadcast at 10 min
    stop()

    expect(mockSay).toHaveBeenCalledTimes(2)
  })

  it('respects per-team intervalSeconds shorter than the default', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([
      makeTeam({ statusBroadcast: { enabled: true, intervalSeconds: 120 } }),
    ])

    const { stop } = startStatusBroadcaster()
    // Advance 120 s — should trigger the 2-minute interval team
    await vi.advanceTimersByTimeAsync(120_000)
    stop()

    expect(mockSay).toHaveBeenCalledOnce()
  })

  it('stop() halts the interval — no broadcasts fire after stop', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startStatusBroadcaster()
    stop()
    await tick()

    expect(mockSay).not.toHaveBeenCalled()
  })

  it('calls routeMessage() after gw.say() to populate the ring buffer', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    const team = makeTeam()
    listTeams.mockReturnValue([team])
    listTeamChannels.mockReturnValue([{ id: 'ch-main-uuid', name: '#main' }])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    expect(routeMessage).toHaveBeenCalledOnce()
    const event = routeMessage.mock.calls[0][0]
    expect(event.teamId).toBe(team.id)
    expect(event.teamName).toBe(team.name)
    expect(event.channel).toBe('#main')
    expect(event.channelId).toBe('ch-main-uuid')
    expect(event.nick).toBe(`manager-${team.name}`)
    expect(event.text).toMatch(/^@all statuses \| Team: myteam \| Agents:/)
    expect(typeof event.time).toBe('string')
  })

  it('passes null channelId to routeMessage when channel not found in store', async () => {
    const mockSay = vi.fn()
    getGateway.mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam()])
    listTeamChannels.mockReturnValue([]) // no matching channel in store

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    expect(routeMessage).toHaveBeenCalledOnce()
    expect(routeMessage.mock.calls[0][0].channelId).toBeNull()
  })

  it('does not call routeMessage when gateway is null', async () => {
    getGateway.mockReturnValue(null)
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startStatusBroadcaster()
    await tick()
    stop()

    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('retries broadcast on the very next tick once gateway becomes available (null-gw does not consume interval)', async () => {
    const mockSay = vi.fn()
    // First call: no gateway. Second call: gateway available.
    getGateway
      .mockReturnValueOnce(null)
      .mockReturnValue({ say: mockSay })
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startStatusBroadcaster()
    // First tick fires at DEFAULT_INTERVAL_MS — gateway is null, no broadcast, lastBroadcast NOT set.
    await tick()
    expect(mockSay).not.toHaveBeenCalled()

    // Second tick fires at 2 × DEFAULT_INTERVAL_MS — gateway available, fires immediately
    // because lastBroadcast was never set, so (now - startTime) >= intervalMs again.
    await tick()
    stop()

    expect(mockSay).toHaveBeenCalledOnce()
  })
})
