import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startNudger } from './nudger.js'

// Mock FIFO — verify nudger uses the shared module, not tmux directly
vi.mock('../orchestrator/fifo.js', () => ({
  writeFifo: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../store/teams.js', () => ({
  listTeams: vi.fn(),
}))

vi.mock('../api/ws.js', () => ({
  broadcastAgentStatus: vi.fn(),
}))

import { writeFifo } from '../orchestrator/fifo.js'
import { listTeams } from '../store/teams.js'
import { broadcastAgentStatus } from '../api/ws.js'

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

  it('skips chuck role', async () => {
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

describe('startNudger — stalled/alive status broadcasts', () => {
  it('broadcasts stalled on first nudge', async () => {
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startNudger()
    await tick()
    stop()

    expect(broadcastAgentStatus).toHaveBeenCalledOnce()
    expect(broadcastAgentStatus).toHaveBeenCalledWith('team-1', 'agent-dev', 'stalled')
  })

  it('does not re-broadcast stalled on subsequent ticks', async () => {
    listTeams.mockReturnValue([makeTeam()])

    const { stop } = startNudger()
    await tick()
    await tick()
    stop()

    // Only one stalled broadcast across two ticks
    const stalledCalls = broadcastAgentStatus.mock.calls.filter(([, , s]) => s === 'stalled')
    expect(stalledCalls).toHaveLength(1)
  })

  it('broadcasts alive when stalled agent heartbeat refreshes below threshold', async () => {
    // First tick: agent is stalled (STALE_HB)
    listTeams.mockReturnValueOnce([makeTeam()])
    // Second tick: agent heartbeat refreshed (FRESH_HB)
    listTeams.mockReturnValue([
      makeTeam({
        agents: [{ id: 'agent-dev', role: 'dev', last_heartbeat: FRESH_HB }],
      }),
    ])

    const { stop } = startNudger()
    await tick() // stalled broadcast
    await tick() // alive broadcast
    stop()

    expect(broadcastAgentStatus).toHaveBeenCalledWith('team-1', 'agent-dev', 'stalled')
    expect(broadcastAgentStatus).toHaveBeenCalledWith('team-1', 'agent-dev', 'alive')
  })

  it('does not broadcast alive if agent was never stalled', async () => {
    // Agent always has fresh heartbeat — never crosses threshold
    listTeams.mockReturnValue([
      makeTeam({
        agents: [{ id: 'agent-dev', role: 'dev', last_heartbeat: FRESH_HB }],
      }),
    ])

    const { stop } = startNudger()
    await tick()
    await tick()
    stop()

    expect(broadcastAgentStatus).not.toHaveBeenCalled()
  })

  it('does not re-broadcast alive on repeated fresh ticks after recovery', async () => {
    listTeams
      .mockReturnValueOnce([makeTeam()]) // stalled tick
      .mockReturnValue([
        makeTeam({
          agents: [{ id: 'agent-dev', role: 'dev', last_heartbeat: FRESH_HB }],
        }),
      ]) // subsequent fresh ticks

    const { stop } = startNudger()
    await tick() // stalled
    await tick() // alive
    await tick() // no-op
    stop()

    const aliveCalls = broadcastAgentStatus.mock.calls.filter(([, , s]) => s === 'alive')
    expect(aliveCalls).toHaveLength(1)
  })
})
