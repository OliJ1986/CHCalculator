import { expect, test } from '@playwright/test'

test.describe('M22 mobil UI kapu', () => {
  test.use({ viewport: { width: 360, height: 667 } })

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      if (!url.pathname.startsWith('/api/')) return route.continue()
      let body: unknown = []
      if (url.pathname.endsWith('/auth/me')) body = { status: 'guest', authenticated: false, role: 'guest', email: null }
      else if (url.pathname.endsWith('/meals')) body = { items: [], total_carbs_g: 0 }
      else if (url.pathname.endsWith('/goals/summary')) body = { local_date: '2026-09-26', consumed_carbs_g: 0, daily_target_g: null, remaining_carbs_g: null, progress_ratio: null, progress_percent: null, categories: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
  })

  test('keeps the main mobile surfaces inside the viewport', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(500)
    await expect(page.locator('.app-frame')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth + 1))
    await page.getByRole('button', { name: 'Hozzáadás', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const search = page.getByRole('textbox', { name: 'Étel keresése' })
    await expect(search).toBeVisible()
    expect(await search.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(250)
    await page.screenshot({ path: 'test-results/m22/home-add-360.png', fullPage: true })
    await page.getByRole('button', { name: 'Bezárás' }).click()
    await page.goto('/etelek')
    await expect(page.getByRole('tab', { name: 'Saját ételek' })).toBeVisible()
    await page.screenshot({ path: 'test-results/m22/catalog-360.png', fullPage: true })
    await page.goto('/tervezo')
    await expect(page.getByRole('heading', { name: 'Heti étkezési terv' })).toBeVisible()
    await page.screenshot({ path: 'test-results/m22/planner-360.png', fullPage: true })
  })
})
