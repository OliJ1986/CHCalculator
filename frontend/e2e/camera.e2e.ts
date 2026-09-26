import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

type CameraTestWindow = Window & {
  __cameraCalls: MediaStreamConstraints[]
  __cameraStops: number
  __denyCamera: boolean
}

const viewports = [
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
]

async function mockApi(page: Page, barcodeRequests: string[]) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    let body: unknown = {}
    if (url.pathname.endsWith('/auth/me')) body = { status: 'guest', authenticated: false, role: 'guest', email: null }
    else if (url.pathname.includes('/foods/barcode/')) { barcodeRequests.push(url.pathname.split('/').pop() ?? ''); body = null }
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

for (const viewport of viewports) {
  test.describe(`camera ${viewport.width}px`, () => {
    test.use({ viewport })

    test('asks for camera permission, reports denial, retries and stops on close', async ({ page }) => {
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
  })
}
