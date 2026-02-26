import { randomUUID } from 'crypto'
import { getPool } from '../db/pool.js'

// PostgreSQL-backed store — Phase 2. Replaced in-memory Map from Phase 1.

// Normalize auth config — never persist raw API keys.
function normalizeAuth(auth) {
  const mode = auth?.mode ?? 'session'
  if (mode === 'session') {
    return { mode: 'session', sessionPath: auth?.sessionPath ?? '~/.claude' }
  }
  if (mode === 'api-key') {
    // API key is read from env at render time; store only the mode.
    return { mode: 'api-key' }
  }
  return { mode }
}

function rowToTeam(row, agentRows) {
  return {
    id: row.id,
    name: row.name,
    repo: row.repo,
    auth: row.config?.auth ?? { mode: 'session' },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    agents: (agentRows ?? []).map((a) => ({
      id: a.id,
      role: a.role,
      model: a.model,
      runtime: a.config?.runtime ?? 'claude-code',
      prompt: a.config?.prompt ?? '',
      env: a.config?.env ?? {},
      last_heartbeat: a.last_heartbeat ? new Date(a.last_heartbeat).toISOString() : null,
    })),
  }
}

export async function createTeam(config) {
  const id = randomUUID()
  const agents = (config.agents ?? []).map((a, i) => ({
    id: a.id ?? `${config.name}-${a.role}${i > 0 ? `-${i}` : ''}`,
    role: a.role,
    model: a.model ?? null,
    runtime: a.runtime ?? 'claude-code',
    prompt: a.prompt ?? '',
    env: a.env ?? {},
  }))
  const auth = normalizeAuth(config.auth)
  const repo = config.repo ?? {}

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO teams (id, name, repo, config, status)
       VALUES ($1, $2, $3, $4, 'creating')`,
      [id, config.name, JSON.stringify(repo), JSON.stringify({ auth })]
    )

    for (const a of agents) {
      await client.query(
        `INSERT INTO agents (id, team_id, role, model, config)
         VALUES ($1, $2, $3, $4, $5)`,
        [a.id, id, a.role, a.model, JSON.stringify({ runtime: a.runtime, prompt: a.prompt, env: a.env })]
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return await getTeam(id)
}

export async function getTeam(id) {
  const { rows: teamRows } = await getPool().query(
    'SELECT * FROM teams WHERE id = $1',
    [id]
  )
  if (teamRows.length === 0) return null

  const { rows: agentRows } = await getPool().query(
    'SELECT * FROM agents WHERE team_id = $1 ORDER BY id',
    [id]
  )
  return rowToTeam(teamRows[0], agentRows)
}

export async function listTeams() {
  const { rows: teamRows } = await getPool().query('SELECT * FROM teams ORDER BY created_at')
  if (teamRows.length === 0) return []

  const ids = teamRows.map((r) => r.id)
  const { rows: agentRows } = await getPool().query(
    'SELECT * FROM agents WHERE team_id = ANY($1) ORDER BY team_id, id',
    [ids]
  )

  return teamRows.map((row) => {
    const agents = agentRows.filter((a) => a.team_id === row.id)
    return rowToTeam(row, agents)
  })
}

export async function updateTeam(id, updates) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    if (updates.agents !== undefined) {
      // Replace full agent list atomically
      await client.query('DELETE FROM agents WHERE team_id = $1', [id])
      for (const a of updates.agents) {
        await client.query(
          `INSERT INTO agents (id, team_id, role, model, config, last_heartbeat)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            a.id,
            id,
            a.role,
            a.model ?? null,
            JSON.stringify({ runtime: a.runtime ?? 'claude-code', prompt: a.prompt ?? '', env: a.env ?? {} }),
            a.last_heartbeat ? new Date(a.last_heartbeat) : null,
          ]
        )
      }
    }

    // Build SET clause for team fields
    const teamFields = {}
    if (updates.name !== undefined) teamFields.name = updates.name
    if (updates.status !== undefined) teamFields.status = updates.status
    if (updates.repo !== undefined) teamFields.repo = JSON.stringify(updates.repo)

    // config (auth) updates
    let configUpdate = null
    if (updates.auth !== undefined) {
      const { rows } = await client.query('SELECT config FROM teams WHERE id = $1', [id])
      if (rows.length === 0) throw new Error(`Team not found: ${id}`)
      const existing = rows[0].config ?? {}
      configUpdate = JSON.stringify({ ...existing, auth: normalizeAuth(updates.auth) })
    }

    const setClauses = ['updated_at = now()']
    const params = []
    let paramIdx = 1

    for (const [key, val] of Object.entries(teamFields)) {
      setClauses.push(`${key} = $${paramIdx}`)
      params.push(val)
      paramIdx++
    }
    if (configUpdate !== null) {
      setClauses.push(`config = $${paramIdx}`)
      params.push(configUpdate)
      paramIdx++
    }

    params.push(id)
    const { rowCount } = await client.query(
      `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      params
    )
    if (rowCount === 0) throw new Error(`Team not found: ${id}`)

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return getTeam(id)
}

export async function touchAgentHeartbeat(teamId, agentId) {
  await getPool().query(
    'UPDATE agents SET last_heartbeat = now() WHERE team_id = $1 AND id = $2',
    [teamId, agentId]
  )
}

export async function deleteTeam(id) {
  // ON DELETE CASCADE removes agents automatically
  await getPool().query('DELETE FROM teams WHERE id = $1', [id])
}
