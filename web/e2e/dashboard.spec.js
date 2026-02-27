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

test.describe('Dashboard — unauthenticated', () => {
  test('redirects to /login when cookie is missing', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Dashboard — authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page)
  })

  test('shows Teams heading and New Team button', async ({ page }) => {
    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
    await expect(page.getByRole('link', { name: /New Team/i })).toBeVisible()
  })

  test('shows empty state when there are no teams', async ({ page }) => {
    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'No teams yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create team' })).toBeVisible()
  })

  test('renders team cards from API response', async ({ page }) => {
    const teams = [
      {
        id: 'team-1',
        name: 'Alpha Squad',
        status: 'running',
        agents: [{ id: 'a1' }, { id: 'a2' }],
        repo: { url: 'https://github.com/org/alpha' },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'team-2',
        name: 'Beta Team',
        status: 'stopped',
        agents: [],
        repo: null,
        createdAt: new Date().toISOString(),
      },
    ]

    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teams) })
    )

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Alpha Squad' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Beta Team' })).toBeVisible()
    await expect(page.getByText('running')).toBeVisible()
    await expect(page.getByText('stopped')).toBeVisible()
  })

  test('shows error state when API call fails', async ({ page }) => {
    await page.route('/api/teams', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal' }) })
    )

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Failed to load teams/i)).toBeVisible()
  })

  test('team card links to team detail page', async ({ page }) => {
    const teams = [
      {
        id: 'team-abc',
        name: 'Link Test Team',
        status: 'running',
        agents: [],
        repo: null,
        createdAt: new Date().toISOString(),
      },
    ]

    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teams) })
    )

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const card = page.getByRole('heading', { name: 'Link Test Team' })
    await expect(card).toBeVisible()

    const link = page.getByRole('link', { name: /Link Test Team/ })
    await expect(link).toHaveAttribute('href', '/dashboard/teams/team-abc')
  })
})
