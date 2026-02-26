import { describe, it, expect } from 'vitest'
import { renderCompose } from './compose.js'

const BASE_CONFIG = {
  id: 'test-team-id',
  name: 'naples',
  repo: { url: 'https://github.com/example/repo', branch: 'main' },
  ergo: { image: 'ghcr.io/ergochat/ergo:stable', configPath: '/etc/ergo/ircd.yaml', port: 6667 },
  agents: [
    {
      id: 'naples-dev',
      role: 'dev',
      model: 'claude-sonnet-4-6',
      runtime: 'claude-code',
      prompt: 'you are a dev',
      env: { FOO: 'bar' },
    },
  ],
}

describe('renderCompose', () => {
  it('includes team name in network and volume names', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('net-naples')
    expect(yaml).toContain('git-naples')
  })

  it('includes ergo service with team name', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('ergo-naples:')
    expect(yaml).toContain('ghcr.io/ergochat/ergo:stable')
  })

  it('includes agent service named after agent id', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('agent-naples-dev:')
  })

  it('sets IRC_NICK env var to agent id', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('IRC_NICK: "naples-dev"')
  })

  it('sets IRC_ROLE env var', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('IRC_ROLE: "dev"')
  })

  it('sets MODEL env var', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('MODEL: "claude-sonnet-4-6"')
  })

  it('uses agent runtime in image tag', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('a1-agent-claude-code:latest')
  })

  it('includes HEARTBEAT_URL with team id and agent id', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('HEARTBEAT_URL: "http://manager:8080/heartbeat/test-team-id/naples-dev"')
  })

  it('includes AGENT_PROMPT', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('"you are a dev"')
  })

  it('includes custom env vars from agent.env', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('FOO: "bar"')
  })

  it('renders multiple agents', async () => {
    const config = {
      ...BASE_CONFIG,
      agents: [
        { id: 'naples-dev', role: 'dev', model: 'claude-sonnet-4-6', runtime: 'claude-code', prompt: '', env: {} },
        { id: 'naples-arch', role: 'arch', model: 'claude-opus-4-6', runtime: 'claude-code', prompt: '', env: {} },
      ],
    }
    const yaml = await renderCompose(config)
    expect(yaml).toContain('agent-naples-dev:')
    expect(yaml).toContain('agent-naples-arch:')
    expect(yaml).toContain('MODEL: "claude-sonnet-4-6"')
    expect(yaml).toContain('MODEL: "claude-opus-4-6"')
  })

  it('includes repo url in git-init service', async () => {
    const yaml = await renderCompose(BASE_CONFIG)
    expect(yaml).toContain('"https://github.com/example/repo"')
  })
})
