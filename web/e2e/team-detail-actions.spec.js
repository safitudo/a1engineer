/**
 * E2E tests for AgentActions, AgentActivity, and IrcMessageInput components
 * rendered on the Team Detail page (web/app/dashboard/teams/[id]/page.js).
 *
 * Issue #201
 */
import { test, expect } from '@playwright/test'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-actions'
const AGENT_ID = 'agent-dev'

const SAMPLE_TEAM = {
  id: TEAM_ID,
  name: 'Actions Squad',
  status: 'running',
  agents: [{
    id: AGENT_ID,
    role: 'developer',
    model: 'claude-sonnet-4-6',
    last_heartbeat: new Date().toISOString(),
  }],
  ergo: { port: 6667 },
  channels: ['#main', '#tasks', '#code', '#testing', '#merges'],
  repo: { url: 'https://github.com/org/actions' },
  createdAt: new Date().toISOString(),
}

const SAMPLE_ACTIVITY = {
  branch: 'feat/my-feature',
  recentCommits: ['abc1234 first commit', 'def5678 second commit'],
  diffStat: ' src/foo.js | 3 ++-\n 1 file changed, 2 insertions(+), 1 deletion(-)',
  status: 'M  src/foo.js\nA  src/new.js',
}

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

/**
 * Sets up WebSocket mock — handles auth/subscribe handshake.
 * Returns a Promise that resolves with a `send` function once subscribed.
 */
function setupWSMock(page) {
  return new Promise(resolve => {
    page.routeWebSocket('ws://localhost:8080/ws', ws => {
      ws.onMessage(data => {
        let msg
        try { msg = JSON.parse(data.toString()) } catch { return }
        if (msg.type === 'auth') {
          ws.send(JSON.stringify({ type: 'authenticated' }))
        } else if (msg.type === 'subscribe') {
          ws.send(JSON.stringify({ type: 'subscribed', teamId: msg.teamId }))
          resolve(m => ws.send(JSON.stringify(m)))
        }
      })
    })
  })
}

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
      body: JSON.stringify({ token: 'test' }),
    })
  )
  await page.goto(`/dashboard/teams/${TEAM_ID}`)
  await page.waitForLoadState('networkidle')
}

/**
 * Mock agent sub-endpoints and click the agent card to select it.
 * Waits for AgentActions buttons to appear before returning.
 */
async function selectAgent(page, activityData = SAMPLE_ACTIVITY) {
  await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/activity`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(activityData),
    })
  )
  await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/screen`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lines: [] }),
    })
  )
  await page.getByText(AGENT_ID).click()
  await expect(page.getByRole('button', { name: /nudge/i })).toBeVisible()
}

// ── AgentActions tests ────────────────────────────────────────────────────────

test.describe('AgentActions — buttons', () => {
  test('shows all 4 action buttons when an agent is selected', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    await expect(page.getByRole('button', { name: /nudge/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /interrupt/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /directive/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /exec/i })).toBeVisible()
  })

  test('nudge sends POST to /nudge and shows success toast', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/nudge`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'agent nudged' }),
      })
    )

    await page.getByRole('button', { name: /nudge/i }).click()

    await expect(page.getByText('✓ agent nudged')).toBeVisible()
  })

  test('interrupt shows confirm dialog, POSTs to /interrupt, and shows success toast', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    let interruptCalled = false
    await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/interrupt`, route => {
      interruptCalled = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: /interrupt/i }).click()

    await expect(page.getByText('✓ interrupted')).toBeVisible()
    expect(interruptCalled).toBe(true)
  })

  test('directive panel opens, Ctrl+Enter sends POST, shows success toast', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    let directiveBody = null
    await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/directive`, async route => {
      directiveBody = JSON.parse(route.request().postData() || '{}')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.getByRole('button', { name: /directive/i }).click()

    const textarea = page.getByPlaceholder('Enter directive for agent…')
    await expect(textarea).toBeVisible()
    await textarea.fill('please refactor this module')
    await textarea.press('Control+Enter')

    await expect(page.getByText('✓ directive sent')).toBeVisible()
    expect(directiveBody).toMatchObject({ message: 'please refactor this module' })
  })

  test('exec panel opens, parses command into array, POSTs to /exec, shows output', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    let execBody = null
    await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/exec`, async route => {
      execBody = JSON.parse(route.request().postData() || '{}')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, output: 'total 8\ndrwxr-xr-x 2 root root 4096 .' }),
      })
    })

    await page.getByRole('button', { name: /exec/i }).click()

    const input = page.getByPlaceholder('ls -la /git')
    await expect(input).toBeVisible()
    await input.fill('ls -la /git')
    await input.press('Enter')

    await expect(page.getByText('total 8')).toBeVisible()
    expect(execBody.command).toEqual(['ls', '-la', '/git'])
  })

  test('shows error toast when action POST returns 500', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/nudge`, route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'agent unreachable' }),
      })
    )

    await page.getByRole('button', { name: /nudge/i }).click()

    await expect(page.getByText('✗ agent unreachable')).toBeVisible()
  })
})

// ── AgentActivity tests ───────────────────────────────────────────────────────

test.describe('AgentActivity — panel', () => {
  test('renders Activity header and refresh button when agent is selected', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    await expect(page.getByText('Activity')).toBeVisible()
    await expect(page.locator('button').filter({ hasText: '↻' })).toBeVisible()
  })

  test('shows branch, recent commits, and diff stat from activity API', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page)

    await expect(page.getByText('feat/my-feature')).toBeVisible()
    await expect(page.getByText('first commit')).toBeVisible()
    await expect(page.getByText('second commit')).toBeVisible()
    await expect(page.getByText(/insertion/)).toBeVisible()
    await expect(page.getByText(/deletion/)).toBeVisible()
  })

  test('shows empty state when activity has no git info', async ({ page }) => {
    await gotoTeamDetail(page)
    await selectAgent(page, { branch: null, recentCommits: [], diffStat: null, status: null })

    await expect(page.getByText('no git activity yet')).toBeVisible()
  })

  test('shows error state when activity API returns 500', async ({ page }) => {
    await gotoTeamDetail(page)

    // Override activity to return 500 (must be set up before clicking agent card)
    await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/activity`, route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal' }),
      })
    )
    await page.route(`/api/teams/${TEAM_ID}/agents/${AGENT_ID}/screen`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines: [] }),
      })
    )
    await page.getByText(AGENT_ID).click()

    await expect(page.getByText(/failed to load/i)).toBeVisible()
  })
})

// ── IrcMessageInput tests ─────────────────────────────────────────────────────

test.describe('IrcMessageInput', () => {
  test('renders channel select, text input, and Send button', async ({ page }) => {
    await gotoTeamDetail(page)

    await expect(page.locator('select')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
    // Placeholder depends on WS status — accept either value
    const input = page.locator('input[type="text"]').last()
    await expect(input).toBeVisible()
  })

  test('sends POST on Enter keypress and clears the input field', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    await wsMockReady

    let postBody = null
    await page.route(
      new RegExp(`/api/teams/${TEAM_ID}/channels/[^/]+/messages`),
      async route => {
        postBody = JSON.parse(route.request().postData() || '{}')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      }
    )

    const input = page.getByPlaceholder('Type a message…')
    await input.fill('hello world')
    await input.press('Enter')

    await expect(input).toHaveValue('')
    expect(postBody).toEqual({ text: 'hello world' })
  })

  test('channel selector changes the POST target URL', async ({ page }) => {
    const wsMockReady = setupWSMock(page)
    await gotoTeamDetail(page)
    await wsMockReady

    let requestUrl = null
    await page.route(
      new RegExp(`/api/teams/${TEAM_ID}/channels/[^/]+/messages`),
      async route => {
        requestUrl = route.request().url()
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      }
    )

    await page.locator('select').selectOption('#code')
    const input = page.getByPlaceholder('Type a message…')
    await input.fill('review this')
    await input.press('Enter')

    expect(requestUrl).toContain('/channels/code/messages')
  })

  test('input is disabled and shows Disconnected placeholder when WS is not connected', async ({ page }) => {
    // Block WS so it never connects
    await page.routeWebSocket('ws://localhost:8080/ws', () => {})
    await gotoTeamDetail(page)

    const input = page.getByPlaceholder('Disconnected')
    await expect(input).toBeVisible()
    await expect(input).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled()
  })
})
