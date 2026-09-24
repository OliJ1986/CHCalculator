export type MealSnapshot = {
  snapshotVersion: number
  capturedAt: string
  calculationVersion: string
  unit: string
  name: string
  originalName: string
  brand: string | null
  source: string
  sourceId: string
  availableCarbs100g: number | null
  totalCarbohydrate100g: number | null
  dietaryFiber100g: number | null
  nutrientIds: Record<string, number> | null
  nutrientValues: Record<string, number | null> | null
  nutrientProvenance: Record<string, unknown> | null
  mappingVersion: number | null
}

export type Meal = {
  id: string
  foodId: string | null
  consumedAt: string
  localDate: string
  timezone: string
  amountG: number
  mealCategory: string
  calculatedCarbsG: number
  snapshot: MealSnapshot
  createdAt: string
  updatedAt: string
}

export type MealList = { items: Meal[]; totalCarbsG: number }

type MealSnapshotResponse = {
  snapshot_version: number
  captured_at: string
  calculation_version: string
  unit: string
  name: string
  original_name: string
  brand: string | null
  source: string
  source_id: string
  available_carbs_100g: number | null
  total_carbohydrate_100g: number | null
  dietary_fiber_100g: number | null
  nutrient_ids: Record<string, number> | null
  nutrient_values: Record<string, number | null> | null
  nutrient_provenance: Record<string, unknown> | null
  mapping_version: number | null
}

type MealResponse = {
  id: string
  food_id: string | null
  consumed_at: string
  local_date: string
  timezone: string
  amount_g: number
  meal_category: string
  calculated_carbs_g: number
  snapshot: MealSnapshotResponse
  created_at: string
  updated_at: string
}

type MealListResponse = { items: MealResponse[]; total_carbs_g: number }

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

function mapSnapshot(snapshot: MealSnapshotResponse): MealSnapshot {
  return {
    snapshotVersion: snapshot.snapshot_version,
    capturedAt: snapshot.captured_at,
    calculationVersion: snapshot.calculation_version,
    unit: snapshot.unit,
    name: snapshot.name,
    originalName: snapshot.original_name,
    brand: snapshot.brand,
    source: snapshot.source,
    sourceId: snapshot.source_id,
    availableCarbs100g: snapshot.available_carbs_100g,
    totalCarbohydrate100g: snapshot.total_carbohydrate_100g,
    dietaryFiber100g: snapshot.dietary_fiber_100g,
    nutrientIds: snapshot.nutrient_ids,
    nutrientValues: snapshot.nutrient_values,
    nutrientProvenance: snapshot.nutrient_provenance,
    mappingVersion: snapshot.mapping_version,
  }
}

function mapMeal(meal: MealResponse): Meal {
  return {
    id: meal.id,
    foodId: meal.food_id,
    consumedAt: meal.consumed_at,
    localDate: meal.local_date,
    timezone: meal.timezone,
    amountG: meal.amount_g,
    mealCategory: meal.meal_category,
    calculatedCarbsG: meal.calculated_carbs_g,
    snapshot: mapSnapshot(meal.snapshot),
    createdAt: meal.created_at,
    updatedAt: meal.updated_at,
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!response.ok) {
    let message = 'A napló mentése nem sikerült.'
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) message = payload.detail
    } catch {
      // Keep a safe, generic message for non-JSON provider/proxy errors.
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function listMeals(localDate: string, signal?: AbortSignal): Promise<MealList> {
  const response = await request<MealListResponse>(
    `/meals?local_date=${encodeURIComponent(localDate)}`,
    { signal },
  )
  return { items: response.items.map(mapMeal), totalCarbsG: response.total_carbs_g }
}

export type CreateMealPayload = {
  food_id: string
  amount_g: number
  local_date: string
  meal_category: 'other'
  idempotency_key: string
  client_carbs_g?: number
}

export async function createMeal(payload: CreateMealPayload): Promise<Meal> {
  return mapMeal(await request<MealResponse>('/meals', { method: 'POST', body: JSON.stringify(payload) }))
}

export type UpdateMealPayload = {
  amount_g: number
  food_id?: string
}

export async function updateMeal(mealId: string, payload: UpdateMealPayload): Promise<Meal> {
  return mapMeal(await request<MealResponse>(`/meals/${encodeURIComponent(mealId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }))
}

export async function deleteMeal(mealId: string): Promise<void> {
  await request<void>(`/meals/${encodeURIComponent(mealId)}`, { method: 'DELETE' })
}
