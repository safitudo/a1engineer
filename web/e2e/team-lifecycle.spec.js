import { test, expect } from '@playwright/test'

// Helper: inject auth cookie so middleware allows dashboard access
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
 * Complete all wizard steps and land on the Review & launch step.
 *
 * Actual step flow:
 *   Step 0 — Start from a template  (fetches /api/templates)
 *   Step 1 — Name your team         (name + repo + channels)
 *   Step 2 — Add agents
 *   Step 3 — Your API key
 *   Step 4 — Review & launch
 */
async function fillWizard(page, { teamName = 'lifecycle-test' } = {}) {
  await authenticate(page)

  // Mock templates API so step 0 renders without real network
  await page.route('/api/templates', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ templates: [] }),
    })
  )

  await page.goto('/dashboard/teams/new')
  await page.waitForLoadState('networkidle')

  // Step 0: template picker — advance
  await expect(page.getByRole('heading', { name: 'Start from a template' })).toBeVisible()
  await page.getByRole('button', { name: 'Next →' }).click()

  // Step 1: name + repo
  await expect(page.getByRole('heading', { name: 'Name your team' })).toBeVisible()
  await page.getByPlaceholder('e.g. alpha-squad').fill(teamName)
  await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
  await page.getByRole('button', { name: 'Next →' }).click()

  // Step 2: agents — advance without changes
  await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
  await page.getByRole('button', { name: 'Next →' }).click()

  // Step 3: API key
  await expect(page.getByRole('heading', { name: 'Your API key' })).toBeVisible()
  const apiKeyInput = page.getByPlaceholder('sk-ant-api03-...')
  await apiKeyInput.scrollIntoViewIfNeeded()
  await apiKeyInput.fill('sk-ant-api03-testkey')
  await page.getByRole('button', { name: 'Next →' }).click()

  // Step 4: review
  await expect(page.getByRole('heading', { name: 'Review & launch' })).toBeVisible()
}

test.describe.serial('Team lifecycle', () => {
  test('create team via wizard and verify team card on dashboard', async ({ page }) => {
    const createdTeam = {
      id: 'lifecycle-team-1',
      name: 'lifecycle-test',
      status: 'running',
      agents: [{ id: 'agent-1' }],
      repo: { url: 'https://github.com/org/repo' },
      createdAt: new Date().toISOString(),
    }

    // POST creates the team; GET returns it for dashboard rendering
    await page.route('/api/teams', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTeam),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([createdTeam]),
        })
      }
    })

    await fillWizard(page)

    await page.getByRole('button', { name: /Launch/i }).click()

    // Redirects to dashboard after successful launch
    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)

    // Team card should appear
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'lifecycle-test' })).toBeVisible()
  })

  test('team card links to team detail page', async ({ page }) => {
    const team = {
      id: 'detail-team-1',
      name: 'detail-test',
      status: 'running',
      agents: [{ id: 'agent-1', role: 'dev', last_heartbeat: new Date().toISOString() }],
      repo: { url: 'https://github.com/org/repo' },
      createdAt: new Date().toISOString(),
    }

    await authenticate(page)
    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([team]) })
    )
    await page.route('/api/teams/detail-team-1', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) })
    )

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Navigate via team card link
    await page.getByRole('link', { name: /detail-test/ }).click()
    await page.waitForURL('**/teams/detail-team-1')
    await page.waitForLoadState('networkidle')

    // Team name and status shown in header
    await expect(page.getByRole('heading', { name: 'detail-test' })).toBeVisible()
    await expect(page.getByText('running')).toBeVisible()

    // Agent card visible
    await expect(page.getByText('agent-1')).toBeVisible()
  })

  test('team detail shows correct repo and agent count', async ({ page }) => {
    const team = {
      id: 'info-team-1',
      name: 'info-test',
      status: 'creating',
      agents: [
        { id: 'agent-dev', role: 'dev', last_heartbeat: null },
        { id: 'agent-qa', role: 'qa', last_heartbeat: null },
      ],
      repo: { url: 'https://github.com/org/myrepo' },
      createdAt: new Date().toISOString(),
    }

    await authenticate(page)
    await page.route('/api/teams/info-team-1', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) })
    )

    await page.goto('/dashboard/teams/info-team-1')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('creating')).toBeVisible()
    await expect(page.getByText('agent-dev')).toBeVisible()
    await expect(page.getByText('agent-qa')).toBeVisible()
  })

  test('stop team redirects back to dashboard', async ({ page }) => {
    const team = {
      id: 'stop-team-1',
      name: 'stop-test',
      status: 'running',
      agents: [],
      repo: null,
      createdAt: new Date().toISOString(),
    }

    await authenticate(page)
    await page.route('/api/teams/stop-team-1', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(team),
        })
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      }
    })
    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )

    await page.goto('/dashboard/teams/stop-team-1')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'stop-test' })).toBeVisible()

    // Accept the native confirm dialog
    page.on('dialog', dialog => dialog.accept())

    await page.getByRole('button', { name: 'Stop Team' }).click()

    // Should redirect to dashboard
    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('Stop Team button is disabled when team is already stopped', async ({ page }) => {
    const team = {
      id: 'stopped-team-1',
      name: 'stopped-test',
      status: 'stopped',
      agents: [],
      repo: null,
      createdAt: new Date().toISOString(),
    }

    await authenticate(page)
    await page.route('/api/teams/stopped-team-1', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) })
    )

    await page.goto('/dashboard/teams/stopped-team-1')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: 'Stop Team' })).toBeDisabled()
  })

  test('dismissing stop confirm dialog keeps team detail open', async ({ page }) => {
    const team = {
      id: 'cancel-stop-team',
      name: 'cancel-test',
      status: 'running',
      agents: [],
      repo: null,
      createdAt: new Date().toISOString(),
    }

    await authenticate(page)
    await page.route('/api/teams/cancel-stop-team', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) })
    )

    await page.goto('/dashboard/teams/cancel-stop-team')
    await page.waitForLoadState('networkidle')

    // Dismiss the confirm dialog
    page.on('dialog', dialog => dialog.dismiss())

    await page.getByRole('button', { name: 'Stop Team' }).click()

    // Should stay on the team detail page
    await expect(page).toHaveURL(/\/teams\/cancel-stop-team/)
    await expect(page.getByRole('heading', { name: 'cancel-test' })).toBeVisible()
  })

  test('delete team from settings redirects to /dashboard', async ({ page }) => {
    const team = {
      id: 'delete-team-1',
      name: 'delete-test',
      status: 'stopped',
      channels: ['#main'],
      agents: [],
      repo: { url: 'https://github.com/org/repo', branch: 'main' },
      ergo: { port: 6667 },
    }

    await authenticate(page)
    await page.route('/api/teams/delete-team-1', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(team),
        })
      }
    })

    await page.goto('/dashboard/teams/delete-team-1/settings')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Stop Team' }).click()

    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('wizard shows error when team creation fails with 500', async ({ page }) => {
    await page.route('/api/teams', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
      }
    })

    await fillWizard(page)

    await page.getByRole('button', { name: /Launch/i }).click()

    // Should stay on the wizard and show an error
    await expect(page.getByText(/error|failed/i)).toBeVisible()
    await expect(page).not.toHaveURL(/\/dashboard$/)
  })
})
