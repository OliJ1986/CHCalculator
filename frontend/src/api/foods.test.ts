import { afterEach, describe, expect, it, vi } from 'vitest'
import { FoodLookupError, lookupFoodBarcode } from './foods'

const responseFood = {
  id: 'off:5997420103990', name: 'Teszt termék', original_name: null, brand: null,
  barcode: '5997420103990', source: 'open_food_facts', source_id: '5997420103990',
  available_carbs_100g: 7.1, serving_size_g: null, image_url: null, language: 'hu', country: 'hu',
  is_generic: false, is_verified: false, category: 'other', category_label: 'Egyéb', carbs_available: true,
}

afterEach(() => vi.restoreAllMocks())

describe('barcode API result classification', () => {
  it('maps a successful product and keeps an empty 200 response as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(responseFood), { status: 200 }))
      .mockResolvedValueOnce(new Response('null', { status: 200 })))
    expect((await lookupFoodBarcode('5997420103990'))?.availableCarbs100g).toBe(7.1)
    expect(await lookupFoodBarcode('5997420103990')).toBeNull()
  })

  it('treats an OFF/gateway 404 as an unknown product', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    expect(await lookupFoodBarcode('5997420103990')).toBeNull()
  })

  it.each([
    [429, 'rate_limit'],
    [503, 'provider'],
    [401, 'authentication'],
  ] as const)('exposes HTTP %s as a distinct user-facing error', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(lookupFoodBarcode('5997420103990')).rejects.toMatchObject({ kind, status })
  })

  it('classifies a network failure without exposing implementation details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('socket failed')))
    const promise = lookupFoodBarcode('5997420103990')
    await expect(promise).rejects.toBeInstanceOf(FoodLookupError)
    await expect(promise).rejects.toMatchObject({ kind: 'network' })
  })
})
