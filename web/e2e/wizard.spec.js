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

// Mock /api/templates — wizard fetches this on mount.
// Pass an array of template objects to simulate a non-empty library.
async function mockTemplates(page, templates = []) {
  await page.route('/api/templates', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ templates }),
    })
  )
}

// Navigate to wizard and land on step 0 (Template).
async function gotoWizardStep0(page) {
  await authenticate(page)
  await mockTemplates(page)
  await page.goto('/dashboard/teams/new')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Start from a template' })).toBeVisible()
}

// Navigate to wizard and advance past step 0 to step 1 (Team).
// Step 0 has no validation — default selectedTemplateId is 'custom' so Next → always works.
async function gotoWizard(page) {
  await gotoWizardStep0(page)
  await page.getByRole('button', { name: 'Next →' }).click()
  await expect(page.getByRole('heading', { name: 'Name your team' })).toBeVisible()
}

// ── Step 0: Template selection ─────────────────────────────────────────────────

test.describe('Create Team wizard — unauthenticated', () => {
  test('redirects to /login when cookie is missing', async ({ page }) => {
    await mockTemplates(page)
    await page.goto('/dashboard/teams/new')
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Create Team wizard — step 0 (Template)', () => {
  test('renders template step with heading and Custom option', async ({ page }) => {
    await gotoWizardStep0(page)

    await expect(page.getByRole('heading', { name: 'Start from a template' })).toBeVisible()
    // Custom is always present as a sentinel option
    await expect(page.getByRole('button', { name: 'Custom' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
    // Step 0: Cancel link (not ← Back) since it is the first step
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible()
  })

  test('shows template cards loaded from /api/templates', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          templates: [{
            id: 'tpl-1',
            name: 'Full Stack',
            description: 'Frontend + backend team',
            runtime: 'claude-code',
            agents: [{ role: 'dev' }, { role: 'qa' }],
            tags: ['recommended'],
          }],
        }),
      })
    )
    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /Full Stack/ })).toBeVisible()
    await expect(page.getByText('recommended')).toBeVisible()
  })

  test('selecting a template highlights it', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          templates: [{
            id: 'tpl-1',
            name: 'Full Stack',
            description: 'Frontend + backend',
            runtime: 'claude-code',
            agents: [],
            tags: [],
          }],
        }),
      })
    )
    await page.goto('/dashboard/teams/new')
    await page.waitForLoadState('networkidle')

    // Click the template card
    await page.getByRole('button', { name: /Full Stack/ }).click()
    // Selected card gets the green border class
    await expect(page.getByRole('button', { name: /Full Stack/ })).toHaveClass(/border-\[#3fb950\]/)
  })

  test('Cancel link navigates back to dashboard', async ({ page }) => {
    await gotoWizardStep0(page)
    await page.getByRole('link', { name: 'Cancel' }).click()
    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('Next → advances to step 1 without needing to select a template', async ({ page }) => {
    await gotoWizardStep0(page)
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Name your team' })).toBeVisible()
  })
})

// ── Steps 1–5 ─────────────────────────────────────────────────────────────────

test.describe('Create Team wizard — step 1 (Team)', () => {
  test('renders team name and repo URL inputs', async ({ page }) => {
    await gotoWizard(page)

    await expect(page.getByPlaceholder('e.g. alpha-squad')).toBeVisible()
    await expect(page.getByPlaceholder('https://github.com/org/repo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
  })

  test('shows validation error if team name is empty', async ({ page }) => {
    await gotoWizard(page)

    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Team name is required')).toBeVisible()
  })

  test('shows validation error if repo URL is missing', async ({ page }) => {
    await gotoWizard(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Repository URL is required')).toBeVisible()
  })

  test('shows validation error for invalid repo URL', async ({ page }) => {
    await gotoWizard(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('not-a-url')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Enter a valid URL')).toBeVisible()
  })

  test('Back button from step 1 returns to step 0', async ({ page }) => {
    await gotoWizard(page)

    await page.getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('heading', { name: 'Start from a template' })).toBeVisible()
    // Step 0 shows Cancel link
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible()
  })
})

test.describe('Create Team wizard — step 2 (Runtime)', () => {
  test('runtime selection is visible and selectable', async ({ page }) => {
    await gotoWizard(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()

    const claudeCodeBtn = page.getByRole('button', { name: /Claude Code/ })
    await expect(claudeCodeBtn).toBeVisible()
    await claudeCodeBtn.click()

    // Codex shows "coming soon" badge
    await expect(page.getByText('coming soon')).toBeVisible()
  })

  test('Back button from step 2 returns to step 1', async ({ page }) => {
    await gotoWizard(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()

    await page.getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('heading', { name: 'Name your team' })).toBeVisible()
  })
})

test.describe('Create Team wizard — step 3 (Agents)', () => {
  test('can add and remove agents', async ({ page }) => {
    await gotoWizard(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await expect(page.getByText('Agent 1')).toBeVisible()

    // Add a second agent
    const addAgentBtn = page.getByRole('button', { name: /Add agent/ })
    await addAgentBtn.scrollIntoViewIfNeeded()
    await addAgentBtn.click()
    await expect(page.getByText('Agent 2')).toBeVisible()

    // Remove button appears when there is more than one agent
    const removeBtn = page.getByRole('button', { name: 'Remove' }).first()
    await expect(removeBtn).toBeVisible()
    await removeBtn.click()
    await expect(page.getByText('Agent 2')).not.toBeVisible()
  })
})

test.describe('Create Team wizard — step 4 (API Key)', () => {
  test('API key input with show/hide toggle and validation', async ({ page }) => {
    await gotoWizard(page)

    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByRole('heading', { name: 'Your API key' })).toBeVisible()

    const apiKeyInput = page.getByPlaceholder('sk-ant-api03-...')
    await apiKeyInput.scrollIntoViewIfNeeded()
    await expect(apiKeyInput).toHaveAttribute('type', 'password')

    // Toggle show/hide
    await page.getByRole('button', { name: 'Show' }).click()
    await expect(apiKeyInput).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide' }).click()
    await expect(apiKeyInput).toHaveAttribute('type', 'password')

    // Validation: empty API key
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('API key is required')).toBeVisible()
  })
})

test.describe('Create Team wizard — step 5 (Review & Launch)', () => {
  // Helper: fill steps 1–4 and land on step 5
  async function gotoStep5(page) {
    await gotoWizard(page)
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Your API key' })).toBeVisible()
    const apiKeyInput = page.getByPlaceholder('sk-ant-api03-...')
    await apiKeyInput.scrollIntoViewIfNeeded()
    await apiKeyInput.fill('sk-ant-api03-testkey')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Review & launch' })).toBeVisible()
  }

  test('review shows filled values', async ({ page }) => {
    await gotoStep5(page)

    await expect(page.getByText('my-team')).toBeVisible()
    await expect(page.getByText('https://github.com/org/repo')).toBeVisible()
    await expect(page.getByText('Claude Code')).toBeVisible()
  })

  test('successful launch redirects to dashboard', async ({ page }) => {
    await page.route('/api/teams', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'new-team-id', name: 'my-team' }),
      })
    )

    await gotoStep5(page)

    const launchBtn = page.getByRole('button', { name: 'Launch team' })
    await expect(launchBtn).toBeVisible()
    await launchBtn.click()

    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('shows error when launch fails', async ({ page }) => {
    await page.route('/api/teams', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Manager unavailable' }),
      })
    )

    await gotoStep5(page)
    await page.getByRole('button', { name: 'Launch team' }).click()

    await expect(page.getByText('Manager unavailable')).toBeVisible()
  })
})
