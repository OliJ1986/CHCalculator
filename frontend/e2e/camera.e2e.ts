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
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
]

async function mockApi(page: Page, barcodeRequests: string[], visionHandler?: (route: Route) => Promise<void>) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    let body: unknown = {}
    if (url.pathname.endsWith('/auth/me')) body = { status: 'guest', authenticated: false, role: 'guest', email: null }
    else if (url.pathname.includes('/foods/barcode/')) { barcodeRequests.push(url.pathname.split('/').pop() ?? ''); body = null }
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
  await expect(page.getByRole('button', { name: 'Olvasás indítása' })).toBeVisible()
}

async function openNutritionPanel(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hozzáadás', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hozzáadás', exact: true }).click()
  await page.getByRole('button', { name: /^Kamera/ }).click()
  await page.getByRole('tab', { name: 'Tápérték', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Kép feltöltése' })).toBeVisible()
}

async function openVisionPanel(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hozzáadás', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hozzáadás', exact: true }).click()
  await page.getByRole('button', { name: /^Kamera/ }).click()
  await page.getByRole('tab', { name: 'Étel fotó', exact: true }).click()
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

      await page.getByRole('button', { name: 'Kamera bezárása' }).click()
      await expect.poll(() => page.evaluate(() => (window as CameraTestWindow).__cameraStops)).toBeGreaterThan(0)
      await page.getByRole('button', { name: /^Kamera/ }).click()
      await expect(page.getByRole('button', { name: 'Olvasás indítása' })).toBeVisible()
    })

    test('decodes a known EAN image locally and keeps manual fallback', async ({ page }) => {
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
