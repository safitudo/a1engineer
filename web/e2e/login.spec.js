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

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('API Key').fill('sk-test-key')
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
