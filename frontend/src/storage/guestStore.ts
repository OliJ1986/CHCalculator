import { calculateCarbohydrate } from '../lib/carbs'
import type { Food } from '../api/foods'
import type { GoalSummary } from '../api/goals'
import type { Meal, MealCategory, MealList, MealSnapshot } from '../api/meals'
import type { CustomFood, Plan, Recipe, ShoppingItem } from '../api/catalog'

const DB_NAME = 'chill-guest-v1'
const DB_VERSION = 2
const MEALS = 'meals'
const GOALS = 'goals'
const CUSTOM_FOODS = 'customFoods'
const RECIPES = 'recipes'
const PLANS = 'plans'
const SHOPPING = 'shopping'
const CATEGORIES: Array<{ key: MealCategory; label: string }> = [
  { key: 'breakfast', label: 'Reggeli' },
  { key: 'morning_snack', label: 'Tízórai' },
  { key: 'lunch', label: 'Ebéd' },
  { key: 'afternoon_snack', label: 'Uzsonna' },
  { key: 'dinner', label: 'Vacsora' },
  { key: 'other', label: 'Egyéb' },
]

type StoredGoal = { effectiveDate: string; dailyTargetG: number | null; mealTargets: Partial<Record<MealCategory, number>>; allowPast: boolean }

const fallbackMeals = new Map<string, Meal>()
const fallbackGoals = new Map<string, StoredGoal>()
const fallbackCustomFoods = new Map<string, CustomFood>()
const fallbackRecipes = new Map<string, Recipe>()
const fallbackPlans = new Map<string, Plan>()
const fallbackShopping = new Map<string, ShoppingItem>()

function dbAvailable(): boolean { return typeof indexedDB !== 'undefined' }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MEALS)) db.createObjectStore(MEALS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(GOALS)) db.createObjectStore(GOALS, { keyPath: 'effectiveDate' })
      if (!db.objectStoreNames.contains(CUSTOM_FOODS)) db.createObjectStore(CUSTOM_FOODS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(RECIPES)) db.createObjectStore(RECIPES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PLANS)) db.createObjectStore(PLANS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SHOPPING)) db.createObjectStore(SHOPPING, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('A vendég napló tárhelye nem érhető el'))
  })
}

async function readAll<T>(storeName: string): Promise<T[]> {
  if (!dbAvailable()) {
    const stores: Record<string, unknown[]> = { [MEALS]: [...fallbackMeals.values()], [GOALS]: [...fallbackGoals.values()], [CUSTOM_FOODS]: [...fallbackCustomFoods.values()], [RECIPES]: [...fallbackRecipes.values()], [PLANS]: [...fallbackPlans.values()], [SHOPPING]: [...fallbackShopping.values()] }
    return (stores[storeName] ?? []) as T[]
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error ?? new Error('A vendég napló olvasása nem sikerült'))
  })
}

async function put(storeName: string, value: unknown): Promise<void> {
  if (!dbAvailable()) {
    if (storeName === MEALS) fallbackMeals.set((value as Meal).id, value as Meal)
    else if (storeName === GOALS) fallbackGoals.set((value as StoredGoal).effectiveDate, value as StoredGoal)
    else if (storeName === CUSTOM_FOODS) fallbackCustomFoods.set((value as CustomFood).id, value as CustomFood)
    else if (storeName === RECIPES) fallbackRecipes.set((value as Recipe).id, value as Recipe)
    else if (storeName === PLANS) fallbackPlans.set((value as Plan).id, value as Plan)
    else fallbackShopping.set((value as ShoppingItem).id, value as ShoppingItem)
    return
  }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('A vendég napló mentése nem sikerült'))
  })
}

async function remove(storeName: string, key: string): Promise<void> {
  if (!dbAvailable()) {
    if (storeName === MEALS) fallbackMeals.delete(key)
    else if (storeName === GOALS) fallbackGoals.delete(key)
    else if (storeName === CUSTOM_FOODS) fallbackCustomFoods.delete(key)
    else if (storeName === RECIPES) fallbackRecipes.delete(key)
    else if (storeName === PLANS) fallbackPlans.delete(key)
    else fallbackShopping.delete(key)
    return
  }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('A vendég napló törlése nem sikerült'))
  })
}

function dateValue(value: string): number { return Date.parse(`${value}T12:00:00Z`) }
function visibleForGuest(localDate: string, today: string): boolean {
  const difference = Math.round((dateValue(today) - dateValue(localDate)) / 86_400_000)
  return difference >= 0 && difference <= 2
}

function snapshot(food: Food): MealSnapshot {
  return {
    snapshotVersion: 1,
    capturedAt: new Date().toISOString(),
    calculationVersion: 'm5-guest-v1',
    unit: 'g',
    name: food.name,
    originalName: food.originalName ?? food.name,
    brand: food.brand,
    source: food.source,
    sourceId: food.sourceId,
    availableCarbs100g: food.availableCarbs100g,
    totalCarbohydrate100g: null,
    dietaryFiber100g: null,
    nutrientIds: null,
    nutrientValues: null,
    nutrientProvenance: null,
    mappingVersion: null,
  }
}

export function guestWindowAllows(localDate: string, today: string): boolean { return visibleForGuest(localDate, today) }

export async function listGuestMeals(localDate: string, today: string): Promise<MealList> {
  if (!visibleForGuest(localDate, today)) return { items: [], totalCarbsG: 0 }
  const items = (await readAll<Meal>(MEALS)).filter((meal) => meal.localDate === localDate).sort((a, b) => a.consumedAt.localeCompare(b.consumedAt))
  return { items, totalCarbsG: items.reduce((sum, meal) => sum + meal.calculatedCarbsG, 0) }
}

export async function createGuestMeal(food: Food, amountG: number, localDate: string, mealCategory: MealCategory): Promise<Meal> {
  const carbs = calculateCarbohydrate(amountG, food.availableCarbs100g)
  if (carbs === null) throw new Error('A kiválasztott étel CH-adata nem számolható')
  const now = new Date().toISOString()
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  const meal: Meal = { id, foodId: food.source === 'custom' ? null : food.id, customFoodId: food.source === 'custom' ? food.sourceId : null, consumedAt: now, localDate, timezone: 'Europe/Budapest', amountG, mealCategory, calculatedCarbsG: carbs, snapshot: snapshot(food), createdAt: now, updatedAt: now }
  await put(MEALS, meal)
  return meal
}

export async function updateGuestMeal(id: string, amountG: number, mealCategory: MealCategory): Promise<Meal> {
  const meal = (await readAll<Meal>(MEALS)).find((item) => item.id === id)
  if (!meal) throw new Error('A bejegyzés nem található')
  const carbs = calculateCarbohydrate(amountG, meal.snapshot.availableCarbs100g)
  if (carbs === null) throw new Error('A bejegyzés CH-adata nem számolható')
  const updated = { ...meal, amountG, mealCategory, calculatedCarbsG: carbs, updatedAt: new Date().toISOString() }
  await put(MEALS, updated)
  return updated
}

export async function deleteGuestMeal(id: string): Promise<void> { await remove(MEALS, id) }

export async function getGuestSummary(localDate: string, today: string): Promise<GoalSummary> {
  const meals = (await listGuestMeals(localDate, today)).items
  const goals = (await readAll<StoredGoal>(GOALS)).filter((goal) => goal.effectiveDate <= localDate).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
  const goal = goals[0]
  const consumed = meals.reduce((sum, meal) => sum + meal.calculatedCarbsG, 0)
  const daily = goal?.dailyTargetG ?? null
  const categories = CATEGORIES.map(({ key, label }) => {
    const categoryConsumed = meals.filter((meal) => meal.mealCategory === key).reduce((sum, meal) => sum + meal.calculatedCarbsG, 0)
    const target = goal?.mealTargets[key] ?? null
    return { key, label, consumedCarbsG: categoryConsumed, targetG: target, remainingG: target === null ? null : target - categoryConsumed }
  })
  const ratio = daily === null ? null : consumed / daily
  return { localDate, consumedCarbsG: consumed, dailyTargetG: daily, remainingCarbsG: daily === null ? null : daily - consumed, progressRatio: ratio, progressPercent: ratio === null ? null : Math.min(ratio * 100, 100), categories }
}

export async function saveGuestGoal(payload: StoredGoal): Promise<void> { await put(GOALS, payload) }

export async function exportGuestData(): Promise<{ meals: Meal[]; goals: StoredGoal[]; customFoods: CustomFood[]; recipes: Recipe[]; plans: Plan[]; shopping: ShoppingItem[] }> {
  return { meals: await readAll<Meal>(MEALS), goals: await readAll<StoredGoal>(GOALS), customFoods: await readAll<CustomFood>(CUSTOM_FOODS), recipes: await readAll<Recipe>(RECIPES), plans: await readAll<Plan>(PLANS), shopping: await readAll<ShoppingItem>(SHOPPING) }
}

export async function clearGuestData(): Promise<void> {
  const data = await exportGuestData()
  await Promise.all(data.meals.map((meal) => remove(MEALS, meal.id)))
  await Promise.all(data.goals.map((goal) => remove(GOALS, goal.effectiveDate)))
  await Promise.all(data.customFoods.map((item) => remove(CUSTOM_FOODS, item.id)))
  await Promise.all(data.recipes.map((item) => remove(RECIPES, item.id)))
  await Promise.all(data.plans.map((item) => remove(PLANS, item.id)))
  await Promise.all(data.shopping.map((item) => remove(SHOPPING, item.id)))
}

export async function listGuestCustomFoods(query = ''): Promise<CustomFood[]> {
  const normalized = query.trim().toLocaleLowerCase()
  return (await readAll<CustomFood>(CUSTOM_FOODS)).filter((item) => !normalized || `${item.name} ${item.brand ?? ''}`.toLocaleLowerCase().includes(normalized)).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name))
}
export async function saveGuestCustomFood(item: CustomFood): Promise<void> { await put(CUSTOM_FOODS, item) }
export async function deleteGuestCustomFood(id: string): Promise<void> { await remove(CUSTOM_FOODS, id) }
export async function listGuestRecipes(): Promise<Recipe[]> { return readAll<Recipe>(RECIPES) }
export async function saveGuestRecipe(item: Recipe): Promise<void> { await put(RECIPES, item) }
export async function deleteGuestRecipe(id: string): Promise<void> { await remove(RECIPES, id) }
export async function listGuestPlans(localDate?: string): Promise<Plan[]> { const rows = await readAll<Plan>(PLANS); return localDate ? rows.filter((row) => row.planDate === localDate) : rows }
export async function saveGuestPlan(item: Plan): Promise<void> { await put(PLANS, item) }
export async function deleteGuestPlan(id: string): Promise<void> { await remove(PLANS, id) }
export async function createGuestMealFromPlan(plan: Plan, localDate: string): Promise<Meal> {
  const now = new Date().toISOString()
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  const meal: Meal = { id, foodId: plan.foodId, customFoodId: plan.customFoodId, recipeId: plan.recipeId, consumedAt: now, localDate, timezone: 'Europe/Budapest', amountG: plan.quantity, mealCategory: plan.mealCategory, calculatedCarbsG: plan.plannedCarbsG, snapshot: { snapshotVersion: 1, capturedAt: now, calculationVersion: 'm10-plan-v1', unit: plan.quantityUnit, name: String(plan.snapshot.name ?? 'Tervezett étkezés'), originalName: String(plan.snapshot.name ?? 'Tervezett étkezés'), brand: null, source: String(plan.snapshot.source ?? 'plan'), sourceId: String(plan.snapshot.source_id ?? plan.id), availableCarbs100g: null, totalCarbohydrate100g: null, dietaryFiber100g: null, nutrientIds: null, nutrientValues: null, nutrientProvenance: { planned: true }, mappingVersion: null }, createdAt: now, updatedAt: now }
  await put(MEALS, meal); return meal
}
export async function listGuestShopping(): Promise<ShoppingItem[]> { return readAll<ShoppingItem>(SHOPPING) }
export async function saveGuestShopping(item: ShoppingItem): Promise<void> { await put(SHOPPING, item) }
export async function updateGuestShopping(item: ShoppingItem): Promise<void> { await put(SHOPPING, item) }
export async function deleteGuestShopping(id: string): Promise<void> { await remove(SHOPPING, id) }
