import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerAdapter, getGateway, broadcast, _clearAdapters } from './registry.js'

// ── Mock channels store ───────────────────────────────────────────────────────

const mockChannel = {
  id: 'ch-uuid-1',
  name: '#main',
  type: 'irc',
  config: {},
  createdAt: '2026-01-01T00:00:00.000Z',
}

vi.mock('../store/channels.js', () => ({
  getChannel: vi.fn(),
}))

import { getChannel } from '../store/channels.js'

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _clearAdapters()
  vi.clearAllMocks()
})

describe('registerAdapter() / getGateway()', () => {
  it('returns null when channel does not exist', () => {
    getChannel.mockReturnValue(null)
    expect(getGateway('missing-id')).toBeNull()
  })

  it('returns null when no adapter is registered for the channel type', () => {
    getChannel.mockReturnValue(mockChannel)
    expect(getGateway(mockChannel.id)).toBeNull()
  })

  it('delegates to the registered adapter', () => {
    const fakeGateway = { say: vi.fn() }
    const adapter = { getGateway: vi.fn().mockReturnValue(fakeGateway), broadcast: vi.fn() }
    registerAdapter('irc', adapter)
    getChannel.mockReturnValue(mockChannel)

    const gw = getGateway(mockChannel.id)
    expect(gw).toBe(fakeGateway)
    expect(adapter.getGateway).toHaveBeenCalledWith(mockChannel.id)
  })

  it('returns null when adapter.getGateway returns null/undefined', () => {
    const adapter = { getGateway: vi.fn().mockReturnValue(null), broadcast: vi.fn() }
    registerAdapter('irc', adapter)
    getChannel.mockReturnValue(mockChannel)

    expect(getGateway(mockChannel.id)).toBeNull()
  })
})

describe('broadcast()', () => {
  it('throws when channel does not exist', () => {
    getChannel.mockReturnValue(null)
    expect(() => broadcast('missing-id', 'hello')).toThrow('Channel missing-id not found')
  })

  it('throws when no adapter is registered for the type', () => {
    getChannel.mockReturnValue(mockChannel)
    expect(() => broadcast(mockChannel.id, 'hello')).toThrow("No adapter registered for type 'irc'")
  })

  it('delegates to the registered adapter with channelId, name, and msg', () => {
    const adapter = { getGateway: vi.fn(), broadcast: vi.fn() }
    registerAdapter('irc', adapter)
    getChannel.mockReturnValue(mockChannel)

    broadcast(mockChannel.id, 'hello there')

    expect(adapter.broadcast).toHaveBeenCalledWith(mockChannel.id, '#main', 'hello there')
  })
})

describe('registerAdapter() — type replacement', () => {
  it('replaces an existing adapter for the same type', () => {
    const adapterA = { getGateway: vi.fn().mockReturnValue('gw-a'), broadcast: vi.fn() }
    const adapterB = { getGateway: vi.fn().mockReturnValue('gw-b'), broadcast: vi.fn() }
    registerAdapter('irc', adapterA)
    registerAdapter('irc', adapterB)
    getChannel.mockReturnValue(mockChannel)

    expect(getGateway(mockChannel.id)).toBe('gw-b')
  })

  it('supports multiple adapter types independently', () => {
    const slackChannel = { ...mockChannel, id: 'ch-slack', type: 'slack' }
    const ircAdapter   = { getGateway: vi.fn().mockReturnValue('irc-gw'),   broadcast: vi.fn() }
    const slackAdapter = { getGateway: vi.fn().mockReturnValue('slack-gw'), broadcast: vi.fn() }
    registerAdapter('irc', ircAdapter)
    registerAdapter('slack', slackAdapter)

    getChannel.mockImplementation(id => id === mockChannel.id ? mockChannel : slackChannel)

    expect(getGateway(mockChannel.id)).toBe('irc-gw')
    expect(getGateway(slackChannel.id)).toBe('slack-gw')
  })
})
