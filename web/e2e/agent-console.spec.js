import { test, expect } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authenticate(page) {
  await page.context().addCookies([{
    name: 'a1_api_key',
    value: 'sk-test-key',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  }])
}

const TEAM_ID = 'team-console'

const SAMPLE_TEAM = {
  id: TEAM_ID,
  name: 'Console Squad',
  status: 'running',
  agents: [
    {
      id: 'agent-dev',
      role: 'developer',
      model: 'claude-sonnet-4-6',
      last_heartbeat: new Date().toISOString(),
    },
    {
      id: 'agent-arch',
      role: 'architect',
      model: 'claude-opus-4-6',
      last_heartbeat: null,
    },
  ],
  ergo: { hostPort: 16667, port: 6667 },
  repo: { url: 'https://github.com/org/console-squad' },
  createdAt: new Date().toISOString(),
}

/**
 * Navigate to the team detail page with all HTTP routes mocked.
 * TeamWSProvider will fail to connect — expected in tests.
 */
async function gotoTeamDetail(page, teamData = SAMPLE_TEAM) {
  await authenticate(page)
  await page.route(`/api/teams/${TEAM_ID}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(teamData),
    })
  )
  // Stub ws-token so TeamWSProvider does not receive a 404 on mount
  await page.route('/api/auth/ws-token', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'test' }),
    })
  )
  await page.goto(`/dashboard/teams/${TEAM_ID}`)
  await page.waitForLoadState('networkidle')
}

/**
 * WS mock that handles the auth/subscribe handshake and captures
 * console.attach / console.detach messages sent by AgentConsole.
 *
 * Returns:
 *   connected — Promise<send fn> that resolves after WS handshake
 *   attach    — Promise<msg>     that resolves when console.attach arrives
 *   detach    — Promise<msg>     that resolves when console.detach arrives
 */
function setupConsoleMock(page) {
  let resolveConnected
  let resolveAttach
  let resolveDetach

  const connected = new Promise(r => { resolveConnected = r })
  const attach    = new Promise(r => { resolveAttach    = r })
  const detach    = new Promise(r => { resolveDetach    = r })

  page.routeWebSocket('ws://localhost:8080/ws', ws => {
    ws.onMessage(data => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }

      if (msg.type === 'auth') {
        ws.send(JSON.stringify({ type: 'authenticated' }))
      } else if (msg.type === 'subscribe') {
        ws.send(JSON.stringify({ type: 'subscribed', teamId: msg.teamId }))
        resolveConnected(m => ws.send(JSON.stringify(m)))
      } else if (msg.type === 'console.attach') {
        resolveAttach(msg)
      } else if (msg.type === 'console.detach') {
        resolveDetach(msg)
      }
    })
  })

  return { connected, attach, detach }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('AgentConsole — initial state', () => {
  test('no console panel is shown before any agent card is clicked', async ({ page }) => {
    await gotoTeamDetail(page)

    // "live" badge is unique to AgentConsole — not present until a card is opened
    await expect(page.getByText('live')).not.toBeVisible()
    // Close button absent too
    await expect(page.getByTitle('Close console')).not.toBeVisible()
  })

  test('all agent cards show "▶ click for console" initially', async ({ page }) => {
    await gotoTeamDetail(page)

    await expect(page.getByText('▶ click for console')).toHaveCount(2)
  })
})

test.describe('AgentConsole — open and close', () => {
  test('clicking an agent card opens the console panel with live badge', async ({ page }) => {
    await gotoTeamDetail(page)

    await page.getByText('agent-dev').click()

    // Console header shows the agent id
    await expect(page.getByText('live')).toBeVisible()
    // The ✕ close button is present
    await expect(page.getByTitle('Close console')).toBeVisible()
    // Agent card indicator updates
    await expect(page.getByText('▼ console + activity')).toBeVisible()
  })

  test('close button dismisses the console panel', async ({ page }) => {
    await gotoTeamDetail(page)

    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    await page.getByTitle('Close console').click()

    await expect(page.getByText('live')).not.toBeVisible()
    await expect(page.getByTitle('Close console')).not.toBeVisible()
  })

  test('clicking the same agent card again collapses the console', async ({ page }) => {
    await gotoTeamDetail(page)

    // Open
    await page.getByText('agent-dev').click()
    await expect(page.getByText('▼ console + activity')).toBeVisible()

    // Close by clicking the card again
    await page.getByText('agent-dev').first().click()
    await expect(page.getByText('▼ console + activity')).not.toBeVisible()
    await expect(page.getByText('live')).not.toBeVisible()
    // Card returns to collapsed state
    await expect(page.getByText('▶ click for console').first()).toBeVisible()
  })
})

test.describe('AgentConsole — agent switching', () => {
  test('only one console is visible at a time', async ({ page }) => {
    await gotoTeamDetail(page)

    // Open first agent
    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    // Open second agent — first console should be replaced
    await page.getByText('agent-arch').click()
    await expect(page.getByText('live')).toHaveCount(1)
  })

  test('switching agents updates the console header agentId', async ({ page }) => {
    await gotoTeamDetail(page)

    await page.getByText('agent-dev').click()
    await expect(page.getByText('▼ console + activity').first()).toBeVisible()

    // Now click agent-arch — the other card should show ▼ console + activity
    await page.getByText('agent-arch').click()

    // agent-dev card should be collapsed again
    const devCard = page.locator('text=agent-dev').first()
    const devCardContainer = devCard.locator('xpath=ancestor::div[contains(@class,"cursor-pointer")]')
    await expect(devCardContainer.getByText('▶ click for console')).toBeVisible()

    // agent-arch card shows console open
    await expect(page.getByText('▼ console + activity')).toBeVisible()
  })
})

test.describe('AgentConsole — console container', () => {
  test('console panel has a terminal container element', async ({ page }) => {
    await gotoTeamDetail(page)

    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    // The xterm.js mount target div is present (minHeight: 200px)
    // We verify the outer console wrapper is in the DOM
    const consoleWrapper = page.locator('.bg-\\[\\#010409\\].border.border-\\[\\#30363d\\].rounded-lg')
    await expect(consoleWrapper).toBeVisible()
  })

  test('after close, console container is removed from DOM', async ({ page }) => {
    await gotoTeamDetail(page)

    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    await page.getByTitle('Close console').click()
    await expect(page.getByText('live')).not.toBeVisible()
  })
})

test.describe('AgentConsole — console header content', () => {
  test('console header shows the agentId of the selected agent', async ({ page }) => {
    await gotoTeamDetail(page)

    await page.getByText('agent-dev').click()

    // The console wrapper header should contain the agentId text
    const consoleWrapper = page.locator('.bg-\\[\\#010409\\].border.border-\\[\\#30363d\\].rounded-lg')
    await expect(consoleWrapper).toBeVisible()
    await expect(consoleWrapper.getByText('agent-dev')).toBeVisible()
  })

  test('console header updates agentId when switching agents', async ({ page }) => {
    await gotoTeamDetail(page)

    // Open agent-dev console
    await page.getByText('agent-dev').click()
    const consoleWrapper = page.locator('.bg-\\[\\#010409\\].border.border-\\[\\#30363d\\].rounded-lg')
    await expect(consoleWrapper.getByText('agent-dev')).toBeVisible()

    // Switch to agent-arch — console header should update
    await page.getByText('agent-arch').click()
    await expect(consoleWrapper.getByText('agent-arch')).toBeVisible()
    await expect(consoleWrapper.getByText('agent-dev')).not.toBeVisible()
  })
})

test.describe('AgentConsole — WS error handling', () => {
  test('console container renders when ws-token fetch fails', async ({ page }) => {
    await authenticate(page)
    await page.route(`/api/teams/${TEAM_ID}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SAMPLE_TEAM),
      })
    )
    // Return 500 from ws-token — TeamWSProvider should degrade gracefully
    await page.route('/api/auth/ws-token', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal' }),
      })
    )

    await page.goto(`/dashboard/teams/${TEAM_ID}`)
    await page.waitForLoadState('networkidle')

    // Open a console — the wrapper and live badge should still render
    await page.getByText('agent-dev').click()
    const consoleWrapper = page.locator('.bg-\\[\\#010409\\].border.border-\\[\\#30363d\\].rounded-lg')
    await expect(consoleWrapper).toBeVisible()
    await expect(page.getByText('live')).toBeVisible()
  })
})

test.describe('AgentConsole — WS console protocol', () => {
  test('sends console.attach with correct agentId and teamId when console opens', async ({ page }) => {
    const { connected, attach } = setupConsoleMock(page)
    await gotoTeamDetail(page)
    await connected

    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    const attachMsg = await attach
    expect(attachMsg.agentId).toBe('agent-dev')
    expect(attachMsg.teamId).toBe(TEAM_ID)
  })

  test('sends console.detach when the console is closed', async ({ page }) => {
    const { connected, attach, detach } = setupConsoleMock(page)
    await gotoTeamDetail(page)
    await connected

    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    // Wait for xterm to init before closing — ensures detach send is reliable
    await attach

    await page.getByTitle('Close console').click()
    await expect(page.getByText('live')).not.toBeVisible()

    const detachMsg = await detach
    expect(detachMsg.agentId).toBe('agent-dev')
  })

  test('console.data event writes output to the xterm terminal', async ({ page }) => {
    const { connected, attach } = setupConsoleMock(page)
    await gotoTeamDetail(page)
    const send = await connected

    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    // Wait for xterm to initialize and WS listeners to register before sending events
    await attach

    send({ type: 'console.attached', agentId: 'agent-dev', teamId: TEAM_ID })
    send({ type: 'console.data', agentId: 'agent-dev', data: 'hello terminal' })

    // xterm.js DOM renderer puts text in .xterm-rows spans
    await expect(page.locator('.xterm-rows').getByText('hello terminal')).toBeVisible()
  })

  test('console.detached event writes [detached] to the terminal', async ({ page }) => {
    const { connected, attach } = setupConsoleMock(page)
    await gotoTeamDetail(page)
    const send = await connected

    await page.getByText('agent-dev').click()
    await expect(page.getByText('live')).toBeVisible()

    // Wait for xterm to initialize before injecting server events
    await attach

    send({ type: 'console.attached', agentId: 'agent-dev', teamId: TEAM_ID })
    send({ type: 'console.detached', agentId: 'agent-dev', teamId: TEAM_ID })

    // AgentConsole writes '\x1b[90m[detached]\x1b[0m' — xterm renders as text in .xterm-rows
    await expect(page.locator('.xterm-rows').getByText(/\[detached\]/)).toBeVisible()
  })
})
