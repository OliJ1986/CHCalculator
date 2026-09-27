export type FoodVisionSuggestion = { name: string; confidence: number | null; possibleIngredients: string[] }
export type FoodVisionResult = { suggestions: FoodVisionSuggestion[]; uncertain: boolean; provider: string }
export type FoodVisionErrorCode =
  | 'vision_disabled'
  | 'vision_unconfigured'
  | 'rate_limit_minute'
  | 'rate_limit_daily'
  | 'rate_limit_global'
  | 'rate_limit_unavailable'
  | 'image_too_large'
  | 'unsupported_media_type'
  | 'provider_rate_limit'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'provider_invalid_response'
  | 'provider_authentication'
  | 'provider_bad_request'
  | 'provider_error'
  | 'network_error'
  | 'unknown'

const VISION_ERROR_MESSAGES: Record<FoodVisionErrorCode, string> = {
  vision_disabled: 'Az ételfelismerés jelenleg ki van kapcsolva.',
  vision_unconfigured: 'Az ételfelismerés nincs konfigurálva.',
  rate_limit_minute: 'A percenkénti képfelismerési korlátot elérted. Próbáld később újra.',
  rate_limit_daily: 'A napi képfelismerési korlátot elérted. Próbáld később újra.',
  rate_limit_global: 'A napi összesített képfelismerési keret elfogyott. Próbáld később újra.',
  rate_limit_unavailable: 'A képfelismerési korlát jelenleg nem ellenőrizhető.',
  image_too_large: 'A kép túl nagy. Válassz kisebb képet.',
  unsupported_media_type: 'Csak képfájl tölthető fel.',
  provider_rate_limit: 'A képfelismerési szolgáltató elérte a korlátját. Próbáld később újra.',
  provider_timeout: 'A képfelismerési szolgáltató nem válaszolt időben. Próbáld újra.',
  provider_unavailable: 'A képfelismerési szolgáltató nem érhető el.',
  provider_invalid_response: 'A képfelismerési szolgáltató hibás választ adott.',
  provider_authentication: 'A képfelismerési szolgáltató hitelesítése sikertelen.',
  provider_bad_request: 'A képfelismerési kérés nem fogadható el.',
  provider_error: 'A képfelismerés átmenetileg nem sikerült.',
  network_error: 'A képfelismerés hálózati hiba miatt nem sikerült.',
  unknown: 'Az ételfelismerés nem sikerült.',
}

function messageForVisionCode(code: string): string {
  return VISION_ERROR_MESSAGES[code as FoodVisionErrorCode] ?? VISION_ERROR_MESSAGES.unknown
}

export class FoodVisionError extends Error {
  readonly code: FoodVisionErrorCode
  readonly status: number
  readonly retryable: boolean

  constructor(code: FoodVisionErrorCode, message: string, status: number) {
    super(message)
    this.name = 'FoodVisionError'
    this.code = code
    this.status = status
    this.retryable = code.startsWith('rate_limit') || code.startsWith('provider_') || code === 'network_error'
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export async function identifyFoodImage(image: Blob, signal?: AbortSignal): Promise<FoodVisionResult> {
  const form = new FormData()
  const extension = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg'
  form.append('image', image, `food.${extension}`)
  const response = await fetch(`${apiBaseUrl}/vision/food`, { method: 'POST', body: form, credentials: 'include', signal })
  const body = await response.json().catch(() => ({})) as { detail?: string | { code?: string; message?: string }; suggestions?: Array<{ name: string; confidence?: number | null; possible_ingredients?: string[] }>; uncertain?: boolean; provider?: string }
  if (!response.ok) {
    if (typeof body.detail === 'object' && body.detail !== null) {
      const code = (body.detail.code ?? 'unknown') as FoodVisionErrorCode
      throw new FoodVisionError(code, messageForVisionCode(code), response.status)
    }
    throw new FoodVisionError('unknown', messageForVisionCode('unknown'), response.status)
  }
  return { suggestions: (body.suggestions ?? []).map((item) => ({ name: item.name, confidence: item.confidence ?? null, possibleIngredients: item.possible_ingredients ?? [] })), uncertain: body.uncertain ?? true, provider: body.provider ?? 'unknown' }
}
