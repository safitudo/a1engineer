import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startNudger } from './nudger.js'

// Mock FIFO — verify nudger uses the shared module, not tmux directly
vi.mock('../orchestrator/fifo.js', () => ({
  writeFifo: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../store/teams.js', () => ({
  listTeams: vi.fn(),
}))

import { writeFifo } from '../orchestrator/fifo.js'
import { listTeams } from '../store/teams.js'

const NOW = new Date('2024-01-01T12:00:00.000Z').getTime()

// Agent idle for 10 minutes (well above any default threshold)
const STALE_HB = new Date(NOW - 10 * 60 * 1000).toISOString()
// Agent active 1 second ago
const FRESH_HB = new Date(NOW - 1000).toISOString()

const makeTeam = (overrides = {}) => ({
  id: 'team-1',
  status: 'running',
  autoNudge: { enabled: true, idleThresholdSeconds: 300 },
  agents: [
    { id: 'agent-dev', role: 'dev', last_heartbeat: STALE_HB },
  ],
  ...overrides,
})

// Advance fake timers by one CHECK_INTERVAL (15s) and flush micro-tasks
async function tick() {
  await vi.advanceTimersByTimeAsync(15_000)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startNudger', () => {
  it('calls writeFifo with nudge command for idle agent', async () => {
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).toHaveBeenCalledOnce()
    const [teamId, agentId, command] = writeFifo.mock.calls[0]
    expect(teamId).toBe('team-1')
    expect(agentId).toBe('agent-dev')
    expect(command).toMatch(/^nudge /)
  })

  it('FIFO command is nudge <message>, not tmux send-keys', async () => {
    const nudgeMessage = 'continue. check IRC with msg read, then resume your current task.'
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startNudger()
    await tick()
    stop()

    const command = writeFifo.mock.calls[0][2]
    expect(command).toBe(`nudge ${nudgeMessage}`)
    // Must NOT be a raw tmux call
    expect(command).not.toContain('tmux')
    expect(command).not.toContain('send-keys')
  })

  it('uses custom nudge message from team config', async () => {
    const customMsg = 'wake up and check your tasks'
    listTeams.mockReturnValue([
      makeTeam({ autoNudge: { enabled: true, idleThresholdSeconds: 300, nudgeMessage: customMsg } }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    const command = writeFifo.mock.calls[0][2]
    expect(command).toBe(`nudge ${customMsg}`)
  })

  it('skips agents below idle threshold', async () => {
    listTeams.mockReturnValue([
      makeTeam({
        agents: [{ id: 'agent-dev', role: 'dev', last_heartbeat: FRESH_HB }],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).not.toHaveBeenCalled()
  })

  it('skips agents with no heartbeat', async () => {
    listTeams.mockReturnValue([
      makeTeam({
        agents: [{ id: 'agent-dev', role: 'dev', last_heartbeat: null }],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).not.toHaveBeenCalled()
  })

  it('skips chuck role by default', async () => {
    listTeams.mockReturnValue([
      makeTeam({
        agents: [{ id: 'agent-chuck', role: 'chuck', last_heartbeat: STALE_HB }],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).not.toHaveBeenCalled()
  })

  it('nudges chuck when includeChuck is true', async () => {
    listTeams.mockReturnValue([
      makeTeam({
        autoNudge: { enabled: true, idleThresholdSeconds: 300, includeChuck: true },
        agents: [{ id: 'agent-chuck', role: 'chuck', last_heartbeat: STALE_HB }],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).toHaveBeenCalledOnce()
    const [teamId, agentId] = writeFifo.mock.calls[0]
    expect(teamId).toBe('team-1')
    expect(agentId).toBe('agent-chuck')
  })

  it('skips chuck but nudges other agents when includeChuck is false', async () => {
    listTeams.mockReturnValue([
      makeTeam({
        autoNudge: { enabled: true, idleThresholdSeconds: 300, includeChuck: false },
        agents: [
          { id: 'agent-chuck', role: 'chuck', last_heartbeat: STALE_HB },
          { id: 'agent-dev', role: 'dev', last_heartbeat: STALE_HB },
        ],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).toHaveBeenCalledOnce()
    expect(writeFifo.mock.calls[0][1]).toBe('agent-dev')
  })

  it('skips teams not in running status', async () => {
    listTeams.mockReturnValue([makeTeam({ status: 'stopped' })])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).not.toHaveBeenCalled()
  })

  it('skips teams with autoNudge disabled', async () => {
    listTeams.mockReturnValue([makeTeam({ autoNudge: { enabled: false } })])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).not.toHaveBeenCalled()
  })

  it('nudges multiple idle agents across multiple teams', async () => {
    listTeams.mockReturnValue([
      makeTeam({
        id: 'team-1',
        agents: [
          { id: 'agent-dev', role: 'dev', last_heartbeat: STALE_HB },
          { id: 'agent-qa', role: 'qa', last_heartbeat: STALE_HB },
        ],
      }),
      makeTeam({
        id: 'team-2',
        agents: [{ id: 'agent-lead', role: 'lead', last_heartbeat: STALE_HB }],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(writeFifo).toHaveBeenCalledTimes(3)
  })

  it('continues nudging other agents when one FIFO call fails', async () => {
    writeFifo
      .mockRejectedValueOnce(new Error('docker exec failed'))
      .mockResolvedValue(undefined)

    listTeams.mockReturnValue([
      makeTeam({
        agents: [
          { id: 'agent-dev', role: 'dev', last_heartbeat: STALE_HB },
          { id: 'agent-qa', role: 'qa', last_heartbeat: STALE_HB },
        ],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    stop()

    // Both should have been attempted; first failed, second succeeded
    expect(writeFifo).toHaveBeenCalledTimes(2)
  })

  it('stop() halts the interval', async () => {
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startNudger()
    stop()

    await tick()
    expect(writeFifo).not.toHaveBeenCalled()
  })
})
