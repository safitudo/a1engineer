import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IrcGateway } from './gateway.js'

// ── Mock irc-framework ───────────────────────────────────────────────────────

const mockClient = {
  connect: vi.fn(),
  on: vi.fn(),
  join: vi.fn(),
  part: vi.fn(),
  say: vi.fn(),
  quit: vi.fn(),
}

vi.mock('irc-framework', () => ({
  default: {
    // Regular function (not arrow) so vitest can invoke it as a constructor with `new`
    Client: vi.fn().mockImplementation(function () { return mockClient }),
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGateway(opts = {}) {
  return new IrcGateway({
    teamId: 'team-1',
    teamName: 'alpha',
    host: 'ergo-alpha',
    port: 6667,
    channels: opts.channels ?? ['#main', '#tasks'],
    ...opts,
  })
}

/** Simulate a successful IRC registration so the gateway has an active client */
function simulateConnect(gw) {
  gw.connect()
  // Find and invoke the 'registered' handler registered via client.on()
  const registeredCall = mockClient.on.mock.calls.find(c => c[0] === 'registered')
  if (registeredCall) registeredCall[1]()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IrcGateway.updateChannels()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores the new channel list before connecting', () => {
    const gw = makeGateway({ channels: ['#main'] })
    gw.updateChannels(['#main', '#ops'])
    expect(gw.channels).toEqual(['#main', '#ops'])
  })

  it('does not call join/part when not yet connected', () => {
    const gw = makeGateway({ channels: ['#main'] })
    gw.updateChannels(['#main', '#ops'])
    expect(mockClient.join).not.toHaveBeenCalled()
    expect(mockClient.part).not.toHaveBeenCalled()
  })

  it('joins newly added channels when connected', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks'] })
    simulateConnect(gw)
    vi.clearAllMocks()

    gw.updateChannels(['#main', '#tasks', '#ops'])

    expect(mockClient.join).toHaveBeenCalledTimes(1)
    expect(mockClient.join).toHaveBeenCalledWith('#ops')
    expect(mockClient.part).not.toHaveBeenCalled()
  })

  it('parts removed channels when connected', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks', '#code'] })
    simulateConnect(gw)
    vi.clearAllMocks()

    gw.updateChannels(['#main'])

    expect(mockClient.part).toHaveBeenCalledTimes(2)
    expect(mockClient.part).toHaveBeenCalledWith('#tasks')
    expect(mockClient.part).toHaveBeenCalledWith('#code')
    expect(mockClient.join).not.toHaveBeenCalled()
  })

  it('joins and parts in the same call when channels differ', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks'] })
    simulateConnect(gw)
    vi.clearAllMocks()

    gw.updateChannels(['#main', '#ops'])

    expect(mockClient.part).toHaveBeenCalledWith('#tasks')
    expect(mockClient.join).toHaveBeenCalledWith('#ops')
  })

  it('is a no-op when the channel list is unchanged', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks'] })
    simulateConnect(gw)
    vi.clearAllMocks()

    gw.updateChannels(['#main', '#tasks'])

    expect(mockClient.join).not.toHaveBeenCalled()
    expect(mockClient.part).not.toHaveBeenCalled()
  })

  it('stores channels but skips IRC calls when destroyed', () => {
    const gw = makeGateway({ channels: ['#main'] })
    simulateConnect(gw)
    gw.destroy()
    vi.clearAllMocks()

    gw.updateChannels(['#main', '#ops'])

    expect(mockClient.join).not.toHaveBeenCalled()
    expect(mockClient.part).not.toHaveBeenCalled()
  })
})
