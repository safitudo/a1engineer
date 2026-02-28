/**
 * E2E tests for Team Settings CRUD operations.
 *
 * Focuses on the create/update/delete operations not fully covered in
 * team-settings.spec.js:
 *
 *   Agents:
 *     1. Empty state — no agents message shown
 *     2. Add agent — form submission sends POST /api/teams/:id/agents
 *     3. Add agent — new agent appears in list after success
 *     4. Add agent — API error shown inline
 *     5. Add agent — Cancel hides form without making request
 *     6. Add agent — Adding… state shown while in flight
 *
 *   Channels:
 *     7. Save button disabled while team is running
 *     8. Channels Save error shown inline on API failure
 *
 *   General (team name):
 *     9. Save skipped when name is blank
 *    10. Saving… state shown while in flight
 */
import { test, expect } from '@playwright/test'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-xyz'

const BASE_TEAM = {
  id: TEAM_ID,
  name: 'my-squad',
  status: 'running',
  channels: ['#main', '#tasks'],
  agents: [
    {
      id: 'my-squad-dev',
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

async function gotoSettings(page, teamData = BASE_TEAM) {
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

// ── Agents — empty state ───────────────────────────────────────────────────────

test.describe('Team Settings CRUD — Agents: empty state', () => {
  test('shows "No agents configured." when team has no agents', async ({ page }) => {
    await gotoSettings(page, { ...BASE_TEAM, agents: [] })

    await expect(page.getByText('No agents configured.')).toBeVisible()
    // + Add Agent button still present so user can add one
    await expect(page.getByRole('button', { name: '+ Add Agent' })).toBeVisible()
  })
})

// ── Agents — add agent CRUD ────────────────────────────────────────────────────

test.describe('Team Settings CRUD — Agents: add agent', () => {
  test('form submission sends POST /api/teams/:id/agents', async ({ page }) => {
    await gotoSettings(page)

    let postBody = null
    await page.route(`/api/teams/${TEAM_ID}/agents`, route => {
      if (route.request().method() === 'POST') {
        postBody = route.request().postDataJSON()
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'my-squad-qa',
            role: 'qa',
            model: 'sonnet',
            runtime: 'claude-code',
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()

    // Select role = qa
    await page.getByLabel('Role').selectOption('qa')

    await page.getByRole('button', { name: 'Add Agent' }).click()

    expect(postBody).toMatchObject({ role: 'qa' })
    // Form closes after success
    await expect(page.getByRole('button', { name: '+ Add Agent' })).toBeVisible()
  })

  test('new agent appears in list after successful add', async ({ page }) => {
    await gotoSettings(page)

    await page.route(`/api/teams/${TEAM_ID}/agents`, route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'my-squad-qa',
            role: 'qa',
            model: 'sonnet',
            runtime: 'claude-code',
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('button', { name: 'Add Agent' }).click()

    await expect(page.getByText('my-squad-qa')).toBeVisible()
  })

  test('shows inline error when POST fails', async ({ page }) => {
    await gotoSettings(page)

    await page.route(`/api/teams/${TEAM_ID}/agents`, route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Max agents reached' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('button', { name: 'Add Agent' }).click()

    await expect(page.getByText('Max agents reached')).toBeVisible()
    // Form stays open so user can correct
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  test('Cancel hides form without making request', async ({ page }) => {
    await gotoSettings(page)

    let postCalled = false
    await page.route(`/api/teams/${TEAM_ID}/agents`, route => {
      if (route.request().method() === 'POST') postCalled = true
      route.continue()
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('button', { name: '+ Add Agent' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).not.toBeVisible()
    expect(postCalled).toBe(false)
  })

  test('shows Adding… while POST is in flight', async ({ page }) => {
    await gotoSettings(page)

    // Never fulfill — keeps button in Adding… state
    await page.route(`/api/teams/${TEAM_ID}/agents`, route => {
      if (route.request().method() !== 'POST') route.continue()
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('button', { name: 'Add Agent' }).click()

    await expect(page.getByRole('button', { name: 'Adding…' })).toBeVisible()
  })
})

// ── Channels — CRUD edge cases ─────────────────────────────────────────────────

test.describe('Team Settings CRUD — Channels', () => {
  test('Save button is disabled when team is running', async ({ page }) => {
    await gotoSettings(page, { ...BASE_TEAM, status: 'running' })

    // Channels Save button is the last Save button on the page
    const saveBtns = page.getByRole('button', { name: 'Save' })
    // The Channels save button is disabled when team is running
    const channelSave = saveBtns.last()
    await expect(channelSave).toBeDisabled()
  })

  test('shows inline error when channels PATCH fails', async ({ page }) => {
    await gotoSettings(page, { ...BASE_TEAM, status: 'stopped' })

    await page.route(`/api/teams/${TEAM_ID}`, async route => {
      if (route.request().method() === 'PATCH') {
        const body = await route.request().postDataJSON()
        if (body.channels) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'IRC gateway unavailable' }),
          })
          return
        }
      }
      route.continue()
    })

    const channelInput = page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')
    await channelInput.fill('#main, #dev')

    await page.getByRole('button', { name: 'Save' }).last().click()

    await expect(page.getByText('IRC gateway unavailable')).toBeVisible()
  })
})

// ── General — CRUD edge cases ──────────────────────────────────────────────────

test.describe('Team Settings CRUD — General', () => {
  test('Save is skipped when name is blank or whitespace', async ({ page }) => {
    await gotoSettings(page)

    let patchCalled = false
    await page.route(`/api/teams/${TEAM_ID}`, route => {
      if (route.request().method() === 'PATCH') patchCalled = true
      route.continue()
    })

    const nameInput = page.getByPlaceholder('e.g. alpha-squad')
    await nameInput.fill('   ')

    await page.getByRole('button', { name: 'Save' }).first().click()

    expect(patchCalled).toBe(false)
  })

  test('shows Saving… while PATCH is in flight', async ({ page }) => {
    await gotoSettings(page)

    // Never fulfill — keeps button in Saving… state
    await page.route(`/api/teams/${TEAM_ID}`, route => {
      if (route.request().method() !== 'PATCH') route.continue()
    })

    await page.getByPlaceholder('e.g. alpha-squad').fill('new-name')
    await page.getByRole('button', { name: 'Save' }).first().click()

    await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible()
  })
})
