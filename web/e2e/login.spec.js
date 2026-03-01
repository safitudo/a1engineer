import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test('renders the login form', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'A1 Engineer' })).toBeVisible()
    await expect(page.getByLabel('API Key')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('sign-in button is disabled when input is empty', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })

  test('redirects to dashboard on successful login', async ({ page }) => {
    await page.route('/api/auth/login', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    )
    // Dashboard fetches teams on load; mock it so networkidle settles cleanly.
    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('API Key').fill('sk-test-key')

    // The real /api/auth/login handler sets the HttpOnly cookie server-side.
    // Playwright's browser-level mock bypasses that handler, so the cookie is
    // never set and the dashboard middleware redirects back to /login.
    // Inject it manually before the click so the middleware sees it.
    await page.context().addCookies([{
      name: 'a1_api_key',
      value: 'sk-test-key',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    }])

    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('shows error message on failed login', async ({ page }) => {
    await page.route('/api/auth/login', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid API key' }),
      })
    )

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('API Key').fill('sk-bad-key')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Invalid API key')).toBeVisible()
  })

  test('shows generic error on network failure', async ({ page }) => {
    await page.route('/api/auth/login', route => route.abort())

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('API Key').fill('sk-any-key')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Some error text appears (network failure message)
    const errorEl = page.locator('text=/failed/i').or(page.locator('text=/error/i'))
    await expect(errorEl.first()).toBeVisible()
  })
})
