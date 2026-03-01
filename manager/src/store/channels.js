import { randomUUID } from 'crypto'
import { getDb } from './db.js'

function rowToChannel(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: JSON.parse(row.config),
    createdAt: row.created_at,
  }
}

export function createChannel({ name, type = 'irc', config = {} } = {}) {
  if (!name || typeof name !== 'string') return { error: 'name is required' }
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb()
    .prepare('INSERT INTO channels (id, name, type, config, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, type, JSON.stringify(config), now)
  return { channel: rowToChannel(getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id)) }
}

export function getChannel(id) {
  return rowToChannel(getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id))
}

export function listChannels() {
  return getDb().prepare('SELECT * FROM channels ORDER BY created_at').all().map(rowToChannel)
}

export function deleteChannel(id) {
  getDb().prepare('DELETE FROM team_channels WHERE channel_id = ?').run(id)
  const result = getDb().prepare('DELETE FROM channels WHERE id = ?').run(id)
  return result.changes > 0 ? { ok: true } : { error: 'channel not found', code: 'NOT_FOUND' }
}

export function addTeamChannel(teamId, channelId) {
  getDb()
    .prepare('INSERT OR IGNORE INTO team_channels (team_id, channel_id) VALUES (?, ?)')
    .run(teamId, channelId)
}

export function removeTeamChannel(teamId, channelId) {
  getDb()
    .prepare('DELETE FROM team_channels WHERE team_id = ? AND channel_id = ?')
    .run(teamId, channelId)
}

export function listTeamChannels(teamId) {
  return getDb()
    .prepare(
      'SELECT c.* FROM channels c JOIN team_channels tc ON c.id = tc.channel_id WHERE tc.team_id = ? ORDER BY c.created_at, tc.rowid'
    )
    .all(teamId)
    .map(rowToChannel)
}

export function findTeamsByChannelId(channelId) {
  return getDb()
    .prepare('SELECT team_id FROM team_channels WHERE channel_id = ?')
    .all(channelId)
    .map(r => r.team_id)
}
