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

  test('custom (no template) starts with one blank dev agent', async ({ page }) => {
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

    // Do NOT select any template — click Custom or just advance
    await page.getByRole('button', { name: 'Custom' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Navigate to agents step
    await page.getByPlaceholder('e.g. alpha-squad').fill('custom-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()

    // Exactly 1 agent, with default role 'dev'
    await expect(page.getByText('Agent 1')).toBeVisible()
    await expect(page.getByText('Agent 2')).not.toBeVisible()
    await expect(page.getByDisplayValue('dev')).toBeVisible()
  })

  test('template with auth:session shows auth badge on agents step', async ({ page }) => {
    const AUTH_TEMPLATE = {
      id: 'builtin-auth',
      name: 'Auth team',
      builtin: true,
      agents: [
        { role: 'dev', model: 'sonnet', auth: 'session' },
        { role: 'qa', model: 'sonnet' },
      ],
    }

    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [AUTH_TEMPLATE] }),
      })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Auth team' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    await page.getByPlaceholder('e.g. alpha-squad').fill('auth-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()

    // Agent 1 (dev) should show auth:session badge; Agent 2 (qa) should not
    await expect(page.getByText('auth:session')).toBeVisible()
  })

  test('template with env vars shows them in review step', async ({ page }) => {
    const ENV_TEMPLATE = {
      id: 'builtin-env',
      name: 'Env team',
      builtin: true,
      env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '80' },
      agents: [{ role: 'dev', model: 'sonnet' }],
    }

    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [ENV_TEMPLATE] }),
      })
    )
    await page.route('/api/teams', route =>
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'team-env-1' }) })
    )

    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Env team' }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 1: Team
    await page.getByPlaceholder('e.g. alpha-squad').fill('env-test')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2: Agents
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 3: API key
    await page.getByPlaceholder(/sk-/).fill('sk-test-key')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 4: Review — env vars section must be visible
    await expect(page.getByText('Env vars')).toBeVisible()
    await expect(page.getByText('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE')).toBeVisible()
  })
})

test.describe('Templates page CRUD', () => {
  const BUILTIN = {
    id: 'builtin-fullstack',
    name: 'Full-stack team',
    builtin: true,
    agents: [{ role: 'lead', model: 'sonnet' }, { role: 'dev', model: 'sonnet' }],
    tags: [],
  }
  const CUSTOM = {
    id: 'custom-1',
    name: 'My Custom',
    builtin: false,
    agents: [{ role: 'dev', model: 'haiku' }],
    tags: [],
  }

  test('GET /api/templates shows builtin and custom sections', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [BUILTIN, CUSTOM] }),
      })
    )

    await page.goto('/dashboard/templates')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Team Templates' })).toBeVisible()
    await expect(page.getByText(/Builtin Templates/)).toBeVisible()
    await expect(page.getByText(/Custom Templates/)).toBeVisible()
    await expect(page.getByText('Full-stack team')).toBeVisible()
    await expect(page.getByText('My Custom')).toBeVisible()
  })

  test('creating a template via form shows new card', async ({ page }) => {
    const newTemplate = {
      id: 'custom-new',
      name: 'Sprint Team',
      builtin: false,
      agents: [{ role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'medium', prompt: 'build things' }],
      tags: [],
    }

    await authenticate(page)
    await page.route('/api/templates', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ templates: [] }),
        })
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newTemplate),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/dashboard/templates')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '+ New Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible()

    await page.getByPlaceholder('e.g. Full-Stack Team').fill('Sprint Team')
    await page.getByRole('button', { name: 'Create Template' }).click()

    await expect(page.getByText('Sprint Team')).toBeVisible()
  })

  test('validation error from API is shown in form', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ templates: [] }),
        })
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'name is required', code: 'MISSING_NAME' }),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/dashboard/templates')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '+ New Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible()

    // Submit without filling name (form has required attr but mock a 400 response)
    await page.getByPlaceholder('e.g. Full-Stack Team').fill('X')
    await page.getByRole('button', { name: 'Create Template' }).click()

    // Error from API should appear in the form
    await expect(page.getByText('name is required')).toBeVisible()
  })
})
