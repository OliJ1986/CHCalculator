export type FoodVisionSuggestion = { name: string; confidence: number | null; possibleIngredients: string[] }
export type FoodVisionResult = { suggestions: FoodVisionSuggestion[]; uncertain: boolean; provider: string }

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export async function identifyFoodImage(image: Blob, signal?: AbortSignal): Promise<FoodVisionResult> {
  const form = new FormData()
  form.append('image', image, 'food.jpg')
  const response = await fetch(`${apiBaseUrl}/vision/food`, { method: 'POST', body: form, credentials: 'include', signal })
  const body = await response.json().catch(() => ({})) as { detail?: string; suggestions?: Array<{ name: string; confidence?: number | null; possible_ingredients?: string[] }>; uncertain?: boolean; provider?: string }
  if (!response.ok) throw new Error(body.detail ?? 'Az ételfelismerés most nem elérhető.')
  return { suggestions: (body.suggestions ?? []).map((item) => ({ name: item.name, confidence: item.confidence ?? null, possibleIngredients: item.possible_ingredients ?? [] })), uncertain: body.uncertain ?? true, provider: body.provider ?? 'unknown' }
}
