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

// Helper: navigate to wizard and wait for hydration
async function gotoWizard(page) {
  await authenticate(page)
  await page.goto('/dashboard/teams/new')
  // Wait for the client component to hydrate — avoids "element not interactable" on first render
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Name your team' })).toBeVisible()
}

test.describe('Create Team wizard', () => {
  test('renders step 1 with team name and repo URL inputs', async ({ page }) => {
    await gotoWizard(page)

    // Use placeholder-based selectors since Input component has no htmlFor/id linkage
    await expect(page.getByPlaceholder('e.g. alpha-squad')).toBeVisible()
    await expect(page.getByPlaceholder('https://github.com/org/repo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
  })

  test('shows validation error if team name is empty on Next', async ({ page }) => {
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

  test('step 2 — runtime selection is visible and selectable', async ({ page }) => {
    await gotoWizard(page)

    // Complete step 1
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2: Runtime
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()

    // Claude Code button should be visible and clickable
    const claudeCodeBtn = page.getByRole('button', { name: /Claude Code/ })
    await expect(claudeCodeBtn).toBeVisible()
    await claudeCodeBtn.scrollIntoViewIfNeeded()
    await claudeCodeBtn.click()

    // Codex should show "coming soon" badge
    await expect(page.getByText('coming soon')).toBeVisible()
  })

  test('step 3 — can add and remove agents', async ({ page }) => {
    await gotoWizard(page)

    // Step 1
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 3
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await expect(page.getByText('Agent 1')).toBeVisible()

    // Add a second agent
    const addAgentBtn = page.getByRole('button', { name: /Add agent/ })
    await addAgentBtn.scrollIntoViewIfNeeded()
    await addAgentBtn.click()
    await expect(page.getByText('Agent 2')).toBeVisible()

    // Remove button appears when more than one agent
    const removeBtn = page.getByRole('button', { name: 'Remove' }).first()
    await expect(removeBtn).toBeVisible()
    await removeBtn.click()
    await expect(page.getByText('Agent 2')).not.toBeVisible()
  })

  test('step 4 — API key input with show/hide toggle', async ({ page }) => {
    await gotoWizard(page)

    // Steps 1-3
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 4
    await expect(page.getByRole('heading', { name: 'Your API key' })).toBeVisible()

    const apiKeyInput = page.getByPlaceholder('sk-ant-api03-...')
    await expect(apiKeyInput).toBeVisible()
    await apiKeyInput.scrollIntoViewIfNeeded()

    // Default type is password
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

  test('step 5 — review shows filled values and launches team', async ({ page }) => {
    await page.route('/api/teams', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'new-team-id', name: 'my-team' }),
      })
    )

    await gotoWizard(page)

    // Step 1
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 3
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 4
    await expect(page.getByRole('heading', { name: 'Your API key' })).toBeVisible()
    const apiKeyInput = page.getByPlaceholder('sk-ant-api03-...')
    await apiKeyInput.scrollIntoViewIfNeeded()
    await apiKeyInput.fill('sk-ant-api03-testkey')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 5: Review
    await expect(page.getByRole('heading', { name: 'Review & launch' })).toBeVisible()

    // Verify summary values are shown
    await expect(page.getByText('my-team')).toBeVisible()
    await expect(page.getByText('https://github.com/org/repo')).toBeVisible()
    await expect(page.getByText('Claude Code')).toBeVisible()

    // Launch
    const launchBtn = page.getByRole('button', { name: 'Launch team' })
    await expect(launchBtn).toBeVisible()
    await launchBtn.click()

    // Should redirect to dashboard
    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('step 5 — shows error when launch fails', async ({ page }) => {
    await page.route('/api/teams', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Manager unavailable' }),
      })
    )

    await gotoWizard(page)

    // Step 1
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 3
    await expect(page.getByRole('heading', { name: 'Add agents' })).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 4
    await expect(page.getByRole('heading', { name: 'Your API key' })).toBeVisible()
    const apiKeyInput = page.getByPlaceholder('sk-ant-api03-...')
    await apiKeyInput.scrollIntoViewIfNeeded()
    await apiKeyInput.fill('sk-ant-api03-testkey')
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 5: Launch
    await expect(page.getByRole('heading', { name: 'Review & launch' })).toBeVisible()
    await page.getByRole('button', { name: 'Launch team' }).click()

    // Error message should appear
    await expect(page.getByText('Manager unavailable')).toBeVisible()
  })

  test('Back button navigates to previous step', async ({ page }) => {
    await gotoWizard(page)

    // Advance to step 2
    await page.getByPlaceholder('e.g. alpha-squad').fill('my-team')
    await page.getByPlaceholder('https://github.com/org/repo').fill('https://github.com/org/repo')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a runtime' })).toBeVisible()

    // Go back
    await page.getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('heading', { name: 'Name your team' })).toBeVisible()
  })
})
