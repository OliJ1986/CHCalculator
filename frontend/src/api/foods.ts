export type Food = {
  id: string
  name: string
  originalName: string | null
  brand: string | null
  barcode: string | null
  source: string
  sourceId: string
  availableCarbs100g: number | null
  servingSizeG: number | null
  imageUrl: string | null
  language: string | null
  country: string | null
  isGeneric: boolean
  isVerified: boolean
  category: string
  categoryLabel: string
  carbsAvailable: boolean
}

type FoodResponse = {
  id: string
  name: string
  original_name: string | null
  brand: string | null
  barcode: string | null
  source: string
  source_id: string
  available_carbs_100g: number | null
  serving_size_g: number | null
  image_url: string | null
  language: string | null
  country: string | null
  is_generic: boolean
  is_verified: boolean
  category: string
  category_label: string
  carbs_available: boolean
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export type FoodLookupErrorKind = 'invalid' | 'authentication' | 'rate_limit' | 'provider' | 'network'

export class FoodLookupError extends Error {
  readonly kind: FoodLookupErrorKind
  readonly status: number | null

  constructor(kind: FoodLookupErrorKind, message: string, status: number | null = null) {
    super(message)
    this.kind = kind
    this.status = status
    this.name = 'FoodLookupError'
  }
}

function mapFood(food: FoodResponse): Food {
  return {
    id: food.id,
    name: food.name,
    originalName: food.original_name,
    brand: food.brand,
    barcode: food.barcode,
    source: food.source,
    sourceId: food.source_id,
    availableCarbs100g: food.available_carbs_100g,
    servingSizeG: food.serving_size_g,
    imageUrl: food.image_url,
    language: food.language,
    country: food.country,
    isGeneric: food.is_generic,
    isVerified: food.is_verified,
    category: food.category,
    categoryLabel: food.category_label,
    carbsAvailable: food.carbs_available,
  }
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<Food[]> {
  const response = await fetch(`${apiBaseUrl}/foods/search?q=${encodeURIComponent(query.trim())}`, { signal })
  if (!response.ok) throw new Error('Az ételkeresés átmenetileg nem elérhető.')
  const payload = (await response.json()) as { items: FoodResponse[] }
  return payload.items.map(mapFood)
}

export async function lookupFoodBarcode(barcode: string, signal?: AbortSignal): Promise<Food | null> {
  const normalized = barcode.trim()
  if (!/^\d{8,14}$/.test(normalized)) throw new FoodLookupError('invalid', 'Érvénytelen vonalkód.')
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/foods/barcode/${encodeURIComponent(normalized)}`, { signal, credentials: 'include' })
  } catch (value) {
    // Keep explicit caller cancellation cancellable; classify other failures.
    if (value instanceof DOMException && value.name === 'AbortError') throw value
    throw new FoodLookupError('network', 'A vonalkódos szolgáltatás hálózati hibát jelzett.')
  }
  // A gateway may expose an unknown product as HTTP 404. This is a normal
  // empty lookup, equivalent to FastAPI's 200/null response.
  if (response.status === 404) return null
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new FoodLookupError('authentication', 'A vonalkódos szolgáltatás hitelesítése nem sikerült.', response.status)
    if (response.status === 429) throw new FoodLookupError('rate_limit', 'A vonalkódos szolgáltatás elérte a lekérdezési korlátot. Próbáld később újra.', response.status)
    if (response.status >= 500) throw new FoodLookupError('provider', 'A vonalkódos szolgáltató átmenetileg nem érhető el.', response.status)
    throw new FoodLookupError('invalid', 'A vonalkódos kérés nem fogadható el.', response.status)
  }
  const payload = await response.json() as FoodResponse | null
  return payload ? mapFood(payload) : null
}
