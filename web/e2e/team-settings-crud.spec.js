/**
 * E2E tests: Team Settings — CRUD completeness
 *
 * Supplements team-settings.spec.js with coverage gaps:
 *   1.  Empty agents state — "No agents configured." message
 *   2.  Add Agent — Cancel hides the form, makes no API call
 *   3.  Add Agent — default form values (dev / sonnet / claude-code)
 *   4.  Add Agent — POST sends correct payload
 *   5.  Add Agent — newly added agent appears in the list
 *   6.  Add Agent — form closes after successful POST
 *   7.  Add Agent — shows "Adding…" while POST is in flight
 *   8.  Add Agent — shows inline error when POST fails
 *   9.  Add Agent — form stays open after POST error
 *  10.  Add Agent — role change reflected in POST payload
 *  11.  Add Agent — model change reflected in POST payload
 *  12.  Remove Agent — dismissing confirm keeps agent visible, no DELETE sent
 */
import { test, expect } from '@playwright/test'

// ── Constants ──────────────────────────────────────────────────────────────────

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

const EMPTY_TEAM = { ...SAMPLE_TEAM, agents: [] }

// ── Helpers ────────────────────────────────────────────────────────────────────

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

/** Stub POST /api/teams/:id/agents with a given response agent object. */
async function stubAgentPost(page, responseAgent) {
  await page.route(`/api/teams/${TEAM_ID}/agents`, async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(responseAgent),
      })
    } else {
      route.continue()
    }
  })
}

// ── Agents — empty state ───────────────────────────────────────────────────────

test.describe('Agents — empty state', () => {
  test('shows "No agents configured." when agents array is empty', async ({ page }) => {
    await gotoSettings(page, EMPTY_TEAM)

    await expect(page.getByText('No agents configured.')).toBeVisible()
  })

  test('shows "+ Add Agent" button even when list is empty', async ({ page }) => {
    await gotoSettings(page, EMPTY_TEAM)

    await expect(page.getByRole('button', { name: '+ Add Agent' })).toBeVisible()
  })
})

// ── Add Agent — form interaction ───────────────────────────────────────────────

test.describe('Add Agent — form interaction', () => {
  test('Cancel button hides the add-agent form', async ({ page }) => {
    await gotoSettings(page)

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await expect(page.getByRole('button', { name: 'Add Agent' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('button', { name: 'Add Agent' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: '+ Add Agent' })).toBeVisible()
  })

  test('Cancel makes no POST request', async ({ page }) => {
    await gotoSettings(page)

    let postCalled = false
    await page.route(`/api/teams/${TEAM_ID}/agents`, route => {
      if (route.request().method() === 'POST') postCalled = true
      route.continue()
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()

    expect(postCalled).toBe(false)
  })

  test('form defaults to role=dev, model=sonnet, runtime=claude-code', async ({ page }) => {
    await gotoSettings(page)

    await page.getByRole('button', { name: '+ Add Agent' }).click()

    // When the form is open, the three <select> elements are Role, Model, Runtime in order
    const [roleSelect, modelSelect, runtimeSelect] = [
      page.getByRole('combobox').nth(0),
      page.getByRole('combobox').nth(1),
      page.getByRole('combobox').nth(2),
    ]

    await expect(roleSelect).toHaveValue('dev')
    await expect(modelSelect).toHaveValue('sonnet')
    await expect(runtimeSelect).toHaveValue('claude-code')
  })
})

// ── Add Agent — POST flow ──────────────────────────────────────────────────────

test.describe('Add Agent — POST flow', () => {
  test('sends POST /api/teams/:id/agents with role, model, and runtime', async ({ page }) => {
    await gotoSettings(page)

    let postBody = null
    await page.route(`/api/teams/${TEAM_ID}/agents`, async route => {
      if (route.request().method() === 'POST') {
        postBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'alpha-squad-dev-9000',
            role: 'dev',
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

    expect(postBody).toMatchObject({ role: 'dev', model: 'sonnet', runtime: 'claude-code' })
  })

  test('newly added agent appears in the agent list', async ({ page }) => {
    await gotoSettings(page)

    const newAgent = {
      id: 'alpha-squad-qa-9999',
      role: 'qa',
      model: 'sonnet',
      runtime: 'claude-code',
    }
    await stubAgentPost(page, newAgent)

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('combobox').nth(0).selectOption('qa')
    await page.getByRole('button', { name: 'Add Agent' }).click()

    await expect(page.getByText('alpha-squad-qa-9999')).toBeVisible()
    await expect(page.getByText('qa')).toBeVisible()
  })

  test('form closes and "+ Add Agent" reappears after successful POST', async ({ page }) => {
    await gotoSettings(page)

    await stubAgentPost(page, {
      id: 'alpha-squad-dev-9001',
      role: 'dev',
      model: 'sonnet',
      runtime: 'claude-code',
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await expect(page.getByRole('button', { name: 'Add Agent' })).toBeVisible()

    await page.getByRole('button', { name: 'Add Agent' }).click()

    await expect(page.getByRole('button', { name: 'Add Agent' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: '+ Add Agent' })).toBeVisible()
  })

  test('shows "Adding…" while POST is in flight', async ({ page }) => {
    await gotoSettings(page)

    // Never fulfill the POST — keeps button in Adding… state
    await page.route(`/api/teams/${TEAM_ID}/agents`, route => {
      if (route.request().method() !== 'POST') route.continue()
      // POST is intentionally never fulfilled
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('button', { name: 'Add Agent' }).click()

    await expect(page.getByRole('button', { name: 'Adding…' })).toBeVisible()
  })

  test('shows inline error message when POST returns an error', async ({ page }) => {
    await gotoSettings(page)

    await page.route(`/api/teams/${TEAM_ID}/agents`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'failed to spawn agent' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('button', { name: 'Add Agent' }).click()

    await expect(page.getByText('failed to spawn agent')).toBeVisible()
  })

  test('form stays open after POST error', async ({ page }) => {
    await gotoSettings(page)

    await page.route(`/api/teams/${TEAM_ID}/agents`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'compose error' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('button', { name: 'Add Agent' }).click()

    // Form should remain open with Cancel still visible
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })
})

// ── Add Agent — select interactions ───────────────────────────────────────────

test.describe('Add Agent — role and model selection', () => {
  test('selecting a different role sends updated role in POST payload', async ({ page }) => {
    await gotoSettings(page)

    let postBody = null
    await page.route(`/api/teams/${TEAM_ID}/agents`, async route => {
      if (route.request().method() === 'POST') {
        postBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'alpha-squad-arch-1', role: 'arch', model: 'sonnet', runtime: 'claude-code' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('combobox').nth(0).selectOption('arch')
    await page.getByRole('button', { name: 'Add Agent' }).click()

    expect(postBody).toMatchObject({ role: 'arch' })
  })

  test('selecting a different model sends updated model in POST payload', async ({ page }) => {
    await gotoSettings(page)

    let postBody = null
    await page.route(`/api/teams/${TEAM_ID}/agents`, async route => {
      if (route.request().method() === 'POST') {
        postBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'alpha-squad-dev-1', role: 'dev', model: 'opus', runtime: 'claude-code' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByRole('button', { name: '+ Add Agent' }).click()
    await page.getByRole('combobox').nth(1).selectOption('opus')
    await page.getByRole('button', { name: 'Add Agent' }).click()

    expect(postBody).toMatchObject({ model: 'opus' })
  })

  test('all available roles are selectable (dev, lead, arch, qa, critic)', async ({ page }) => {
    await gotoSettings(page)

    await page.getByRole('button', { name: '+ Add Agent' }).click()

    const roleSelect = page.getByRole('combobox').nth(0)
    const options = await roleSelect.locator('option').allTextContents()

    expect(options).toEqual(expect.arrayContaining(['dev', 'lead', 'arch', 'qa', 'critic']))
  })
})

// ── Remove Agent — confirm dialog ─────────────────────────────────────────────

test.describe('Remove Agent — confirm dialog', () => {
  test('dismissing confirm keeps agent visible and does not send DELETE', async ({ page }) => {
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

    // Dismiss the native confirm dialog
    page.on('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Remove' }).click()

    await expect(page.getByText('alpha-squad-dev')).toBeVisible()
    expect(deleteCalled).toBe(false)
  })

  test('agent card shows "Removing…" while DELETE is in flight', async ({ page }) => {
    await gotoSettings(page)

    // Never fulfill the DELETE — keeps button in Removing… state
    await page.route(`/api/teams/${TEAM_ID}/agents/alpha-squad-dev`, route => {
      if (route.request().method() !== 'DELETE') route.continue()
      // DELETE intentionally never fulfilled
    })

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Remove' }).click()

    await expect(page.getByRole('button', { name: 'Removing…' })).toBeVisible()
  })
})
