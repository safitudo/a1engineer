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

const TEAM_ID = 'team-abc'

const SAMPLE_TEAM = {
  id: TEAM_ID,
  name: 'Alpha Squad',
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
  repo: { url: 'https://github.com/org/alpha' },
  createdAt: new Date().toISOString(),
}

/**
 * Navigate to the team detail page with all HTTP routes mocked.
 * The WebSocket (TeamWSProvider) will fail to connect — that's expected in tests.
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

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Team Detail — unauthenticated', () => {
  test('redirects to /login when cookie is missing', async ({ page }) => {
    await page.goto(`/dashboard/teams/${TEAM_ID}`)
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Team Detail — authenticated', () => {
  test('renders team name, status badge, and back link', async ({ page }) => {
    await gotoTeamDetail(page)

    await expect(page.getByRole('heading', { name: 'Alpha Squad' })).toBeVisible()
    await expect(page.getByText('running')).toBeVisible()

    const backLink = page.getByRole('link', { name: /← Teams/i })
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/dashboard')
  })

  test('renders agent cards with id and role', async ({ page }) => {
    await gotoTeamDetail(page)

    await expect(page.getByText('agent-dev')).toBeVisible()
    await expect(page.getByText('developer')).toBeVisible()
    await expect(page.getByText('agent-arch')).toBeVisible()
    await expect(page.getByText('architect')).toBeVisible()
  })

  test('shows correct agent count in sidebar', async ({ page }) => {
    await gotoTeamDetail(page)

    // 2 agents → 2 cards with expand prompt
    await expect(page.getByText('▶ click for console')).toHaveCount(2)
  })

  test('shows "no agents" message when agents array is empty', async ({ page }) => {
    await gotoTeamDetail(page, { ...SAMPLE_TEAM, agents: [] })

    await expect(page.getByText(/No agents configured/i)).toBeVisible()
  })

  test('agent card expand and collapse toggles console indicator', async ({ page }) => {
    await gotoTeamDetail(page)

    // Initial state: collapsed
    await expect(page.getByText('▶ click for console').first()).toBeVisible()

    // Click to expand
    await page.getByText('agent-dev').click()
    await expect(page.getByText('▼ console + activity')).toBeVisible()

    // Click again to collapse
    await page.getByText('agent-dev').click()
    await expect(page.getByText('▼ console + activity')).not.toBeVisible()
    await expect(page.getByText('▶ click for console').first()).toBeVisible()
  })

  test('renders IRC feed panel', async ({ page }) => {
    await gotoTeamDetail(page)

    await expect(page.getByText('IRC Feed')).toBeVisible()
  })

  test('renders IRC connection info with external host and port', async ({ page }) => {
    await gotoTeamDetail(page)

    // hostPort present → shows exposed port
    await expect(page.getByText('16667', { exact: true })).toBeVisible()
    // Standard channels listed as copy buttons
    for (const ch of ['#main', '#tasks', '#code', '#testing', '#merges']) {
      await expect(page.getByRole('button', { name: ch })).toBeVisible()
    }
  })

  test('renders IRC connection info with internal hostname when hostPort is absent', async ({ page }) => {
    const teamInternalErgo = { ...SAMPLE_TEAM, ergo: { port: 6667 } }
    await gotoTeamDetail(page, teamInternalErgo)

    await expect(page.getByText('ergo-Alpha Squad', { exact: true })).toBeVisible()
    await expect(page.getByText('6667', { exact: true })).toBeVisible()
    await expect(page.getByText(/internal only/i)).toBeVisible()
  })

  test('Stop Team button is visible and enabled for a running team', async ({ page }) => {
    await gotoTeamDetail(page)

    const stopBtn = page.getByRole('button', { name: /Stop Team/i })
    await expect(stopBtn).toBeVisible()
    await expect(stopBtn).toBeEnabled()
  })

  test('Start Team button is visible for a stopped team', async ({ page }) => {
    await gotoTeamDetail(page, { ...SAMPLE_TEAM, status: 'stopped' })

    await expect(page.getByRole('button', { name: /Start Team/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Start Team/i })).toBeEnabled()
  })

  test('Stop Team calls POST /api/teams/:id/stop and updates button to Start Team', async ({ page }) => {
    await authenticate(page)

    let stopCalled = false
    await page.route(`/api/teams/${TEAM_ID}`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_TEAM) })
    )
    await page.route(`/api/teams/${TEAM_ID}/stop`, route => {
      if (route.request().method() === 'POST') {
        stopCalled = true
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return route.continue()
    })
    await page.route('/api/auth/ws-token', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test' }) })
    )

    await page.goto(`/dashboard/teams/${TEAM_ID}`)
    await page.waitForLoadState('networkidle')

    // Accept the confirm() dialog that stopTeam() shows
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: /Stop Team/i }).click()

    // After stopping, the button should switch to "Start Team"
    await expect(page.getByRole('button', { name: /Start Team/i })).toBeVisible()
    expect(stopCalled).toBe(true)
  })

  test('shows error state with back link when API returns 500', async ({ page }) => {
    await authenticate(page)
    await page.route(`/api/teams/${TEAM_ID}`, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal' }) })
    )
    await page.route('/api/auth/ws-token', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test' }) })
    )

    await page.goto(`/dashboard/teams/${TEAM_ID}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Failed to load team/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /← Back to dashboard/i })).toBeVisible()
  })

  test('shows 404 state when team is not found', async ({ page }) => {
    await authenticate(page)
    await page.route(`/api/teams/${TEAM_ID}`, route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) })
    )
    await page.route('/api/auth/ws-token', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test' }) })
    )

    await page.goto(`/dashboard/teams/${TEAM_ID}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Failed to load team/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /← Back to dashboard/i })).toBeVisible()
  })

  test('shows error state on network failure', async ({ page }) => {
    await authenticate(page)
    await page.route(`/api/teams/${TEAM_ID}`, route => route.abort())
    await page.route('/api/auth/ws-token', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test' }) })
    )

    await page.goto(`/dashboard/teams/${TEAM_ID}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Failed to load team/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /← Back to dashboard/i })).toBeVisible()
  })
})
