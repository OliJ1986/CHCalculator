import type { MealCategory } from './meals'

export type GoalCategory = { key: MealCategory; label: string; consumedCarbsG: number; targetG: number | null; remainingG: number | null }
export type GoalSummary = {
  localDate: string
  consumedCarbsG: number
  dailyTargetG: number | null
  remainingCarbsG: number | null
  progressRatio: number | null
  progressPercent: number | null
  categories: GoalCategory[]
}
export type Goal = { localDate: string; effectiveDate: string | null; dailyTargetG: number | null; mealTargets: Partial<Record<MealCategory, number>>; hasGoal: boolean }

type GoalResponse = { local_date: string; effective_date: string | null; daily_target_g: number | null; meal_targets: Record<string, number>; has_goal: boolean }
type GoalSummaryResponse = { local_date: string; consumed_carbs_g: number; daily_target_g: number | null; remaining_carbs_g: number | null; progress_ratio: number | null; progress_percent: number | null; categories: Array<{ key: MealCategory; label: string; consumed_carbs_g: number; target_g: number | null; remaining_g: number | null }> }
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBaseUrl + path, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!response.ok) {
    let message = 'A cél mentése nem sikerült.'
    try { const body = (await response.json()) as { detail?: string }; if (body.detail) message = body.detail } catch { /* generic fallback */ }
    throw new Error(message)
  }
  return (await response.json()) as T
}

function mapGoal(goal: GoalResponse): Goal {
  return { localDate: goal.local_date, effectiveDate: goal.effective_date, dailyTargetG: goal.daily_target_g, mealTargets: goal.meal_targets as Partial<Record<MealCategory, number>>, hasGoal: goal.has_goal }
}
export async function getGoal(localDate: string, signal?: AbortSignal): Promise<Goal> { return mapGoal(await request<GoalResponse>('/goals?local_date=' + encodeURIComponent(localDate), { signal })) }
export async function getGoalSummary(localDate: string, signal?: AbortSignal): Promise<GoalSummary> {
  const value = await request<GoalSummaryResponse>('/goals/summary?local_date=' + encodeURIComponent(localDate), { signal })
  return { localDate: value.local_date, consumedCarbsG: value.consumed_carbs_g, dailyTargetG: value.daily_target_g, remainingCarbsG: value.remaining_carbs_g, progressRatio: value.progress_ratio, progressPercent: value.progress_percent, categories: value.categories.map((category) => ({ key: category.key, label: category.label, consumedCarbsG: category.consumed_carbs_g, targetG: category.target_g, remainingG: category.remaining_g })) }
}
export async function saveGoal(payload: { effective_date: string; daily_target_g: number | null; meal_targets: Partial<Record<MealCategory, number>>; allow_past: boolean }): Promise<Goal> {
  return mapGoal(await request<GoalResponse>('/goals', { method: 'PUT', body: JSON.stringify(payload) }))
}
