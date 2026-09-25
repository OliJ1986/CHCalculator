import { afterEach, describe, expect, it } from 'vitest'
import type { Food } from '../api/foods'
import { clearGuestData, createGuestMeal, exportGuestData, listGuestCustomFoods, listGuestMeals, saveGuestCustomFood, saveGuestPlan, listGuestPlans } from './guestStore'
import type { CustomFood, Plan } from '../api/catalog'

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

  it('persists own foods and plans in the additive guest stores', async () => {
    const now = new Date().toISOString()
    const own: CustomFood = { id: 'own-1', name: 'Saját étel', brand: null, availableCarbs100g: 10, dietaryFiber100g: null, servingSizeG: null, notes: null, isFavorite: true, createdAt: now, updatedAt: now }
    const plan: Plan = { id: 'plan-1', planDate: '2099-09-25', mealCategory: 'lunch', foodId: null, customFoodId: own.id, recipeId: null, quantity: 100, quantityUnit: 'g', plannedCarbsG: 10, snapshot: { name: own.name }, createdAt: now, updatedAt: now }
    await saveGuestCustomFood(own); await saveGuestPlan(plan)
    expect((await listGuestCustomFoods('saját')).map((item) => item.id)).toEqual(['own-1'])
    expect((await listGuestPlans('2099-09-25')).map((item) => item.id)).toEqual(['plan-1'])
    expect((await exportGuestData()).customFoods).toHaveLength(1)
  })
})
