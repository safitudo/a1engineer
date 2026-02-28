/**
 * E2E tests for template selection in the Create Team wizard.
 *
 * These tests are skipped until TMPL-3 (wizard integration) is implemented.
 * TMPL-3 wires template selection UI into the wizard so that choosing a
 * builtin template pre-populates the agents step.
 *
 * Expected flow once TMPL-3 lands:
 *   1. Wizard step 1 (or step 3) shows a "Use template" option or template picker
 *   2. User selects a builtin template (e.g. "Full-stack team")
 *   3. Agents step is pre-populated with the template's agent roster
 *   4. User can still edit the pre-populated agents before launching
 */
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

// Builtin template fixture matching expected TMPL-1 API shape
const FULLSTACK_TEMPLATE = {
  id: 'builtin-fullstack',
  name: 'Full-stack team',
  builtin: true,
  agents: [
    { role: 'lead', model: '' },
    { role: 'dev', model: '' },
    { role: 'dev', model: '' },
    { role: 'qa', model: '' },
  ],
}

const SOLO_TEMPLATE = {
  id: 'builtin-solo',
  name: 'Solo dev',
  builtin: true,
  agents: [
    { role: 'dev', model: '' },
  ],
}

test.describe('Template selection in Create Team wizard', () => {
  // TODO: remove .skip once TMPL-3 (wizard integration) is merged
  test.skip('wizard shows template picker', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([FULLSTACK_TEMPLATE, SOLO_TEMPLATE]),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Template picker should be visible somewhere in the wizard
    // (exact placement determined by TMPL-3 implementation)
    await expect(page.getByText('Full-stack team')).toBeVisible()
    await expect(page.getByText('Solo dev')).toBeVisible()
  })

  // TODO: remove .skip once TMPL-3 (wizard integration) is merged
  test.skip('selecting a template pre-populates agents step', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([FULLSTACK_TEMPLATE, SOLO_TEMPLATE]),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Select the Full-stack template
    await page.getByRole('button', { name: 'Full-stack team' }).click()

    // Advance to the agents step (step 3)
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Agents step: template should have pre-populated 4 agents
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await expect(page.getByText('Agent 1')).toBeVisible()
    await expect(page.getByText('Agent 2')).toBeVisible()
    await expect(page.getByText('Agent 3')).toBeVisible()
    await expect(page.getByText('Agent 4')).toBeVisible()
  })

  // TODO: remove .skip once TMPL-3 (wizard integration) is merged
  test.skip('pre-populated agents from template are editable', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([SOLO_TEMPLATE]),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Select solo template (1 agent pre-populated)
    await page.getByRole('button', { name: 'Solo dev' }).click()

    // Navigate to agents step
    await page.getByPlaceholder('e.g. alpha-squad').fill('solo-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()

    // Should be able to add more agents on top of pre-populated ones
    const addAgentBtn = page.getByRole('button', { name: /Add agent/ })
    await addAgentBtn.scrollIntoViewIfNeeded()
    await addAgentBtn.click()
    await expect(page.getByText('Agent 2')).toBeVisible()
  })

  // TODO: remove .skip once TMPL-3 (wizard integration) is merged
  test.skip('switching template updates the agents step', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([FULLSTACK_TEMPLATE, SOLO_TEMPLATE]),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Select Full-stack first, then switch to Solo dev
    await page.getByRole('button', { name: 'Full-stack team' }).click()
    await page.getByRole('button', { name: 'Solo dev' }).click()

    // Navigate to agents step
    await page.getByPlaceholder('e.g. alpha-squad').fill('switch-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()

    // Solo dev template has only 1 agent
    await expect(page.getByText('Agent 1')).toBeVisible()
    await expect(page.getByText('Agent 2')).not.toBeVisible()
  })
})
