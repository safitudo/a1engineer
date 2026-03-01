import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IrcGateway } from './gateway.js'

// ── Mock channels store (gateway imports listTeamChannels for channelId lookup) ──

vi.mock('../store/channels.js', () => ({
  listTeamChannels: vi.fn().mockReturnValue([
    { id: 'ch-main', name: '#main' },
    { id: 'ch-tasks', name: '#tasks' },
  ]),
}))

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

describe('IrcGateway.joinChannel()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds the channel to the list when not already present', () => {
    const gw = makeGateway({ channels: ['#main'] })
    gw.joinChannel('#ops')
    expect(gw.channels).toContain('#ops')
  })

  it('does not duplicate the channel if already in the list', () => {
    const gw = makeGateway({ channels: ['#main'] })
    gw.joinChannel('#main')
    expect(gw.channels.filter(c => c === '#main')).toHaveLength(1)
  })

  it('does not call client.join when not yet connected', () => {
    const gw = makeGateway({ channels: ['#main'] })
    gw.joinChannel('#ops')
    expect(mockClient.join).not.toHaveBeenCalled()
  })

  it('calls client.join when connected', () => {
    const gw = makeGateway({ channels: ['#main'] })
    simulateConnect(gw)
    vi.clearAllMocks()

    gw.joinChannel('#ops')
    expect(mockClient.join).toHaveBeenCalledWith('#ops')
  })

  it('does not call client.join when destroyed', () => {
    const gw = makeGateway({ channels: ['#main'] })
    simulateConnect(gw)
    gw.destroy()
    vi.clearAllMocks()

    gw.joinChannel('#ops')
    expect(mockClient.join).not.toHaveBeenCalled()
    expect(gw.channels).toContain('#ops')
  })
})

describe('IrcGateway.partChannel()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes the channel from the list', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks'] })
    gw.partChannel('#tasks')
    expect(gw.channels).not.toContain('#tasks')
    expect(gw.channels).toContain('#main')
  })

  it('is a no-op when the channel is not in the list', () => {
    const gw = makeGateway({ channels: ['#main'] })
    gw.partChannel('#unknown')
    expect(gw.channels).toEqual(['#main'])
  })

  it('does not call client.part when not yet connected', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks'] })
    gw.partChannel('#tasks')
    expect(mockClient.part).not.toHaveBeenCalled()
  })

  it('calls client.part when connected', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks'] })
    simulateConnect(gw)
    vi.clearAllMocks()

    gw.partChannel('#tasks')
    expect(mockClient.part).toHaveBeenCalledWith('#tasks')
  })

  it('does not call client.part when destroyed', () => {
    const gw = makeGateway({ channels: ['#main', '#tasks'] })
    simulateConnect(gw)
    gw.destroy()
    vi.clearAllMocks()

    gw.partChannel('#tasks')
    expect(mockClient.part).not.toHaveBeenCalled()
    expect(gw.channels).not.toContain('#tasks')
  })
})

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
