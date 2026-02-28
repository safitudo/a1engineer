/**
 * E2E tests for the Global Settings page (web/app/dashboard/settings/page.js).
 *
 * Covers:
 *   1. Unauthenticated redirect to /login
 *   2. Settings page renders with masked API key
 *   3. Settings page renders tenant info
 *   4. Copy button is visible
 *   5. Logout clears cookie and redirects to /login
 *   6. Sidebar settings link navigates correctly
 */
import { test, expect } from '@playwright/test'

// ── Constants ─────────────────────────────────────────────────────────────────

const ME_RESPONSE = {
  maskedKey: 'sk-...abcd',
  tenantId: 'tenant-abc123',
}

const TEAMS_RESPONSE = [
  { id: 'team-1', name: 'alpha-squad', status: 'running' },
  { id: 'team-2', name: 'beta-squad', status: 'stopped' },
]

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

async function gotoSettings(page) {
  await authenticate(page)
  await page.route('/api/auth/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ME_RESPONSE),
    })
  )
  await page.route('/api/teams', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEAMS_RESPONSE),
    })
  )
  await page.goto('/dashboard/settings')
  await page.waitForLoadState('networkidle')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Global Settings — unauthenticated', () => {
  test('redirects to /login when cookie is missing', async ({ page }) => {
    await page.goto('/dashboard/settings')
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Global Settings — page rendering', () => {
  test('renders with masked API key', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText('sk-...abcd')).toBeVisible()
  })

  test('renders tenant info section', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByText('tenant-abc123')).toBeVisible()
    await expect(page.getByText('2')).toBeVisible()
  })

  test('copy button is visible', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible()
  })

  test('renders breadcrumb navigation', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByRole('link', { name: /← Dashboard/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('renders danger zone with logout button', async ({ page }) => {
    await gotoSettings(page)

    await expect(page.getByText('Danger Zone')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  })
})

test.describe('Global Settings — logout', () => {
  test('logout clears cookie and redirects to /login', async ({ page }) => {
    await gotoSettings(page)

    let logoutCalled = false
    await page.route('/api/auth/logout', async route => {
      logoutCalled = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Log out' }).click()

    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
    expect(logoutCalled).toBe(true)
  })

  test('cancelling logout confirm stays on settings', async ({ page }) => {
    await gotoSettings(page)

    page.on('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Log out' }).click()

    await expect(page).toHaveURL(/\/dashboard\/settings/)
  })
})

test.describe('Global Settings — sidebar navigation', () => {
  test('sidebar settings link navigates to /dashboard/settings', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/auth/me', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ME_RESPONSE),
      })
    )
    await page.route('/api/teams', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEAMS_RESPONSE),
      })
    )

    await page.goto('/dashboard')
    const settingsLink = page.getByRole('link', { name: /settings/i }).first()
    await settingsLink.click()

    await page.waitForURL('**/dashboard/settings')
    await expect(page).toHaveURL(/\/dashboard\/settings/)
  })
})
