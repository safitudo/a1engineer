/**
 * E2E tests for the Templates management page (/dashboard/templates).
 *
 * Covers:
 *   1. Page layout — heading, custom section, builtin section
 *   2. Empty state when no custom templates exist
 *   3. Template cards — custom badge + Edit/Delete buttons; builtin badge, no buttons
 *   4. Create form — opens on "+ New Template", heading, cancel, successful POST
 *   5. Create form — server error displayed inline
 *   6. Edit form — opens on "Edit", pre-populated name, "Save Changes" button, successful PUT
 *   7. Delete — confirm dialog triggers DELETE and removes card; dismiss keeps card
 *   8. "+ New Template" button hidden while form is open
 */
import { test, expect } from '@playwright/test'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CUSTOM_TEMPLATE = {
  id: 'tmpl-custom-1',
  name: 'Full-Stack Team',
  description: 'A full stack development team',
  builtin: false,
  agents: [
    { role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: '' },
  ],
}

const BUILTIN_TEMPLATE = {
  id: 'tmpl-builtin-1',
  name: 'Basic Dev',
  description: 'Minimal single-developer template',
  builtin: true,
  agents: [
    { role: 'dev', model: 'sonnet', runtime: 'claude-code', effort: 'high', prompt: '' },
  ],
}

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

/**
 * Navigate to /dashboard/templates with GET /api/templates mocked to return
 * the provided templates array.  Additional route mocks can be registered
 * after this call (e.g. for PUT / DELETE on specific IDs).
 */
async function gotoTemplates(page, templates = []) {
  await authenticate(page)
  await page.route('/api/templates', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates }),
      })
    }
    return route.continue()
  })
  await page.goto('/dashboard/templates')
  await page.waitForLoadState('networkidle')
}

// ── Layout ────────────────────────────────────────────────────────────────────

test.describe('Templates page — layout', () => {
  test('shows "Team Templates" page heading', async ({ page }) => {
    await gotoTemplates(page, [])
    await expect(page.getByRole('heading', { name: 'Team Templates' })).toBeVisible()
  })

  test('shows Custom Templates section with count', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await expect(page.getByText('Custom Templates (1)')).toBeVisible()
  })

  test('shows Builtin Templates section with count', async ({ page }) => {
    await gotoTemplates(page, [BUILTIN_TEMPLATE])
    await expect(page.getByText('Builtin Templates (1)')).toBeVisible()
  })

  test('section counts reflect actual number of templates', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE, BUILTIN_TEMPLATE])
    await expect(page.getByText('Custom Templates (1)')).toBeVisible()
    await expect(page.getByText('Builtin Templates (1)')).toBeVisible()
  })
})

// ── Empty state ───────────────────────────────────────────────────────────────

test.describe('Templates page — empty state', () => {
  test('shows empty state message when no custom templates exist', async ({ page }) => {
    await gotoTemplates(page, [])
    await expect(page.getByText(/No custom templates yet/)).toBeVisible()
  })

  test('empty state is hidden once a custom template exists', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await expect(page.getByText(/No custom templates yet/)).not.toBeVisible()
  })
})

// ── Template cards ────────────────────────────────────────────────────────────

test.describe('Templates page — template cards', () => {
  test('custom template card shows name and "custom" badge', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await expect(page.getByText('Full-Stack Team')).toBeVisible()
    await expect(page.getByText('custom')).toBeVisible()
  })

  test('custom template card has Edit and Delete buttons', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  test('custom template card shows description', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await expect(page.getByText('A full stack development team')).toBeVisible()
  })

  test('custom template card shows agent role:model badge', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await expect(page.getByText('dev:sonnet')).toBeVisible()
  })

  test('builtin template card shows name and "builtin" badge', async ({ page }) => {
    await gotoTemplates(page, [BUILTIN_TEMPLATE])
    await expect(page.getByText('Basic Dev')).toBeVisible()
    await expect(page.getByText('builtin')).toBeVisible()
  })

  test('builtin template card has no Edit or Delete buttons', async ({ page }) => {
    await gotoTemplates(page, [BUILTIN_TEMPLATE])
    await expect(page.getByRole('button', { name: 'Edit' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' })).not.toBeVisible()
  })
})

// ── Create form ───────────────────────────────────────────────────────────────

test.describe('Templates page — create form', () => {
  test('clicking "+ New Template" opens the create form', async ({ page }) => {
    await gotoTemplates(page, [])
    await page.getByRole('button', { name: '+ New Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible()
  })

  test('create form has "Create Template" submit button', async ({ page }) => {
    await gotoTemplates(page, [])
    await page.getByRole('button', { name: '+ New Template' }).click()
    await expect(page.getByRole('button', { name: 'Create Template' })).toBeVisible()
  })

  test('+ New Template button is hidden while form is open', async ({ page }) => {
    await gotoTemplates(page, [])
    await page.getByRole('button', { name: '+ New Template' }).click()
    await expect(page.getByRole('button', { name: '+ New Template' })).not.toBeVisible()
  })

  test('Cancel button closes the form', async ({ page }) => {
    await gotoTemplates(page, [])
    await page.getByRole('button', { name: '+ New Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'New Template' })).not.toBeVisible()
    // + New Template button reappears after cancel
    await expect(page.getByRole('button', { name: '+ New Template' })).toBeVisible()
  })

  test('successful create POSTs to /api/templates and shows new card', async ({ page }) => {
    const created = { ...CUSTOM_TEMPLATE, id: 'tmpl-new-1', name: 'My New Template' }

    await authenticate(page)
    await page.route('/api/templates', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ templates: [] }),
        })
      }
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        })
      }
      return route.continue()
    })
    await page.goto('/dashboard/templates')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '+ New Template' }).click()
    await page.getByPlaceholder('e.g. Full-Stack Team').fill('My New Template')
    await page.getByRole('button', { name: 'Create Template' }).click()

    // Form closes and new template card appears
    await expect(page.getByRole('heading', { name: 'New Template' })).not.toBeVisible()
    await expect(page.getByText('My New Template')).toBeVisible()
  })

  test('server error on create is displayed inside the form', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ templates: [] }),
        })
      }
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'name is required' }),
        })
      }
      return route.continue()
    })
    await page.goto('/dashboard/templates')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '+ New Template' }).click()
    await page.getByPlaceholder('e.g. Full-Stack Team').fill('x')
    await page.getByRole('button', { name: 'Create Template' }).click()

    await expect(page.getByText('name is required')).toBeVisible()
    // Form stays open on error
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible()
  })
})

// ── Edit form ─────────────────────────────────────────────────────────────────

test.describe('Templates page — edit form', () => {
  test('clicking Edit opens the form with "Edit Template" heading', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Template' })).toBeVisible()
  })

  test('edit form is pre-populated with the existing template name', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByPlaceholder('e.g. Full-Stack Team')).toHaveValue('Full-Stack Team')
  })

  test('edit form has "Save Changes" submit button', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible()
  })

  test('successful edit PUTs to /api/templates/:id and updates the card', async ({ page }) => {
    const updated = { ...CUSTOM_TEMPLATE, name: 'Updated Team Name' }

    await authenticate(page)
    await page.route('/api/templates', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ templates: [CUSTOM_TEMPLATE] }),
        })
      }
      return route.continue()
    })
    await page.route(`/api/templates/${CUSTOM_TEMPLATE.id}`, async route => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updated),
        })
      }
      return route.continue()
    })
    await page.goto('/dashboard/templates')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Edit' }).click()
    const nameInput = page.getByPlaceholder('e.g. Full-Stack Team')
    await nameInput.fill('Updated Team Name')
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // Form closes and updated name appears in card
    await expect(page.getByRole('heading', { name: 'Edit Template' })).not.toBeVisible()
    await expect(page.getByText('Updated Team Name')).toBeVisible()
    // Old name gone
    await expect(page.getByText('Full-Stack Team')).not.toBeVisible()
  })
})

// ── Delete ────────────────────────────────────────────────────────────────────

test.describe('Templates page — delete', () => {
  test('confirming delete dialog sends DELETE and removes template card', async ({ page }) => {
    await authenticate(page)
    await page.route('/api/templates', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ templates: [CUSTOM_TEMPLATE] }),
        })
      }
      return route.continue()
    })
    await page.route(`/api/templates/${CUSTOM_TEMPLATE.id}`, async route => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({ status: 204 })
      }
      return route.continue()
    })
    await page.goto('/dashboard/templates')
    await page.waitForLoadState('networkidle')

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText('Full-Stack Team')).not.toBeVisible()
  })

  test('dismissing delete confirm dialog keeps the template card', async ({ page }) => {
    await gotoTemplates(page, [CUSTOM_TEMPLATE])

    page.on('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Delete' }).click()

    // Template should still be visible
    await expect(page.getByText('Full-Stack Team')).toBeVisible()
  })
})
