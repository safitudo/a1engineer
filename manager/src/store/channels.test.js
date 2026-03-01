import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { initDb, closeDb, getDb } from './db.js'
import {
  createChannel,
  getChannel,
  listChannels,
  deleteChannel,
  addTeamChannel,
  removeTeamChannel,
  listTeamChannels,
  findTeamsByChannelId,
} from './channels.js'

beforeAll(() => initDb(':memory:'))
afterAll(() => closeDb())
afterEach(() => {
  getDb().exec('DELETE FROM team_channels')
  getDb().exec('DELETE FROM channels')
})

// ── createChannel ─────────────────────────────────────────────────────────────

describe('createChannel()', () => {
  it('creates a channel and returns it', () => {
    const { channel } = createChannel({ name: '#main', type: 'irc' })
    expect(channel).toMatchObject({ name: '#main', type: 'irc', config: {} })
    expect(channel.id).toBeTruthy()
    expect(channel.createdAt).toBeTruthy()
  })

  it('stores custom config as parsed object', () => {
    const config = { server: 'irc.example.com', port: 6667 }
    const { channel } = createChannel({ name: '#ops', config })
    expect(channel.config).toEqual(config)
  })

  it('defaults type to irc', () => {
    const { channel } = createChannel({ name: '#default' })
    expect(channel.type).toBe('irc')
  })

  it('returns error when name is missing', () => {
    const result = createChannel({})
    expect(result.error).toBeTruthy()
    expect(result.channel).toBeUndefined()
  })

  it('returns error when name is not a string', () => {
    const result = createChannel({ name: 42 })
    expect(result.error).toBeTruthy()
  })

  it('generates unique ids for channels with the same name', () => {
    const { channel: a } = createChannel({ name: '#main' })
    const { channel: b } = createChannel({ name: '#main' })
    expect(a.id).not.toBe(b.id)
  })
})

// ── getChannel ────────────────────────────────────────────────────────────────

describe('getChannel()', () => {
  it('returns the channel by id', () => {
    const { channel } = createChannel({ name: '#tasks' })
    const fetched = getChannel(channel.id)
    expect(fetched).toEqual(channel)
  })

  it('returns null for unknown id', () => {
    expect(getChannel('nonexistent-id')).toBeNull()
  })
})

// ── listChannels ──────────────────────────────────────────────────────────────

describe('listChannels()', () => {
  it('returns all channels ordered by created_at', () => {
    createChannel({ name: '#alpha' })
    createChannel({ name: '#beta' })
    const channels = listChannels()
    expect(channels.length).toBe(2)
    expect(channels.map(c => c.name)).toEqual(['#alpha', '#beta'])
  })

  it('returns empty array when no channels', () => {
    expect(listChannels()).toEqual([])
  })
})

// ── deleteChannel ─────────────────────────────────────────────────────────────

describe('deleteChannel()', () => {
  it('deletes existing channel and returns ok', () => {
    const { channel } = createChannel({ name: '#gone' })
    const result = deleteChannel(channel.id)
    expect(result).toEqual({ ok: true })
    expect(getChannel(channel.id)).toBeNull()
  })

  it('returns error for unknown id', () => {
    const result = deleteChannel('no-such-id')
    expect(result.error).toBeTruthy()
    expect(result.code).toBe('NOT_FOUND')
  })

  it('also removes team_channels rows for the deleted channel', () => {
    const { channel } = createChannel({ name: '#cleanup' })
    addTeamChannel('team-1', channel.id)
    addTeamChannel('team-2', channel.id)
    deleteChannel(channel.id)
    expect(findTeamsByChannelId(channel.id)).toEqual([])
  })
})

// ── addTeamChannel / removeTeamChannel ────────────────────────────────────────

describe('addTeamChannel() / removeTeamChannel()', () => {
  it('links a team to a channel', () => {
    const { channel } = createChannel({ name: '#main' })
    addTeamChannel('team-a', channel.id)
    expect(listTeamChannels('team-a')).toHaveLength(1)
  })

  it('is idempotent — duplicate inserts do not throw', () => {
    const { channel } = createChannel({ name: '#main' })
    addTeamChannel('team-a', channel.id)
    addTeamChannel('team-a', channel.id) // second insert ignored
    expect(listTeamChannels('team-a')).toHaveLength(1)
  })

  it('removes the link', () => {
    const { channel } = createChannel({ name: '#main' })
    addTeamChannel('team-a', channel.id)
    removeTeamChannel('team-a', channel.id)
    expect(listTeamChannels('team-a')).toHaveLength(0)
  })
})

// ── listTeamChannels ──────────────────────────────────────────────────────────

describe('listTeamChannels()', () => {
  it('returns channels linked to a team', () => {
    const { channel: c1 } = createChannel({ name: '#main' })
    const { channel: c2 } = createChannel({ name: '#tasks' })
    addTeamChannel('team-x', c1.id)
    addTeamChannel('team-x', c2.id)
    const channels = listTeamChannels('team-x')
    expect(channels).toHaveLength(2)
    expect(channels.map(c => c.name)).toEqual(['#main', '#tasks'])
  })

  it('does not return channels from other teams', () => {
    const { channel } = createChannel({ name: '#shared' })
    addTeamChannel('team-1', channel.id)
    expect(listTeamChannels('team-2')).toHaveLength(0)
  })

  it('returns empty array for team with no channels', () => {
    expect(listTeamChannels('unknown-team')).toEqual([])
  })
})

// ── findTeamsByChannelId ──────────────────────────────────────────────────────

describe('findTeamsByChannelId()', () => {
  it('returns all teams linked to a channel', () => {
    const { channel } = createChannel({ name: '#shared' })
    addTeamChannel('team-1', channel.id)
    addTeamChannel('team-2', channel.id)
    const teams = findTeamsByChannelId(channel.id)
    expect(teams.sort()).toEqual(['team-1', 'team-2'])
  })

  it('returns empty array for unknown channelId', () => {
    expect(findTeamsByChannelId('no-such-channel')).toEqual([])
  })
})
