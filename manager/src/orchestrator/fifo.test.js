import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('../constants.js', () => ({
  TEAMS_DIR: '/tmp/teams',
}))

import { execFile } from 'child_process'
import { writeFifo } from './fifo.js'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: docker exec succeeds
  execFile.mockImplementation((cmd, args, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb
    callback(null, '', '')
  })
})

describe('writeFifo', () => {
  it('calls docker with compose exec', async () => {
    await writeFifo('team-1', 'dev', 'nudge hello')
    expect(execFile).toHaveBeenCalledOnce()
    const [cmd, args] = execFile.mock.calls[0]
    expect(cmd).toBe('docker')
    expect(args).toContain('compose')
    expect(args).toContain('exec')
  })

  it('targets the correct service name (agent-<agentId>)', async () => {
    await writeFifo('team-1', 'dev', 'nudge hello')
    const [, args] = execFile.mock.calls[0]
    expect(args).toContain('agent-dev')
  })

  it('uses FIFO_CMD env var to pass the command safely', async () => {
    await writeFifo('team-1', 'dev', 'nudge hello world')
    const [, args] = execFile.mock.calls[0]
    const envIdx = args.indexOf('-e')
    expect(envIdx).toBeGreaterThan(-1)
    expect(args[envIdx + 1]).toBe('FIFO_CMD=nudge hello world')
  })

  it('writes to /tmp/nudge.fifo inside the container', async () => {
    await writeFifo('team-1', 'dev', 'interrupt')
    const [, args] = execFile.mock.calls[0]
    const bashCmd = args[args.length - 1]
    expect(bashCmd).toContain('/tmp/nudge.fifo')
  })

  it('constructs the compose file path from TEAMS_DIR and teamId', async () => {
    await writeFifo('team-42', 'qa', 'directive check your tasks')
    const [, args] = execFile.mock.calls[0]
    const cfIdx = args.indexOf('-f')
    expect(cfIdx).toBeGreaterThan(-1)
    expect(args[cfIdx + 1]).toContain('/tmp/teams/team-42/')
    expect(args[cfIdx + 1]).toContain('docker-compose.yml')
  })

  it('runs as agent user (-u agent)', async () => {
    await writeFifo('team-1', 'dev', 'nudge')
    const [, args] = execFile.mock.calls[0]
    const uIdx = args.indexOf('-u')
    expect(uIdx).toBeGreaterThan(-1)
    expect(args[uIdx + 1]).toBe('agent')
  })

  it('uses -T flag for non-interactive exec', async () => {
    await writeFifo('team-1', 'dev', 'nudge')
    const [, args] = execFile.mock.calls[0]
    expect(args).toContain('-T')
  })

  it('propagates errors from docker exec', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === 'function' ? opts : cb
      callback(new Error('container not running'), '', '')
    })
    await expect(writeFifo('team-1', 'dev', 'nudge')).rejects.toThrow('container not running')
  })

  it('handles commands with special characters via env var (no shell escaping needed)', async () => {
    const command = 'nudge check #tasks and report back'
    await writeFifo('team-1', 'dev', command)
    const [, args] = execFile.mock.calls[0]
    const envIdx = args.indexOf('-e')
    expect(args[envIdx + 1]).toBe(`FIFO_CMD=${command}`)
  })
})
