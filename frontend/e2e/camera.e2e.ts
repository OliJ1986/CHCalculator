import { expect, test, type Page, type Route } from '@playwright/test'
import { Buffer } from 'node:buffer'
import path from 'node:path'

type CameraTestWindow = Window & {
  __cameraCalls: MediaStreamConstraints[]
  __cameraStops: number
  __denyCamera: boolean
  __CHILL_NUTRITION_LAST_CROP?: { x: number; y: number; width: number; height: number; sourceWidth: number; sourceHeight: number }
}

const viewports = [
  { width: 360, height: 667 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
]

function photoFixture(name: string, color: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${color}"/><circle cx="400" cy="250" r="120" fill="#fff" fill-opacity=".55"/><text x="400" y="475" text-anchor="middle" font-family="sans-serif" font-size="54" fill="#23321e">${label}</text></svg>`
  return { name, mimeType: 'image/svg+xml', buffer: Buffer.from(svg) }
}

async function mockApi(
  page: Page,
  barcodeRequests: string[],
  visionHandler?: (route: Route) => Promise<void>,
  barcodeHandler?: (route: Route) => Promise<void>,
) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    let body: unknown = {}
    if (url.pathname.endsWith('/auth/me')) body = { status: 'guest', authenticated: false, role: 'guest', email: null }
    else if (url.pathname.includes('/foods/barcode/')) {
      barcodeRequests.push(url.pathname.split('/').pop() ?? '')
      if (barcodeHandler) { await barcodeHandler(route); return }
      body = null
    }
    else if (url.pathname.endsWith('/vision/food')) {
      if (visionHandler) { await visionHandler(route); return }
      body = { provider: 'mock', uncertain: false, suggestions: [] }
    }
    else if (url.pathname.endsWith('/meals')) body = { items: [], total_carbs_g: 0 }
    else if (url.pathname.endsWith('/goals/summary')) body = { local_date: '2026-09-26', consumed_carbs_g: 0, daily_target_g: null, remaining_carbs_g: null, progress_ratio: null, progress_percent: null, categories: [] }
    else if (url.pathname.includes('/recipes') || url.pathname.includes('/custom-foods') || url.pathname.includes('/plans') || url.pathname.includes('/shopping-list')) body = []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockCamera(page: Page) {
  await page.addInitScript(() => {
    const testWindow = window as CameraTestWindow
    testWindow.__cameraCalls = []
    testWindow.__cameraStops = 0
    testWindow.__denyCamera = false
    class MockMediaStream {
      private readonly tracks: Array<{ kind: string; stop: () => void; getCapabilities: () => object; getSettings: () => object; getConstraints: () => object }>

      constructor(track: { kind: string; stop: () => void; getCapabilities: () => object; getSettings: () => object; getConstraints: () => object }) {
        this.tracks = [track]
      }

      getVideoTracks() { return this.tracks }
      getTracks() { return this.tracks }
    }
    Object.defineProperty(window, 'MediaStream', { configurable: true, value: MockMediaStream })
    const streamValues = new WeakMap<HTMLMediaElement, unknown>()
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() { return streamValues.get(this) ?? null },
      set(value: unknown) { streamValues.set(this, value) },
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          testWindow.__cameraCalls.push(constraints)
          if (testWindow.__denyCamera) throw new DOMException('Permission denied', 'NotAllowedError')
          const track = {
            kind: 'video',
            stop: () => { testWindow.__cameraStops += 1 },
            getCapabilities: () => ({}),
            getSettings: () => ({}),
            getConstraints: () => ({}),
          }
          return new MockMediaStream(track) as unknown as MediaStream
        },
      },
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => false })
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { configurable: true, get: () => 1 })
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 })
    HTMLMediaElement.prototype.play = async function play() { return undefined }
  })
}

async function openBarcodePanel(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hozzáadás', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hozzáadás', exact: true }).click()
  await page.getByRole('button', { name: /^Kamera/ }).click()
  await page.getByRole('button', { name: /^Vonalkód/ }).click()
  await expect(page.getByRole('button', { name: 'Olvasás indítása' })).toBeVisible()
}

async function openNutritionPanel(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hozzáadás', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hozzáadás', exact: true }).click()
  await page.getByRole('button', { name: /^Kamera/ }).click()
  await page.getByRole('button', { name: /^Tápértékcímke/ }).click()
  await expect(page.getByRole('button', { name: 'Kép feltöltése' })).toBeVisible()
}

async function openVisionPanel(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hozzáadás', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hozzáadás', exact: true }).click()
  await page.getByRole('button', { name: /^Kamera/ }).click()
  await page.getByRole('button', { name: /^Étel fotója/ }).click()
  await expect(page.getByRole('button', { name: 'Kép feltöltése' })).toBeVisible()
}

async function openIngredientsPanel(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hozzáadás', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hozzáadás', exact: true }).click()
  await page.getByRole('button', { name: /^Kamera/ }).click()
  await page.getByRole('button', { name: /^Alapanyag fotója/ }).click()
  await expect(page.getByRole('button', { name: 'Kép feltöltése' })).toBeVisible()
}

for (const viewport of viewports) {
  test.describe(`camera ${viewport.width}px`, () => {
    test.use({ viewport })

    test('asks for camera permission, reports denial, retries and stops on close', async ({ page }) => {
      test.setTimeout(45_000)
      const barcodeRequests: string[] = []
      await mockCamera(page)
      await mockApi(page, barcodeRequests)
      await openBarcodePanel(page)

      await page.evaluate(() => { (window as CameraTestWindow).__denyCamera = true })
      await page.getByRole('button', { name: 'Olvasás indítása' }).click()
      await expect(page.getByRole('alert')).toContainText('kameraengedélyt')

      await page.evaluate(() => { (window as CameraTestWindow).__denyCamera = false })
      await page.getByRole('button', { name: 'Olvasás indítása' }).click()
      await expect(page.getByRole('button', { name: 'Leállítás' })).toBeVisible()
      const calls = await page.evaluate(() => (window as CameraTestWindow).__cameraCalls)
      expect(calls).toHaveLength(2)
      expect((calls[1].video as MediaTrackConstraints).facingMode).toEqual({ ideal: 'environment' })

      await page.getByRole('button', { name: 'Leállítás' }).click()
      await expect(page.getByRole('button', { name: 'Olvasás indítása' })).toBeVisible()
      await page.getByRole('button', { name: 'Olvasás indítása' }).click()
      await expect(page.getByRole('button', { name: 'Leállítás' })).toBeVisible()
      expect(await page.evaluate(() => (window as CameraTestWindow).__cameraCalls)).toHaveLength(3)

      await page.getByRole('button', { name: 'Kamera bezárása' }).click()
      await expect.poll(() => page.evaluate(() => (window as CameraTestWindow).__cameraStops)).toBeGreaterThan(0)
      await page.getByRole('button', { name: /^Kamera/ }).click()
      await page.getByRole('button', { name: /^Tápértékcímke/ }).click()
      await expect(page.getByRole('button', { name: 'Kép feltöltése' })).toBeVisible()
      await page.getByRole('button', { name: 'Kamera bezárása' }).click()
      await page.getByRole('button', { name: /^Kamera/ }).click()
      await page.getByRole('button', { name: /^Vonalkód/ }).click()
      await expect(page.getByRole('button', { name: 'Olvasás indítása' })).toBeVisible()
    })

    test('keeps the full-screen scanner outside the sheet and scanning after a failed lookup', async ({ page }, testInfo) => {
      test.setTimeout(45_000)
      const barcodeRequests: string[] = []
      let lookupCount = 0
      await mockCamera(page)
      await mockApi(page, barcodeRequests, undefined, async (route) => {
        lookupCount += 1
        if (lookupCount === 1) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'off-4006381333931', name: 'Teszt termék', original_name: null, brand: 'Teszt',
            barcode: '4006381333931', source: 'open_food_facts', source_id: '4006381333931',
            available_carbs_100g: 12.5, serving_size_g: null, image_url: null, language: 'hu',
            country: 'HU', is_generic: false, is_verified: true, category: 'packaged',
            category_label: 'Csomagolt', carbs_available: true,
          }),
        })
      })
      await openBarcodePanel(page)

      const cameraFlow = page.locator('#camera-root > .camera-flow')
      await expect(cameraFlow).toBeVisible()
      await expect(page.locator('.add-sheet .camera-flow')).toHaveCount(0)
      const bounds = await cameraFlow.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(-1)
      expect((bounds?.x ?? 0) + (bounds?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(viewport.width + 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
      await expect(page.getByRole('tab')).toHaveCount(0)

      const headerBounds = await page.locator('.camera-flow-header').boundingBox()
      const startBounds = await page.getByRole('button', { name: 'Olvasás indítása' }).boundingBox()
      expect(headerBounds).not.toBeNull()
      expect(startBounds).not.toBeNull()
      expect(headerBounds?.x ?? -1).toBeGreaterThanOrEqual(-1)
      expect((headerBounds?.x ?? 0) + (headerBounds?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(viewport.width + 1)
      expect((startBounds?.y ?? 0) + (startBounds?.height ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(viewport.height + 1)

      await page.getByRole('button', { name: 'Olvasás indítása' }).click()
      await expect(page.getByRole('button', { name: 'Leállítás' })).toBeVisible()
      const previewBounds = await page.getByLabel('Vonalkód kamera előnézete').boundingBox()
      expect(previewBounds).not.toBeNull()
      expect(previewBounds?.width ?? 0).toBeGreaterThan(300)
      expect(previewBounds?.height ?? 0).toBeGreaterThanOrEqual(220)
      await page.screenshot({ path: `test-results/m22/${testInfo.project.name}-${viewport.width}x${viewport.height}-barcode-active.png` })
      await page.getByLabel('Vonalkód kézzel').fill('4006381333931')
      await page.getByRole('button', { name: 'Keresés' }).click()
      await expect(page.getByText('nincs találat', { exact: false })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Leállítás' })).toBeVisible()
      expect(await page.evaluate(() => (window as CameraTestWindow).__cameraStops)).toBe(0)

      await page.getByLabel('Vonalkód kézzel').press('Enter')
      await expect(cameraFlow).toHaveCount(0)
      await expect(page.getByText('Teszt termék', { exact: true })).toBeVisible()
      expect(barcodeRequests).toEqual(['4006381333931', '4006381333931'])
    })

    test('uses the real ZXing decoder for known EAN fixtures and keeps manual fallback', async ({ page }) => {
      const barcodeRequests: string[] = []
      await mockCamera(page)
      await mockApi(page, barcodeRequests)
      await openBarcodePanel(page)

      const fixtures = [
        ['ean13-4006381333931.svg', '4006381333931'],
        ['ean8-96385074.svg', '96385074'],
      ] as const
      for (const [filename, code] of fixtures) {
        await page.locator('input[type="file"]').setInputFiles(path.join(import.meta.dirname, 'fixtures', filename))
        await expect.poll(() => barcodeRequests, { timeout: 15_000 }).toContain(code)
      }

      const manual = page.getByLabel('Vonalkód kézzel')
      await manual.fill('4006381333932')
      await page.getByRole('button', { name: 'Keresés' }).click()
      await expect(page.locator('.input-error').filter({ hasText: 'érvényes EAN' })).toBeVisible()
    })

    test('analyzes a selected image without camera permission and supports retry', async ({ page }) => {
      const barcodeRequests: string[] = []
      await mockCamera(page)
      let visionCalls = 0
      const visionHandler = async (route: Route) => {
        visionCalls += 1
        if (visionCalls === 1) {
          await new Promise((resolve) => setTimeout(resolve, 150))
          await route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ detail: { code: 'provider_timeout', message: 'A képfelismerési szolgáltató nem válaszolt időben.' } }) })
          return
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'gemini', uncertain: true, suggestions: [{ name: 'Alma', confidence: 0.7, possible_ingredients: ['uncertain: fahéj'] }] }) })
      }
      await mockApi(page, barcodeRequests, visionHandler)
      await openVisionPanel(page)
      const image = { name: 'selected-food.png', mimeType: 'image/png', buffer: Buffer.from('not-a-real-image') }
      await page.locator('input[type="file"]').setInputFiles(image)
      await expect(page.locator('.camera-capture .search-state[role="status"]')).toContainText('Feldolgozás')
      await expect(page.getByRole('alert')).toContainText('nem válaszolt időben')
      await expect(page.getByRole('img', { name: 'Kiválasztott kép előnézete' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Kamera engedélyezése' })).toHaveCount(0)
      expect(await page.evaluate(() => (window as CameraTestWindow).__cameraCalls)).toHaveLength(0)

      await page.getByRole('button', { name: 'Elemzés újra' }).click()
      await expect(page.getByRole('button', { name: /Alma/ })).toBeVisible()
      await expect(page.getByText('bizonytalan', { exact: false }).first()).toBeVisible()
      await expect(page.getByText('70%', { exact: false })).toHaveCount(0)
      await expect(page.getByText('uncertain:', { exact: false })).toHaveCount(0)
      await page.getByRole('button', { name: /Alma/ }).click()
      await expect(page.getByRole('textbox', { name: 'Étel neve' })).toHaveValue('Alma')
      await expect(page.getByText('Lehetséges összetevő', { exact: false })).toBeVisible()
      await page.getByRole('button', { name: /Étel megerősítése és keresése/ }).click()
      expect(visionCalls).toBe(2)
    })

    test('hands a confirmed vision suggestion to the Chef workflow and saves a verified meal', async ({ page }) => {
      const barcodeRequests: string[] = []
      await mockCamera(page)
      let visionCalls = 0
      await mockApi(page, barcodeRequests, async (route) => {
        visionCalls += 1
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'mock', uncertain: true, suggestions: [{ name: 'Alma', confidence: null, possible_ingredients: ['uncertain: fahéj'] }] }) })
      })
      await page.route('**/api/foods/search*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'usda-cinnamon', name: 'Fahéj, őrölt', original_name: 'Cinnamon, ground', brand: null, barcode: null, source: 'usda', source_id: 'usda-cinnamon', available_carbs_100g: 80.6, serving_size_g: null, image_url: null, language: 'hu', country: null, is_generic: true, is_verified: true, category: 'spice', category_label: 'Fűszer', carbs_available: true }] }) })
      })
      await page.route('**/api/recipes*', async (route) => {
        if (route.request().method() === 'POST' && !route.request().url().endsWith('/meal')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'recipe-chef-1', name: 'Alma', instructions: '', prep_minutes: null, notes: null, servings: 1, total_weight_g: 100, total_carbs_g: 80.6, carbs_per_serving_g: 80.6, carbs_per_100g_cooked_g: null, is_favorite: false, ingredients: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) })
          return
        }
        await route.fulfill({ status: 204, body: '' })
      })
      await openVisionPanel(page)
      await page.locator('input[type="file"]').setInputFiles({ name: 'chef.png', mimeType: 'image/png', buffer: Buffer.from('mock-image') })
      await expect(page.getByRole('button', { name: /Alma/ })).toBeVisible()
      await page.getByRole('button', { name: /Alma/ }).click()
      await page.getByRole('button', { name: /megerősít/i }).click()
      await expect(page.locator('.chef-workflow')).toBeVisible()
      const row = page.locator('.chef-ingredient-row').first()
      await row.locator('.chef-result-list .food-option').first().click()
      await row.getByRole('button', { name: /Meger/ }).click()
      await row.locator('input[inputmode="decimal"]').first().fill('100')
      await page.locator('.chef-actions .confirm-button').nth(1).click()
      await expect(page.locator('.chef-workflow [role="status"]')).toContainText('naplóba')
      expect(visionCalls).toBe(1)
    })

    test('supports the ingredient photo mode without an additional AI request', async ({ page }) => {
      const barcodeRequests: string[] = []
      let visionCalls = 0
      await mockCamera(page)
      await mockApi(page, barcodeRequests, async (route) => {
        visionCalls += 1
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'mock', uncertain: true, suggestions: [{ name: 'Alapanyagok', confidence: null, possible_ingredients: ['paprika', 'uncertain: csirkemell'] }] }) })
      })
      await openIngredientsPanel(page)
      await expect(page.getByRole('button', { name: 'Kép feltöltése' })).toBeVisible()
      await page.locator('input[type="file"]').setInputFiles({ name: 'ingredients.png', mimeType: 'image/png', buffer: Buffer.from('mock-image') })
      await expect(page.getByRole('button', { name: /Alapanyagok/ })).toBeVisible()
      await page.getByRole('button', { name: /Alapanyagok/ }).click()
      await expect(page.getByRole('button', { name: /Alapanyagok megerősítése/ })).toBeVisible()
      expect(visionCalls).toBe(1)
    })

    test('builds a confirmed fridge inventory and requests new recipe ideas explicitly', async ({ page }, testInfo) => {
      test.setTimeout(75_000)
      const barcodeRequests: string[] = []
      let fridgeCalls = 0
      let recipeCalls = 0
      await mockCamera(page)
      await mockApi(page, barcodeRequests)
      await page.route('**/api/vision/fridge', async (route) => {
        fridgeCalls += 1
        const form = await route.request().postDataBuffer()
        expect(form).not.toBeNull()
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'mock', uncertain: true, suggestions: [{ name: 'Tej', confidence: null, possible_ingredients: [] }, { name: 'tej', confidence: null, possible_ingredients: [] }, { name: 'Tojás', confidence: null, possible_ingredients: ['uncertain: márka'] }] }) })
      })
      await page.route('**/api/chef/recipes/generate', async (route) => {
        recipeCalls += 1
        const payload = JSON.parse(route.request().postData() ?? '{}') as { ingredients?: string[] }
        expect(payload.ingredients).toEqual(['Tej', 'Tojás'])
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'mock', recipes: [{ name: 'Tejes omlett', description: 'Gyors vacsora.', ingredients: ['Tej', 'Tojás'], missing_ingredients: ['só'], instructions: ['Keverd össze.', 'Süsd meg.'], servings: 2, notes: null }] }) })
      })
      await page.route('**/api/foods/search*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'food-milk', name: 'Tej, nyers', original_name: 'Milk, raw', brand: null, barcode: null, source: 'usda', source_id: 'food-milk', available_carbs_100g: 5, serving_size_g: null, image_url: null, language: 'hu', country: null, is_generic: true, is_verified: true, category: 'dairy', category_label: 'Tejtermék', carbs_available: true }] }) })
      })
      await page.goto('/')
      await page.getByRole('button', { name: /Hozz/ }).last().click()
      await page.locator('.fridge-launch').click()
      await expect(page.getByTestId('fridge-workflow')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
      const gallery = page.locator('.fridge-workflow input[type="file"]')
      await gallery.setInputFiles(photoFixture('fridge-1.svg', '#d8f06a', '1'))
      await expect(page.locator('.fridge-photo')).toHaveCount(1)
      await expect.poll(() => page.locator('.fridge-photo img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete))).toBe(true)
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await expect(page.locator('.fridge-photo-grid')).toHaveClass(/single/)
      const singleGrid = await page.locator('.fridge-photo-grid').boundingBox()
      const singlePhoto = await page.locator('.fridge-photo').boundingBox()
      expect(singleGrid).not.toBeNull()
      expect(singlePhoto).not.toBeNull()
      expect(Math.abs((singleGrid?.width ?? 0) - (singlePhoto?.width ?? 0))).toBeLessThan(2)
      expect(await page.locator('.camera-flow').evaluate((element) => ({
        left: element.scrollLeft,
        top: element.scrollTop,
        overflow: element.scrollWidth - element.clientWidth,
      }))).toEqual({ left: 0, top: 0, overflow: 0 })
      await page.screenshot({ path: `test-results/m22/${testInfo.project.name}-${viewport.width}x${viewport.height}-fridge-one.png` })

      await gallery.setInputFiles([
        photoFixture('fridge-2.svg', '#9ed9cb', '2'),
        photoFixture('fridge-3.svg', '#f5c987', '3'),
        photoFixture('fridge-4.svg', '#c9b5ed', '4'),
      ])
      await expect(page.locator('.fridge-photo')).toHaveCount(4)
      await expect.poll(() => page.locator('.fridge-photo img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete))).toBe(true)
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await expect(page.locator('.fridge-photo-grid')).toHaveClass(/multiple/)
      const photoBoxes = await page.locator('.fridge-photo').evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, right: box.right, width: box.width }
      }))
      expect(photoBoxes[0].width).toBeLessThan((singleGrid?.width ?? Number.POSITIVE_INFINITY) * 0.6)
      expect(photoBoxes[1].x).toBeGreaterThan(photoBoxes[0].x)
      expect(Math.max(...photoBoxes.map((box) => box.right))).toBeLessThanOrEqual(viewport.width + 1)
      expect(await page.locator('.camera-flow').evaluate((element) => ({
        left: element.scrollLeft,
        top: element.scrollTop,
        overflow: element.scrollWidth - element.clientWidth,
      }))).toEqual({ left: 0, top: 0, overflow: 0 })
      const cameraViewport = await page.evaluate(() => {
        const flow = document.querySelector('.camera-flow')?.getBoundingClientRect()
        const header = document.querySelector('.camera-flow-header')?.getBoundingClientRect()
        return { pageX: window.scrollX, pageY: window.scrollY, visualX: window.visualViewport?.offsetLeft ?? 0, visualY: window.visualViewport?.offsetTop ?? 0, flowX: flow?.x ?? -1, flowY: flow?.y ?? -1, headerX: header?.x ?? -1, headerY: header?.y ?? -1 }
      })
      expect(cameraViewport).toMatchObject({ pageX: 0, pageY: 0, visualX: 0, visualY: 0, flowX: 0, flowY: 0 })
      expect(cameraViewport.headerX).toBeGreaterThanOrEqual(0)
      expect(cameraViewport.headerY).toBeGreaterThanOrEqual(0)
      const actionBoundsAreInside = await page.locator('.fridge-photo').evaluateAll((photos) => photos.every((photo) => {
        const parent = photo.getBoundingClientRect()
        return [...photo.querySelectorAll('button')].every((button) => {
          const box = button.getBoundingClientRect()
          return box.left >= parent.left - 1 && box.right <= parent.right + 1 && box.top >= parent.top - 1 && box.bottom <= parent.bottom + 1
        })
      }))
      expect(actionBoundsAreInside).toBe(true)
      await page.screenshot({ path: `test-results/m22/${testInfo.project.name}-${viewport.width}x${viewport.height}-fridge-four.png` })

      await page.getByRole('button', { name: 'Csere' }).first().click()
      await gallery.setInputFiles(photoFixture('fridge-replaced.svg', '#f19b8f', 'Csere'))
      await expect(page.locator('.fridge-photo')).toHaveCount(4)
      await page.locator('.fridge-photo-remove').first().click()
      await expect(page.locator('.fridge-photo')).toHaveCount(3)
      await gallery.setInputFiles(photoFixture('fridge-5.svg', '#95c6ef', '5'))
      await expect(page.locator('.fridge-photo')).toHaveCount(4)
      expect(fridgeCalls).toBe(0)
      await page.locator('.fridge-workflow > .chef-actions .confirm-button').click()
      await expect(page.locator('.fridge-inventory-row')).toHaveCount(2)
      await expect(page.locator('.fridge-inventory-row.uncertain')).toBeVisible()
      for (const row of await page.locator('.fridge-inventory-row').all()) await row.locator('.fridge-row-actions button').first().click()
      await page.locator('.fridge-workflow > .chef-actions .confirm-button').click()
      await page.locator('.fridge-workflow > .chef-actions .confirm-button').click()
      await expect(page.locator('.fridge-recipe-card')).toHaveCount(1)
      expect(recipeCalls).toBe(1)
      await page.locator('.fridge-recipe-card .confirm-button').click()
      await page.locator('.fridge-recipe-editor .confirm-button').click()
      await expect(page.locator('.chef-workflow')).toBeVisible()
      expect(fridgeCalls).toBe(1)
    })

    test('blocks parallel vision submissions while an analysis is in flight', async ({ page }) => {
      const barcodeRequests: string[] = []
      await mockCamera(page)
      let resolveVision: (() => void) | undefined
      let visionCalls = 0
      const visionHandler = async (route: Route) => {
        visionCalls += 1
        await new Promise<void>((resolve) => { resolveVision = resolve })
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'mock', uncertain: false, suggestions: [] }) })
      }
      await mockApi(page, barcodeRequests, visionHandler)
      await openVisionPanel(page)
      await page.locator('input[type="file"]').setInputFiles({ name: 'selected-food.png', mimeType: 'image/png', buffer: Buffer.from('not-a-real-image') })
      await expect(page.locator('.camera-capture .search-state[role="status"]')).toContainText('Feldolgozás')
      await expect(page.getByRole('button', { name: 'Kép feltöltése' })).toBeDisabled()
      expect(visionCalls).toBe(1)
      resolveVision?.()
      await expect(page.getByText('Nem érkezett használható javaslat', { exact: false })).toBeVisible()
    })

    test('crops a Hungarian label locally and allows manual correction after uncertain OCR', async ({ page }) => {
      test.setTimeout(45_000)
      const barcodeRequests: string[] = []
      await mockCamera(page)
      await mockApi(page, barcodeRequests)
      await page.addInitScript(() => {
        ;(window as Window & { __CHILL_NUTRITION_OCR_TEXT?: string }).__CHILL_NUTRITION_OCR_TEXT = "Koch's Original Majonéz\nTápérték / Nutrition declaration\n100 g\nSzénhidrát / Carbohydrate 7,1 g\nebből cukrok / of which sugars 6,1 g\nFehérje / Protein 1,0 g\nZsír / Fat 52 g"
      })
      await openNutritionPanel(page)
      await page.locator('input[type="file"]').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'ean13-4006381333931.svg'))
      await expect(page.getByRole('button', { name: 'Kivágás és felismerés' })).toBeVisible()
      const stage = page.locator('.nutrition-crop-stage')
      const stageBox = await stage.boundingBox()
      const sourceImageBox = await page.locator('.nutrition-crop-stage > img').boundingBox()
      expect(stageBox).not.toBeNull()
      expect(sourceImageBox).not.toBeNull()
      expect(Math.abs((stageBox?.width ?? 0) - (sourceImageBox?.width ?? 0))).toBeLessThan(1)
      expect(await page.locator('.nutrition-crop-handle').count()).toBe(4)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
      const handleMoves = [
        ['handle-nw', 35, 35],
        ['handle-ne', -35, 35],
        ['handle-sw', 35, -35],
        ['handle-se', -35, -35],
      ] as const
      for (const [handleClass, dx, dy] of handleMoves) {
        await page.locator('.nutrition-crop-reset').click()
        await expect(page.locator(`.${handleClass}`)).toBeVisible()
        const resizeBox = await page.locator(`.${handleClass}`).boundingBox()
        expect(resizeBox).not.toBeNull()
        const startX = (resizeBox?.x ?? 0) + (resizeBox?.width ?? 0) / 2
        const startY = (resizeBox?.y ?? 0) + (resizeBox?.height ?? 0) / 2
        await page.mouse.move(startX, startY)
        await page.mouse.down()
        await page.mouse.move(startX + dx, startY + dy)
        await page.mouse.up()
        const resizedBox = await page.locator('.nutrition-crop-selection').boundingBox()
        expect(resizedBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThan(stageBox?.width ?? Number.POSITIVE_INFINITY)
        expect(resizedBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(stageBox?.height ?? Number.POSITIVE_INFINITY)
      }
      const selectionBox = await page.locator('.nutrition-crop-selection').boundingBox()
      expect(selectionBox).not.toBeNull()
      await page.mouse.move((selectionBox?.x ?? 0) + (selectionBox?.width ?? 0) / 2, (selectionBox?.y ?? 0) + (selectionBox?.height ?? 0) / 2)
      await page.mouse.down()
      await page.mouse.move((selectionBox?.x ?? 0) + 15, (selectionBox?.y ?? 0) + 10)
      await page.mouse.up()
      await page.getByRole('button', { name: 'Teljes kép kijelölése' }).click()
      const fullSelectionWidth = await page.locator('.nutrition-crop-selection').evaluate((element) => element.getBoundingClientRect().width)
      expect(Math.abs(fullSelectionWidth - (stageBox?.width ?? 0))).toBeLessThan(1)
      // Re-select a smaller region so the OCR call can prove that the canvas
      // received the visual selection rather than the full image.
      const resetHandle = await page.locator('.handle-se').boundingBox()
      await page.mouse.move((resetHandle?.x ?? 0) + (resetHandle?.width ?? 0) / 2, (resetHandle?.y ?? 0) + (resetHandle?.height ?? 0) / 2)
      await page.mouse.down()
      await page.mouse.move((resetHandle?.x ?? 0) - 35, (resetHandle?.y ?? 0) - 35)
      await page.mouse.up()
      await page.getByRole('button', { name: 'Kivágás és felismerés' }).click()
      const cropDebug = await page.evaluate(() => (window as CameraTestWindow).__CHILL_NUTRITION_LAST_CROP)
      expect(cropDebug).toBeDefined()
      expect(cropDebug?.width).toBeLessThan(cropDebug?.sourceWidth ?? 0)
      await expect(page.getByLabel('Élelmiszer neve')).toHaveValue("Koch's Original Majonéz")
      await expect(page.getByLabel('Szénhidrát / 100 g')).toHaveValue('7.1')
      await expect(page.getByLabel('Ebből cukrok / 100 g')).toHaveValue('6.1')
      await expect(page.getByLabel('Rost / 100 g')).toHaveValue('')
      await expect(page.getByRole('button', { name: 'Saját étel létrehozása' })).toBeEnabled()

      await page.getByLabel('Fehérje / 100 g').fill('159')
      await page.getByLabel('Zsír / 100 g').fill('149')
      const warning = page.getByRole('alert')
      await expect(warning).toContainText('Fehérje: 159 g')
      await expect(warning).toContainText('Zsír: 149 g')
      await expect(warning).toContainText('nem módosítottuk automatikusan')
      await expect(page.getByLabel('Fehérje / 100 g')).toHaveValue('159')
      await expect(page.getByLabel('Zsír / 100 g')).toHaveValue('149')
      await expect(page.getByRole('button', { name: 'Saját étel létrehozása' })).toBeDisabled()

      await page.getByRole('button', { name: 'Új kép' }).click()
      await page.evaluate(() => { (window as Window & { __CHILL_NUTRITION_OCR_TEXT?: string }).__CHILL_NUTRITION_OCR_TEXT = 'not a nutrition table' })
      await page.locator('input[type="file"]').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'ean13-4006381333931.svg'))
      await page.getByRole('button', { name: 'Kivágás és felismerés' }).click()
      await page.getByLabel('Élelmiszer neve').fill('Kézzel javított majonéz')
      await page.getByLabel('Tápértékalap').selectOption('100g')
      await page.getByLabel('Szénhidrát / 100 g').fill('7,1')
      await expect(page.getByRole('button', { name: 'Saját étel létrehozása' })).toBeEnabled()
    })

    test('keeps a portrait image bounded while processing the selected pixels', async ({ page }) => {
      const barcodeRequests: string[] = []
      await mockCamera(page)
      await mockApi(page, barcodeRequests)
      await page.addInitScript(() => {
        ;(window as Window & { __CHILL_NUTRITION_OCR_TEXT?: string }).__CHILL_NUTRITION_OCR_TEXT = 'not a nutrition table'
      })
      await openNutritionPanel(page)
      const portraitSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="460" viewBox="0 0 220 460"><rect width="220" height="460" fill="white"/><rect x="20" y="40" width="180" height="120" fill="#d8f06a"/></svg>'
      await page.locator('input[type="file"]').setInputFiles({ name: 'portrait.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(portraitSvg) })
      const stage = page.locator('.nutrition-crop-stage')
      const stageBox = await stage.boundingBox()
      const imageBox = await page.locator('.nutrition-crop-stage > img').boundingBox()
      expect(stageBox).not.toBeNull()
      expect(imageBox).not.toBeNull()
      expect(imageBox?.height ?? 0).toBeGreaterThan(imageBox?.width ?? Number.POSITIVE_INFINITY)
      expect(stageBox?.height ?? 0).toBeGreaterThan(stageBox?.width ?? Number.POSITIVE_INFINITY)

      const handle = await page.locator('.handle-nw').boundingBox()
      expect(handle).not.toBeNull()
      await page.mouse.move((handle?.x ?? 0) + (handle?.width ?? 0) / 2, (handle?.y ?? 0) + (handle?.height ?? 0) / 2)
      await page.mouse.down()
      await page.mouse.move((stageBox?.x ?? 0) + (stageBox?.width ?? 0) + 100, (stageBox?.y ?? 0) + (stageBox?.height ?? 0) + 100)
      await page.mouse.up()
      const selectionBox = await page.locator('.nutrition-crop-selection').boundingBox()
      expect(selectionBox).not.toBeNull()
      expect(selectionBox?.x ?? 0).toBeGreaterThanOrEqual((stageBox?.x ?? 0) - 1)
      expect(selectionBox?.y ?? 0).toBeGreaterThanOrEqual((stageBox?.y ?? 0) - 1)
      expect((selectionBox?.x ?? 0) + (selectionBox?.width ?? 0)).toBeLessThanOrEqual((stageBox?.x ?? 0) + (stageBox?.width ?? 0) + 1)
      expect((selectionBox?.y ?? 0) + (selectionBox?.height ?? 0)).toBeLessThanOrEqual((stageBox?.y ?? 0) + (stageBox?.height ?? 0) + 1)
      await page.locator('button.confirm-button').click()
      await expect.poll(() => page.evaluate(() => (window as CameraTestWindow).__CHILL_NUTRITION_LAST_CROP)).toBeDefined()
      const cropDebug = await page.evaluate(() => (window as CameraTestWindow).__CHILL_NUTRITION_LAST_CROP)
      expect(cropDebug?.sourceHeight).toBeGreaterThan(cropDebug?.sourceWidth ?? Number.POSITIVE_INFINITY)
      expect(cropDebug?.height).toBeLessThan(cropDebug?.sourceHeight ?? 0)
    })

  })
}
