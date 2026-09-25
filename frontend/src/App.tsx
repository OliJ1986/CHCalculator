import { ArrowLeft, Check, ChevronRight, CircleUserRound, Minus, Moon, Pencil, Plus, Search, Sparkles, Sun, Trash2, Utensils, X } from './components/icons'
import { useEffect, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { calculateCarbohydrate, formatCarbohydrate, MAX_AMOUNT_GRAMS, parseAmountInput } from './lib/carbs'
import { searchFoods, type Food } from './api/foods'
import { createMeal, deleteMeal, listMeals, updateMeal, type Meal, type MealCategory } from './api/meals'
import { copyPlan, createCustomFood, createPlan, createRecipe, createShopping, deleteCustomFood, deletePlan, deleteRecipe, deleteShopping, favoriteCustomFood, favoriteRecipe, generateShopping, listCustomFoods, listPlans, listRecipes, listShopping, logPlanMeal, logRecipeMeal, updateCustomFood, updatePlan, updateRecipe, updateShopping, type CustomFood, type Plan, type Recipe, type ShoppingItem } from './api/catalog'
import { getGoalSummary, saveGoal, type GoalSummary } from './api/goals'
import { changePassword, getAuthState, importGuestData, login, logout, register, requestPasswordReset, resetPassword, verifyEmail, type AuthState } from './api/auth'
import { clearGuestData, createGuestMeal, createGuestMealFromPlan, deleteGuestMeal, exportGuestData, getGuestSummary, guestWindowAllows, listGuestCustomFoods, listGuestMeals, listGuestPlans, listGuestRecipes, listGuestShopping, saveGuestCustomFood, saveGuestGoal, saveGuestPlan, saveGuestRecipe, saveGuestShopping, updateGuestMeal, deleteGuestCustomFood, deleteGuestPlan, deleteGuestRecipe, deleteGuestShopping } from './storage/guestStore'

const DEFAULT_TIMEZONE = 'Europe/Budapest'
const CATEGORY_LABELS: Record<MealCategory, string> = { breakfast: 'Reggeli', morning_snack: 'TĂ­zĂłrai', lunch: 'EbĂ©d', afternoon_snack: 'Uzsonna', dinner: 'Vacsora', other: 'EgyĂ©b' }
const MEAL_CATEGORIES: MealCategory[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'other']
const navItems = [
  { label: 'Ma', icon: Sparkles, to: '/' }, { label: 'Ételek', icon: Utensils, to: '/etelek' },
  { label: 'Hozzáadás', icon: Plus, to: '__add__' }, { label: 'Tervező', icon: Check, to: '/tervezo' },
  { label: 'Profil', icon: CircleUserRound, to: '/profil' },
]

function localDateInTimezone(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return part('year') + '-' + part('month') + '-' + part('day')
}

function mealTime(meal: Meal): string {
  return new Intl.DateTimeFormat('hu-HU', { timeZone: meal.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(meal.consumedAt))
}

function foodFromMeal(meal: Meal): Food {
  const snapshot = meal.snapshot
  return {
    id: meal.foodId ?? 'snapshot-' + meal.id,
    name: snapshot.name,
    originalName: snapshot.originalName,
    brand: snapshot.brand,
    barcode: null,
    source: snapshot.source,
    sourceId: snapshot.sourceId,
    availableCarbs100g: snapshot.availableCarbs100g,
    servingSizeG: null,
    imageUrl: null,
    language: null,
    country: null,
    isGeneric: false,
    isVerified: false,
    category: 'other',
    categoryLabel: 'EgyĂ©b',
    carbsAvailable: snapshot.availableCarbs100g !== null,
  }
}

function App() {
  const queryClient = useQueryClient()
  const [darkMode, setDarkMode] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [amount, setAmount] = useState('55')
  const [mealCategory, setMealCategory] = useState<MealCategory>('other')
  const [query, setQuery] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('Mentve a naplĂłba')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isGoalSheetOpen, setIsGoalSheetOpen] = useState(false)
  const todayDate = localDateInTimezone()
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const authQuery = useQuery<AuthState>({ queryKey: ['auth'], queryFn: ({ signal }) => getAuthState(signal), retry: false, staleTime: 15_000 })
  const authenticated = authQuery.data?.authenticated === true
  // Guest data is the first usable mode. The auth check may be slow or unavailable
  // behind a staging gateway, so it must not block the local IndexedDB view.
  const mealsQuery = useQuery({ queryKey: ['meals', selectedDate, authenticated ? 'account' : 'guest'], queryFn: ({ signal }) => authenticated ? listMeals(selectedDate, signal) : listGuestMeals(selectedDate, todayDate), enabled: !authenticated || authQuery.isSuccess, staleTime: 15_000 })
  const goalQuery = useQuery<GoalSummary>({ queryKey: ['goal-summary', selectedDate, authenticated ? 'account' : 'guest'], queryFn: ({ signal }) => authenticated ? getGoalSummary(selectedDate, signal) : getGuestSummary(selectedDate, todayDate), enabled: !authenticated || authQuery.isSuccess, staleTime: 15_000 })
  const createMutation = useMutation({
    mutationFn: createMeal,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); closeSheet(); showSavedToast() },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A mentĂ©s nem sikerĂĽlt.'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { amount_g: number; food_id?: string; custom_food_id?: string; meal_category?: MealCategory } }) => updateMeal(id, payload),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); closeSheet(); showSavedToast() },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A mĂłdosĂ­tĂˇs nem sikerĂĽlt.'),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteMeal,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); showSavedToast('BejegyzĂ©s tĂ¶rĂ¶lve') },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A tĂ¶rlĂ©s nem sikerĂĽlt.'),
  })
  const goalMutation = useMutation({
    mutationFn: saveGoal,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); setIsGoalSheetOpen(false); showSavedToast('CĂ©l mentve') },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A cĂ©l mentĂ©se nem sikerĂĽlt.'),
  })
  const meals = mealsQuery.data?.items ?? []
  const total = mealsQuery.data?.totalCarbsG ?? 0
  const isSaving = createMutation.isPending || updateMutation.isPending

  function showSavedToast(message = 'Mentve a naplĂłba') {
    setToastMessage(message)
    setShowToast(true)
    window.setTimeout(() => setShowToast(false), 2800)
    setActionError(null)
  }
  function closeSheet() { setIsSheetOpen(false); setEditingMeal(null); setSelectedFood(null); setMealCategory('other'); setQuery(''); setActionError(null) }
  function openSheet(meal?: Meal) {
    setEditingMeal(meal ?? null); setSelectedFood(meal ? foodFromMeal(meal) : null); setAmount(meal ? String(meal.amountG) : '55'); setMealCategory(meal ? (meal.mealCategory as MealCategory) : 'other'); setQuery(''); setActionError(null); setIsSheetOpen(true)
  }
  function saveMeal() {
    const amountGrams = parseAmountInput(amount)
    if (!selectedFood || amountGrams === null || selectedFood.availableCarbs100g === null) return
    const carbs = calculateCarbohydrate(amountGrams, selectedFood.availableCarbs100g)
    if (carbs === null) return
    setActionError(null)
    if (!authenticated) {
      if (!guestWindowAllows(selectedDate, todayDate)) { setActionError('VendĂ©g mĂłdban csak a mai Ă©s az elĹ‘zĹ‘ kĂ©t nap naplĂłzhatĂł.'); return }
      if (editingMeal) {
        void updateGuestMeal(editingMeal.id, amountGrams, mealCategory).then(() => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); closeSheet(); showSavedToast() }).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'A mĂłdosĂ­tĂˇs nem sikerĂĽlt.'))
      } else {
        void createGuestMeal(selectedFood, amountGrams, selectedDate, mealCategory).then(() => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); closeSheet(); showSavedToast() }).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'A mentĂ©s nem sikerĂĽlt.'))
      }
      return
    }
    if (editingMeal) {
      const sourcePayload = selectedFood.source === 'custom' ? { custom_food_id: selectedFood.sourceId } : { food_id: selectedFood.id }
      const payload = { amount_g: amountGrams, meal_category: mealCategory, ...((selectedFood.source === 'custom' ? editingMeal.customFoodId !== selectedFood.sourceId : selectedFood.id !== editingMeal.foodId) ? sourcePayload : {}) }
      updateMutation.mutate({ id: editingMeal.id, payload })
      return
    }
    const key = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + String(Math.random())
    createMutation.mutate({ ...(selectedFood.source === 'custom' ? { custom_food_id: selectedFood.sourceId } : { food_id: selectedFood.id }), amount_g: amountGrams, local_date: selectedDate, meal_category: mealCategory, idempotency_key: key, client_carbs_g: carbs })
  }
  function requestDelete(meal: Meal) {
    if (window.confirm('TĂ¶rlĂ¶d ezt: ' + meal.snapshot.name + '?')) {
      if (!authenticated) void deleteGuestMeal(meal.id).then(() => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); showSavedToast('BejegyzĂ©s tĂ¶rĂ¶lve') })
      else deleteMutation.mutate(meal.id)
    }
  }

  function saveGoalForMode(payload: { effective_date: string; daily_target_g: number | null; meal_targets: Partial<Record<MealCategory, number>>; allow_past: boolean }) {
    if (authenticated) { goalMutation.mutate(payload); return }
    void saveGuestGoal({ effectiveDate: payload.effective_date, dailyTargetG: payload.daily_target_g, mealTargets: payload.meal_targets, allowPast: payload.allow_past }).then(() => { void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); setIsGoalSheetOpen(false); showSavedToast('CĂ©l mentve') }).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'A cĂ©l mentĂ©se nem sikerĂĽlt.'))
  }

  async function loginAndOfferGuestImport(email: string, password: string) {
    await login(email, password)
    await authQuery.refetch()
    const guest = await exportGuestData()
    if (guest.meals.length === 0 && guest.goals.length === 0 && guest.customFoods.length === 0) return
    if (!window.confirm('A bĂ¶ngĂ©szĹ‘ben talĂˇlt vendĂ©g naplĂładatokat importĂˇljam a fiĂłkodba?')) return
    await importGuestData({
      meals: guest.meals.map((meal) => ({ id: meal.id, consumed_at: meal.consumedAt, local_date: meal.localDate, timezone: meal.timezone, amount_g: meal.amountG, meal_category: meal.mealCategory, snapshot: { snapshot_version: meal.snapshot.snapshotVersion, captured_at: meal.snapshot.capturedAt, calculation_version: meal.snapshot.calculationVersion, unit: meal.snapshot.unit, name: meal.snapshot.name, original_name: meal.snapshot.originalName, brand: meal.snapshot.brand, source: meal.snapshot.source, source_id: meal.snapshot.sourceId, available_carbs_100g: meal.snapshot.availableCarbs100g, total_carbohydrate_100g: meal.snapshot.totalCarbohydrate100g, dietary_fiber_100g: meal.snapshot.dietaryFiber100g, nutrient_ids: meal.snapshot.nutrientIds, nutrient_values: meal.snapshot.nutrientValues, nutrient_provenance: meal.snapshot.nutrientProvenance, mapping_version: meal.snapshot.mappingVersion } })),
      goals: guest.goals.map((goal) => ({ effective_date: goal.effectiveDate, daily_target_g: goal.dailyTargetG, meal_targets: goal.mealTargets, allow_past: goal.allowPast })),
      custom_foods: guest.customFoods.map((food) => ({ id: food.id, name: food.name, brand: food.brand, available_carbs_100g: food.availableCarbs100g, dietary_fiber_100g: food.dietaryFiber100g, serving_size_g: food.servingSizeG, notes: food.notes, is_favorite: food.isFavorite })),
      recipes: guest.recipes.map((recipe) => ({ id: recipe.id, name: recipe.name, instructions: recipe.instructions, prep_minutes: recipe.prepMinutes, notes: recipe.notes, servings: recipe.servings, total_weight_g: recipe.totalWeightG, is_favorite: recipe.isFavorite, ingredients: recipe.ingredients.map((ingredient) => ({ id: ingredient.id, food_id: ingredient.foodId, custom_food_id: ingredient.customFoodId, quantity_g: ingredient.quantityG, calculated_carbs_g: ingredient.calculatedCarbsG, snapshot: ingredient.snapshot, position: ingredient.position })) })),
      plans: guest.plans.map((plan) => ({ id: plan.id, plan_date: plan.planDate, meal_category: plan.mealCategory, food_id: plan.foodId, custom_food_id: plan.customFoodId, recipe_id: plan.recipeId, quantity: plan.quantity, quantity_unit: plan.quantityUnit, planned_carbs_g: plan.plannedCarbsG, snapshot: plan.snapshot })),
      shopping: guest.shopping.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, checked: item.checked, source: item.source })),
    })
    await clearGuestData()
  }

  return <div className={'app-shell ' + (darkMode ? 'theme-dark' : '')}>
    <div className="app-frame">
      <header className="topbar"><Link className="wordmark" to="/" aria-label="CHill kezdĹ‘lap"><span className="wordmark-ch">CH</span><span className="wordmark-rest">ill</span></Link><button className="theme-toggle" onClick={() => setDarkMode((mode) => !mode)} aria-label={darkMode ? 'VilĂˇgos tĂ©ma' : 'SĂ¶tĂ©t tĂ©ma'}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button></header>
      <Routes><Route path="/" element={<HomeScreen date={selectedDate} todayDate={todayDate} guestMode={!authenticated} total={total} meals={meals} goal={goalQuery.data} isLoading={mealsQuery.isPending} isError={mealsQuery.isError} onAdd={() => openSheet()} onEdit={openSheet} onDelete={requestDelete} onDateChange={setSelectedDate} onGoal={() => { setActionError(null); setIsGoalSheetOpen(true) }} />} /><Route path="/etelek" element={<CatalogScreen authenticated={authenticated} />} /><Route path="/receptek" element={<CatalogScreen authenticated={authenticated} />} /><Route path="/tervezo" element={<PlannerScreen authenticated={authenticated} today={todayDate} />} /><Route path="/kedvencek" element={<PlannerScreen authenticated={authenticated} today={todayDate} />} /><Route path="/profil" element={<ProfileScreen auth={authQuery.data} onLogin={loginAndOfferGuestImport} onRegister={register} onVerify={async (token) => { await verifyEmail(token); await authQuery.refetch() }} onLogout={async () => { await logout(); await authQuery.refetch(); void queryClient.invalidateQueries({ queryKey: ['meals'] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary'] }) }} />} /><Route path="*" element={<PlaceholderScreen />} /></Routes>
      <BottomNavigation onAdd={() => openSheet()} />
    </div>
    {isSheetOpen && <AddMealSheet guestMode={!authenticated} mode={editingMeal ? 'edit' : 'create'} selectedDate={selectedDate} todayDate={todayDate} query={query} setQuery={setQuery} selectedFood={selectedFood} setSelectedFood={setSelectedFood} amount={amount} setAmount={setAmount} mealCategory={mealCategory} setMealCategory={setMealCategory} onClose={closeSheet} onAdd={saveMeal} isSaving={isSaving} error={actionError} />}
    {isGoalSheetOpen && <GoalSheet localDate={selectedDate} todayDate={todayDate} goal={goalQuery.data} onClose={() => setIsGoalSheetOpen(false)} onSave={saveGoalForMode} isSaving={goalMutation.isPending} error={goalMutation.isError ? actionError : null} />}
    {showToast && <div className="toast" role="status"><span className="toast-icon"><Check size={15} /></span>{toastMessage}</div>}
  </div>
}

function HomeScreen({ date, todayDate, guestMode, total, meals, goal, isLoading, isError, onAdd, onEdit, onDelete, onDateChange, onGoal }: { date: string; todayDate: string; guestMode: boolean; total: number; meals: Meal[]; goal?: GoalSummary; isLoading: boolean; isError: boolean; onAdd: () => void; onEdit: (meal: Meal) => void; onDelete: (meal: Meal) => void; onDateChange: (date: string) => void; onGoal: () => void }) {
  const target = goal?.dailyTargetG ?? null
  const remaining = goal?.remainingCarbsG ?? null
  const progress = goal?.progressPercent ?? null
  const shiftDate = (delta: number) => { const value = new Date(date + 'T12:00:00'); value.setDate(value.getDate() + delta); const next = localDateInTimezone(value); if (!guestMode || guestWindowAllows(next, todayDate)) onDateChange(next) }
  const previousDate = new Date(date + 'T12:00:00'); previousDate.setDate(previousDate.getDate() - 1)
  const nextDate = new Date(date + 'T12:00:00'); nextDate.setDate(nextDate.getDate() + 1)
  const canPrevious = !guestMode || guestWindowAllows(localDateInTimezone(previousDate), todayDate)
  const canNext = !guestMode || guestWindowAllows(localDateInTimezone(nextDate), todayDate)
  return <main className="screen home-screen">
    <div className="date-line"><button className="date-nav" onClick={() => shiftDate(-1)} aria-label="ElĹ‘zĹ‘ nap" disabled={!canPrevious}>â€ą</button><span className="date-dot" /><span className="date-label">{date === todayDate ? 'Ma Â· ' : ''}{new Intl.DateTimeFormat('hu-HU', { timeZone: DEFAULT_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(date + 'T12:00:00'))}</span><button className="date-nav" onClick={() => shiftDate(1)} aria-label="KĂ¶vetkezĹ‘ nap" disabled={!canNext}>â€ş</button></div>
    <section className="hero-section" aria-labelledby="daily-title"><div className="hero-copy"><p className="eyebrow">{target === null ? 'Napi Ă¶sszesen' : 'FogyasztĂˇs'}</p><h1 id="daily-title"><span className="hero-total" key={total}>{formatCarbohydrate(total)}</span> <small>g CH</small></h1></div><p className="remaining"><span className="remaining-dot" />{target === null ? 'Nincs beĂˇllĂ­tott napi cĂ©l' : remaining !== null && remaining < 0 ? 'TĂşllĂ©pĂ©s ' + formatCarbohydrate(Math.abs(remaining)) + ' g' : 'MĂ©g ' + formatCarbohydrate(remaining ?? 0) + ' g maradt'}</p>{target !== null && <div className="progress-wrap"><div className="progress-meta"><span>Napi cĂ©l</span><span>{formatCarbohydrate(target)} g</span></div><div className="progress-track"><div className="progress-fill" style={{ width: Math.min(progress ?? 0, 100) + '%' }} /></div></div>}</section>
    <div className="goal-actions"><button className="secondary-action" onClick={onGoal}>{target === null ? 'Napi cĂ©l beĂˇllĂ­tĂˇsa' : 'CĂ©l szerkesztĂ©se'}</button></div>
    {goal?.categories && <section className="category-summary" aria-label="Ă‰tkezĂ©si kategĂłriĂˇk"><div className="section-heading"><h2>KategĂłriĂˇk</h2><span className="entry-count">{goal.categories.length} kategĂłria</span></div><div className="category-summary-grid">{goal.categories.map((category) => <div className="category-summary-item" key={category.key}><span>{category.label}</span><strong>{formatCarbohydrate(category.consumedCarbsG)} g</strong>{category.targetG !== null && <small>/ {formatCarbohydrate(category.targetG)} g cĂ©l</small>}</div>)}</div></section>}
    <button className="add-meal-button" onClick={onAdd}><span className="add-icon"><Plus size={20} strokeWidth={2.5} /></span><span>Ă‰tkezĂ©s hozzĂˇadĂˇsa</span><ChevronRight size={19} className="button-arrow" /></button>
    <section className="entries-section" aria-labelledby="entries-title"><div className="section-heading"><h2 id="entries-title">{date === todayDate ? 'Mai' : 'Napi'} bejegyzĂ©sek</h2><span className="entry-count">{meals.length} Ă©tkezĂ©s</span></div><div className="entries-list">{isLoading && <p className="search-state">NaplĂł betĂ¶ltĂ©seâ€¦</p>}{isError && <p className="search-state error">A naplĂł most nem Ă©rhetĹ‘ el. PrĂłbĂˇld Ăşjra kĂ©sĹ‘bb.</p>}{!isLoading && !isError && meals.length === 0 && <p className="search-state">MĂ©g nincs mentett Ă©tkezĂ©s erre a napra.</p>}{meals.map((meal) => <MealRow meal={meal} key={meal.id} onEdit={onEdit} onDelete={onDelete} />)}</div></section>
  </main>
}

function MealRow({ meal, onEdit, onDelete }: { meal: Meal; onEdit: (meal: Meal) => void; onDelete: (meal: Meal) => void }) {
  return <article className="meal-row"><span className="meal-marker lime"><Utensils size={15} /></span><div className="meal-info"><div className="meal-meta"><span>{CATEGORY_LABELS[meal.mealCategory as MealCategory] ?? CATEGORY_LABELS.other}</span><span className="meal-time">{mealTime(meal)}</span></div><h3>{meal.snapshot.name}</h3></div><div className="meal-carbs"><strong>{formatCarbohydrate(meal.calculatedCarbsG)}</strong><span>g CH</span></div><div className="meal-actions"><button onClick={() => onEdit(meal)} aria-label={meal.snapshot.name + ' szerkesztĂ©se'}><Pencil size={16} /></button><button onClick={() => onDelete(meal)} aria-label={meal.snapshot.name + ' tĂ¶rlĂ©se'}><Trash2 size={16} /></button></div></article>
}

function AddMealSheet({ guestMode, mode, selectedDate, todayDate, query, setQuery, selectedFood, setSelectedFood, amount, setAmount, mealCategory, setMealCategory, onClose, onAdd, isSaving, error }: { guestMode: boolean; mode: 'create' | 'edit'; selectedDate: string; todayDate: string; query: string; setQuery: (value: string) => void; selectedFood: Food | null; setSelectedFood: (food: Food | null) => void; amount: string; setAmount: (value: string) => void; mealCategory: MealCategory; setMealCategory: (value: MealCategory) => void; onClose: () => void; onAdd: () => void; isSaving: boolean; error: string | null }) {
  const normalizedQuery = query.trim()
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => { const timeout = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 300); return () => window.clearTimeout(timeout) }, [normalizedQuery])
  const isDebouncing = normalizedQuery.length >= 2 && debouncedQuery !== normalizedQuery
  const searchQuery = useQuery({ queryKey: ['foods', debouncedQuery], queryFn: ({ signal }) => searchFoods(debouncedQuery, signal), enabled: debouncedQuery.length >= 2, staleTime: 60_000 })
  const customQuery = useQuery({ queryKey: ['custom-foods', debouncedQuery, guestMode], queryFn: () => guestMode ? listGuestCustomFoods(debouncedQuery) : listCustomFoods(debouncedQuery), enabled: debouncedQuery.length >= 2, staleTime: 30_000 })
  const customFoods = (customQuery.data ?? []).map((item): Food => ({ id: `custom-${item.id}`, name: item.name, originalName: null, brand: item.brand, barcode: null, source: 'custom', sourceId: item.id, availableCarbs100g: item.availableCarbs100g, servingSizeG: item.servingSizeG, imageUrl: null, language: 'hu', country: null, isGeneric: false, isVerified: true, category: 'custom', categoryLabel: 'SajĂˇt Ă©tel', carbsAvailable: true }))
  const foods = isDebouncing ? [] : [...customFoods, ...(searchQuery.data ?? [])]
  const amountGrams = parseAmountInput(amount)
  const amountError = !amount.trim() ? 'Adj meg egy mennyisĂ©get grammban.' : amountGrams === null ? 'A mennyisĂ©g 0-nĂˇl nagyobb Ă©s legfeljebb ' + MAX_AMOUNT_GRAMS.toLocaleString('hu-HU') + ' g lehet.' : null
  const carbs = selectedFood && amountGrams !== null ? calculateCarbohydrate(amountGrams, selectedFood.availableCarbs100g) : null
  const adjustAmount = (delta: number) => { const current = amountGrams ?? 0; const next = Math.min(MAX_AMOUNT_GRAMS, Math.max(0, current + delta)); setAmount(next > 0 ? String(next) : '') }
  return <div className="sheet-backdrop" onMouseDown={isSaving ? undefined : onClose}><section className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><div><p className="eyebrow">{mode === 'edit' ? 'BejegyzĂ©s szerkesztĂ©se' : 'Ăšj bejegyzĂ©s Â· 1 / 2'}</p><h2 id="sheet-title">{selectedFood ? 'Mennyit ettĂ©l?' : 'Mit ettĂ©l?'}</h2></div><button className="close-button" onClick={onClose} aria-label="BezĂˇrĂˇs" disabled={isSaving}><X size={20} /></button></div>
    {!selectedFood ? <><label className="search-field"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keress egy Ă©teltâ€¦" aria-label="Ă‰tel keresĂ©se" /></label><div className="food-list">{normalizedQuery.length < 2 && <p className="search-state">ĂŤrj be legalĂˇbb 2 karaktert a keresĂ©shez.</p>}{normalizedQuery.length >= 2 && (isDebouncing || searchQuery.isPending) && <p className="search-state">KeresĂ©sâ€¦</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isError && <p className="search-state error">Az Ă©telkeresĂ©s most nem elĂ©rhetĹ‘. PrĂłbĂˇld Ăşjra kĂ©sĹ‘bb.</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isSuccess && foods.length === 0 && <p className="search-state">Nincs talĂˇlat erre a keresĂ©sre.</p>}{foods.map((food) => <button className="food-option" key={food.id} onClick={() => food.carbsAvailable && setSelectedFood(food)} disabled={!food.carbsAvailable} aria-disabled={!food.carbsAvailable}><FoodMedia food={food} /><span className="food-copy"><strong>{food.name}</strong>{food.originalName && food.originalName !== food.name && <small className="food-source-name">{food.originalName}</small>}<small className="food-kind">{food.categoryLabel}</small>{food.brand && <small>{food.brand}</small>}{food.carbsAvailable ? <small>{formatCarbohydrate(food.availableCarbs100g!)} g CH / 100 g</small> : <small className="unavailable">CH adat nem elĂ©rhetĹ‘</small>}</span><ChevronRight size={18} /></button>)}</div></> : <div className="amount-step">{selectedDate !== todayDate && <p className="goal-help other-day-note">Mentés erre a napra: {selectedDate}</p>}<button className="selected-food-card" onClick={() => setSelectedFood(null)} disabled={isSaving}><FoodMedia food={selectedFood} /><span><strong>{selectedFood.name}</strong>{selectedFood.originalName && selectedFood.originalName !== selectedFood.name && <small className="food-source-name">{selectedFood.originalName}</small>}<small className="food-kind">{selectedFood.categoryLabel}</small>{selectedFood.brand && <small>{selectedFood.brand}</small>}<small>{formatCarbohydrate(selectedFood.availableCarbs100g!)} g CH / 100 g</small></span><ArrowLeft size={18} /></button><label className="category-field"><span>Ă‰tkezĂ©s</span><select value={mealCategory} onChange={(event) => setMealCategory(event.target.value as MealCategory)} disabled={isSaving}>{MEAL_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select></label><div className="amount-label"><span>MennyisĂ©g</span><small>grammban</small></div><div className="amount-control"><button onClick={() => adjustAmount(-5)} aria-label="5 grammal kevesebb" disabled={isSaving}><Minus size={21} /></button><label><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="MennyisĂ©g grammban" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? 'amount-error' : undefined} disabled={isSaving} /><span>g</span></label><button onClick={() => adjustAmount(5)} aria-label="5 grammal tĂ¶bb" disabled={isSaving}><Plus size={21} /></button></div>{amountError && <p id="amount-error" className="input-error" role="alert">{amountError}</p>}{error && <p className="input-error" role="alert">{error}</p>}<div className="quick-amounts"><span>Gyors vĂˇlasztĂˇs</span>{[50, 100, 150].map((value) => <button key={value} className={amountGrams === value ? 'active' : ''} onClick={() => setAmount(String(value))} disabled={isSaving}>{value} g</button>)}</div>{carbs !== null ? <div className="calculation-result"><div><p className="eyebrow">Ezzel a mennyisĂ©ggel</p><strong>{formatCarbohydrate(carbs)} <small>g CH</small></strong></div><span className="result-check"><Check size={18} /></span></div> : <p className="calculation-error" role="status">A CH csak Ă©rvĂ©nyes mennyisĂ©g Ă©s elĂ©rhetĹ‘ tĂˇpĂ©rtĂ©k mellett szĂˇmĂ­thatĂł.</p>}<button className="confirm-button" onClick={onAdd} disabled={carbs === null || isSaving}>{isSaving ? 'MentĂ©sâ€¦' : mode === 'edit' ? 'MentĂ©s' : 'MentĂ©s a naplĂłba'} <Plus size={19} /></button></div>}
  </section></div>
}

function GoalSheet({ localDate, todayDate, goal, onClose, onSave, isSaving, error }: { localDate: string; todayDate: string; goal?: GoalSummary; onClose: () => void; onSave: (payload: { effective_date: string; daily_target_g: number | null; meal_targets: Partial<Record<MealCategory, number>>; allow_past: boolean }) => void; isSaving: boolean; error: string | null }) {
  const [daily, setDaily] = useState(goal?.dailyTargetG == null ? '' : String(goal.dailyTargetG))
  const [targets, setTargets] = useState<Partial<Record<MealCategory, string>>>({})
  const [confirmPast, setConfirmPast] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  useEffect(() => { setDaily(goal?.dailyTargetG == null ? '' : String(goal.dailyTargetG)); const next: Partial<Record<MealCategory, string>> = {}; goal?.categories.forEach((category) => { if (category.targetG != null) next[category.key] = String(category.targetG) }); setTargets(next) }, [goal])
  const past = localDate < todayDate
  const dailyNumber = daily.trim() ? Number(daily.replace(',', '.')) : null
  const categoryTargetTotal = Object.values(targets).reduce((sum, value) => { const number = value?.trim() ? Number(value.replace(',', '.')) : 0; return Number.isFinite(number) ? sum + number : sum }, 0)
  const targetMismatch = dailyNumber !== null && Number.isFinite(dailyNumber) && categoryTargetTotal > 0 && Math.abs(categoryTargetTotal - dailyNumber) > 0.0005
  const submit = () => {
    if (past && !confirmPast) { setLocalError('JelĂ¶ld meg, hogy szĂˇndĂ©kosan korĂˇbbi nap cĂ©ljĂˇt mĂłdosĂ­tod.'); return }
    const dailyValue = daily.trim() ? Number(daily.replace(',', '.')) : null
    if (dailyValue !== null && (!Number.isFinite(dailyValue) || dailyValue <= 0)) { setLocalError('A napi cĂ©l 0-nĂˇl nagyobb, vĂ©ges szĂˇm legyen.'); return }
    const mealTargets: Partial<Record<MealCategory, number>> = {}
    for (const category of MEAL_CATEGORIES) { const value = targets[category]; if (value?.trim()) { const number = Number(value.replace(',', '.')); if (!Number.isFinite(number) || number <= 0) { setLocalError('A rĂ©sz-cĂ©lok 0-nĂˇl nagyobb, vĂ©ges szĂˇmok legyenek.'); return }; mealTargets[category] = number } }
    setLocalError(null); onSave({ effective_date: localDate, daily_target_g: dailyValue, meal_targets: mealTargets, allow_past: past })
  }
  return <div className="sheet-backdrop" onMouseDown={isSaving ? undefined : onClose}><section className="add-sheet goal-sheet" role="dialog" aria-modal="true" aria-labelledby="goal-title" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><div><p className="eyebrow">{past ? 'KorĂˇbbi nap cĂ©lja' : 'FelhasznĂˇlĂłi cĂ©l'}</p><h2 id="goal-title">{past ? localDate : 'Napi CH-cĂ©l'}</h2></div><button className="close-button" onClick={onClose} disabled={isSaving} aria-label="BezĂˇrĂˇs"><X size={20} /></button></div>{past && <label className="goal-confirm"><input type="checkbox" checked={confirmPast} onChange={(event) => setConfirmPast(event.target.checked)} disabled={isSaving} /> Tudatosan mĂłdosĂ­tom ennek a korĂˇbbi napnak a cĂ©ljĂˇt.</label>}<label className="goal-input"><span>Napi cĂ©l grammban</span><input inputMode="decimal" value={daily} onChange={(event) => setDaily(event.target.value)} placeholder="Nincs cĂ©l" disabled={isSaving} /></label><p className="goal-help">Ăśresen hagyva nincs napi cĂ©l; ilyenkor az Ă¶sszeg lĂˇthatĂł marad, de nincs szĂˇzalĂ©k vagy maradĂ©k.</p><div className="goal-targets"><p className="eyebrow">OpcionĂˇlis Ă©tkezĂ©si rĂ©sz-cĂ©lok</p>{MEAL_CATEGORIES.map((category) => <label className="goal-input" key={category}><span>{CATEGORY_LABELS[category]}</span><input inputMode="decimal" value={targets[category] ?? ''} onChange={(event) => setTargets((current) => ({ ...current, [category]: event.target.value }))} placeholder="â€”" disabled={isSaving} /></label>)}{targetMismatch && <p className="goal-help">A rĂ©sz-cĂ©lok Ă¶sszege eltĂ©r a napi cĂ©ltĂłl; a megadott Ă©rtĂ©kek vĂˇltozatlanul maradnak.</p>}</div>{(localError || error) && <p className="input-error" role="alert">{localError || error}</p>}<button className="confirm-button" onClick={submit} disabled={isSaving}>{isSaving ? 'MentĂ©sâ€¦' : 'CĂ©l mentĂ©se'} <Check size={19} /></button></section></div>
}

function FoodMedia({ food }: { food: Food }) { return food.imageUrl ? <span className="food-media"><img className="food-image" src={food.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span className="food-icon" aria-hidden="true"><Utensils size={20} /></span></span> : <span className="food-icon" aria-hidden="true"><Utensils size={20} /></span> }

function RecipeEditor({ authenticated, foods, recipe, onClose, onSaved }: { authenticated: boolean; foods: CustomFood[]; recipe?: Recipe; onClose: () => void; onSaved: (recipe: Recipe) => void }) {
  type IngredientDraft = { id: string; name: string; quantityG: string; carbs: number; foodId: string | null; customFoodId: string | null }
  const [name, setName] = useState(recipe?.name ?? '')
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [prep, setPrep] = useState(recipe?.prepMinutes == null ? '' : String(recipe.prepMinutes))
  const [servings, setServings] = useState(String(recipe?.servings ?? 1))
  const [totalWeight, setTotalWeight] = useState(recipe?.totalWeightG == null ? '' : String(recipe.totalWeightG))
  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(recipe?.ingredients.map((item) => ({ id: item.id, name: String(item.snapshot.name ?? 'Hozzávaló'), quantityG: String(item.quantityG), carbs: item.quantityG ? item.calculatedCarbsG / item.quantityG * 100 : 0, foodId: item.foodId, customFoodId: item.customFoodId })) ?? [])
  const [message, setMessage] = useState<string | null>(null)
  const result = useQuery({ queryKey: ['recipe-foods', ingredientQuery], queryFn: ({ signal }) => searchFoods(ingredientQuery, signal), enabled: ingredientQuery.trim().length >= 2, staleTime: 30_000 })
  const addIngredient = (item: Food, customFoodId: string | null = null) => { if (item.availableCarbs100g == null) { setMessage('CH-adat nélkül a hozzávaló nem adható hozzá.'); return }; setIngredients((current) => [...current, { id: crypto.randomUUID(), name: item.name, quantityG: '100', carbs: item.availableCarbs100g!, foodId: customFoodId ? null : item.id, customFoodId, }]); setIngredientQuery('') }
  const addCustom = (item: CustomFood) => addIngredient({ id: `custom-${item.id}`, name: item.name, originalName: null, brand: item.brand, barcode: null, source: 'custom', sourceId: item.id, availableCarbs100g: item.availableCarbs100g, servingSizeG: item.servingSizeG, imageUrl: null, language: 'hu', country: null, isGeneric: false, isVerified: true, category: 'custom', categoryLabel: 'Saját étel', carbsAvailable: true }, item.id)
  const total = ingredients.reduce((sum, item) => sum + (Number(item.quantityG.replace(',', '.')) || 0) * item.carbs / 100, 0)
  const perServing = total / (Number(servings.replace(',', '.')) || 1)
  const cancel = () => { if (name.trim() && !window.confirm('Elveted a szerkesztési változásokat?')) return; onClose() }
  const save = async () => {
    const servingValue = Number(servings.replace(',', '.')); const weightValue = totalWeight.trim() ? Number(totalWeight.replace(',', '.')) : undefined
    if (!name.trim() || !Number.isFinite(servingValue) || servingValue <= 0 || ingredients.length === 0 || ingredients.some((item) => !Number.isFinite(Number(item.quantityG.replace(',', '.'))) || Number(item.quantityG.replace(',', '.')) <= 0 || !Number.isFinite(item.carbs))) { setMessage('Adj meg nevet, adagszámot és érvényes, CH-adattal rendelkező hozzávalókat.'); return }
    const payload = { name: name.trim(), instructions: instructions.trim() || undefined, prep_minutes: prep.trim() ? Number(prep) : undefined, servings: servingValue, total_weight_g: weightValue, ingredients: ingredients.map((item) => ({ food_id: item.foodId ?? undefined, custom_food_id: item.customFoodId ?? undefined, quantity_g: Number(item.quantityG.replace(',', '.')) })) }
    try { const saved = authenticated ? (recipe ? await updateRecipe(recipe.id, payload) : await createRecipe(payload)) : ({ id: recipe?.id ?? crypto.randomUUID(), name: payload.name, instructions: payload.instructions ?? null, prepMinutes: payload.prep_minutes ?? null, notes: null, servings: servingValue, totalWeightG: weightValue ?? null, totalCarbsG: total, carbsPerServingG: perServing, carbsPer100gCookedG: weightValue ? total / weightValue * 100 : null, isFavorite: recipe?.isFavorite ?? false, ingredients: ingredients.map((item, index) => ({ id: item.id, foodId: item.foodId, customFoodId: item.customFoodId, quantityG: Number(item.quantityG.replace(',', '.')), calculatedCarbsG: Number(item.quantityG.replace(',', '.')) * item.carbs / 100, snapshot: { name: item.name, available_carbs_100g: item.carbs }, position: index })), createdAt: recipe?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() } as Recipe)
      if (!authenticated) await saveGuestRecipe(saved); onSaved(saved); onClose()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'A recept mentése nem sikerült.') }
  }
  return <section className="catalog-card recipe-editor"><div className="section-heading"><h2>{recipe ? 'Recept szerkesztése' : 'Új recept'}</h2><button className="secondary-action compact-action" onClick={cancel}>Mégse</button></div><label className="goal-input"><span>Recept neve</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="goal-input"><span>Elkészítés és leírás</span><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} /></label><div className="recipe-fields"><label className="goal-input"><span>Elkészítés (perc)</span><input inputMode="numeric" value={prep} onChange={(event) => setPrep(event.target.value)} /></label><label className="goal-input"><span>Adagok</span><input inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} /></label><label className="goal-input"><span>Főtt össztömeg (g, opcionális)</span><input inputMode="decimal" value={totalWeight} onChange={(event) => setTotalWeight(event.target.value)} /></label></div><div className="ingredient-picker"><h3>Hozzávalók</h3><input value={ingredientQuery} onChange={(event) => setIngredientQuery(event.target.value)} placeholder="Keresés külső ételek között" />{ingredientQuery.trim().length >= 2 && (result.data ?? []).slice(0, 5).map((item) => <button className="catalog-row" key={item.id} onClick={() => addIngredient(item)}>{item.name}<small>{item.availableCarbs100g == null ? 'CH nincs' : formatCarbohydrate(item.availableCarbs100g) + ' g/100 g'}</small></button>)}{foods.map((item) => <button className="catalog-row" key={'custom-' + item.id} onClick={() => addCustom(item)}>Saját · {item.name}<small>{formatCarbohydrate(item.availableCarbs100g)} g/100 g</small></button>)}</div>{ingredients.map((item, index) => <div className="ingredient-line" key={item.id}><span><strong>{item.name}</strong><small>{formatCarbohydrate(item.carbs)} g CH / 100 g</small></span><input inputMode="decimal" aria-label={item.name + ' mennyisége'} value={item.quantityG} onChange={(event) => setIngredients((current) => current.map((entry, i) => i === index ? { ...entry, quantityG: event.target.value } : entry))} /><button className="secondary-action compact-action" onClick={() => setIngredients((current) => current.filter((_, i) => i !== index))}>Törlés</button></div>)}<div className="recipe-total"><strong>Összesen {formatCarbohydrate(total)} g CH</strong><span>{formatCarbohydrate(perServing)} g CH / adag{totalWeight.trim() ? ` · ${formatCarbohydrate(total / Number(totalWeight.replace(',', '.')) * 100)} g/100 g főtt` : ''}</span></div>{message && <p className="input-error" role="alert">{message}</p>}<button className="confirm-button" onClick={() => void save()}>Recept mentése <Check size={18} /></button></section>
}

function CatalogScreen({ authenticated }: { authenticated: boolean }) {
  const [foods, setFoods] = useState<CustomFood[]>([]); const [recipes, setRecipes] = useState<Recipe[]>([]); const [name, setName] = useState(''); const [carbs, setCarbs] = useState(''); const [editingId, setEditingId] = useState<string | null>(null); const [editingRecipe, setEditingRecipe] = useState<Recipe | null | undefined>(); const [message, setMessage] = useState<string | null>(null)
  const load = async () => { try { setFoods(authenticated ? await listCustomFoods() : await listGuestCustomFoods()); setRecipes(authenticated ? await listRecipes() : await listGuestRecipes()) } catch (error) { setMessage(error instanceof Error ? error.message : 'A saját katalógus nem érhető el.') } }
  useEffect(() => { void load() }, [authenticated])
  const addFood = async () => { const value = Number(carbs.replace(',', '.')); if (!name.trim() || !Number.isFinite(value) || value < 0 || value > 100) { setMessage('Adj meg nevet és 0–100 közötti CH/100 g értéket.'); return }; const now = new Date().toISOString(); const item: CustomFood = { id: editingId ?? crypto.randomUUID(), name: name.trim(), brand: null, availableCarbs100g: value, dietaryFiber100g: null, servingSizeG: null, notes: null, isFavorite: false, createdAt: now, updatedAt: now }; try { const existing = editingId ? foods.find((food) => food.id === editingId) : undefined; if (authenticated) { if (editingId) await updateCustomFood(editingId, { name: item.name, available_carbs_100g: value }); else await createCustomFood({ name: item.name, available_carbs_100g: value }) } else await saveGuestCustomFood({ ...item, isFavorite: existing?.isFavorite ?? false, createdAt: existing?.createdAt ?? now }); setName(''); setCarbs(''); setEditingId(null); setMessage(editingId ? 'Saját étel módosítva.' : 'Saját étel mentve.'); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A mentés nem sikerült.') } }
  const removeFood = async (id: string) => { if (authenticated) await deleteCustomFood(id); else await deleteGuestCustomFood(id); await load() }
  const editFood = (item: CustomFood) => { setEditingId(item.id); setName(item.name); setCarbs(String(item.availableCarbs100g)) }
  const toggleFoodFavorite = async (item: CustomFood) => { if (authenticated) await favoriteCustomFood(item.id); else await saveGuestCustomFood({ ...item, isFavorite: !item.isFavorite, updatedAt: new Date().toISOString() }); await load() }
  const removeRecipe = async (id: string) => { if (authenticated) await deleteRecipe(id); else await deleteGuestRecipe(id); await load() }
  const toggleRecipe = async (recipe: Recipe) => { if (authenticated) await favoriteRecipe(recipe.id); else await saveGuestRecipe({ ...recipe, isFavorite: !recipe.isFavorite, updatedAt: new Date().toISOString() }); await load() }
  const logRecipe = async (recipe: Recipe) => { try { const plan: Plan = { id: crypto.randomUUID(), planDate: localDateInTimezone(), mealCategory: 'other', foodId: null, customFoodId: null, recipeId: recipe.id, quantity: 1, quantityUnit: 'servings', plannedCarbsG: recipe.carbsPerServingG, snapshot: { name: recipe.name, source: 'recipe', source_id: recipe.id, servings: recipe.servings }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; if (authenticated) await logRecipeMeal(recipe.id, { quantity: 1, quantity_unit: 'servings', local_date: plan.planDate, meal_category: 'other', idempotency_key: crypto.randomUUID() }); else await createGuestMealFromPlan(plan, plan.planDate); setMessage('A recept bekerült a naplóba.') } catch (error) { setMessage(error instanceof Error ? error.message : 'A recept naplózása nem sikerült.') } }
  if (editingRecipe !== undefined) return <main className="screen catalog-screen"><RecipeEditor authenticated={authenticated} foods={foods} recipe={editingRecipe ?? undefined} onClose={() => setEditingRecipe(undefined)} onSaved={() => { void load() }} /></main>
  return <main className="screen catalog-screen"><p className="eyebrow">Ételek</p><h1>Saját ételek és receptek</h1><p className="goal-help">{authenticated ? 'A fiókodhoz kötött adatok PostgreSQL-ben tárolódnak.' : 'Vendég módban minden adat ezen az eszközön, IndexedDB-ben marad.'}</p><section className="catalog-card"><h2>{editingId ? 'Saját étel szerkesztése' : 'Saját étel'}</h2><div className="goal-input"><span>Megnevezés</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Pl. házi zabkása" /></div><div className="goal-input"><span>CH / 100 g</span><input inputMode="decimal" value={carbs} onChange={(event) => setCarbs(event.target.value)} placeholder="12,5" /></div><button className="confirm-button" onClick={() => void addFood()}>{editingId ? 'Módosítás mentése' : 'Étel mentése'} <Plus size={18} /></button></section><section className="catalog-card"><div className="section-heading"><h2>Saját ételek</h2><span className="entry-count">{foods.length}</span></div>{foods.map((food) => <div className="catalog-row" key={food.id}><span><strong>{food.name}</strong><small>{formatCarbohydrate(food.availableCarbs100g)} g CH / 100 g</small></span><span className="catalog-actions"><button onClick={() => void toggleFoodFavorite(food)} aria-label="Kedvenc">{food.isFavorite ? '★' : '☆'}</button><button onClick={() => editFood(food)} aria-label="Szerkesztés"><Pencil size={16} /></button><button onClick={() => void removeFood(food.id)} aria-label="Törlés"><Trash2 size={16} /></button></span></div>)}</section><section className="catalog-card"><div className="section-heading"><h2>Receptek</h2><button className="secondary-action compact-action" onClick={() => setEditingRecipe(null)}>Új recept <Plus size={15} /></button></div>{recipes.length === 0 && <p className="search-state">Még nincs saját recept.</p>}{recipes.map((recipe) => <div className="catalog-row" key={recipe.id}><button className="catalog-main-button" onClick={() => setEditingRecipe(recipe)}><span><strong>{recipe.name}</strong><small>{formatCarbohydrate(recipe.totalCarbsG)} g CH összesen · {formatCarbohydrate(recipe.carbsPerServingG)} g/adag{recipe.carbsPer100gCookedG != null ? ` · ${formatCarbohydrate(recipe.carbsPer100gCookedG)} g/100 g főtt` : ''}</small></span></button><span className="catalog-actions"><button onClick={() => void toggleRecipe(recipe)} aria-label="Recept kedvenc">{recipe.isFavorite ? '★' : '☆'}</button><button onClick={() => void logRecipe(recipe)} aria-label="Recept naplózása"><Check size={16} /></button><button onClick={() => void removeRecipe(recipe.id)} aria-label="Recept törlése"><Trash2 size={16} /></button></span></div>)}</section>{message && <p className="goal-help" role="status">{message}</p>}</main>
}
function PlannerScreen({ authenticated, today }: { authenticated: boolean; today: string }) {
  const [weekStart, setWeekStart] = useState(() => { const value = new Date(today + 'T12:00:00'); const day = value.getDay() || 7; value.setDate(value.getDate() - day + 1); return localDateInTimezone(value) })
  const [selectedDate, setSelectedDate] = useState(today)
  const [plans, setPlans] = useState<Plan[]>([]); const [shopping, setShopping] = useState<ShoppingItem[]>([]); const [foods, setFoods] = useState<CustomFood[]>([]); const [recipes, setRecipes] = useState<Recipe[]>([]); const [meals, setMeals] = useState<Meal[]>([]); const [goal, setGoal] = useState<GoalSummary>(); const [source, setSource] = useState(''); const [message, setMessage] = useState<string | null>(null)
  const endDate = (start: string) => { const value = new Date(start + 'T12:00:00'); value.setDate(value.getDate() + 6); return localDateInTimezone(value) }
  const days = Array.from({ length: 7 }, (_, index) => { const value = new Date(weekStart + 'T12:00:00'); value.setDate(value.getDate() + index); return localDateInTimezone(value) })
  const load = async () => { try { const end = endDate(weekStart); const allPlans = authenticated ? await listPlans(weekStart, end) : await listGuestPlans(); setPlans(allPlans.filter((item) => item.planDate >= weekStart && item.planDate <= end)); setShopping(authenticated ? await listShopping() : await listGuestShopping()); setFoods(authenticated ? await listCustomFoods() : await listGuestCustomFoods()); setRecipes(authenticated ? await listRecipes() : await listGuestRecipes()); setMeals(authenticated ? (await listMeals(selectedDate)).items : (await listGuestMeals(selectedDate, today)).items); setGoal(authenticated ? await getGoalSummary(selectedDate) : await getGuestSummary(selectedDate, today)) } catch (error) { setMessage(error instanceof Error ? error.message : 'A tervező nem érhető el.') } }
  useEffect(() => { void load() }, [authenticated, weekStart, selectedDate])
  const add = async () => { const selectedRecipe = source.startsWith('recipe:') ? recipes.find((item) => item.id === source.slice(7)) : undefined; const selectedFood = source.startsWith('food:') ? foods.find((item) => item.id === source.slice(5)) : undefined; if (!selectedRecipe && !selectedFood) { setMessage('Válassz saját ételt vagy receptet.'); return }; const now = new Date().toISOString(); const quantity = selectedRecipe ? 1 : 100; const quantityUnit = selectedRecipe ? 'servings' : 'g'; const item: Plan = { id: crypto.randomUUID(), planDate: selectedDate, mealCategory: 'other', foodId: null, customFoodId: selectedFood?.id ?? null, recipeId: selectedRecipe?.id ?? null, quantity, quantityUnit, plannedCarbsG: selectedRecipe?.carbsPerServingG ?? selectedFood?.availableCarbs100g ?? 0, snapshot: { name: selectedRecipe?.name ?? selectedFood?.name, source: selectedRecipe ? 'recipe' : 'custom', source_id: selectedRecipe?.id ?? selectedFood?.id }, createdAt: now, updatedAt: now }; try { if (authenticated) await createPlan({ plan_date: selectedDate, meal_category: 'other', custom_food_id: item.customFoodId ?? undefined, recipe_id: item.recipeId ?? undefined, quantity, quantity_unit: quantityUnit }); else await saveGuestPlan(item); setSource(''); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A mentés nem sikerült.') } }
  const removePlanItem = async (id: string) => { if (authenticated) await deletePlan(id); else await deleteGuestPlan(id); await load() }
  const movePlan = async (plan: Plan, target: string) => { try { if (authenticated) await updatePlan(plan.id, { plan_date: target }); else await saveGuestPlan({ ...plan, planDate: target, updatedAt: new Date().toISOString() }); await load(); setMessage('A terv áthelyezve.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Az áthelyezés nem sikerült.') } }
  const copy = async (plan: Plan, target: string) => { try { if (authenticated) await copyPlan(plan.id, target); else { const exists = plans.some((item) => item.planDate === target && item.snapshot.name === plan.snapshot.name && item.quantity === plan.quantity && item.quantityUnit === plan.quantityUnit); if (!exists) await saveGuestPlan({ ...plan, id: crypto.randomUUID(), planDate: target, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) }; await load(); setMessage('A terv másolva.') } catch (error) { setMessage(error instanceof Error ? error.message : 'A másolás nem sikerült.') } }
  const logPlan = async (plan: Plan) => { try { if (authenticated) await logPlanMeal(plan.id, { idempotency_key: crypto.randomUUID(), local_date: selectedDate }); else await createGuestMealFromPlan(plan, selectedDate); setMessage('A tervezett étkezés bekerült a naplóba.'); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A naplózás nem sikerült.') } }
  const addShopping = async () => { const now = new Date().toISOString(); const item: ShoppingItem = { id: crypto.randomUUID(), name: 'Új bevásárlótétel', quantity: 1, unit: 'db', checked: false, source: 'manual', createdAt: now, updatedAt: now }; try { if (authenticated) await createShopping({ name: item.name, quantity: item.quantity, unit: item.unit }); else await saveGuestShopping(item); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A mentés nem sikerült.') } }
  const generate = async () => { try { if (authenticated) await generateShopping(weekStart, endDate(weekStart)); else { const grouped = new Map<string, number>(); plans.forEach((plan) => { const name = String(plan.snapshot.name ?? 'Élelmiszer'); grouped.set(name, (grouped.get(name) ?? 0) + plan.quantity) }); const plannerItems = shopping.filter((item) => item.source === 'planner'); for (const item of plannerItems) { if (!grouped.has(item.name)) await deleteGuestShopping(item.id) }; for (const [name, quantity] of grouped) { const existing = plannerItems.find((item) => item.name === name && item.unit === 'g'); if (existing) await saveGuestShopping({ ...existing, quantity, checked: false, updatedAt: new Date().toISOString() }); else await saveGuestShopping({ id: crypto.randomUUID(), name, quantity, unit: 'g', checked: false, source: 'planner', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) } }; await load(); setMessage('A heti bevásárlólista frissítve.') } catch (error) { setMessage(error instanceof Error ? error.message : 'A lista generálása nem sikerült.') } }
  const toggleShopping = async (item: ShoppingItem) => { const updated = { ...item, checked: !item.checked, updatedAt: new Date().toISOString() }; if (authenticated) await updateShopping(item.id, { checked: updated.checked }); else await saveGuestShopping(updated); await load() }
  const removeShopping = async (id: string) => { if (authenticated) await deleteShopping(id); else await deleteGuestShopping(id); await load() }
  const selectedPlans = plans.filter((item) => item.planDate === selectedDate); const planned = selectedPlans.reduce((sum, item) => sum + item.plannedCarbsG, 0); const actual = meals.reduce((sum, item) => sum + item.calculatedCarbsG, 0)
  return <main className="screen planner-screen"><p className="eyebrow">Tervező</p><h1>Heti étkezési terv</h1><section className="catalog-card week-card"><div className="section-heading"><button className="secondary-action compact-action" onClick={() => { const value = new Date(weekStart + 'T12:00:00'); value.setDate(value.getDate() - 7); setWeekStart(localDateInTimezone(value)) }}>‹ Előző hét</button><strong>{weekStart} – {endDate(weekStart)}</strong><button className="secondary-action compact-action" onClick={() => { const value = new Date(weekStart + 'T12:00:00'); value.setDate(value.getDate() + 7); setWeekStart(localDateInTimezone(value)) }}>Következő ›</button></div><div className="week-days">{days.map((day) => <button key={day} className={'week-day ' + (day === selectedDate ? 'active' : '') + ' ' + (day === today ? 'today' : '')} onClick={() => setSelectedDate(day)}><strong>{new Intl.DateTimeFormat('hu-HU', { weekday: 'short' }).format(new Date(day + 'T12:00:00'))}</strong><span>{new Intl.DateTimeFormat('hu-HU', { day: 'numeric', month: 'numeric' }).format(new Date(day + 'T12:00:00'))}</span></button>)}</div><p className="planner-summary">{selectedDate}: {formatCarbohydrate(planned)} g tervezett · {formatCarbohydrate(actual)} g tényleges{goal?.dailyTargetG != null ? ` · ${formatCarbohydrate(goal.dailyTargetG)} g cél` : ` · nincs cél beállítva`}</p></section><section className="catalog-card"><div className="section-heading"><h2>{selectedDate}</h2><button className="secondary-action compact-action" onClick={() => void add()}>Terv hozzáadása <Plus size={15} /></button></div><select className="planner-select" value={source} onChange={(event) => setSource(event.target.value)}><option value="">Saját étel vagy recept…</option>{foods.map((item) => <option value={'food:' + item.id} key={'food:' + item.id}>Étel · {item.name}</option>)}{recipes.map((item) => <option value={'recipe:' + item.id} key={'recipe:' + item.id}>Recept · {item.name}</option>)}</select>{selectedPlans.length === 0 && <p className="search-state">Még nincs tervezett étkezés erre a napra.</p>}{selectedPlans.map((plan) => <div className="catalog-row" key={plan.id}><span><strong>{String(plan.snapshot.name ?? 'Tervezett étkezés')}</strong><small>{formatCarbohydrate(plan.plannedCarbsG)} g CH · {plan.quantity} {plan.quantityUnit}</small></span><span className="catalog-actions"><button onClick={() => void logPlan(plan)} aria-label="Terv rögzítése"><Check size={16} /></button><button onClick={() => void copy(plan, days[(days.indexOf(selectedDate) + 1) % days.length])} aria-label="Terv másolása a következő napra">⧉</button><button onClick={() => void movePlan(plan, today)} aria-label="Terv áthelyezése mára">↪</button><button onClick={() => void removePlanItem(plan.id)} aria-label="Terv törlése"><Trash2 size={16} /></button></span></div>)}</section><section className="catalog-card"><div className="section-heading"><h2>Bevásárlólista</h2><span className="catalog-actions"><button className="secondary-action compact-action" onClick={() => void generate()}>Heti lista frissítése</button><button className="secondary-action compact-action" onClick={() => void addShopping()}>Tétel <Plus size={15} /></button></span></div>{shopping.length === 0 && <p className="search-state">Üres lista.</p>}{shopping.map((item) => <div className="catalog-row" key={item.id}><span><strong className={item.checked ? 'shopping-checked' : ''}>{item.name}</strong><small>{item.quantity ?? ''} {item.unit}</small></span><span className="catalog-actions"><button onClick={() => void toggleShopping(item)} aria-label={item.name + ' kipipálása'}><Check size={16} /></button><button onClick={() => void removeShopping(item.id)} aria-label={item.name + ' törlése'}><Trash2 size={16} /></button></span></div>)}</section>{message && <p className="goal-help" role="status">{message}</p>}</main>
}
function ProfileScreen({ auth, onLogin, onRegister, onVerify, onLogout }: { auth?: AuthState; onLogin: (email: string, password: string) => Promise<void>; onRegister: (email: string, password: string) => Promise<AuthState>; onVerify: (token: string) => Promise<void>; onLogout: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setError(null); setMessage(null)
    try {
      if (mode === 'login') { await onLogin(email, password); setMessage('Sikeres bejelentkezĂ©s.') }
      else { const result = await onRegister(email, password); setMessage('A megerĹ‘sĂ­tĹ‘ email elkĂĽldĂ©sĂ©hez szĂĽksĂ©ges lĂ©pĂ©s elindult.'); if (result.verificationToken) setVerificationToken(result.verificationToken) }
    } catch (value) { setError(value instanceof Error ? value.message : 'A kĂ©rĂ©s nem sikerĂĽlt.') } finally { setBusy(false) }
  }
  const change = async () => { setBusy(true); setError(null); try { await changePassword(currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); setMessage('A jelszĂł mĂłdosĂ­tva.') } catch (value) { setError(value instanceof Error ? value.message : 'A jelszĂł mĂłdosĂ­tĂˇsa nem sikerĂĽlt.') } finally { setBusy(false) } }
  const forgot = async () => { setBusy(true); setError(null); try { const result = await requestPasswordReset(email); setMessage('Ha a cĂ­mhez tartozik fiĂłk, visszaĂˇllĂ­tĂł email kĂĽldhetĹ‘.'); if (result.resetToken) setResetToken(result.resetToken) } catch (value) { setError(value instanceof Error ? value.message : 'A kĂ©rĂ©s nem sikerĂĽlt.') } finally { setBusy(false) } }
  const reset = async () => { setBusy(true); setError(null); try { await resetPassword(resetToken, newPassword); setResetToken(''); setNewPassword(''); setMessage('A jelszĂł visszaĂˇllĂ­tva; most bejelentkezhetsz.') } catch (value) { setError(value instanceof Error ? value.message : 'A visszaĂˇllĂ­tĂˇs nem sikerĂĽlt.') } finally { setBusy(false) } }
  if (auth?.authenticated) return <main className="screen placeholder-screen profile-screen"><div className="placeholder-icon"><CircleUserRound size={26} /></div><p className="eyebrow">SajĂˇt profil Â· {auth.role}</p><h1>{auth.email}</h1><p>A naplĂł Ă©s a cĂ©lverziĂłk ehhez a felhasznĂˇlĂłi profilhoz tartoznak.</p><div className="goal-input"><span>Jelenlegi jelszĂł</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div><div className="goal-input"><span>Ăšj jelszĂł</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div>{(error || message) && <p className={error ? 'input-error' : 'goal-help'} role="alert">{error ?? message}</p>}<button className="confirm-button" onClick={() => void change()} disabled={busy || !currentPassword || !newPassword}>JelszĂł mĂłdosĂ­tĂˇsa</button><button className="secondary-action" onClick={() => void onLogout()} disabled={busy}>KijelentkezĂ©s</button></main>
  return <main className="screen placeholder-screen profile-screen"><div className="placeholder-icon"><CircleUserRound size={26} /></div><p className="eyebrow">VendĂ©g mĂłd</p><h1>Az adataid a bĂ¶ngĂ©szĹ‘ben maradnak.</h1><p>BejelentkezĂ©s nĂ©lkĂĽl a mai Ă©s az elĹ‘zĹ‘ kĂ©t nap naplĂłzhatĂł IndexedDB-ben. A bĂ¶ngĂ©szĹ‘ tĂˇrhelyĂ©nek tĂ¶rlĂ©se a vendĂ©g adatokat is tĂ¶rĂ¶lheti; rĂ©gebbi adatok importig megmaradnak, de nem lĂˇthatĂłk a vendĂ©g nĂ©zetben.</p><div className="goal-input"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="goal-input"><span>JelszĂł</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></div>{(error || message) && <p className={error ? 'input-error' : 'goal-help'} role="alert">{error ?? message}</p>}{verificationToken && <><p className="goal-help">FejlesztĹ‘i kĂ¶rnyezetben a megerĹ‘sĂ­tĹ‘ token lĂˇthatĂł; Ă©les kĂ¶rnyezetben email-kĂĽldĹ‘ adapter adja Ăˇt.</p><input className="goal-input" value={verificationToken} onChange={(event) => setVerificationToken(event.target.value)} aria-label="Email megerĹ‘sĂ­tĹ‘ token" /><button className="secondary-action" onClick={() => void onVerify(verificationToken)}>Email megerĹ‘sĂ­tĂ©se</button></>}<button className="confirm-button" onClick={() => void submit()} disabled={busy || !email || !password}>{mode === 'login' ? 'BejelentkezĂ©s' : 'RegisztrĂˇciĂł'}</button><button className="secondary-action" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setMessage(null) }}>{mode === 'login' ? 'Ăšj fiĂłk lĂ©trehozĂˇsa' : 'MĂˇr van fiĂłkom'}</button>{mode === 'login' && <><button className="secondary-action" onClick={() => void forgot()} disabled={busy || !email}>Elfelejtett jelszĂł</button>{resetToken && <><input className="goal-input" value={resetToken} onChange={(event) => setResetToken(event.target.value)} aria-label="JelszĂł-visszaĂˇllĂ­tĂł token" /><div className="goal-input"><span>Ăšj jelszĂł</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><button className="secondary-action" onClick={() => void reset()} disabled={busy || !newPassword}>JelszĂł visszaĂˇllĂ­tĂˇsa</button></>}</>}</main>
}

function BottomNavigation({ onAdd }: { onAdd: () => void }) { const location = useLocation(); const navigate = useNavigate(); return <nav className="bottom-nav" aria-label="FĹ‘ navigĂˇciĂł">{navItems.map(({ label, icon: Icon, to }) => <button key={to} className={'nav-item ' + ((to !== '__add__' && location.pathname === to) ? 'active' : '') + ' ' + (label === 'Hozzáadás' ? 'camera-item' : '')} onClick={() => to === '__add__' ? onAdd() : navigate(to)} aria-label={label}><span className="nav-icon"><Icon size={label === 'Hozzáadás' ? 20 : 19} strokeWidth={location.pathname === to ? 2.4 : 1.8} /></span><span>{label}</span></button>)}</nav> }
function PlaceholderScreen() { const location = useLocation(); const page = navItems.find((item) => item.to === location.pathname); const Icon = page?.icon ?? Sparkles; return <main className="screen placeholder-screen"><div className="placeholder-icon"><Icon size={26} /></div><p className="eyebrow">Hamarosan</p><h1>{page?.label ?? 'Ez az oldal'}<br />kĂ©szĂĽlĹ‘ben van.</h1><p>Az M3 a tartĂłs napi Ă©tkezĂ©si naplĂłra Ă¶sszpontosĂ­t. Ez a rĂ©sz egy kĂ¶vetkezĹ‘ mĂ©rfĂ¶ldkĹ‘ben Ă©rkezik.</p><Link className="back-home" to="/"><ArrowLeft size={17} /> Vissza a mĂˇhoz</Link></main> }
export default App












