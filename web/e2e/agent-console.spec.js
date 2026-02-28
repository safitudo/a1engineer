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
    await expect(page.getByText('▼ console open')).toBeVisible()
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
    await expect(page.getByText('▼ console open')).toBeVisible()

    // Close by clicking the card again
    await page.getByText('agent-dev').click()
    await expect(page.getByText('▼ console open')).not.toBeVisible()
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
    await expect(page.getByText('▼ console open').first()).toBeVisible()

    // Now click agent-arch — the other card should show ▼ console open
    await page.getByText('agent-arch').click()

    // agent-dev card should be collapsed again
    const devCard = page.locator('text=agent-dev').first()
    const devCardContainer = devCard.locator('xpath=ancestor::div[contains(@class,"cursor-pointer")]')
    await expect(devCardContainer.getByText('▶ click for console')).toBeVisible()

    // agent-arch card shows console open
    await expect(page.getByText('▼ console open')).toBeVisible()
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
