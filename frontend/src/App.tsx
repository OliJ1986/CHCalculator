import { ArrowLeft, BookOpen, Camera, Check, ChevronRight, CircleUserRound, Heart, Minus, Moon, Pencil, Plus, Search, Sparkles, Sun, Trash2, Utensils, X } from './components/icons'
import { useEffect, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { calculateCarbohydrate, formatCarbohydrate, MAX_AMOUNT_GRAMS, parseAmountInput } from './lib/carbs'
import { searchFoods, type Food } from './api/foods'
import { createMeal, deleteMeal, listMeals, updateMeal, type Meal } from './api/meals'

const DEFAULT_TIMEZONE = 'Europe/Budapest'
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

function displayDate(date = new Date()): string {
  return new Intl.DateTimeFormat('hu-HU', { timeZone: DEFAULT_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(date)
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
  const [query, setQuery] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('Mentve a mai naphoz')
  const [actionError, setActionError] = useState<string | null>(null)
  const localDate = localDateInTimezone()
  const mealsQuery = useQuery({ queryKey: ['meals', localDate], queryFn: ({ signal }) => listMeals(localDate, signal), staleTime: 15_000 })
  const createMutation = useMutation({
    mutationFn: createMeal,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', localDate] }); closeSheet(); showSavedToast() },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A mentés nem sikerült.'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { amount_g: number; food_id?: string } }) => updateMeal(id, payload),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', localDate] }); closeSheet(); showSavedToast() },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A módosítás nem sikerült.'),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteMeal,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['meals', localDate] }); showSavedToast('Bejegyzés törölve') },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'A törlés nem sikerült.'),
  })
  const meals = mealsQuery.data?.items ?? []
  const total = mealsQuery.data?.totalCarbsG ?? 0
  const isSaving = createMutation.isPending || updateMutation.isPending

  function showSavedToast(message = 'Mentve a mai naphoz') {
    setToastMessage(message)
    setShowToast(true)
    window.setTimeout(() => setShowToast(false), 2800)
    setActionError(null)
  }
  function closeSheet() { setIsSheetOpen(false); setEditingMeal(null); setSelectedFood(null); setQuery(''); setActionError(null) }
  function openSheet(meal?: Meal) {
    setEditingMeal(meal ?? null); setSelectedFood(meal ? foodFromMeal(meal) : null); setAmount(meal ? String(meal.amountG) : '55'); setQuery(''); setActionError(null); setIsSheetOpen(true)
  }
  function saveMeal() {
    const amountGrams = parseAmountInput(amount)
    if (!selectedFood || amountGrams === null || selectedFood.availableCarbs100g === null) return
    const carbs = calculateCarbohydrate(amountGrams, selectedFood.availableCarbs100g)
    if (carbs === null) return
    setActionError(null)
    if (editingMeal) {
      const payload = { amount_g: amountGrams, ...(selectedFood.id !== editingMeal.foodId ? { food_id: selectedFood.id } : {}) }
      updateMutation.mutate({ id: editingMeal.id, payload })
      return
    }
    const key = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + String(Math.random())
    createMutation.mutate({ food_id: selectedFood.id, amount_g: amountGrams, local_date: localDate, meal_category: 'other', idempotency_key: key, client_carbs_g: carbs })
  }
  function requestDelete(meal: Meal) {
    if (window.confirm('Törlöd ezt: ' + meal.snapshot.name + '?')) deleteMutation.mutate(meal.id)
  }

  return <div className={'app-shell ' + (darkMode ? 'theme-dark' : '')}>
    <div className="app-frame">
      <header className="topbar"><Link className="wordmark" to="/" aria-label="CHill kezdőlap"><span className="wordmark-ch">CH</span><span className="wordmark-rest">ill</span></Link><button className="theme-toggle" onClick={() => setDarkMode((mode) => !mode)} aria-label={darkMode ? 'Világos téma' : 'Sötét téma'}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button></header>
      <Routes><Route path="/" element={<HomeScreen date={displayDate()} total={total} meals={meals} isLoading={mealsQuery.isPending} isError={mealsQuery.isError} onAdd={() => openSheet()} onEdit={openSheet} onDelete={requestDelete} />} /><Route path="*" element={<PlaceholderScreen />} /></Routes>
      <BottomNavigation />
    </div>
    {isSheetOpen && <AddMealSheet mode={editingMeal ? 'edit' : 'create'} query={query} setQuery={setQuery} selectedFood={selectedFood} setSelectedFood={setSelectedFood} amount={amount} setAmount={setAmount} onClose={closeSheet} onAdd={saveMeal} isSaving={isSaving} error={actionError} />}
    {showToast && <div className="toast" role="status"><span className="toast-icon"><Check size={15} /></span>{toastMessage}</div>}
  </div>
}

function HomeScreen({ date, total, meals, isLoading, isError, onAdd, onEdit, onDelete }: { date: string; total: number; meals: Meal[]; isLoading: boolean; isError: boolean; onAdd: () => void; onEdit: (meal: Meal) => void; onDelete: (meal: Meal) => void }) {
  return <main className="screen home-screen">
    <div className="date-line"><span className="date-dot" /> {date}</div>
    <section className="hero-section" aria-labelledby="daily-title"><div className="hero-copy"><p className="eyebrow">Ma</p><h1 id="daily-title"><span className="hero-total" key={total}>{formatCarbohydrate(total)}</span> <small>g CH</small></h1></div><p className="remaining"><span className="remaining-dot" /> Napi összesen</p></section>
    <button className="add-meal-button" onClick={onAdd}><span className="add-icon"><Plus size={20} strokeWidth={2.5} /></span><span>Étkezés hozzáadása</span><ChevronRight size={19} className="button-arrow" /></button>
    <section className="entries-section" aria-labelledby="entries-title"><div className="section-heading"><h2 id="entries-title">Mai bejegyzések</h2><span className="entry-count">{meals.length} étkezés</span></div><div className="entries-list">{isLoading && <p className="search-state">Napló betöltése…</p>}{isError && <p className="search-state error">A napló most nem érhető el. Próbáld újra később.</p>}{!isLoading && !isError && meals.length === 0 && <p className="search-state">Még nincs mentett étkezésed mára.</p>}{meals.map((meal) => <MealRow meal={meal} key={meal.id} onEdit={onEdit} onDelete={onDelete} />)}</div></section>
  </main>
}

function MealRow({ meal, onEdit, onDelete }: { meal: Meal; onEdit: (meal: Meal) => void; onDelete: (meal: Meal) => void }) {
  return <article className="meal-row"><span className="meal-marker lime"><Utensils size={15} /></span><div className="meal-info"><div className="meal-meta"><span>Egyéb</span><span className="meal-time">{mealTime(meal)}</span></div><h3>{meal.snapshot.name}</h3></div><div className="meal-carbs"><strong>{formatCarbohydrate(meal.calculatedCarbsG)}</strong><span>g CH</span></div><div className="meal-actions"><button onClick={() => onEdit(meal)} aria-label={meal.snapshot.name + ' szerkesztése'}><Pencil size={16} /></button><button onClick={() => onDelete(meal)} aria-label={meal.snapshot.name + ' törlése'}><Trash2 size={16} /></button></div></article>
}

function AddMealSheet({ mode, query, setQuery, selectedFood, setSelectedFood, amount, setAmount, onClose, onAdd, isSaving, error }: { mode: 'create' | 'edit'; query: string; setQuery: (value: string) => void; selectedFood: Food | null; setSelectedFood: (food: Food | null) => void; amount: string; setAmount: (value: string) => void; onClose: () => void; onAdd: () => void; isSaving: boolean; error: string | null }) {
  const normalizedQuery = query.trim()
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => { const timeout = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 300); return () => window.clearTimeout(timeout) }, [normalizedQuery])
  const isDebouncing = normalizedQuery.length >= 2 && debouncedQuery !== normalizedQuery
  const searchQuery = useQuery({ queryKey: ['foods', debouncedQuery], queryFn: ({ signal }) => searchFoods(debouncedQuery, signal), enabled: debouncedQuery.length >= 2, staleTime: 60_000 })
  const foods = isDebouncing ? [] : searchQuery.data ?? []
  const amountGrams = parseAmountInput(amount)
  const amountError = !amount.trim() ? 'Adj meg egy mennyiséget grammban.' : amountGrams === null ? 'A mennyiség 0-nál nagyobb és legfeljebb ' + MAX_AMOUNT_GRAMS.toLocaleString('hu-HU') + ' g lehet.' : null
  const carbs = selectedFood && amountGrams !== null ? calculateCarbohydrate(amountGrams, selectedFood.availableCarbs100g) : null
  const adjustAmount = (delta: number) => { const current = amountGrams ?? 0; const next = Math.min(MAX_AMOUNT_GRAMS, Math.max(0, current + delta)); setAmount(next > 0 ? String(next) : '') }
  return <div className="sheet-backdrop" onMouseDown={isSaving ? undefined : onClose}><section className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><div><p className="eyebrow">{mode === 'edit' ? 'Bejegyzés szerkesztése' : 'Új bejegyzés · 1 / 2'}</p><h2 id="sheet-title">{selectedFood ? 'Mennyit ettél?' : 'Mit ettél?'}</h2></div><button className="close-button" onClick={onClose} aria-label="Bezárás" disabled={isSaving}><X size={20} /></button></div>
    {!selectedFood ? <><label className="search-field"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keress egy ételt…" aria-label="Étel keresése" /></label><div className="food-list">{normalizedQuery.length < 2 && <p className="search-state">Írj be legalább 2 karaktert a kereséshez.</p>}{normalizedQuery.length >= 2 && (isDebouncing || searchQuery.isPending) && <p className="search-state">Keresés…</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isError && <p className="search-state error">Az ételkeresés most nem elérhető. Próbáld újra később.</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isSuccess && foods.length === 0 && <p className="search-state">Nincs találat erre a keresésre.</p>}{foods.map((food) => <button className="food-option" key={food.id} onClick={() => food.carbsAvailable && setSelectedFood(food)} disabled={!food.carbsAvailable} aria-disabled={!food.carbsAvailable}><FoodMedia food={food} /><span className="food-copy"><strong>{food.name}</strong>{food.originalName && food.originalName !== food.name && <small className="food-source-name">{food.originalName}</small>}<small className="food-kind">{food.categoryLabel}</small>{food.brand && <small>{food.brand}</small>}{food.carbsAvailable ? <small>{formatCarbohydrate(food.availableCarbs100g!)} g CH / 100 g</small> : <small className="unavailable">CH adat nem elérhető</small>}</span><ChevronRight size={18} /></button>)}</div></> : <div className="amount-step"><button className="selected-food-card" onClick={() => setSelectedFood(null)} disabled={isSaving}><FoodMedia food={selectedFood} /><span><strong>{selectedFood.name}</strong>{selectedFood.originalName && selectedFood.originalName !== selectedFood.name && <small className="food-source-name">{selectedFood.originalName}</small>}<small className="food-kind">{selectedFood.categoryLabel}</small>{selectedFood.brand && <small>{selectedFood.brand}</small>}<small>{formatCarbohydrate(selectedFood.availableCarbs100g!)} g CH / 100 g</small></span><ArrowLeft size={18} /></button><div className="amount-label"><span>Mennyiség</span><small>grammban</small></div><div className="amount-control"><button onClick={() => adjustAmount(-5)} aria-label="5 grammal kevesebb" disabled={isSaving}><Minus size={21} /></button><label><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Mennyiség grammban" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? 'amount-error' : undefined} disabled={isSaving} /><span>g</span></label><button onClick={() => adjustAmount(5)} aria-label="5 grammal több" disabled={isSaving}><Plus size={21} /></button></div>{amountError && <p id="amount-error" className="input-error" role="alert">{amountError}</p>}{error && <p className="input-error" role="alert">{error}</p>}<div className="quick-amounts"><span>Gyors választás</span>{[50, 100, 150].map((value) => <button key={value} className={amountGrams === value ? 'active' : ''} onClick={() => setAmount(String(value))} disabled={isSaving}>{value} g</button>)}</div>{carbs !== null ? <div className="calculation-result"><div><p className="eyebrow">Ezzel a mennyiséggel</p><strong>{formatCarbohydrate(carbs)} <small>g CH</small></strong></div><span className="result-check"><Check size={18} /></span></div> : <p className="calculation-error" role="status">A CH csak érvényes mennyiség és elérhető tápérték mellett számítható.</p>}<button className="confirm-button" onClick={onAdd} disabled={carbs === null || isSaving}>{isSaving ? 'Mentés…' : mode === 'edit' ? 'Mentés' : 'Mentés a mai naphoz'} <Plus size={19} /></button></div>}
  </section></div>
}

function FoodMedia({ food }: { food: Food }) { return food.imageUrl ? <span className="food-media"><img className="food-image" src={food.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span className="food-icon" aria-hidden="true"><Utensils size={20} /></span></span> : <span className="food-icon" aria-hidden="true"><Utensils size={20} /></span> }

function BottomNavigation() { const location = useLocation(); const navigate = useNavigate(); return <nav className="bottom-nav" aria-label="Fő navigáció">{navItems.map(({ label, icon: Icon, to }) => <button key={to} className={'nav-item ' + (location.pathname === to ? 'active' : '') + ' ' + (label === 'Kamera' ? 'camera-item' : '')} onClick={() => navigate(to)} aria-label={label}><span className="nav-icon"><Icon size={label === 'Kamera' ? 20 : 19} strokeWidth={location.pathname === to ? 2.4 : 1.8} /></span><span>{label}</span></button>)}</nav> }
function PlaceholderScreen() { const location = useLocation(); const page = navItems.find((item) => item.to === location.pathname); const Icon = page?.icon ?? Sparkles; return <main className="screen placeholder-screen"><div className="placeholder-icon"><Icon size={26} /></div><p className="eyebrow">Hamarosan</p><h1>{page?.label ?? 'Ez az oldal'}<br />készülőben van.</h1><p>Az M3 a tartós napi étkezési naplóra összpontosít. Ez a rész egy következő mérföldkőben érkezik.</p><Link className="back-home" to="/"><ArrowLeft size={17} /> Vissza a mához</Link></main> }
export default App
