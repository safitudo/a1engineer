/**
 * E2E tests for template selection in the Create Team wizard.
 *
 * TMPL-3 wires template selection UI into the wizard so that choosing a
 * builtin template pre-populates the agents step.
 *
 * Flow:
 *   1. Wizard step 0 shows a template picker
 *   2. User selects a builtin template (e.g. "Full-stack team") and clicks Next
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
  test('wizard shows template picker', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [FULLSTACK_TEMPLATE, SOLO_TEMPLATE] }),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Template picker is visible on step 0
    await expect(page.getByText('Full-stack team')).toBeVisible()
    await expect(page.getByText('Solo dev')).toBeVisible()
  })

  test('selecting a template pre-populates agents step', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [FULLSTACK_TEMPLATE, SOLO_TEMPLATE] }),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Select the Full-stack template then advance to step 1 (Team)
    await page.getByRole('button', { name: 'Full-stack team' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Advance to the agents step (step 2)
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Agents step: template should have pre-populated 4 agents
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await expect(page.getByText('Agent 1')).toBeVisible()
    await expect(page.getByText('Agent 2')).toBeVisible()
    await expect(page.getByText('Agent 3')).toBeVisible()
    await expect(page.getByText('Agent 4')).toBeVisible()
  })

  test('pre-populated agents from template are editable', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [SOLO_TEMPLATE] }),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Select solo template (1 agent pre-populated) then advance to step 1 (Team)
    await page.getByRole('button', { name: 'Solo dev' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Navigate to agents step (step 2)
    await page.getByPlaceholder('e.g. alpha-squad').fill('solo-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()

    // Should be able to add more agents on top of pre-populated ones
    const addAgentBtn = page.getByRole('button', { name: /Add agent/ })
    await addAgentBtn.scrollIntoViewIfNeeded()
    await addAgentBtn.click()
    await expect(page.getByText('Agent 2')).toBeVisible()
  })

  test('switching template updates the agents step', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [FULLSTACK_TEMPLATE, SOLO_TEMPLATE] }),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Select Full-stack first, then switch to Solo dev, then advance to step 1 (Team)
    await page.getByRole('button', { name: 'Full-stack team' }).click()
    await page.getByRole('button', { name: 'Solo dev' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Navigate to agents step (step 2)
    await page.getByPlaceholder('e.g. alpha-squad').fill('switch-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()

    // Solo dev template has only 1 agent
    await expect(page.getByText('Agent 1')).toBeVisible()
    await expect(page.getByText('Agent 2')).not.toBeVisible()
  })
})
