/**
 * E2E tests for the Team Settings page (web/app/dashboard/teams/[id]/settings/page.js).
 *
 * Covers:
 *   1. Unauthenticated redirect to /login
 *   2. General section — renders team name, PATCH rename
 *   3. Channels section — disabled with warning when running, editable when stopped
 *   4. Channels section — saves parsed channel array via PATCH
 *   5. Channels section — client-side validation (empty, max 20)
 *   6. Agents section — remove agent sends DELETE
 *   7. Danger Zone — Stop Team button disabled when stopped
 *   8. Danger Zone — sends DELETE and redirects to /dashboard
 */
import { test, expect } from '@playwright/test'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-abc'

const SAMPLE_TEAM = {
  id: TEAM_ID,
  name: 'alpha-squad',
  status: 'running',
  channels: ['#main', '#tasks', '#code'],
  agents: [
    {
      id: 'alpha-squad-dev',
      role: 'dev',
      model: 'claude-sonnet-4-6',
      runtime: 'claude-code',
    },
  ],
  ergo: { port: 6667 },
  repo: { url: 'https://github.com/org/repo', branch: 'main' },
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

async function gotoSettings(page, teamData = SAMPLE_TEAM) {
  await authenticate(page)
  await page.route(`/api/teams/${TEAM_ID}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(teamData),
    })
  )
  await page.goto(`/dashboard/teams/${TEAM_ID}/settings`)
  await page.waitForLoadState('networkidle')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Team Settings — unauthenticated', () => {
  test('redirects to /login when cookie is missing', async ({ page }) => {
    await page.goto(`/dashboard/teams/${TEAM_ID}/settings`)
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Team Settings — General section', () => {
  test('renders team name in input', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    const nameInput = page.getByPlaceholder('e.g. alpha-squad')
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue('alpha-squad')
  })

  test('renders breadcrumb navigation', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByRole('link', { name: /← Teams/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'alpha-squad' })).toBeVisible()
    await expect(page.getByText('Settings')).toBeVisible()
  })

  test('renaming team sends PATCH /api/teams/:id with new name', async ({ page }) => {
    await gotoSettings(page)

    let patchBody = null
    await page.route(`/api/teams/${TEAM_ID}`, async route => {
      if (route.request().method() === 'PATCH') {
        patchBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...SAMPLE_TEAM, name: 'beta-squad' }),
        })
      } else {
        route.continue()
      }
    })

    const nameInput = page.getByPlaceholder('e.g. alpha-squad')
    await nameInput.fill('beta-squad')

    // Find and click the Save button in the General section
    await page.getByRole('button', { name: 'Save' }).first().click()

    await expect(page.getByRole('button', { name: '✓ Saved' })).toBeVisible()
    expect(patchBody).toMatchObject({ name: 'beta-squad' })
  })

  test('shows error message when PATCH fails', async ({ page }) => {
    await gotoSettings(page)

    await page.route(`/api/teams/${TEAM_ID}`, async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Name already taken' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByPlaceholder('e.g. alpha-squad').fill('taken-name')
    await page.getByRole('button', { name: 'Save' }).first().click()

    await expect(page.getByText('Name already taken')).toBeVisible()
  })
})

test.describe('Team Settings — Channels section', () => {
  test('shows warning and disables input when team is running', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'running' })

    await expect(page.getByText(/Channel changes require a stopped team/i)).toBeVisible()

    const channelInput = page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')
    await expect(channelInput).toBeDisabled()
  })

  test('channel input is enabled when team is stopped', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'stopped' })

    await expect(page.getByText(/Channel changes require a stopped team/i)).not.toBeVisible()

    const channelInput = page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')
    await expect(channelInput).toBeEnabled()
  })

  test('pre-populates channels from team data', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'stopped' })

    const channelInput = page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')
    await expect(channelInput).toHaveValue('#main, #tasks, #code')
  })

  test('saving channels sends PATCH with parsed channels array', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'stopped' })

    let patchBody = null
    await page.route(`/api/teams/${TEAM_ID}`, async route => {
      if (route.request().method() === 'PATCH') {
        patchBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...SAMPLE_TEAM, channels: ['#main', '#code', '#deploys'] }),
        })
      } else {
        route.continue()
      }
    })

    const channelInput = page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')
    await channelInput.fill('#main, #code, #deploys')

    // Click the Save button in the Channels section
    await page.getByRole('button', { name: 'Save' }).last().click()

    await expect(page.getByRole('button', { name: '✓ Saved' })).toBeVisible()
    expect(patchBody).toMatchObject({ channels: ['#main', '#code', '#deploys'] })
  })

  test('shows validation error when no valid channels entered', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'stopped' })

    const channelInput = page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')
    await channelInput.fill('no-hash, also-no-hash')

    await page.getByRole('button', { name: 'Save' }).last().click()

    await expect(page.getByText(/At least one valid channel/i)).toBeVisible()
  })

  test('shows validation error when more than 20 channels entered', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'stopped' })

    // Build a string of 21 channels
    const tooMany = Array.from({ length: 21 }, (_, i) => `#ch${i + 1}`).join(', ')
    const channelInput = page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')
    await channelInput.fill(tooMany)

    await page.getByRole('button', { name: 'Save' }).last().click()

    await expect(page.getByText(/Maximum 20 channels/i)).toBeVisible()
  })
})

test.describe('Team Settings — Agents section', () => {
  test('renders agent list with id, role, model', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByText('alpha-squad-dev')).toBeVisible()
    await expect(page.getByText('dev')).toBeVisible()
  })

  test('remove agent sends DELETE /api/teams/:id/agents/:agentId', async ({ page }) => {
    await gotoSettings(page)

    let deleteCalled = false
    await page.route(`/api/teams/${TEAM_ID}/agents/alpha-squad-dev`, route => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true
        route.fulfill({ status: 204, body: '' })
      } else {
        route.continue()
      }
    })

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Remove' }).click()

    // After removal the agent card disappears
    await expect(page.getByText('alpha-squad-dev')).not.toBeVisible()
    expect(deleteCalled).toBe(true)
  })

  test('shows Add Agent form when + Add Agent button clicked', async ({ page }) => {
    await gotoSettings(page)

    await page.getByRole('button', { name: '+ Add Agent' }).click()

    await expect(page.getByRole('button', { name: 'Add Agent' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })
})

test.describe('Team Settings — Danger Zone', () => {
  test('Stop Team button is visible and enabled for a running team', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'running' })

    const stopBtn = page.getByRole('button', { name: 'Stop Team' })
    await expect(stopBtn).toBeVisible()
    await expect(stopBtn).toBeEnabled()
  })

  test('Stop Team button is disabled when team is stopped', async ({ page }) => {
    await gotoSettings(page, { ...SAMPLE_TEAM, status: 'stopped' })

    await expect(page.getByRole('button', { name: 'Stop Team' })).toBeDisabled()
  })

  test('Stop Team sends DELETE /api/teams/:id and redirects to /dashboard', async ({ page }) => {
    await gotoSettings(page)

    await page.route(`/api/teams/${TEAM_ID}`, route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        route.continue()
      }
    })

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Stop Team' }).click()

    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('shows Stopping… while DELETE request is in flight', async ({ page }) => {
    await gotoSettings(page)

    // Never fulfill the DELETE — keeps button in Stopping… state
    await page.route(`/api/teams/${TEAM_ID}`, route => {
      if (route.request().method() !== 'DELETE') route.continue()
    })

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Stop Team' }).click()

    await expect(page.getByRole('button', { name: 'Stopping…' })).toBeVisible()
  })
})

test.describe('Team Settings — error state', () => {
  test('shows error and back link when API returns 500', async ({ page }) => {
    await authenticate(page)
    await page.route(`/api/teams/${TEAM_ID}`, route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal' }),
      })
    )

    await page.goto(`/dashboard/teams/${TEAM_ID}/settings`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Failed to load team/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /← Back to dashboard/i })).toBeVisible()
  })
})
