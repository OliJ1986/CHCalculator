export type AuthState = {
  status: 'guest' | 'authenticated' | 'verification_required' | 'verified' | 'logged_out' | 'reset_requested' | 'password_reset' | 'password_changed'
  authenticated: boolean
  role: 'guest' | 'registered' | string
  email: string | null
  emailVerified: boolean
  verificationToken?: string | null
  resetToken?: string | null
  csrfToken?: string | null
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

function cookie(name: string): string | null {
  const prefix = `${name}=`
  const item = document.cookie.split('; ').find((value) => value.startsWith(prefix))
  return item ? decodeURIComponent(item.slice(prefix.length)) : null
}

export function csrfToken(): string | null { return cookie('chill_csrf') }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const method = (init.method ?? 'GET').toUpperCase()
  const token = csrfToken()
  if (token && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', token)
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, credentials: 'include' })
  if (!response.ok) {
    let message = 'A kérés nem sikerült.'
    try { const body = (await response.json()) as { detail?: string }; if (body.detail) message = body.detail } catch { /* generic fallback */ }
    throw new Error(message)
  }
  return (await response.json()) as T
}

function map(value: { status: AuthState['status']; authenticated?: boolean; role?: string; email?: string | null; email_verified?: boolean; verification_token?: string | null; reset_token?: string | null; csrf_token?: string | null }): AuthState {
  return { status: value.status, authenticated: value.authenticated ?? false, role: value.role ?? 'guest', email: value.email ?? null, emailVerified: value.email_verified ?? false, verificationToken: value.verification_token, resetToken: value.reset_token, csrfToken: value.csrf_token }
}

export async function getAuthState(signal?: AbortSignal): Promise<AuthState> { return map(await request('/auth/me', { signal })) }
export async function register(email: string, password: string): Promise<AuthState> { return map(await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) })) }
export async function verifyEmail(token: string): Promise<AuthState> { return map(await request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })) }
export async function login(email: string, password: string): Promise<AuthState> { return map(await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })) }
export async function logout(): Promise<AuthState> { return map(await request('/auth/logout', { method: 'POST', body: '{}' })) }
export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthState> { return map(await request('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })) }
export async function requestPasswordReset(email: string): Promise<AuthState> { return map(await request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })) }
export async function resetPassword(token: string, password: string): Promise<AuthState> { return map(await request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })) }

export type GuestImportPayload = {
  meals: Array<{ id: string; consumed_at: string; local_date: string; timezone: string; amount_g: number; meal_category: string; snapshot: Record<string, unknown> }>
  goals: Array<{ effective_date: string; daily_target_g: number | null; meal_targets: Record<string, number>; allow_past: boolean }>
  custom_foods?: Array<{ id: string; name: string; brand: string | null; available_carbs_100g: number; dietary_fiber_100g: number | null; serving_size_g: number | null; notes: string | null; is_favorite: boolean }>
  recipes?: Array<{ id: string; name: string; instructions: string | null; prep_minutes: number | null; notes: string | null; servings: number; total_weight_g: number | null; is_favorite: boolean; ingredients: Array<{ id: string; food_id: string | null; custom_food_id: string | null; quantity_g: number; calculated_carbs_g: number; snapshot: Record<string, unknown>; position: number }> }>
  plans?: Array<{ id: string; plan_date: string; meal_category: string; food_id: string | null; custom_food_id: string | null; recipe_id: string | null; quantity: number; quantity_unit: string; planned_carbs_g: number; snapshot: Record<string, unknown> }>
  shopping?: Array<{ id: string; name: string; quantity: number | null; unit: string; checked: boolean; source: string }>
  overwrite_existing?: boolean
}

export async function importGuestData(payload: GuestImportPayload): Promise<{ importedMeals: number; skippedMeals: number; importedGoals: number; skippedGoals: number; importedCustomFoods: number; skippedCustomFoods: number }> {
  const value = await request<{ imported_meals: number; skipped_meals: number; imported_goals: number; skipped_goals: number; imported_custom_foods?: number; skipped_custom_foods?: number }>('/auth/import-guest', { method: 'POST', body: JSON.stringify(payload) })
  return { importedMeals: value.imported_meals, skippedMeals: value.skipped_meals, importedGoals: value.imported_goals, skippedGoals: value.skipped_goals, importedCustomFoods: value.imported_custom_foods ?? 0, skippedCustomFoods: value.skipped_custom_foods ?? 0 }
}
