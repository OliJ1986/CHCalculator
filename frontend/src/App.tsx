import { ArrowLeft, BookOpen, Camera, Check, ChevronRight, CircleUserRound, Heart, Minus, Moon, Pencil, Plus, Search, Sparkles, Sun, Trash2, Utensils, X } from './components/icons'
import { useEffect, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { calculateCarbohydrate, formatCarbohydrate, MAX_AMOUNT_GRAMS, parseAmountInput } from './lib/carbs'
import { searchFoods, type Food } from './api/foods'
import { createMeal, deleteMeal, listMeals, updateMeal, type Meal, type MealCategory } from './api/meals'
import { createCustomFood, createPlan, createRecipe, createShopping, deleteCustomFood, deletePlan, deleteRecipe, deleteShopping, listCustomFoods, listPlans, listRecipes, listShopping, type CustomFood, type Plan, type Recipe, type ShoppingItem } from './api/catalog'
import { getGoalSummary, saveGoal, type GoalSummary } from './api/goals'
import { changePassword, getAuthState, importGuestData, login, logout, register, requestPasswordReset, resetPassword, verifyEmail, type AuthState } from './api/auth'
import { clearGuestData, createGuestMeal, deleteGuestMeal, exportGuestData, getGuestSummary, guestWindowAllows, listGuestCustomFoods, listGuestMeals, listGuestPlans, listGuestRecipes, listGuestShopping, saveGuestCustomFood, saveGuestGoal, saveGuestPlan, saveGuestRecipe, saveGuestShopping, updateGuestMeal, deleteGuestCustomFood, deleteGuestPlan, deleteGuestRecipe, deleteGuestShopping } from './storage/guestStore'

const DEFAULT_TIMEZONE = 'Europe/Budapest'
const CATEGORY_LABELS: Record<MealCategory, string> = { breakfast: 'Reggeli', morning_snack: 'Tízórai', lunch: 'Ebéd', afternoon_snack: 'Uzsonna', dinner: 'Vacsora', other: 'Egyéb' }
const MEAL_CATEGORIES: MealCategory[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'other']
const navItems = [
  { label: 'Ma', icon: Sparkles, to: '/' }, { label: 'Receptek', icon: BookOpen, to: '/receptek' },
  { label: 'Kamera', icon: Camera, to: '/kamera' }, { label: 'Kedvencek', icon: Heart, to: '/kedvencek' },
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
    categoryLabel: 'Egyéb',
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
  const [toastMessage, setToastMessage] = useState('Mentve a naplóba')
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
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A mentés nem sikerült.'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { amount_g: number; food_id?: string; custom_food_id?: string; meal_category?: MealCategory } }) => updateMeal(id, payload),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); closeSheet(); showSavedToast() },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A módosítás nem sikerült.'),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteMeal,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); showSavedToast('Bejegyzés törölve') },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A törlés nem sikerült.'),
  })
  const goalMutation = useMutation({
    mutationFn: saveGoal,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); setIsGoalSheetOpen(false); showSavedToast('Cél mentve') },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A cél mentése nem sikerült.'),
  })
  const meals = mealsQuery.data?.items ?? []
  const total = mealsQuery.data?.totalCarbsG ?? 0
  const isSaving = createMutation.isPending || updateMutation.isPending

  function showSavedToast(message = 'Mentve a naplóba') {
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
      if (!guestWindowAllows(selectedDate, todayDate)) { setActionError('Vendég módban csak a mai és az előző két nap naplózható.'); return }
      if (editingMeal) {
        void updateGuestMeal(editingMeal.id, amountGrams, mealCategory).then(() => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); closeSheet(); showSavedToast() }).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'A módosítás nem sikerült.'))
      } else {
        void createGuestMeal(selectedFood, amountGrams, selectedDate, mealCategory).then(() => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); closeSheet(); showSavedToast() }).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'A mentés nem sikerült.'))
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
    if (window.confirm('Törlöd ezt: ' + meal.snapshot.name + '?')) {
      if (!authenticated) void deleteGuestMeal(meal.id).then(() => { void queryClient.invalidateQueries({ queryKey: ['meals', selectedDate] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); showSavedToast('Bejegyzés törölve') })
      else deleteMutation.mutate(meal.id)
    }
  }

  function saveGoalForMode(payload: { effective_date: string; daily_target_g: number | null; meal_targets: Partial<Record<MealCategory, number>>; allow_past: boolean }) {
    if (authenticated) { goalMutation.mutate(payload); return }
    void saveGuestGoal({ effectiveDate: payload.effective_date, dailyTargetG: payload.daily_target_g, mealTargets: payload.meal_targets, allowPast: payload.allow_past }).then(() => { void queryClient.invalidateQueries({ queryKey: ['goal-summary', selectedDate] }); setIsGoalSheetOpen(false); showSavedToast('Cél mentve') }).catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'A cél mentése nem sikerült.'))
  }

  async function loginAndOfferGuestImport(email: string, password: string) {
    await login(email, password)
    await authQuery.refetch()
    const guest = await exportGuestData()
    if (guest.meals.length === 0 && guest.goals.length === 0) return
    if (!window.confirm('A böngészőben talált vendég naplóadatokat importáljam a fiókodba?')) return
    await importGuestData({
      meals: guest.meals.map((meal) => ({ id: meal.id, consumed_at: meal.consumedAt, local_date: meal.localDate, timezone: meal.timezone, amount_g: meal.amountG, meal_category: meal.mealCategory, snapshot: { snapshot_version: meal.snapshot.snapshotVersion, captured_at: meal.snapshot.capturedAt, calculation_version: meal.snapshot.calculationVersion, unit: meal.snapshot.unit, name: meal.snapshot.name, original_name: meal.snapshot.originalName, brand: meal.snapshot.brand, source: meal.snapshot.source, source_id: meal.snapshot.sourceId, available_carbs_100g: meal.snapshot.availableCarbs100g, total_carbohydrate_100g: meal.snapshot.totalCarbohydrate100g, dietary_fiber_100g: meal.snapshot.dietaryFiber100g, nutrient_ids: meal.snapshot.nutrientIds, nutrient_values: meal.snapshot.nutrientValues, nutrient_provenance: meal.snapshot.nutrientProvenance, mapping_version: meal.snapshot.mappingVersion } })),
      goals: guest.goals.map((goal) => ({ effective_date: goal.effectiveDate, daily_target_g: goal.dailyTargetG, meal_targets: goal.mealTargets, allow_past: goal.allowPast })),
    })
    await clearGuestData()
  }

  return <div className={'app-shell ' + (darkMode ? 'theme-dark' : '')}>
    <div className="app-frame">
      <header className="topbar"><Link className="wordmark" to="/" aria-label="CHill kezdőlap"><span className="wordmark-ch">CH</span><span className="wordmark-rest">ill</span></Link><button className="theme-toggle" onClick={() => setDarkMode((mode) => !mode)} aria-label={darkMode ? 'Világos téma' : 'Sötét téma'}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button></header>
      <Routes><Route path="/" element={<HomeScreen date={selectedDate} todayDate={todayDate} guestMode={!authenticated} total={total} meals={meals} goal={goalQuery.data} isLoading={mealsQuery.isPending} isError={mealsQuery.isError} onAdd={() => openSheet()} onEdit={openSheet} onDelete={requestDelete} onDateChange={setSelectedDate} onGoal={() => { setActionError(null); setIsGoalSheetOpen(true) }} />} /><Route path="/receptek" element={<CatalogScreen authenticated={authenticated} />} /><Route path="/kedvencek" element={<PlannerScreen authenticated={authenticated} today={todayDate} />} /><Route path="/profil" element={<ProfileScreen auth={authQuery.data} onLogin={loginAndOfferGuestImport} onRegister={register} onVerify={async (token) => { await verifyEmail(token); await authQuery.refetch() }} onLogout={async () => { await logout(); await authQuery.refetch(); void queryClient.invalidateQueries({ queryKey: ['meals'] }); void queryClient.invalidateQueries({ queryKey: ['goal-summary'] }) }} />} /><Route path="*" element={<PlaceholderScreen />} /></Routes>
      <BottomNavigation />
    </div>
    {isSheetOpen && <AddMealSheet guestMode={!authenticated} mode={editingMeal ? 'edit' : 'create'} query={query} setQuery={setQuery} selectedFood={selectedFood} setSelectedFood={setSelectedFood} amount={amount} setAmount={setAmount} mealCategory={mealCategory} setMealCategory={setMealCategory} onClose={closeSheet} onAdd={saveMeal} isSaving={isSaving} error={actionError} />}
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
    <div className="date-line"><button className="date-nav" onClick={() => shiftDate(-1)} aria-label="Előző nap" disabled={!canPrevious}>‹</button><span className="date-dot" /><span className="date-label">{date === todayDate ? 'Ma · ' : ''}{new Intl.DateTimeFormat('hu-HU', { timeZone: DEFAULT_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(date + 'T12:00:00'))}</span><button className="date-nav" onClick={() => shiftDate(1)} aria-label="Következő nap" disabled={!canNext}>›</button></div>
    <section className="hero-section" aria-labelledby="daily-title"><div className="hero-copy"><p className="eyebrow">{target === null ? 'Napi összesen' : 'Fogyasztás'}</p><h1 id="daily-title"><span className="hero-total" key={total}>{formatCarbohydrate(total)}</span> <small>g CH</small></h1></div><p className="remaining"><span className="remaining-dot" />{target === null ? 'Nincs beállított napi cél' : remaining !== null && remaining < 0 ? 'Túllépés ' + formatCarbohydrate(Math.abs(remaining)) + ' g' : 'Még ' + formatCarbohydrate(remaining ?? 0) + ' g maradt'}</p>{target !== null && <div className="progress-wrap"><div className="progress-meta"><span>Napi cél</span><span>{formatCarbohydrate(target)} g</span></div><div className="progress-track"><div className="progress-fill" style={{ width: Math.min(progress ?? 0, 100) + '%' }} /></div></div>}</section>
    <div className="goal-actions"><button className="secondary-action" onClick={onGoal}>{target === null ? 'Napi cél beállítása' : 'Cél szerkesztése'}</button></div>
    {goal?.categories && <section className="category-summary" aria-label="Étkezési kategóriák"><div className="section-heading"><h2>Kategóriák</h2><span className="entry-count">{goal.categories.length} kategória</span></div><div className="category-summary-grid">{goal.categories.map((category) => <div className="category-summary-item" key={category.key}><span>{category.label}</span><strong>{formatCarbohydrate(category.consumedCarbsG)} g</strong>{category.targetG !== null && <small>/ {formatCarbohydrate(category.targetG)} g cél</small>}</div>)}</div></section>}
    <button className="add-meal-button" onClick={onAdd}><span className="add-icon"><Plus size={20} strokeWidth={2.5} /></span><span>Étkezés hozzáadása</span><ChevronRight size={19} className="button-arrow" /></button>
    <section className="entries-section" aria-labelledby="entries-title"><div className="section-heading"><h2 id="entries-title">{date === todayDate ? 'Mai' : 'Napi'} bejegyzések</h2><span className="entry-count">{meals.length} étkezés</span></div><div className="entries-list">{isLoading && <p className="search-state">Napló betöltése…</p>}{isError && <p className="search-state error">A napló most nem érhető el. Próbáld újra később.</p>}{!isLoading && !isError && meals.length === 0 && <p className="search-state">Még nincs mentett étkezés erre a napra.</p>}{meals.map((meal) => <MealRow meal={meal} key={meal.id} onEdit={onEdit} onDelete={onDelete} />)}</div></section>
  </main>
}

function MealRow({ meal, onEdit, onDelete }: { meal: Meal; onEdit: (meal: Meal) => void; onDelete: (meal: Meal) => void }) {
  return <article className="meal-row"><span className="meal-marker lime"><Utensils size={15} /></span><div className="meal-info"><div className="meal-meta"><span>{CATEGORY_LABELS[meal.mealCategory as MealCategory] ?? CATEGORY_LABELS.other}</span><span className="meal-time">{mealTime(meal)}</span></div><h3>{meal.snapshot.name}</h3></div><div className="meal-carbs"><strong>{formatCarbohydrate(meal.calculatedCarbsG)}</strong><span>g CH</span></div><div className="meal-actions"><button onClick={() => onEdit(meal)} aria-label={meal.snapshot.name + ' szerkesztése'}><Pencil size={16} /></button><button onClick={() => onDelete(meal)} aria-label={meal.snapshot.name + ' törlése'}><Trash2 size={16} /></button></div></article>
}

function AddMealSheet({ guestMode, mode, query, setQuery, selectedFood, setSelectedFood, amount, setAmount, mealCategory, setMealCategory, onClose, onAdd, isSaving, error }: { guestMode: boolean; mode: 'create' | 'edit'; query: string; setQuery: (value: string) => void; selectedFood: Food | null; setSelectedFood: (food: Food | null) => void; amount: string; setAmount: (value: string) => void; mealCategory: MealCategory; setMealCategory: (value: MealCategory) => void; onClose: () => void; onAdd: () => void; isSaving: boolean; error: string | null }) {
  const normalizedQuery = query.trim()
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => { const timeout = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 300); return () => window.clearTimeout(timeout) }, [normalizedQuery])
  const isDebouncing = normalizedQuery.length >= 2 && debouncedQuery !== normalizedQuery
  const searchQuery = useQuery({ queryKey: ['foods', debouncedQuery], queryFn: ({ signal }) => searchFoods(debouncedQuery, signal), enabled: debouncedQuery.length >= 2, staleTime: 60_000 })
  const customQuery = useQuery({ queryKey: ['custom-foods', debouncedQuery, guestMode], queryFn: () => guestMode ? listGuestCustomFoods(debouncedQuery) : listCustomFoods(debouncedQuery), enabled: debouncedQuery.length >= 2, staleTime: 30_000 })
  const customFoods = (customQuery.data ?? []).map((item): Food => ({ id: `custom-${item.id}`, name: item.name, originalName: null, brand: item.brand, barcode: null, source: 'custom', sourceId: item.id, availableCarbs100g: item.availableCarbs100g, servingSizeG: item.servingSizeG, imageUrl: null, language: 'hu', country: null, isGeneric: false, isVerified: true, category: 'custom', categoryLabel: 'Saját étel', carbsAvailable: true }))
  const foods = isDebouncing ? [] : [...customFoods, ...(searchQuery.data ?? [])]
  const amountGrams = parseAmountInput(amount)
  const amountError = !amount.trim() ? 'Adj meg egy mennyiséget grammban.' : amountGrams === null ? 'A mennyiség 0-nál nagyobb és legfeljebb ' + MAX_AMOUNT_GRAMS.toLocaleString('hu-HU') + ' g lehet.' : null
  const carbs = selectedFood && amountGrams !== null ? calculateCarbohydrate(amountGrams, selectedFood.availableCarbs100g) : null
  const adjustAmount = (delta: number) => { const current = amountGrams ?? 0; const next = Math.min(MAX_AMOUNT_GRAMS, Math.max(0, current + delta)); setAmount(next > 0 ? String(next) : '') }
  return <div className="sheet-backdrop" onMouseDown={isSaving ? undefined : onClose}><section className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><div><p className="eyebrow">{mode === 'edit' ? 'Bejegyzés szerkesztése' : 'Új bejegyzés · 1 / 2'}</p><h2 id="sheet-title">{selectedFood ? 'Mennyit ettél?' : 'Mit ettél?'}</h2></div><button className="close-button" onClick={onClose} aria-label="Bezárás" disabled={isSaving}><X size={20} /></button></div>
    {!selectedFood ? <><label className="search-field"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keress egy ételt…" aria-label="Étel keresése" /></label><div className="food-list">{normalizedQuery.length < 2 && <p className="search-state">Írj be legalább 2 karaktert a kereséshez.</p>}{normalizedQuery.length >= 2 && (isDebouncing || searchQuery.isPending) && <p className="search-state">Keresés…</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isError && <p className="search-state error">Az ételkeresés most nem elérhető. Próbáld újra később.</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isSuccess && foods.length === 0 && <p className="search-state">Nincs találat erre a keresésre.</p>}{foods.map((food) => <button className="food-option" key={food.id} onClick={() => food.carbsAvailable && setSelectedFood(food)} disabled={!food.carbsAvailable} aria-disabled={!food.carbsAvailable}><FoodMedia food={food} /><span className="food-copy"><strong>{food.name}</strong>{food.originalName && food.originalName !== food.name && <small className="food-source-name">{food.originalName}</small>}<small className="food-kind">{food.categoryLabel}</small>{food.brand && <small>{food.brand}</small>}{food.carbsAvailable ? <small>{formatCarbohydrate(food.availableCarbs100g!)} g CH / 100 g</small> : <small className="unavailable">CH adat nem elérhető</small>}</span><ChevronRight size={18} /></button>)}</div></> : <div className="amount-step"><button className="selected-food-card" onClick={() => setSelectedFood(null)} disabled={isSaving}><FoodMedia food={selectedFood} /><span><strong>{selectedFood.name}</strong>{selectedFood.originalName && selectedFood.originalName !== selectedFood.name && <small className="food-source-name">{selectedFood.originalName}</small>}<small className="food-kind">{selectedFood.categoryLabel}</small>{selectedFood.brand && <small>{selectedFood.brand}</small>}<small>{formatCarbohydrate(selectedFood.availableCarbs100g!)} g CH / 100 g</small></span><ArrowLeft size={18} /></button><label className="category-field"><span>Étkezés</span><select value={mealCategory} onChange={(event) => setMealCategory(event.target.value as MealCategory)} disabled={isSaving}>{MEAL_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select></label><div className="amount-label"><span>Mennyiség</span><small>grammban</small></div><div className="amount-control"><button onClick={() => adjustAmount(-5)} aria-label="5 grammal kevesebb" disabled={isSaving}><Minus size={21} /></button><label><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Mennyiség grammban" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? 'amount-error' : undefined} disabled={isSaving} /><span>g</span></label><button onClick={() => adjustAmount(5)} aria-label="5 grammal több" disabled={isSaving}><Plus size={21} /></button></div>{amountError && <p id="amount-error" className="input-error" role="alert">{amountError}</p>}{error && <p className="input-error" role="alert">{error}</p>}<div className="quick-amounts"><span>Gyors választás</span>{[50, 100, 150].map((value) => <button key={value} className={amountGrams === value ? 'active' : ''} onClick={() => setAmount(String(value))} disabled={isSaving}>{value} g</button>)}</div>{carbs !== null ? <div className="calculation-result"><div><p className="eyebrow">Ezzel a mennyiséggel</p><strong>{formatCarbohydrate(carbs)} <small>g CH</small></strong></div><span className="result-check"><Check size={18} /></span></div> : <p className="calculation-error" role="status">A CH csak érvényes mennyiség és elérhető tápérték mellett számítható.</p>}<button className="confirm-button" onClick={onAdd} disabled={carbs === null || isSaving}>{isSaving ? 'Mentés…' : mode === 'edit' ? 'Mentés' : 'Mentés a naplóba'} <Plus size={19} /></button></div>}
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
    if (past && !confirmPast) { setLocalError('Jelöld meg, hogy szándékosan korábbi nap célját módosítod.'); return }
    const dailyValue = daily.trim() ? Number(daily.replace(',', '.')) : null
    if (dailyValue !== null && (!Number.isFinite(dailyValue) || dailyValue <= 0)) { setLocalError('A napi cél 0-nál nagyobb, véges szám legyen.'); return }
    const mealTargets: Partial<Record<MealCategory, number>> = {}
    for (const category of MEAL_CATEGORIES) { const value = targets[category]; if (value?.trim()) { const number = Number(value.replace(',', '.')); if (!Number.isFinite(number) || number <= 0) { setLocalError('A rész-célok 0-nál nagyobb, véges számok legyenek.'); return }; mealTargets[category] = number } }
    setLocalError(null); onSave({ effective_date: localDate, daily_target_g: dailyValue, meal_targets: mealTargets, allow_past: past })
  }
  return <div className="sheet-backdrop" onMouseDown={isSaving ? undefined : onClose}><section className="add-sheet goal-sheet" role="dialog" aria-modal="true" aria-labelledby="goal-title" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><div><p className="eyebrow">{past ? 'Korábbi nap célja' : 'Felhasználói cél'}</p><h2 id="goal-title">{past ? localDate : 'Napi CH-cél'}</h2></div><button className="close-button" onClick={onClose} disabled={isSaving} aria-label="Bezárás"><X size={20} /></button></div>{past && <label className="goal-confirm"><input type="checkbox" checked={confirmPast} onChange={(event) => setConfirmPast(event.target.checked)} disabled={isSaving} /> Tudatosan módosítom ennek a korábbi napnak a célját.</label>}<label className="goal-input"><span>Napi cél grammban</span><input inputMode="decimal" value={daily} onChange={(event) => setDaily(event.target.value)} placeholder="Nincs cél" disabled={isSaving} /></label><p className="goal-help">Üresen hagyva nincs napi cél; ilyenkor az összeg látható marad, de nincs százalék vagy maradék.</p><div className="goal-targets"><p className="eyebrow">Opcionális étkezési rész-célok</p>{MEAL_CATEGORIES.map((category) => <label className="goal-input" key={category}><span>{CATEGORY_LABELS[category]}</span><input inputMode="decimal" value={targets[category] ?? ''} onChange={(event) => setTargets((current) => ({ ...current, [category]: event.target.value }))} placeholder="—" disabled={isSaving} /></label>)}{targetMismatch && <p className="goal-help">A rész-célok összege eltér a napi céltól; a megadott értékek változatlanul maradnak.</p>}</div>{(localError || error) && <p className="input-error" role="alert">{localError || error}</p>}<button className="confirm-button" onClick={submit} disabled={isSaving}>{isSaving ? 'Mentés…' : 'Cél mentése'} <Check size={19} /></button></section></div>
}

function FoodMedia({ food }: { food: Food }) { return food.imageUrl ? <span className="food-media"><img className="food-image" src={food.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span className="food-icon" aria-hidden="true"><Utensils size={20} /></span></span> : <span className="food-icon" aria-hidden="true"><Utensils size={20} /></span> }

function CatalogScreen({ authenticated }: { authenticated: boolean }) {
  const [foods, setFoods] = useState<CustomFood[]>([]); const [recipes, setRecipes] = useState<Recipe[]>([]); const [name, setName] = useState(''); const [carbs, setCarbs] = useState(''); const [message, setMessage] = useState<string | null>(null)
  const load = async () => { try { setFoods(authenticated ? await listCustomFoods() : await listGuestCustomFoods()); setRecipes(authenticated ? await listRecipes() : await listGuestRecipes()) } catch (error) { setMessage(error instanceof Error ? error.message : 'A saját katalógus nem érhető el.') } }
  useEffect(() => { void load() }, [authenticated])
  const addFood = async () => { const value = Number(carbs.replace(',', '.')); if (!name.trim() || !Number.isFinite(value) || value < 0 || value > 100) { setMessage('Adj meg nevet és 0–100 közötti CH/100 g értéket.'); return }; const now = new Date().toISOString(); const item: CustomFood = { id: crypto.randomUUID(), name: name.trim(), brand: null, availableCarbs100g: value, dietaryFiber100g: null, servingSizeG: null, notes: null, isFavorite: false, createdAt: now, updatedAt: now }; try { if (authenticated) await createCustomFood({ name: item.name, available_carbs_100g: value }); else await saveGuestCustomFood(item); setName(''); setCarbs(''); setMessage('Saját étel mentve.'); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A mentés nem sikerült.') } }
  const removeFood = async (id: string) => { if (authenticated) await deleteCustomFood(id); else await deleteGuestCustomFood(id); await load() }
  const addRecipe = async () => { const source = foods[0]; if (!source) { setMessage('Előbb hozz létre legalább egy saját ételt.'); return }; const now = new Date().toISOString(); const item: Recipe = { id: crypto.randomUUID(), name: `${source.name} recept`, instructions: null, prepMinutes: null, notes: null, servings: 1, totalWeightG: 100, totalCarbsG: source.availableCarbs100g, carbsPerServingG: source.availableCarbs100g, isFavorite: false, ingredients: [{ id: crypto.randomUUID(), foodId: null, customFoodId: source.id, quantityG: 100, calculatedCarbsG: source.availableCarbs100g, snapshot: { name: source.name, source: 'custom', source_id: source.id, available_carbs_100g: source.availableCarbs100g }, position: 0 }], createdAt: now, updatedAt: now }; try { if (authenticated) await createRecipe({ name: item.name, servings: 1, total_weight_g: 100, ingredients: [{ custom_food_id: source.id, quantity_g: 100 }] }); else await saveGuestRecipe(item); setMessage('Recept mentve.'); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A recept mentése nem sikerült.') } }
  const removeRecipe = async (id: string) => { if (authenticated) await deleteRecipe(id); else await deleteGuestRecipe(id); await load() }
  return <main className="screen catalog-screen"><p className="eyebrow">Saját katalógus</p><h1>Ételek és receptek</h1><p className="goal-help">{authenticated ? 'A fiókodhoz kötött adatok PostgreSQL-ben tárolódnak.' : 'Vendég módban minden adat ezen az eszközön, IndexedDB-ben marad.'}</p><section className="catalog-card"><h2>Saját étel</h2><div className="goal-input"><span>Megnevezés</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Pl. házi zabkása" /></div><div className="goal-input"><span>CH / 100 g</span><input inputMode="decimal" value={carbs} onChange={(event) => setCarbs(event.target.value)} placeholder="12,5" /></div><button className="confirm-button" onClick={() => void addFood()}>Étel mentése <Plus size={18} /></button></section><section className="catalog-card"><div className="section-heading"><h2>Saját ételek</h2><span className="entry-count">{foods.length}</span></div>{foods.length === 0 && <p className="search-state">Még nincs saját étel.</p>}{foods.map((food) => <div className="catalog-row" key={food.id}><span><strong>{food.name}</strong><small>{formatCarbohydrate(food.availableCarbs100g)} g CH / 100 g</small></span><button onClick={() => void removeFood(food.id)} aria-label={food.name + ' törlése'}><Trash2 size={16} /></button></div>)}</section><section className="catalog-card"><div className="section-heading"><h2>Receptek</h2><button className="secondary-action compact-action" onClick={() => void addRecipe()}>Gyors recept <Plus size={15} /></button></div>{recipes.length === 0 && <p className="search-state">Még nincs saját recept.</p>}{recipes.map((recipe) => <div className="catalog-row" key={recipe.id}><span><strong>{recipe.name}</strong><small>{formatCarbohydrate(recipe.carbsPerServingG)} g CH / adag</small></span><button onClick={() => void removeRecipe(recipe.id)} aria-label={recipe.name + ' törlése'}><Trash2 size={16} /></button></div>)}</section>{message && <p className="goal-help" role="status">{message}</p>}</main>
}

function PlannerScreen({ authenticated, today }: { authenticated: boolean; today: string }) {
  const [plans, setPlans] = useState<Plan[]>([]); const [shopping, setShopping] = useState<ShoppingItem[]>([]); const [foods, setFoods] = useState<CustomFood[]>([]); const [recipes, setRecipes] = useState<Recipe[]>([]); const [source, setSource] = useState(''); const [message, setMessage] = useState<string | null>(null)
  const load = async () => { try { setPlans(authenticated ? await listPlans(today, today) : await listGuestPlans(today)); setShopping(authenticated ? await listShopping() : await listGuestShopping()); setFoods(authenticated ? await listCustomFoods() : await listGuestCustomFoods()); setRecipes(authenticated ? await listRecipes() : await listGuestRecipes()) } catch (error) { setMessage(error instanceof Error ? error.message : 'A tervező nem érhető el.') } }
  useEffect(() => { void load() }, [authenticated, today])
  const add = async () => { const selectedRecipe = source.startsWith('recipe:') ? recipes.find((item) => item.id === source.slice(7)) : undefined; const selectedFood = source.startsWith('food:') ? foods.find((item) => item.id === source.slice(5)) : undefined; if (!selectedRecipe && !selectedFood) { setMessage('Válassz saját ételt vagy receptet.'); return }; const now = new Date().toISOString(); const quantity = selectedRecipe ? 1 : 100; const quantityUnit = selectedRecipe ? 'servings' : 'g'; const planCarbs = selectedRecipe?.carbsPerServingG ?? selectedFood?.availableCarbs100g ?? 0; const item: Plan = { id: crypto.randomUUID(), planDate: today, mealCategory: 'other', foodId: null, customFoodId: selectedFood?.id ?? null, recipeId: selectedRecipe?.id ?? null, quantity, quantityUnit, plannedCarbsG: planCarbs, snapshot: { name: selectedRecipe?.name ?? selectedFood?.name, source: selectedRecipe ? 'recipe' : 'custom', source_id: selectedRecipe?.id ?? selectedFood?.id }, createdAt: now, updatedAt: now }; try { if (authenticated) await createPlan({ plan_date: today, meal_category: 'other', custom_food_id: item.customFoodId ?? undefined, recipe_id: item.recipeId ?? undefined, quantity, quantity_unit: quantityUnit }); else await saveGuestPlan(item); setSource(''); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A mentés nem sikerült.') } }
  const addShopping = async () => { const now = new Date().toISOString(); const item: ShoppingItem = { id: crypto.randomUUID(), name: 'Új bevásárlótétel', quantity: 1, unit: 'db', checked: false, source: 'manual', createdAt: now, updatedAt: now }; try { if (authenticated) await createShopping({ name: item.name, quantity: item.quantity, unit: item.unit }); else await saveGuestShopping(item); await load() } catch (error) { setMessage(error instanceof Error ? error.message : 'A mentés nem sikerült.') } }
  const removePlanItem = async (id: string) => { if (authenticated) await deletePlan(id); else await deleteGuestPlan(id); await load() }; const removeShopping = async (id: string) => { if (authenticated) await deleteShopping(id); else await deleteGuestShopping(id); await load() }
  return <main className="screen planner-screen"><p className="eyebrow">Napi tervező</p><h1>Tervezés és bevásárlás</h1><section className="catalog-card"><div className="section-heading"><h2>{today}</h2><button className="secondary-action compact-action" onClick={() => void add()}>Terv hozzáadása <Plus size={15} /></button></div><select className="planner-select" value={source} onChange={(event) => setSource(event.target.value)}><option value="">Saját étel vagy recept…</option>{foods.map((item) => <option value={'food:' + item.id} key={'food:' + item.id}>Étel · {item.name}</option>)}{recipes.map((item) => <option value={'recipe:' + item.id} key={'recipe:' + item.id}>Recept · {item.name}</option>)}</select>{plans.length === 0 && <p className="search-state">Még nincs tervezett étkezés erre a napra.</p>}{plans.map((plan) => <div className="catalog-row" key={plan.id}><span><strong>{String(plan.snapshot.name ?? 'Tervezett étkezés')}</strong><small>{formatCarbohydrate(plan.plannedCarbsG)} g CH</small></span><button onClick={() => void removePlanItem(plan.id)} aria-label="Terv törlése"><Trash2 size={16} /></button></div>)}</section><section className="catalog-card"><div className="section-heading"><h2>Bevásárlólista</h2><button className="secondary-action compact-action" onClick={() => void addShopping()}>Tétel <Plus size={15} /></button></div>{shopping.length === 0 && <p className="search-state">Üres lista.</p>}{shopping.map((item) => <div className="catalog-row" key={item.id}><span><strong>{item.name}</strong><small>{item.quantity ?? ''} {item.unit}</small></span><button onClick={() => void removeShopping(item.id)} aria-label={item.name + ' törlése'}><Trash2 size={16} /></button></div>)}</section>{message && <p className="goal-help" role="status">{message}</p>}</main>
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
      if (mode === 'login') { await onLogin(email, password); setMessage('Sikeres bejelentkezés.') }
      else { const result = await onRegister(email, password); setMessage('A megerősítő email elküldéséhez szükséges lépés elindult.'); if (result.verificationToken) setVerificationToken(result.verificationToken) }
    } catch (value) { setError(value instanceof Error ? value.message : 'A kérés nem sikerült.') } finally { setBusy(false) }
  }
  const change = async () => { setBusy(true); setError(null); try { await changePassword(currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); setMessage('A jelszó módosítva.') } catch (value) { setError(value instanceof Error ? value.message : 'A jelszó módosítása nem sikerült.') } finally { setBusy(false) } }
  const forgot = async () => { setBusy(true); setError(null); try { const result = await requestPasswordReset(email); setMessage('Ha a címhez tartozik fiók, visszaállító email küldhető.'); if (result.resetToken) setResetToken(result.resetToken) } catch (value) { setError(value instanceof Error ? value.message : 'A kérés nem sikerült.') } finally { setBusy(false) } }
  const reset = async () => { setBusy(true); setError(null); try { await resetPassword(resetToken, newPassword); setResetToken(''); setNewPassword(''); setMessage('A jelszó visszaállítva; most bejelentkezhetsz.') } catch (value) { setError(value instanceof Error ? value.message : 'A visszaállítás nem sikerült.') } finally { setBusy(false) } }
  if (auth?.authenticated) return <main className="screen placeholder-screen"><div className="placeholder-icon"><CircleUserRound size={26} /></div><p className="eyebrow">Saját profil · {auth.role}</p><h1>{auth.email}</h1><p>A napló és a célverziók ehhez a felhasználói profilhoz tartoznak.</p><div className="goal-input"><span>Jelenlegi jelszó</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div><div className="goal-input"><span>Új jelszó</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div>{(error || message) && <p className={error ? 'input-error' : 'goal-help'} role="alert">{error ?? message}</p>}<button className="confirm-button" onClick={() => void change()} disabled={busy || !currentPassword || !newPassword}>Jelszó módosítása</button><button className="secondary-action" onClick={() => void onLogout()} disabled={busy}>Kijelentkezés</button></main>
  return <main className="screen placeholder-screen"><div className="placeholder-icon"><CircleUserRound size={26} /></div><p className="eyebrow">Vendég mód</p><h1>Az adataid a böngészőben maradnak.</h1><p>Bejelentkezés nélkül a mai és az előző két nap naplózható IndexedDB-ben. A böngésző tárhelyének törlése a vendég adatokat is törölheti; régebbi adatok importig megmaradnak, de nem láthatók a vendég nézetben.</p><div className="goal-input"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="goal-input"><span>Jelszó</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></div>{(error || message) && <p className={error ? 'input-error' : 'goal-help'} role="alert">{error ?? message}</p>}{verificationToken && <><p className="goal-help">Fejlesztői környezetben a megerősítő token látható; éles környezetben email-küldő adapter adja át.</p><input className="goal-input" value={verificationToken} onChange={(event) => setVerificationToken(event.target.value)} aria-label="Email megerősítő token" /><button className="secondary-action" onClick={() => void onVerify(verificationToken)}>Email megerősítése</button></>}<button className="confirm-button" onClick={() => void submit()} disabled={busy || !email || !password}>{mode === 'login' ? 'Bejelentkezés' : 'Regisztráció'}</button><button className="secondary-action" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setMessage(null) }}>{mode === 'login' ? 'Új fiók létrehozása' : 'Már van fiókom'}</button>{mode === 'login' && <><button className="secondary-action" onClick={() => void forgot()} disabled={busy || !email}>Elfelejtett jelszó</button>{resetToken && <><input className="goal-input" value={resetToken} onChange={(event) => setResetToken(event.target.value)} aria-label="Jelszó-visszaállító token" /><div className="goal-input"><span>Új jelszó</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><button className="secondary-action" onClick={() => void reset()} disabled={busy || !newPassword}>Jelszó visszaállítása</button></>}</>}</main>
}

function BottomNavigation() { const location = useLocation(); const navigate = useNavigate(); return <nav className="bottom-nav" aria-label="Fő navigáció">{navItems.map(({ label, icon: Icon, to }) => <button key={to} className={'nav-item ' + (location.pathname === to ? 'active' : '') + ' ' + (label === 'Kamera' ? 'camera-item' : '')} onClick={() => navigate(to)} aria-label={label}><span className="nav-icon"><Icon size={label === 'Kamera' ? 20 : 19} strokeWidth={location.pathname === to ? 2.4 : 1.8} /></span><span>{label}</span></button>)}</nav> }
function PlaceholderScreen() { const location = useLocation(); const page = navItems.find((item) => item.to === location.pathname); const Icon = page?.icon ?? Sparkles; return <main className="screen placeholder-screen"><div className="placeholder-icon"><Icon size={26} /></div><p className="eyebrow">Hamarosan</p><h1>{page?.label ?? 'Ez az oldal'}<br />készülőben van.</h1><p>Az M3 a tartós napi étkezési naplóra összpontosít. Ez a rész egy következő mérföldkőben érkezik.</p><Link className="back-home" to="/"><ArrowLeft size={17} /> Vissza a mához</Link></main> }
export default App
