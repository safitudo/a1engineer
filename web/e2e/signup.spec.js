import { test, expect } from '@playwright/test'

test.describe('Signup page', () => {
  test('renders the signup form', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await expect(page.getByLabel('Organization name')).toBeVisible()
    await expect(page.getByLabel('Work email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('submit button is disabled when fields are empty', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  test('submit button remains disabled with only one field filled', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Organization name').fill('Acme Corp')
    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  test('successful signup shows API key reveal screen', async ({ page }) => {
    await page.route('/api/auth/signup', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ apiKey: 'sk-ant-api03-testkey123', name: 'Acme Corp' }),
      })
    )

    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Organization name').fill('Acme Corp')
    await page.getByLabel('Work email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible()
    await expect(page.getByText('sk-ant-api03-testkey123')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible()
  })

  test('API key reveal shows a warning to save the key', async ({ page }) => {
    await page.route('/api/auth/signup', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ apiKey: 'sk-ant-api03-testkey123', name: 'Acme Corp' }),
      })
    )

    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Organization name').fill('Acme Corp')
    await page.getByLabel('Work email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible()
    // Warning banner: key won't be shown again
    await expect(page.getByText(/Save this key/i)).toBeVisible()
  })

  test('shows error when signup fails', async ({ page }) => {
    await page.route('/api/auth/signup', route =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Email already registered' }),
      })
    )

    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Organization name').fill('Acme Corp')
    await page.getByLabel('Work email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText('Email already registered')).toBeVisible()
  })

  test('shows network error on request failure', async ({ page }) => {
    await page.route('/api/auth/signup', route => route.abort())

    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Organization name').fill('Acme Corp')
    await page.getByLabel('Work email').fill('admin@acme.com')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText(/Network error/i)).toBeVisible()
  })

  test('Go to Dashboard link navigates to /dashboard', async ({ page }) => {
    await page.route('/api/auth/signup', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ apiKey: 'sk-ant-api03-newkey', name: 'Test Org' }),
      })
    )
    await page.route('/api/teams', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )

    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Organization name').fill('Test Org')
    await page.getByLabel('Work email').fill('test@testorg.com')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible()

    // Inject auth cookie so dashboard middleware allows access
    await page.context().addCookies([
      {
        name: 'a1_api_key',
        value: 'sk-ant-api03-newkey',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ])

    await page.getByRole('link', { name: 'Go to Dashboard' }).click()
    await page.waitForURL('**/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('has a link to login page for existing users', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
  })
})
