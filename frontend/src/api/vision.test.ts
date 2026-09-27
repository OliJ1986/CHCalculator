import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateChefRecipes, identifyFoodImage, identifyFoodImages, mapVisionIngredient } from './vision'

afterEach(() => vi.restoreAllMocks())

describe('food vision API client', () => {
  it('maps structured backend errors without exposing provider details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: { code: 'provider_timeout', message: 'A képfelismerési szolgáltató nem válaszolt időben.' } }),
      { status: 504, headers: { 'Content-Type': 'application/json' } },
    )))

    await expect(identifyFoodImage(new Blob(['image'], { type: 'image/png' }))).rejects.toMatchObject({
      code: 'provider_timeout',
      status: 504,
      retryable: true,
    })
  })

  it('keeps the selected image MIME extension and maps successful suggestions', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as FormData
      expect((body.get('image') as File).name).toBe('food.webp')
      return new Response(JSON.stringify({ provider: 'mock', uncertain: true, suggestions: [{ name: 'Alma', confidence: 0.8, possible_ingredients: ['uncertain: fahéj'] }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(identifyFoodImage(new Blob(['image'], { type: 'image/webp' }))).resolves.toEqual({
      provider: 'mock',
      uncertain: true,
      suggestions: [{ name: 'Alma', confidence: 0.8, possibleIngredients: [{ name: 'fahéj', uncertain: true }] }],
    })
  })

  it('keeps uncertainty structured while preserving the wire marker', () => {
    expect(mapVisionIngredient('uncertain: fahéj')).toEqual({ name: 'fahéj', uncertain: true })
    expect(mapVisionIngredient('tej')).toEqual({ name: 'tej', uncertain: false })
    expect(mapVisionIngredient(' UNCERTAIN: vanília ')).toEqual({ name: 'vanília', uncertain: true })
  })

  it('sends up to four fridge images only after the explicit recognition action', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as FormData
      expect(body.getAll('images')).toHaveLength(2)
      return new Response(JSON.stringify({ provider: 'mock', uncertain: false, suggestions: [{ name: 'Tej', possible_ingredients: [] }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(identifyFoodImages([new Blob(['one'], { type: 'image/jpeg' }), new Blob(['two'], { type: 'image/png' })])).resolves.toMatchObject({ suggestions: [{ name: 'Tej' }] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps structured recipe suggestions without accepting nutrient fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'mock', recipes: [{ name: 'Zöldséges tál', ingredients: ['tej'], missing_ingredients: ['fokhagyma'], instructions: ['Keverd össze.'], servings: 2, carbs_g: 999 }] }), { status: 200 })))
    const result = await generateChefRecipes({ ingredients: ['tej'], meal_type: 'dinner', servings: 2, required_ingredients: [], excluded_ingredients: [], carbohydrate_limit_g: null })
    expect(result.recipes[0]).toMatchObject({ name: 'Zöldséges tál', missingIngredients: ['fokhagyma'] })
    expect(result.recipes[0]).not.toHaveProperty('carbs_g')
  })
})
