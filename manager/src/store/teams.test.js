import { describe, it, expect, afterEach } from 'vitest'
import { createTeam, getTeam, listTeams, updateTeam, deleteTeam } from './teams.js'

afterEach(() => {
  for (const team of listTeams()) deleteTeam(team.id)
})

describe('createTeam', () => {
  it('creates a team with a UUID id', () => {
    const team = createTeam({ name: 'hamburg', repo: 'https://github.com/x/y', agents: [] })
    expect(team.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(team.name).toBe('hamburg')
    expect(team.status).toBe('creating')
  })

  it('applies default runtime/prompt/env to agents', () => {
    const team = createTeam({
      name: 'berlin',
      agents: [{ role: 'dev', model: 'claude-sonnet-4-6' }],
    })
    const agent = team.agents[0]
    expect(agent.runtime).toBe('claude-code')
    expect(agent.prompt).toBe('')
    expect(agent.env).toEqual({})
    expect(agent.last_heartbeat).toBeNull()
  })

  it('preserves explicit agent runtime, prompt, env', () => {
    const team = createTeam({
      name: 'berlin',
      agents: [{
        role: 'dev',
        model: 'claude-sonnet-4-6',
        runtime: 'claude-code',
        prompt: 'you are an expert',
        env: { FOO: 'bar' },
      }],
    })
    const agent = team.agents[0]
    expect(agent.runtime).toBe('claude-code')
    expect(agent.prompt).toBe('you are an expert')
    expect(agent.env).toEqual({ FOO: 'bar' })
  })

  it('generates deterministic agent id from team name + role', () => {
    const team = createTeam({
      name: 'naples',
      agents: [
        { role: 'dev', model: 'claude-sonnet-4-6' },
        { role: 'dev', model: 'claude-sonnet-4-6' },
      ],
    })
    expect(team.agents[0].id).toBe('naples-dev')
    expect(team.agents[1].id).toBe('naples-dev-1')
  })

  it('preserves explicit agent id', () => {
    const team = createTeam({
      name: 'naples',
      agents: [{ id: 'custom-id', role: 'dev', model: 'claude-sonnet-4-6' }],
    })
    expect(team.agents[0].id).toBe('custom-id')
  })

  it('stores the team and makes it retrievable', () => {
    const team = createTeam({ name: 'test', agents: [] })
    expect(getTeam(team.id)).toEqual(team)
  })
})

describe('createTeam auth', () => {
  it('defaults to session auth when no auth config provided', () => {
    const team = createTeam({ name: 'test', agents: [] })
    expect(team.auth).toEqual({ mode: 'session', sessionPath: '~/.claude' })
  })

  it('stores session auth with custom sessionPath', () => {
    const team = createTeam({
      name: 'test',
      agents: [],
      auth: { mode: 'session', sessionPath: '/home/user/.claude' },
    })
    expect(team.auth).toEqual({ mode: 'session', sessionPath: '/home/user/.claude' })
  })

  it('stores api-key mode without persisting raw key', () => {
    const team = createTeam({
      name: 'test',
      agents: [],
      auth: { mode: 'api-key', apiKey: 'sk-super-secret' },
    })
    expect(team.auth.mode).toBe('api-key')
    expect(team.auth).not.toHaveProperty('apiKey')
  })

  it('defaults sessionPath to ~/.claude when session mode omits it', () => {
    const team = createTeam({
      name: 'test',
      agents: [],
      auth: { mode: 'session' },
    })
    expect(team.auth.sessionPath).toBe('~/.claude')
  })
})

describe('getTeam', () => {
  it('returns team by id', () => {
    const team = createTeam({ name: 'test', agents: [] })
    expect(getTeam(team.id)).toEqual(team)
  })

  it('returns null for unknown id', () => {
    expect(getTeam('nonexistent')).toBeNull()
  })
})

describe('listTeams', () => {
  it('returns empty array when no teams', () => {
    expect(listTeams()).toHaveLength(0)
  })

  it('returns all created teams', () => {
    createTeam({ name: 'a', agents: [] })
    createTeam({ name: 'b', agents: [] })
    expect(listTeams()).toHaveLength(2)
  })
})

describe('updateTeam', () => {
  it('updates fields and bumps updatedAt', () => {
    const team = createTeam({ name: 'test', agents: [] })
    const updated = updateTeam(team.id, { status: 'running' })
    expect(updated.status).toBe('running')
    expect(updated.name).toBe('test')
  })

  it('throws for unknown team id', () => {
    expect(() => updateTeam('missing', {})).toThrow('Team not found: missing')
  })
})

describe('deleteTeam', () => {
  it('removes team from store', () => {
    const team = createTeam({ name: 'test', agents: [] })
    deleteTeam(team.id)
    expect(getTeam(team.id)).toBeNull()
    expect(listTeams()).toHaveLength(0)
  })

  it('is a no-op for nonexistent id', () => {
    expect(() => deleteTeam('missing')).not.toThrow()
  })
})
