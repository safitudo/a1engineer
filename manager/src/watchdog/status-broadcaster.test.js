import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildBroadcastMessage, startStatusBroadcaster } from './status-broadcaster.js'

vi.mock('../store/teams.js', () => ({
  listTeams: vi.fn(),
}))

vi.mock('../irc/gateway.js', () => ({
  getGateway: vi.fn(),
}))

vi.mock('../irc/router.js', () => ({
  routeMessage: vi.fn(),
}))

vi.mock('../store/channels.js', () => ({
  listTeamChannels: vi.fn(),
}))

import { listTeams } from '../store/teams.js'
import { getGateway } from '../irc/gateway.js'
import { routeMessage } from '../irc/router.js'
import { listTeamChannels } from '../store/channels.js'

const makeTeam = (overrides = {}) => ({
  id: 'team-1',
  name: 'alpha',
  status: 'running',
  agents: [
    { role: 'lead', prompt: 'Coordinate the team. Review PRs daily.' },
    { role: 'dev',  prompt: null },
  ],
  statusBroadcast: undefined,
  ...overrides,
})

const makeSay = () => vi.fn()

// Advance fake timers by one DEFAULT interval (5 min) and flush micro-tasks
async function tick(ms = 5 * 60 * 1000) {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  // Default: channel store returns empty list (channelId resolves to null)
  listTeamChannels.mockReturnValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

// ── buildBroadcastMessage ─────────────────────────────────────────────────

describe('buildBroadcastMessage', () => {
  it('formats message with @all statuses prefix', () => {
    const team = makeTeam()
    const msg = buildBroadcastMessage(team)
    expect(msg).toMatch(/^@all statuses \| Team: alpha \| Agents: /)
  })

  it('includes first sentence of agent prompt', () => {
    const team = makeTeam()
    const msg = buildBroadcastMessage(team)
    // 'Coordinate the team.' is the first sentence
    expect(msg).toContain('lead — Coordinate the team.')
  })

  it('omits em-dash when agent has no prompt', () => {
    const team = makeTeam()
    const msg = buildBroadcastMessage(team)
    // dev has null prompt — just role, no em-dash
    expect(msg).toContain(', dev')
    expect(msg).not.toMatch(/dev —/)
  })

  it('extracts sentence terminated by !', () => {
    const team = makeTeam({
      agents: [{ role: 'qa', prompt: 'Run all tests! Then report.' }],
    })
    expect(buildBroadcastMessage(team)).toContain('qa — Run all tests!')
  })

  it('extracts sentence terminated by ?', () => {
    const team = makeTeam({
      agents: [{ role: 'qa', prompt: 'Is the build green? Check CI.' }],
    })
    expect(buildBroadcastMessage(team)).toContain('qa — Is the build green?')
  })

  it('uses full trimmed text when no sentence terminator found', () => {
    const team = makeTeam({
      agents: [{ role: 'ops', prompt: 'Monitor infrastructure health' }],
    })
    expect(buildBroadcastMessage(team)).toContain('ops — Monitor infrastructure health')
  })

  it('renders "none" when agents array is empty', () => {
    const team = makeTeam({ agents: [] })
    expect(buildBroadcastMessage(team)).toBe('@all statuses | Team: alpha | Agents: none')
  })

  it('renders "none" when agents is undefined', () => {
    const team = makeTeam({ agents: undefined })
    expect(buildBroadcastMessage(team)).toBe('@all statuses | Team: alpha | Agents: none')
  })
})

// ── startStatusBroadcaster ────────────────────────────────────────────────

describe('startStatusBroadcaster', () => {
  it('calls gw.say with broadcast message on each tick', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(say).toHaveBeenCalledOnce()
    const [channel, text] = say.mock.calls[0]
    expect(channel).toBe('#main')
    expect(text).toMatch(/^@all statuses \| Team: alpha/)
  })

  it('calls routeMessage to populate ring buffer', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(routeMessage).toHaveBeenCalledOnce()
    const event = routeMessage.mock.calls[0][0]
    expect(event.teamId).toBe('team-1')
    expect(event.channel).toBe('#main')
    expect(event.nick).toBe('manager-alpha')
    expect(event.text).toMatch(/^@all statuses \| Team: alpha/)
    expect(event.time).toBeTruthy()
  })

  it('routeMessage receives channelId from listTeamChannels', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say })
    listTeamChannels.mockReturnValue([{ id: 'ch-main-id', name: '#main' }])

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    const event = routeMessage.mock.calls[0][0]
    expect(event.channelId).toBe('ch-main-id')
  })

  it('routeMessage receives null channelId when channel not found in store', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say })
    listTeamChannels.mockReturnValue([]) // no channels registered

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    const event = routeMessage.mock.calls[0][0]
    expect(event.channelId).toBeNull()
  })

  it('skips teams not in running status', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam({ status: 'stopped' })])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(say).not.toHaveBeenCalled()
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('skips teams with statusBroadcast.enabled === false', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam({ statusBroadcast: { enabled: false } })])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(say).not.toHaveBeenCalled()
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('skips teams where getGateway returns null', async () => {
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue(null)

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(getGateway).toHaveBeenCalledWith('team-1')
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('uses custom channel from statusBroadcast config', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam({ statusBroadcast: { channel: '#status' } })])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(say.mock.calls[0][0]).toBe('#status')
    expect(routeMessage.mock.calls[0][0].channel).toBe('#status')
  })

  it('defaults to #main when statusBroadcast.channel is not set', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam({ statusBroadcast: {} })])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(say.mock.calls[0][0]).toBe('#main')
    expect(routeMessage.mock.calls[0][0].channel).toBe('#main')
  })

  it('broadcasts to multiple running teams in one tick', async () => {
    const say1 = makeSay()
    const say2 = makeSay()
    listTeams.mockReturnValue([
      makeTeam({ id: 'team-1', name: 'alpha' }),
      makeTeam({ id: 'team-2', name: 'beta' }),
    ])
    getGateway
      .mockReturnValueOnce({ say: say1 })
      .mockReturnValueOnce({ say: say2 })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    stop()

    expect(say1).toHaveBeenCalledOnce()
    expect(say2).toHaveBeenCalledOnce()
    expect(routeMessage).toHaveBeenCalledTimes(2)
  })

  it('still calls routeMessage when gw.say() throws', async () => {
    const sayThrow = vi.fn().mockImplementation(() => { throw new Error('IRC disconnected') })
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say: sayThrow })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await expect(tick()).resolves.not.toThrow()
    stop()

    expect(sayThrow).toHaveBeenCalledOnce()
    // routeMessage must still be called even when gw.say fails
    expect(routeMessage).toHaveBeenCalledOnce()
  })

  it('continues to other teams when one gw.say() throws', async () => {
    const say2 = makeSay()
    const sayThrow = vi.fn().mockImplementation(() => { throw new Error('IRC disconnected') })
    listTeams.mockReturnValue([
      makeTeam({ id: 'team-1', name: 'alpha' }),
      makeTeam({ id: 'team-2', name: 'beta' }),
    ])
    getGateway
      .mockReturnValueOnce({ say: sayThrow })
      .mockReturnValueOnce({ say: say2 })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await expect(tick()).resolves.not.toThrow()
    stop()

    expect(say2).toHaveBeenCalledOnce()
    expect(routeMessage).toHaveBeenCalledTimes(2)
  })

  it('stop() halts the interval — no further say() or routeMessage() calls', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    stop()

    await tick()
    expect(say).not.toHaveBeenCalled()
    expect(routeMessage).not.toHaveBeenCalled()
  })

  it('fires again on a second tick', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 5 * 60 * 1000 })
    await tick()
    await tick()
    stop()

    expect(say).toHaveBeenCalledTimes(2)
    expect(routeMessage).toHaveBeenCalledTimes(2)
  })

  it('respects custom intervalMs option', async () => {
    const say = makeSay()
    listTeams.mockReturnValue([makeTeam()])
    getGateway.mockReturnValue({ say })

    const { stop } = startStatusBroadcaster({ intervalMs: 1000 })
    // Should not fire before 1000 ms
    await vi.advanceTimersByTimeAsync(999)
    expect(say).not.toHaveBeenCalled()

    // Fires exactly at 1000 ms
    await vi.advanceTimersByTimeAsync(1)
    expect(say).toHaveBeenCalledOnce()
    stop()
  })
})
