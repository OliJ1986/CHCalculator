import { afterEach, describe, expect, it } from 'vitest'
import type { Food } from '../api/foods'
import { clearGuestData, createGuestMeal, exportGuestData, listGuestMeals } from './guestStore'

const food: Food = {
  id: 'guest-food', name: 'Teszt alma', originalName: 'Test apple', brand: null, barcode: null,
  source: 'fixture', sourceId: 'fixture-1', availableCarbs100g: 12.5, servingSizeG: null,
  imageUrl: null, language: 'hu', country: null, isGeneric: true, isVerified: true,
  category: 'fruit', categoryLabel: 'Gyümölcs', carbsAvailable: true,
}

describe('guest IndexedDB data layer', () => {
  afterEach(async () => { await clearGuestData() })

  it('keeps older records for later import but exposes only the three-day window', async () => {
    await createGuestMeal(food, 100, '2099-09-25', 'lunch')
    await createGuestMeal(food, 100, '2099-09-22', 'lunch')
    expect((await listGuestMeals('2099-09-25', '2099-09-25')).items).toHaveLength(1)
    expect((await listGuestMeals('2099-09-22', '2099-09-25')).items).toHaveLength(0)
    expect((await exportGuestData()).meals).toHaveLength(2)
  })
})
