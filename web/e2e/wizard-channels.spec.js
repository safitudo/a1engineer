/**
 * E2E tests for custom channels input in the Create Team wizard.
 *
 * Covers:
 *   1. Channels field is visible in Step 1 (Name your team)
 *   2. Custom channels appear in the Review step
 *   3. Channels are included in POST /api/teams when provided
 *   4. Channels are omitted from POST /api/teams when left blank
 *   5. Channel entries without # prefix are filtered out before submission
 *   6. Review step omits Channels row when field is blank
 *   7. All-invalid entries (no # prefix) → channels key omitted from POST
 *   8. Channels field value is preserved when navigating back from agents step
 */
import { test, expect } from '@playwright/test'

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
 * Navigate to the Create Team wizard with the templates API mocked
 * (no builtin templates so wizard shows the custom/blank slate).
 */
async function gotoWizard(page) {
  await authenticate(page)
  await page.route('/api/templates', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ templates: [] }),
    })
  )
  await page.goto('/dashboard/teams/new')
  await page.waitForLoadState('networkidle')
}

/**
 * Advance through Step 0 (template picker) to Step 1 (Team name / channels).
 * With no templates the picker still renders; clicking Next advances the step.
 */
async function advanceToTeamStep(page) {
  // Step 0 → Step 1
  await page.getByRole('button', { name: 'Next →' }).click()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Create Team wizard — channels field', () => {
  test('channels input is visible in the team name step', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    await expect(page.getByText('IRC channels')).toBeVisible()
    await expect(page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')).toBeVisible()
    await expect(page.getByText(/Leave blank to use the 5 default channels/i)).toBeVisible()
  })

  test('custom channels appear in the Review step', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    // Fill team name, repo URL, and custom channels
    await page.getByPlaceholder('e.g. alpha-squad').fill('channel-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByPlaceholder('#main, #tasks, #code, #testing, #merges').fill('#main, #deploys, #alerts')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2: Agents — advance without changes
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 3: Auth / API key — fill dummy key
    const apiKeyInput = page.getByPlaceholder(/sk-ant-/)
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill('sk-ant-test-key')
      await page.getByRole('button', { name: 'Next →' }).click()
    }

    // Review step should display the custom channels
    await expect(page.getByText('#main, #deploys, #alerts')).toBeVisible()
  })

  test('channels are sent in POST /api/teams when custom channels provided', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    let postBody = null
    await page.route('/api/teams', async route => {
      if (route.request().method() === 'POST') {
        postBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-team', name: 'channel-test', status: 'creating' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByPlaceholder('e.g. alpha-squad').fill('channel-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByPlaceholder('#main, #tasks, #code, #testing, #merges').fill('#main, #deploys')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Agents step — advance
    await page.getByRole('button', { name: 'Next →' }).click()

    // API key step
    const apiKeyInput = page.getByPlaceholder(/sk-ant-/)
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill('sk-ant-test-key')
      await page.getByRole('button', { name: 'Next →' }).click()
    }

    // Launch from review step
    await page.getByRole('button', { name: /Launch/i }).click()

    await expect(async () => {
      expect(postBody).not.toBeNull()
    }).toPass()

    expect(postBody.channels).toEqual(['#main', '#deploys'])
  })

  test('channels are omitted from POST body when field is left blank', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    let postBody = null
    await page.route('/api/teams', async route => {
      if (route.request().method() === 'POST') {
        postBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-team', name: 'no-channels-test', status: 'creating' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByPlaceholder('e.g. alpha-squad').fill('no-channels-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    // Leave channels blank
    await page.getByRole('button', { name: 'Next →' }).click()

    // Agents step — advance
    await page.getByRole('button', { name: 'Next →' }).click()

    // API key step
    const apiKeyInput = page.getByPlaceholder(/sk-ant-/)
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill('sk-ant-test-key')
      await page.getByRole('button', { name: 'Next →' }).click()
    }

    await page.getByRole('button', { name: /Launch/i }).click()

    await expect(async () => {
      expect(postBody).not.toBeNull()
    }).toPass()

    // No channels key when field was blank
    expect(postBody.channels).toBeUndefined()
  })

  test('channel entries without # prefix are filtered out before POST', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    let postBody = null
    await page.route('/api/teams', async route => {
      if (route.request().method() === 'POST') {
        postBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-team', name: 'filter-test', status: 'creating' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByPlaceholder('e.g. alpha-squad').fill('filter-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    // Mix valid and invalid channel names
    await page.getByPlaceholder('#main, #tasks, #code, #testing, #merges').fill('#main, nohash, #code')
    await page.getByRole('button', { name: 'Next →' }).click()

    await page.getByRole('button', { name: 'Next →' }).click()

    const apiKeyInput = page.getByPlaceholder(/sk-ant-/)
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill('sk-ant-test-key')
      await page.getByRole('button', { name: 'Next →' }).click()
    }

    await page.getByRole('button', { name: /Launch/i }).click()

    await expect(async () => {
      expect(postBody).not.toBeNull()
    }).toPass()

    // 'nohash' should be filtered out
    expect(postBody.channels).toEqual(['#main', '#code'])
  })

  test('review step does not show channels row when field is left blank', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('no-channels-review')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    // Leave channels blank
    await page.getByRole('button', { name: 'Next →' }).click()

    // Agents step — advance
    await page.getByRole('button', { name: 'Next →' }).click()

    // API key step
    const apiKeyInput = page.getByPlaceholder(/sk-ant-/)
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill('sk-ant-test-key')
      await page.getByRole('button', { name: 'Next →' }).click()
    }

    // Review step: channels row should NOT appear when the field was blank
    await expect(page.getByText('Channels', { exact: true })).not.toBeVisible()
  })

  test('all-invalid channel entries result in channels key being omitted from POST', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    let postBody = null
    await page.route('/api/teams', async route => {
      if (route.request().method() === 'POST') {
        postBody = await route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'new-team', name: 'invalid-channels-test', status: 'creating' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByPlaceholder('e.g. alpha-squad').fill('invalid-channels-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    // All entries lack '#' prefix — parsedChannels will be [] → channels key omitted
    await page.getByPlaceholder('#main, #tasks, #code, #testing, #merges').fill('nohash, alsonohash, stillnohash')
    await page.getByRole('button', { name: 'Next →' }).click()

    await page.getByRole('button', { name: 'Next →' }).click()

    const apiKeyInput = page.getByPlaceholder(/sk-ant-/)
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill('sk-ant-test-key')
      await page.getByRole('button', { name: 'Next →' }).click()
    }

    await page.getByRole('button', { name: /Launch/i }).click()

    await expect(async () => {
      expect(postBody).not.toBeNull()
    }).toPass()

    // channels must be absent — all-invalid entries behave the same as blank
    expect(postBody.channels).toBeUndefined()
  })

  test('channels field value is preserved when navigating back from agents step', async ({ page }) => {
    await gotoWizard(page)
    await advanceToTeamStep(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('back-nav-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByPlaceholder('#main, #tasks, #code, #testing, #merges').fill('#main, #code, #alerts')

    // Advance to agents step
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()

    // Go back to team step
    await page.getByRole('button', { name: '← Back' }).click()

    // Channels value must still be intact
    await expect(page.getByPlaceholder('#main, #tasks, #code, #testing, #merges')).toHaveValue('#main, #code, #alerts')
  })
})
