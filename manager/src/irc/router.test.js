import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  routeMessage,
  readMessages,
  registerBroadcaster,
  listChannels,
  clearTeamBuffers,
} from './router.js'
import { initDb, closeDb, getDb } from '../store/db.js'
import { createTeam } from '../store/teams.js'
import { createChannel, addTeamChannel } from '../store/channels.js'

beforeAll(() => initDb(':memory:'))
afterAll(() => closeDb())

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEAM = 'router-test-team'
const OTHER_TEAM = 'router-test-other-team'
const CHANNEL = '#main'
const CHANNEL2 = '#tasks'

let CH_MAIN_ID
let CH_TASKS_ID
let CH_MAIN_OTHER_ID  // #main channel for OTHER_TEAM (distinct UUID)

beforeEach(() => {
  const { channel: chMain } = createChannel({ name: '#main' })
  const { channel: chTasks } = createChannel({ name: '#tasks' })
  const { channel: chMainOther } = createChannel({ name: '#main' })
  CH_MAIN_ID = chMain.id
  CH_TASKS_ID = chTasks.id
  CH_MAIN_OTHER_ID = chMainOther.id
  addTeamChannel(TEAM, CH_MAIN_ID)
  addTeamChannel(TEAM, CH_TASKS_ID)
  addTeamChannel(OTHER_TEAM, CH_MAIN_OTHER_ID)
})

function makeEvent(overrides = {}) {
  return {
    teamId: TEAM,
    teamName: 'Router Test Team',
    channel: CHANNEL,
    channelId: CH_MAIN_ID,
    nick: 'bot',
    text: 'hello',
    time: new Date().toISOString(),
    ...overrides,
  }
}

// Track registered broadcasters so they can be cleaned up after each test
const broadcasterCleanups = []

function trackBroadcaster(fn) {
  const unregister = registerBroadcaster(fn)
  broadcasterCleanups.push(unregister)
  return unregister
}

afterEach(() => {
  // Unregister all broadcasters registered during the test
  for (const fn of broadcasterCleanups) fn()
  broadcasterCleanups.length = 0
  // Clear buffers before deleting channel records (clearTeamBuffers reads from DB)
  clearTeamBuffers(TEAM)
  clearTeamBuffers(OTHER_TEAM)
  // Clear DB tables
  getDb().exec('DELETE FROM team_channels')
  getDb().exec('DELETE FROM channels')
  getDb().exec('DELETE FROM teams')
})

// ── routeMessage — insertion ────────────────────────────────────────────────────

describe('routeMessage — ring buffer insertion', () => {
  it('inserts a message into the buffer for the given channelId', () => {
    routeMessage(makeEvent({ text: 'first message' }))
    const msgs = readMessages(CH_MAIN_ID)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('first message')
  })

  it('preserves all fields from the original event', () => {
    const event = makeEvent({ nick: 'alice', text: 'hi', time: '2024-06-01T12:00:00.000Z' })
    routeMessage(event)
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.teamId).toBe(TEAM)
    expect(msg.teamName).toBe('Router Test Team')
    expect(msg.channel).toBe(CHANNEL)
    expect(msg.nick).toBe('alice')
    expect(msg.text).toBe('hi')
    expect(msg.time).toBe('2024-06-01T12:00:00.000Z')
  })

  it('inserts messages in order across multiple calls', () => {
    routeMessage(makeEvent({ text: 'msg-1' }))
    routeMessage(makeEvent({ text: 'msg-2' }))
    routeMessage(makeEvent({ text: 'msg-3' }))
    const msgs = readMessages(CH_MAIN_ID)
    expect(msgs.map((m) => m.text)).toEqual(['msg-1', 'msg-2', 'msg-3'])
  })

  it('stores messages in separate buffers per channel', () => {
    routeMessage(makeEvent({ channel: CHANNEL, channelId: CH_MAIN_ID, text: 'main-msg' }))
    routeMessage(makeEvent({ channel: CHANNEL2, channelId: CH_TASKS_ID, text: 'tasks-msg' }))
    expect(readMessages(CH_MAIN_ID).map((m) => m.text)).toEqual(['main-msg'])
    expect(readMessages(CH_TASKS_ID).map((m) => m.text)).toEqual(['tasks-msg'])
  })

  it('stores messages in separate buffers per teamId', () => {
    routeMessage(makeEvent({ teamId: TEAM, channelId: CH_MAIN_ID, text: 'team-a-msg' }))
    routeMessage(makeEvent({ teamId: OTHER_TEAM, channelId: CH_MAIN_OTHER_ID, text: 'team-b-msg' }))
    expect(readMessages(CH_MAIN_ID).map((m) => m.text)).toEqual(['team-a-msg'])
    expect(readMessages(CH_MAIN_OTHER_ID).map((m) => m.text)).toEqual(['team-b-msg'])
  })

  it('caps buffer at 500 messages, dropping the oldest when exceeded', () => {
    for (let i = 0; i < 501; i++) {
      routeMessage(makeEvent({ text: `msg-${i}` }))
    }
    const msgs = readMessages(CH_MAIN_ID, { limit: 600 })
    expect(msgs).toHaveLength(500)
    // msg-0 was shifted out; msg-1 is now the oldest
    expect(msgs[0].text).toBe('msg-1')
    expect(msgs[499].text).toBe('msg-500')
  })

  it('exactly 500 messages stays within cap (no shift)', () => {
    for (let i = 0; i < 500; i++) {
      routeMessage(makeEvent({ text: `msg-${i}` }))
    }
    const msgs = readMessages(CH_MAIN_ID, { limit: 600 })
    expect(msgs).toHaveLength(500)
    expect(msgs[0].text).toBe('msg-0')
  })
})

// ── routeMessage — tag parsing ─────────────────────────────────────────────────

describe('routeMessage — tag parsing', () => {
  it('sets tag=null and tagBody=null for plain text', () => {
    routeMessage(makeEvent({ text: 'just a normal message' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBeNull()
    expect(msg.tagBody).toBeNull()
  })

  it('parses [ASSIGN] tag with body', () => {
    routeMessage(makeEvent({ text: '[ASSIGN] @nick — #42 build the thing' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBe('ASSIGN')
    expect(msg.tagBody).toBe('@nick — #42 build the thing')
  })

  it('parses [ACK] tag with empty body', () => {
    routeMessage(makeEvent({ text: '[ACK]' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBe('ACK')
    expect(msg.tagBody).toBe('')
  })

  it('parses [PR] tag with link body', () => {
    routeMessage(makeEvent({ text: '[PR] https://github.com/org/repo/pull/99 — Fixes #42' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBe('PR')
    expect(msg.tagBody).toBe('https://github.com/org/repo/pull/99 — Fixes #42')
  })

  it('parses [REVIEW] tag', () => {
    routeMessage(makeEvent({ text: '[REVIEW] APPROVED — https://github.com/org/repo/pull/99' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBe('REVIEW')
    expect(msg.tagBody).toBe('APPROVED — https://github.com/org/repo/pull/99')
  })

  it('parses [BLOCK] tag', () => {
    routeMessage(makeEvent({ text: '[BLOCK] missing tests in PR #55' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBe('BLOCK')
    expect(msg.tagBody).toBe('missing tests in PR #55')
  })

  it('parses [DONE] tag', () => {
    routeMessage(makeEvent({ text: '[DONE] #42 build the thing' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBe('DONE')
    expect(msg.tagBody).toBe('#42 build the thing')
  })

  it('parses [STATUS] tag', () => {
    routeMessage(makeEvent({ text: '[STATUS] halfway through refactor' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBe('STATUS')
    expect(msg.tagBody).toBe('halfway through refactor')
  })

  it('does not match a tag embedded mid-sentence', () => {
    routeMessage(makeEvent({ text: 'see [BLOCK] note below' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tag).toBeNull()
    expect(msg.tagBody).toBeNull()
  })

  it('trims leading/trailing whitespace from tagBody', () => {
    routeMessage(makeEvent({ text: '[ACK]   lots of spaces   ' }))
    const [msg] = readMessages(CH_MAIN_ID)
    expect(msg.tagBody).toBe('lots of spaces')
  })
})

// ── routeMessage — broadcast ────────────────────────────────────────────────────

describe('routeMessage — broadcaster callbacks', () => {
  it('calls a registered broadcaster with the enriched entry', () => {
    const received = []
    trackBroadcaster((entry) => received.push(entry))

    routeMessage(makeEvent({ text: 'broadcast test' }))

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('broadcast test')
    expect(received[0].tag).toBeNull()
  })

  it('calls multiple broadcasters for a single message', () => {
    const calls1 = []
    const calls2 = []
    trackBroadcaster((e) => calls1.push(e))
    trackBroadcaster((e) => calls2.push(e))

    routeMessage(makeEvent({ text: 'multi-broadcast' }))

    expect(calls1).toHaveLength(1)
    expect(calls2).toHaveLength(1)
  })

  it('does not call broadcaster after unsubscribe', () => {
    const received = []
    const unregister = trackBroadcaster((e) => received.push(e))

    routeMessage(makeEvent({ text: 'before unsubscribe' }))
    expect(received).toHaveLength(1)

    unregister()
    routeMessage(makeEvent({ text: 'after unsubscribe' }))
    expect(received).toHaveLength(1) // still 1 — second message not received
  })

  it('broadcaster error does not prevent other broadcasters from being called', () => {
    const received = []
    trackBroadcaster(() => { throw new Error('broadcaster exploded') })
    trackBroadcaster((e) => received.push(e))

    // Should not throw
    expect(() => routeMessage(makeEvent({ text: 'resilience test' }))).not.toThrow()
    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('resilience test')
  })

  it('broadcaster receives tag-enriched entry', () => {
    const received = []
    trackBroadcaster((e) => received.push(e))

    routeMessage(makeEvent({ text: '[ASSIGN] @alice — #7 fix the bug' }))

    expect(received[0].tag).toBe('ASSIGN')
    expect(received[0].tagBody).toBe('@alice — #7 fix the bug')
  })

  it('broadcaster is not called after all broadcasters are unregistered', () => {
    const received = []
    const unregister = trackBroadcaster((e) => received.push(e))

    unregister()
    routeMessage(makeEvent())

    expect(received).toHaveLength(0)
  })
})

// ── readMessages ───────────────────────────────────────────────────────────────

describe('readMessages', () => {
  it('returns empty array for unknown channel id', () => {
    expect(readMessages('nonexistent-uuid')).toEqual([])
  })

  it('returns empty array when no messages routed to the channel', () => {
    routeMessage(makeEvent({ channelId: CH_MAIN_ID }))
    // CH_TASKS_ID has no messages routed to it
    expect(readMessages(CH_TASKS_ID)).toEqual([])
  })

  it('defaults to returning last 100 messages', () => {
    for (let i = 0; i < 120; i++) {
      routeMessage(makeEvent({ text: `msg-${i}` }))
    }
    const msgs = readMessages(CH_MAIN_ID)
    expect(msgs).toHaveLength(100)
    expect(msgs[0].text).toBe('msg-20') // oldest of the last 100
    expect(msgs[99].text).toBe('msg-119')
  })

  it('respects limit option — returns last N messages', () => {
    for (let i = 1; i <= 5; i++) {
      routeMessage(makeEvent({ text: `msg-${i}` }))
    }
    const msgs = readMessages(CH_MAIN_ID, { limit: 3 })
    expect(msgs).toHaveLength(3)
    expect(msgs[0].text).toBe('msg-3')
    expect(msgs[2].text).toBe('msg-5')
  })

  it('limit larger than buffer returns all messages', () => {
    routeMessage(makeEvent({ text: 'only' }))
    const msgs = readMessages(CH_MAIN_ID, { limit: 999 })
    expect(msgs).toHaveLength(1)
  })

  it('filters by since — only messages strictly after the timestamp', () => {
    const t1 = '2024-06-01T12:00:01.000Z'
    const t2 = '2024-06-01T12:00:02.000Z'
    const t3 = '2024-06-01T12:00:03.000Z'
    routeMessage(makeEvent({ text: 'first', time: t1 }))
    routeMessage(makeEvent({ text: 'second', time: t2 }))
    routeMessage(makeEvent({ text: 'third', time: t3 }))

    const msgs = readMessages(CH_MAIN_ID, { since: t1 })
    // t1 itself is excluded (strictly greater), t2 and t3 included
    expect(msgs).toHaveLength(2)
    expect(msgs[0].text).toBe('second')
    expect(msgs[1].text).toBe('third')
  })

  it('since with no matching messages returns empty array', () => {
    routeMessage(makeEvent({ text: 'old', time: '2024-01-01T00:00:00.000Z' }))
    const msgs = readMessages(CH_MAIN_ID, { since: '2025-01-01T00:00:00.000Z' })
    expect(msgs).toEqual([])
  })

  it('since + limit: applies since filter first, then slices last N', () => {
    const times = [
      '2024-06-01T12:00:01.000Z',
      '2024-06-01T12:00:02.000Z',
      '2024-06-01T12:00:03.000Z',
      '2024-06-01T12:00:04.000Z',
      '2024-06-01T12:00:05.000Z',
    ]
    times.forEach((time, i) => routeMessage(makeEvent({ text: `msg-${i + 1}`, time })))

    // since=times[0] → msgs 2-5 qualify (4 msgs); limit=2 → last 2 of those
    const msgs = readMessages(CH_MAIN_ID, { since: times[0], limit: 2 })
    expect(msgs).toHaveLength(2)
    expect(msgs[0].text).toBe('msg-4')
    expect(msgs[1].text).toBe('msg-5')
  })
})

// ── registerBroadcaster ────────────────────────────────────────────────────────

describe('registerBroadcaster', () => {
  it('returns an unsubscribe function', () => {
    const unregister = trackBroadcaster(() => {})
    expect(typeof unregister).toBe('function')
  })

  it('registered broadcaster is invoked on routeMessage', () => {
    let callCount = 0
    trackBroadcaster(() => { callCount++ })
    routeMessage(makeEvent())
    expect(callCount).toBe(1)
  })

  it('unsubscribe is idempotent — calling twice does not throw', () => {
    const unregister = trackBroadcaster(() => {})
    expect(() => { unregister(); unregister() }).not.toThrow()
  })
})

// ── listChannels ───────────────────────────────────────────────────────────────

describe('listChannels', () => {
  it('returns empty array for an unknown team', () => {
    expect(listChannels('no-such-team-xyz')).toEqual([])
  })

  it('returns configured channels for a team regardless of buffer state', () => {
    const team = createTeam({ name: 'test', channels: [CHANNEL, CHANNEL2], agents: [] })
    const channels = listChannels(team.id)
    expect(channels).toContain(CHANNEL)
    expect(channels).toContain(CHANNEL2)
    expect(channels).toHaveLength(2)
  })

  it('returns channels even when no messages have been routed', () => {
    const team = createTeam({ name: 'test', channels: [CHANNEL], agents: [] })
    // No routeMessage calls — channel still appears because it is configured
    expect(listChannels(team.id)).toContain(CHANNEL)
  })

  it('does not include channels from other teams', () => {
    const teamA = createTeam({ name: 'a', channels: [CHANNEL], agents: [] })
    const teamB = createTeam({ name: 'b', channels: ['#other'], agents: [] })
    expect(listChannels(teamA.id)).toContain(CHANNEL)
    expect(listChannels(teamA.id)).not.toContain('#other')
    expect(listChannels(teamB.id)).toContain('#other')
    expect(listChannels(teamB.id)).not.toContain(CHANNEL)
  })
})

// ── clearTeamBuffers ───────────────────────────────────────────────────────────

describe('clearTeamBuffers', () => {
  it('removes all buffered messages for the team', () => {
    routeMessage(makeEvent({ channel: CHANNEL, channelId: CH_MAIN_ID }))
    routeMessage(makeEvent({ channel: CHANNEL2, channelId: CH_TASKS_ID }))
    clearTeamBuffers(TEAM)
    expect(readMessages(CH_MAIN_ID)).toEqual([])
    expect(readMessages(CH_TASKS_ID)).toEqual([])
  })

  it('does not affect buffers for other teams', () => {
    routeMessage(makeEvent({ teamId: TEAM, channelId: CH_MAIN_ID, text: 'keep me' }))
    routeMessage(makeEvent({ teamId: OTHER_TEAM, channelId: CH_MAIN_OTHER_ID, text: 'other team' }))
    clearTeamBuffers(TEAM)
    expect(readMessages(CH_MAIN_ID)).toEqual([])
    const other = readMessages(CH_MAIN_OTHER_ID)
    expect(other).toHaveLength(1)
    expect(other[0].text).toBe('other team')
  })

  it('is safe to call on a team with no buffers', () => {
    expect(() => clearTeamBuffers('nonexistent-team')).not.toThrow()
  })
})
