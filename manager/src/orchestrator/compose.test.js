import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderCompose, rehydrateTeams } from './compose.js'

// Mock fs/promises so tests don't touch the filesystem
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(),
}))

import { readFile, writeFile, access, readdir } from 'fs/promises'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = readFileSync(
  join(__dirname, '../../templates/team-compose.yml.ejs'),
  'utf8'
)

const BASE_CONFIG = {
  id: 'abc-123',
  name: 'naples',
  repo: { url: 'https://github.com/x/y', branch: 'main' },
  ergo: { image: 'ghcr.io/ergochat/ergo:stable', configPath: '/etc/ergo/ircd.yaml', port: 6667 },
  agents: [{ id: 'naples-dev', role: 'dev', model: 'claude-sonnet-4-6', runtime: 'claude-code', prompt: '', env: {} }],
}

beforeEach(() => {
  vi.clearAllMocks()
  readFile.mockResolvedValue(TEMPLATE)
})

describe('renderCompose — session auth', () => {
  it('includes bind-mount volume for ~/.claude by default', async () => {
    const yaml = await renderCompose({ ...BASE_CONFIG })
    expect(yaml).toContain('/root/.claude')
    expect(yaml).toContain('read_only: true')
  })

  it('resolves ~ to homedir in session path', async () => {
    const { homedir } = await import('os')
    const yaml = await renderCompose({
      ...BASE_CONFIG,
      auth: { mode: 'session', sessionPath: '~/.claude' },
    })
    expect(yaml).toContain(homedir())
    expect(yaml).toContain('/root/.claude')
  })

  it('uses explicit absolute session path', async () => {
    const yaml = await renderCompose({
      ...BASE_CONFIG,
      auth: { mode: 'session', sessionPath: '/custom/path/.claude' },
    })
    expect(yaml).toContain('/custom/path/.claude')
    expect(yaml).toContain('/root/.claude')
  })

  it('does NOT include ANTHROPIC_API_KEY env var in session mode', async () => {
    const yaml = await renderCompose({ ...BASE_CONFIG })
    expect(yaml).not.toContain('ANTHROPIC_API_KEY:')
  })

  it('warns but does not throw when session path does not exist', async () => {
    access.mockRejectedValueOnce(new Error('ENOENT'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(renderCompose({ ...BASE_CONFIG })).resolves.toBeDefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning'))
    warnSpy.mockRestore()
  })
})

describe('renderCompose — api-key auth', () => {
  it('writes ANTHROPIC_API_KEY to secrets file when secretsDir provided', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'
    await renderCompose(
      { ...BASE_CONFIG, auth: { mode: 'api-key' } },
      '/tmp/secrets'
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('anthropic_key.txt'),
      'sk-test-key',
      'utf8'
    )
    delete process.env.ANTHROPIC_API_KEY
  })

  it('includes anthropic_key in secrets block when secretsDir provided', async () => {
    const yaml = await renderCompose(
      { ...BASE_CONFIG, auth: { mode: 'api-key' } },
      '/tmp/secrets'
    )
    expect(yaml).toContain('anthropic_key:')
    expect(yaml).not.toContain('ANTHROPIC_API_KEY:')
  })

  it('does NOT include bind-mount volume in api-key mode', async () => {
    const yaml = await renderCompose({
      ...BASE_CONFIG,
      auth: { mode: 'api-key' },
    })
    expect(yaml).not.toContain('/root/.claude')
  })

  it('uses explicit apiKey param over process.env.ANTHROPIC_API_KEY', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-key'
    await renderCompose(
      { ...BASE_CONFIG, auth: { mode: 'api-key' } },
      '/tmp/secrets',
      'sk-per-team-key'
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('anthropic_key.txt'),
      'sk-per-team-key',
      'utf8'
    )
    delete process.env.ANTHROPIC_API_KEY
  })

  it('writes empty string when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await renderCompose(
      { ...BASE_CONFIG, auth: { mode: 'api-key' } },
      '/tmp/secrets'
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('anthropic_key.txt'),
      '',
      'utf8'
    )
  })

  it('does not call writeFile when no secretsDir', async () => {
    await renderCompose({ ...BASE_CONFIG, auth: { mode: 'api-key' } })
    // writeFile should not be called for the secrets file (only readFile for template)
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe('renderCompose — ergo hostPort', () => {
  it('exposes host port when ergo.hostPort is set', async () => {
    const yaml = await renderCompose({
      ...BASE_CONFIG,
      ergo: { ...BASE_CONFIG.ergo, hostPort: 16667 },
    })
    expect(yaml).toContain('"16667:6667"')
  })

  it('does not expose ports when hostPort is omitted', async () => {
    const yaml = await renderCompose({ ...BASE_CONFIG })
    expect(yaml).not.toContain('ports:')
  })
})

describe('renderCompose — invalid auth', () => {
  it('throws for unknown auth mode', async () => {
    await expect(
      renderCompose({ ...BASE_CONFIG, auth: { mode: 'magic-token' } })
    ).rejects.toThrow('Unknown auth mode: magic-token')
  })
})

// Regression test for #99: rehydrateTeams previously wiped tenantId to null
// on every restart, making all restored teams unclaimed and inaccessible via WS.
// The fix removes the `meta.tenantId = null` assignment so the persisted value
// from team-meta.json is preserved unchanged.
describe('rehydrateTeams — tenantId preservation (regression #99)', () => {
  it('preserves tenantId from team-meta.json and does not wipe it to null', async () => {
    readdir.mockResolvedValue(['team-abc'])
    readFile.mockResolvedValue(JSON.stringify({
      id: 'team-abc',
      tenantId: 'tenant-xyz',
      name: 'test-team',
      agents: [],
      auth: null,
      status: 'running',
      createdAt: new Date().toISOString(),
    }))

    const restoreTeam = vi.fn()
    await rehydrateTeams(restoreTeam)

    expect(restoreTeam).toHaveBeenCalledOnce()
    const restoredTeam = restoreTeam.mock.calls[0][0]
    expect(restoredTeam.tenantId).toBe('tenant-xyz')
  })
})
