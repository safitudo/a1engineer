import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('../store/teams.js', () => ({
  listTeams: vi.fn(),
}))

vi.mock('../github/app.js', () => ({
  resolveGitHubToken: vi.fn(),
  clearTokenCache: vi.fn(),
}))

vi.mock('../constants.js', () => ({
  TEAMS_DIR: '/tmp/teams',
}))

import { execFile } from 'child_process'
import { listTeams } from '../store/teams.js'
import { resolveGitHubToken, clearTokenCache } from '../github/app.js'
import { startTokenRefresh } from './token-refresh.js'

const REFRESH_INTERVAL = 45 * 60 * 1000 // 45 minutes

function makeTeam(overrides = {}) {
  return {
    id: 'team-1',
    name: 'naples',
    status: 'running',
    github: { appId: '123', installationId: '456' },
    agents: [{ id: 'dev' }, { id: 'qa' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  // Default: docker exec succeeds
  execFile.mockImplementation((cmd, args, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb
    callback(null, '', '')
  })
  resolveGitHubToken.mockResolvedValue('ghp_fake_token')
  listTeams.mockReturnValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startTokenRefresh', () => {
  it('returns an object with stop and refreshNow', () => {
    const result = startTokenRefresh()
    expect(typeof result.stop).toBe('function')
    expect(typeof result.refreshNow).toBe('function')
    result.stop()
  })

  it('stop() prevents further refresh cycles', async () => {
    listTeams.mockReturnValue([makeTeam()])
    const { stop } = startTokenRefresh()
    stop()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    expect(clearTokenCache).not.toHaveBeenCalled()
  })

  it('calls clearTokenCache on each refresh tick', async () => {
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    expect(clearTokenCache).toHaveBeenCalledOnce()
  })

  it('calls clearTokenCache once per tick across multiple ticks', async () => {
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL * 2)
    stop()
    expect(clearTokenCache).toHaveBeenCalledTimes(2)
  })

  it('calls docker exec for each agent in a running team with github config', async () => {
    listTeams.mockReturnValue([makeTeam()])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    // 2 agents → 2 docker exec calls
    expect(execFile).toHaveBeenCalledTimes(2)
    const [cmd] = execFile.mock.calls[0]
    expect(cmd).toBe('docker')
  })

  it('skips teams with status !== running', async () => {
    listTeams.mockReturnValue([makeTeam({ status: 'stopped' })])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    expect(resolveGitHubToken).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('skips teams without github config', async () => {
    listTeams.mockReturnValue([makeTeam({ github: null })])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    expect(resolveGitHubToken).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('skips docker exec when resolveGitHubToken returns null', async () => {
    resolveGitHubToken.mockResolvedValue(null)
    listTeams.mockReturnValue([makeTeam()])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('continues to next agent when docker exec fails', async () => {
    let callCount = 0
    execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === 'function' ? opts : cb
      callCount++
      if (callCount === 1) {
        callback(new Error('docker exec failed'), '', '')
      } else {
        callback(null, '', '')
      }
    })
    listTeams.mockReturnValue([makeTeam()])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    // Both agents attempted despite first failing
    expect(execFile).toHaveBeenCalledTimes(2)
  })

  it('handles resolveGitHubToken errors gracefully without throwing', async () => {
    resolveGitHubToken.mockRejectedValue(new Error('GitHub API error'))
    listTeams.mockReturnValue([makeTeam()])
    const { stop } = startTokenRefresh()
    await expect(vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)).resolves.not.toThrow()
    stop()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('handles empty agents array without calling docker exec', async () => {
    listTeams.mockReturnValue([makeTeam({ agents: [] })])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    expect(resolveGitHubToken).toHaveBeenCalledOnce()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('handles missing agents property gracefully', async () => {
    const team = makeTeam()
    delete team.agents
    listTeams.mockReturnValue([team])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('refreshNow() returns without throwing', () => {
    const { stop, refreshNow } = startTokenRefresh()
    expect(() => refreshNow()).not.toThrow()
    stop()
  })

  it('processes multiple teams in one tick', async () => {
    listTeams.mockReturnValue([
      makeTeam({ id: 'team-1', agents: [{ id: 'dev' }] }),
      makeTeam({ id: 'team-2', agents: [{ id: 'qa' }] }),
    ])
    const { stop } = startTokenRefresh()
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL)
    stop()
    expect(execFile).toHaveBeenCalledTimes(2)
  })
})
