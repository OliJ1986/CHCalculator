export type CustomFood = { id: string; name: string; brand: string | null; availableCarbs100g: number; dietaryFiber100g: number | null; servingSizeG: number | null; notes: string | null; isFavorite: boolean; createdAt: string; updatedAt: string }
export type RecipeIngredient = { id: string; foodId: string | null; customFoodId: string | null; quantityG: number; calculatedCarbsG: number; snapshot: Record<string, unknown>; position: number }
export type Recipe = { id: string; name: string; instructions: string | null; prepMinutes: number | null; notes: string | null; servings: number; totalWeightG: number | null; totalCarbsG: number; carbsPerServingG: number; carbsPer100gCookedG: number | null; isFavorite: boolean; ingredients: RecipeIngredient[]; createdAt: string; updatedAt: string }
export type Plan = { id: string; planDate: string; mealCategory: string; foodId: string | null; customFoodId: string | null; recipeId: string | null; quantity: number; quantityUnit: 'g' | 'servings'; plannedCarbsG: number; snapshot: Record<string, unknown>; createdAt: string; updatedAt: string }
export type ShoppingItem = { id: string; name: string; quantity: number | null; unit: 'g' | 'ml' | 'db' | 'adag'; checked: boolean; source: string; createdAt: string; updatedAt: string }

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers); headers.set('Content-Type', 'application/json')
  const csrf = document.cookie.split('; ').find((value) => value.startsWith('chill_csrf='))?.slice('chill_csrf='.length)
  if (csrf && init?.method && init.method !== 'GET') headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, credentials: 'include' })
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { detail?: string }; throw new Error(body.detail ?? 'A mentés nem sikerült.') }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
const mapCustom = (x: any): CustomFood => ({ id:x.id,name:x.name,brand:x.brand,availableCarbs100g:x.available_carbs_100g,dietaryFiber100g:x.dietary_fiber_100g,servingSizeG:x.serving_size_g,notes:x.notes,isFavorite:x.is_favorite,createdAt:x.created_at,updatedAt:x.updated_at })
const mapRecipe = (x: any): Recipe => ({ id:x.id,name:x.name,instructions:x.instructions,prepMinutes:x.prep_minutes,notes:x.notes,servings:x.servings,totalWeightG:x.total_weight_g,totalCarbsG:x.total_carbs_g,carbsPerServingG:x.carbs_per_serving_g,carbsPer100gCookedG:x.carbs_per_100g_cooked_g ?? null,isFavorite:x.is_favorite,ingredients:(x.ingredients ?? []).map((i:any)=>({id:i.id,foodId:i.food_id,customFoodId:i.custom_food_id,quantityG:i.quantity_g,calculatedCarbsG:i.calculated_carbs_g,snapshot:i.snapshot,position:i.position})),createdAt:x.created_at,updatedAt:x.updated_at })
const mapPlan = (x: any): Plan => ({ id:x.id,planDate:x.plan_date,mealCategory:x.meal_category,foodId:x.food_id,customFoodId:x.custom_food_id,recipeId:x.recipe_id,quantity:x.quantity,quantityUnit:x.quantity_unit,plannedCarbsG:x.planned_carbs_g,snapshot:x.snapshot,createdAt:x.created_at,updatedAt:x.updated_at })
const mapShopping = (x: any): ShoppingItem => ({ id:x.id,name:x.name,quantity:x.quantity,unit:x.unit,checked:x.checked,source:x.source,createdAt:x.created_at,updatedAt:x.updated_at })
export async function listCustomFoods(query?: string): Promise<CustomFood[]> { return (await request<any[]>(`/custom-foods${query ? `?q=${encodeURIComponent(query)}` : ''}`)).map(mapCustom) }
export async function createCustomFood(payload: Record<string, unknown>): Promise<CustomFood> { return mapCustom(await request('/custom-foods',{method:'POST',body:JSON.stringify(payload)})) }
export async function updateCustomFood(id: string, payload: Record<string, unknown>): Promise<CustomFood> { return mapCustom(await request(`/custom-foods/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)})) }
export async function favoriteCustomFood(id: string): Promise<CustomFood> { return mapCustom(await request(`/custom-foods/${encodeURIComponent(id)}/favorite`,{method:'POST'})) }
export async function deleteCustomFood(id: string): Promise<void> { await request(`/custom-foods/${encodeURIComponent(id)}`,{method:'DELETE'}) }
export async function listRecipes(): Promise<Recipe[]> { return (await request<any[]>('/recipes')).map(mapRecipe) }
export async function createRecipe(payload: Record<string, unknown>): Promise<Recipe> { return mapRecipe(await request('/recipes',{method:'POST',body:JSON.stringify(payload)})) }
export async function updateRecipe(id: string, payload: Record<string, unknown>): Promise<Recipe> { return mapRecipe(await request(`/recipes/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)})) }
export async function deleteRecipe(id: string): Promise<void> { await request(`/recipes/${encodeURIComponent(id)}`,{method:'DELETE'}) }
export async function listPlans(start?: string, end?: string): Promise<Plan[]> { const q = start ? `?start=${start}${end ? `&end=${end}` : ''}` : ''; return (await request<any[]>(`/plans${q}`)).map(mapPlan) }
export async function createPlan(payload: Record<string, unknown>): Promise<Plan> { return mapPlan(await request('/plans',{method:'POST',body:JSON.stringify(payload)})) }
export async function deletePlan(id: string): Promise<void> { await request(`/plans/${encodeURIComponent(id)}`,{method:'DELETE'}) }
export async function updatePlan(id: string, payload: Record<string, unknown>): Promise<Plan> { return mapPlan(await request(`/plans/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)})) }
export async function copyPlan(id: string, targetDate: string): Promise<Plan> { return mapPlan(await request(`/plans/${encodeURIComponent(id)}/copy`,{method:'POST',body:JSON.stringify({target_date: targetDate})})) }
export async function logPlanMeal(id: string, payload: { idempotency_key: string; local_date?: string }): Promise<void> { await request(`/plans/${encodeURIComponent(id)}/meal`,{method:'POST',body:JSON.stringify(payload)}) }
export async function logRecipeMeal(id: string, payload: { quantity: number; quantity_unit: 'g' | 'servings'; local_date?: string; meal_category: string; idempotency_key: string }): Promise<void> { await request(`/recipes/${encodeURIComponent(id)}/meal`,{method:'POST',body:JSON.stringify(payload)}) }
export async function favoriteRecipe(id: string): Promise<Recipe> { return mapRecipe(await request(`/recipes/${encodeURIComponent(id)}/favorite`,{method:'POST'})) }
export async function listShopping(): Promise<ShoppingItem[]> { return (await request<any[]>('/shopping-list')).map(mapShopping) }
export async function createShopping(payload: Record<string, unknown>): Promise<ShoppingItem> { return mapShopping(await request('/shopping-list',{method:'POST',body:JSON.stringify(payload)})) }
export async function updateShopping(id: string, payload: Record<string, unknown>): Promise<ShoppingItem> { return mapShopping(await request(`/shopping-list/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)})) }
export async function deleteShopping(id: string): Promise<void> { await request(`/shopping-list/${encodeURIComponent(id)}`,{method:'DELETE'}) }
export async function generateShopping(start: string, end: string): Promise<ShoppingItem[]> { return (await request<any[]>(`/shopping-list/generate?start=${start}&end=${end}`,{method:'POST'})).map(mapShopping) }
