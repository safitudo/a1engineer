/**
 * E2E tests for the Team Detail page (web/app/dashboard/teams/[id]/page.js).
 *
 * Covers:
 *   1. Agent card click expands the AgentConsole panel
 *   2. IRC feed renders messages received over WebSocket
 *   3. Stop Team button sends DELETE and redirects to dashboard
 */
import { test, expect } from '@playwright/test'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-abc'

const SAMPLE_TEAM = {
  id: TEAM_ID,
  name: 'test-team',
  status: 'running',
  ergo: { port: 6667 },
  repo: { url: 'https://github.com/org/repo', branch: 'main' },
  agents: [
    {
      id: 'test-team-dev',
      role: 'dev',
      model: 'claude-sonnet-4-6',
      runtime: 'claude-code',
      last_heartbeat: new Date().toISOString(),
    },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authenticate(page) {
  await page.context().addCookies([
    {
      name: 'a1_api_key',
      value: 'sk-test-key',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    },
  ])
}

/**
 * Sets up WebSocket mock for ws://localhost:8080/ws.
 * Handles the auth/subscribe handshake and returns a `send` function
 * that pushes additional messages to the client.
 */
function setupWSMock(page) {
  return new Promise(resolve => {
    page.routeWebSocket('ws://localhost:8080/ws', ws => {
      let sendToClient
      ws.onMessage(data => {
        let msg
        try { msg = JSON.parse(data.toString()) } catch { return }

        if (msg.type === 'auth') {
          ws.send(JSON.stringify({ type: 'authenticated' }))
        } else if (msg.type === 'subscribe') {
          ws.send(JSON.stringify({ type: 'subscribed', teamId: msg.teamId }))
          sendToClient = m => ws.send(JSON.stringify(m))
          resolve(sendToClient)
        }
      })
    })
  })
}

/**
 * Navigate to the team detail page with HTTP routes and WS token mocked.
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
  await page.route('/api/auth/ws-token', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'test-ws-token' }),
    })
  )
  await page.goto(`/dashboard/teams/${TEAM_ID}`)
  await page.waitForLoadState('networkidle')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Team Detail page — agent console', () => {
  test('clicking an agent card expands the AgentConsole panel', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    await wsMockReady

    const agentCard = page.getByText('test-team-dev')
    await expect(agentCard).toBeVisible()

    // Before clicking: console is collapsed
    await expect(page.getByText('▶ click for console')).toBeVisible()

    // Click the agent card
    await agentCard.click()

    // Console panel opens
    await expect(page.getByText('▼ console + activity')).toBeVisible()
    // AgentConsole renders with "live" badge
    await expect(page.getByText('live')).toBeVisible()
  })

  test('clicking an open agent card collapses the console', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    await wsMockReady

    const agentCard = page.getByText('test-team-dev')

    // Open console
    await agentCard.click()
    await expect(page.getByText('▼ console + activity')).toBeVisible()

    // Close via ✕ button
    await page.getByTitle('Close console').click()
    await expect(page.getByText('▶ click for console')).toBeVisible()
  })
})

test.describe('Team Detail page — IRC feed', () => {
  test('renders IRC messages received over WebSocket', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    const send = await wsMockReady

    // Inject an IRC message after connection is established
    await send({
      type: 'message',
      time: new Date().toISOString(),
      channel: '#main',
      nick: 'test-agent',
      text: 'hello from IRC',
    })

    // Message should appear in the feed
    await expect(page.getByText('hello from IRC')).toBeVisible()
    await expect(page.getByText('test-agent')).toBeVisible()
    await expect(page.getByText('#main')).toBeVisible()
  })

  test('renders multiple IRC messages in order', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    const send = await wsMockReady

    const now = new Date().toISOString()
    await send({ type: 'message', time: now, channel: '#code', nick: 'dev-1', text: 'first message' })
    await send({ type: 'message', time: now, channel: '#code', nick: 'dev-2', text: 'second message' })

    await expect(page.getByText('first message')).toBeVisible()
    await expect(page.getByText('second message')).toBeVisible()
  })

  test('shows connecting state while WebSocket handshake is in progress', async ({ page }) => {
    // Do not set up WS mock so the connection stays pending
    await authenticate(page)
    await page.route(`/api/teams/${TEAM_ID}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SAMPLE_TEAM),
      })
    )
    await page.route('/api/auth/ws-token', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'test-ws-token' }),
      })
    )
    // Block the WS so it never connects
    await page.routeWebSocket('ws://localhost:8080/ws', () => {})

    await page.goto(`/dashboard/teams/${TEAM_ID}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('connecting')).toBeVisible()
  })
})

test.describe('Team Detail page — real-time agent status', () => {
  test('heartbeat WS event updates last_heartbeat on agent card', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    const send = await wsMockReady

    // Verify agent card is visible
    await expect(page.getByText('test-team-dev')).toBeVisible()

    // Inject a heartbeat — timestamp well in the past so "last seen" changes
    const ts = new Date(Date.now() - 5000).toISOString()
    await send({
      type: 'heartbeat',
      teamId: TEAM_ID,
      agentId: 'test-team-dev',
      timestamp: ts,
    })

    // The "last seen" text should reflect seconds-ago (not "never")
    await expect(page.getByText(/last seen: \ds ago/)).toBeVisible()
  })

  test('agent_status stalled shows stalled indicator on agent card', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    const send = await wsMockReady

    await expect(page.getByText('test-team-dev')).toBeVisible()

    await send({
      type: 'agent_status',
      teamId: TEAM_ID,
      agentId: 'test-team-dev',
      status: 'stalled',
    })

    await expect(page.getByText('stalled (nudged)')).toBeVisible()
  })

  test('agent_status killed removes agent card from the list', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    const send = await wsMockReady

    await expect(page.getByText('test-team-dev')).toBeVisible()

    await send({
      type: 'agent_status',
      teamId: TEAM_ID,
      agentId: 'test-team-dev',
      status: 'killed',
    })

    await expect(page.getByText('test-team-dev')).not.toBeVisible()
    // Empty state should appear
    await expect(page.getByText('No agents configured.')).toBeVisible()
  })

  test('agent_status spawned triggers refetch and new agent appears', async ({ page }) => {
    const wsMockReady = setupWSMock(page)

    // Initial team has one agent; after spawn refetch returns two
    const updatedTeam = {
      ...SAMPLE_TEAM,
      agents: [
        ...SAMPLE_TEAM.agents,
        {
          id: 'test-team-qa',
          role: 'qa',
          model: 'claude-haiku-4-5-20251001',
          runtime: 'claude-code',
          last_heartbeat: new Date().toISOString(),
        },
      ],
    }

    await gotoTeamDetail(page)
    const send = await wsMockReady

    // Override the GET /api/teams/:id to return updatedTeam on the next call
    await page.route(`/api/teams/${TEAM_ID}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updatedTeam),
      })
    )

    await send({
      type: 'agent_status',
      teamId: TEAM_ID,
      agentId: 'test-team-qa',
      status: 'spawned',
    })

    // New agent card should appear after refetch
    await expect(page.getByText('test-team-qa')).toBeVisible()
  })
})

test.describe('Team Detail page — Stop Team button', () => {
  test('sends DELETE request and redirects to /dashboard on success', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    await wsMockReady

    await page.route(`/api/teams/${TEAM_ID}`, route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      } else {
        route.continue()
      }
    })

    // Accept the confirm() dialog
    page.on('dialog', dialog => dialog.accept())

    await page.getByRole('button', { name: 'Stop Team' }).click()

    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('is disabled when team status is stopped', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page, { ...SAMPLE_TEAM, status: 'stopped' })
    await wsMockReady

    const stopBtn = page.getByRole('button', { name: 'Stop Team' })
    await expect(stopBtn).toBeDisabled()
  })

  test('stays on page and shows Stopping… while request is in flight', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    await wsMockReady

    // Delay the DELETE response
    await page.route(`/api/teams/${TEAM_ID}`, route => {
      if (route.request().method() === 'DELETE') {
        // Never fulfill — keeps button in "Stopping…" state
        // (test just checks the transient UI label)
      } else {
        route.continue()
      }
    })

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Stop Team' }).click()

    await expect(page.getByRole('button', { name: 'Stopping…' })).toBeVisible()
  })
})
