import { ArrowLeft, BookOpen, Camera, Check, ChevronRight, CircleUserRound, Heart, Minus, Moon, Plus, Search, Sparkles, Sun, Utensils, X } from './components/icons'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { calculateCarbohydrate, formatCarbohydrate, MAX_AMOUNT_GRAMS, parseAmountInput } from './lib/carbs'
import { searchFoods, type Food } from './api/foods'

type Meal = { type: string; time: string; name: string; carbs: number; color: string }
const initialMeals: Meal[] = [
  { type: 'Reggeli', time: '08:10', name: 'Zabkása', carbs: 38, color: 'sun' },
  { type: 'Tízórai', time: '10:45', name: 'Alma', carbs: 6.3, color: 'coral' },
  { type: 'Ebéd', time: '13:20', name: 'Csirkemell rizzsel', carbs: 39.7, color: 'plum' },
]
const navItems = [
  { label: 'Ma', icon: Sparkles, to: '/' }, { label: 'Receptek', icon: BookOpen, to: '/receptek' },
  { label: 'Kamera', icon: Camera, to: '/kamera' }, { label: 'Kedvencek', icon: Heart, to: '/kedvencek' },
  { label: 'Profil', icon: CircleUserRound, to: '/profil' },
]

function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('55')
  const [query, setQuery] = useState('')
  const [meals, setMeals] = useState(initialMeals)
  const [showToast, setShowToast] = useState(false)
  const total = useMemo(() => meals.reduce((sum, meal) => sum + meal.carbs, 0), [meals])
  const openSheet = () => { setSelectedFood(null); setAmount('55'); setQuery(''); setIsSheetOpen(true) }
  const addMeal = () => {
    const amountGrams = parseAmountInput(amount)
    if (!selectedFood || amountGrams === null || selectedFood.availableCarbs100g === null) return
    const carbs = calculateCarbohydrate(amountGrams, selectedFood.availableCarbs100g)
    if (carbs === null) return
    setMeals((current) => [...current, { type: 'Most', time: 'most', name: selectedFood.name, carbs, color: 'lime' }])
    setIsSheetOpen(false); setShowToast(true); window.setTimeout(() => setShowToast(false), 2800)
  }
  return <div className={`app-shell ${darkMode ? 'theme-dark' : ''}`}>
    <div className="app-frame">
      <header className="topbar"><Link className="wordmark" to="/" aria-label="CHill kezdőlap"><span className="wordmark-ch">CH</span><span className="wordmark-rest">ill</span></Link><button className="theme-toggle" onClick={() => setDarkMode((mode) => !mode)} aria-label={darkMode ? 'Világos téma' : 'Sötét téma'}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button></header>
      <Routes><Route path="/" element={<HomeScreen total={total} meals={meals} onAdd={openSheet} />} /><Route path="*" element={<PlaceholderScreen />} /></Routes>
      <BottomNavigation />
    </div>
    {isSheetOpen && <AddMealSheet query={query} setQuery={setQuery} selectedFood={selectedFood} setSelectedFood={setSelectedFood} amount={amount} setAmount={setAmount} onClose={() => setIsSheetOpen(false)} onAdd={addMeal} />}
    {showToast && <div className="toast" role="status"><span className="toast-icon"><Check size={15} /></span>Hozzáadva a mai naphoz</div>}
  </div>
}

function HomeScreen({ total, meals, onAdd }: { total: number; meals: Meal[]; onAdd: () => void }) {
  const goal = 160; const percentage = Math.min((total / goal) * 100, 100)
  return <main className="screen home-screen">
    <div className="date-line"><span className="date-dot" /> 11. szeptember 2026 · csütörtök</div>
    <section className="hero-section" aria-labelledby="daily-title"><div className="hero-copy"><p className="eyebrow">Ma</p><h1 id="daily-title"><span className="hero-total" key={total}>{formatCarbohydrate(total)}</span> <small>g CH</small></h1></div><p className="remaining"><span className="remaining-dot" /> Még <strong>{formatCarbohydrate(Math.max(0, goal - total))} g</strong> maradt mára</p><div className="progress-wrap" aria-label={`${formatCarbohydrate(total)} g a ${goal} g napi célból`}><div className="progress-meta"><span>Napi keret</span><span>{goal} g</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${percentage}%` }} /></div></div></section>
    <button className="add-meal-button" onClick={onAdd}><span className="add-icon"><Plus size={20} strokeWidth={2.5} /></span><span>Étkezés hozzáadása</span><ChevronRight size={19} className="button-arrow" /></button>
    <section className="entries-section" aria-labelledby="entries-title"><div className="section-heading"><h2 id="entries-title">Mai bejegyzések</h2><span className="entry-count">{meals.length} étkezés</span></div><div className="entries-list">{meals.map((meal, index) => <MealRow meal={meal} key={`${meal.name}-${index}`} />)}</div></section>
  </main>
}

function MealRow({ meal }: { meal: Meal }) { return <article className="meal-row"><span className={`meal-marker ${meal.color}`}><Utensils size={15} /></span><div className="meal-info"><div className="meal-meta"><span>{meal.type}</span><span className="meal-time">{meal.time}</span></div><h3>{meal.name}</h3></div><div className="meal-carbs"><strong>{formatCarbohydrate(meal.carbs)}</strong><span>g CH</span></div></article> }

function AddMealSheet({ query, setQuery, selectedFood, setSelectedFood, amount, setAmount, onClose, onAdd }: { query: string; setQuery: (value: string) => void; selectedFood: Food | null; setSelectedFood: (food: Food | null) => void; amount: string; setAmount: (value: string) => void; onClose: () => void; onAdd: () => void }) {
  const normalizedQuery = query.trim()
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 300)
    return () => window.clearTimeout(timeout)
  }, [normalizedQuery])
  const isDebouncing = normalizedQuery.length >= 2 && debouncedQuery !== normalizedQuery
  const searchQuery = useQuery({ queryKey: ['foods', debouncedQuery], queryFn: ({ signal }) => searchFoods(debouncedQuery, signal), enabled: debouncedQuery.length >= 2, staleTime: 60_000 })
  const foods = isDebouncing ? [] : searchQuery.data ?? []
  const amountGrams = parseAmountInput(amount)
  const amountError = !amount.trim() ? 'Adj meg egy mennyiséget grammban.' : amountGrams === null ? `A mennyiség 0-nál nagyobb és legfeljebb ${MAX_AMOUNT_GRAMS.toLocaleString('hu-HU')} g lehet.` : null
  const carbs = selectedFood && amountGrams !== null ? calculateCarbohydrate(amountGrams, selectedFood.availableCarbs100g) : null
  const adjustAmount = (delta: number) => {
    const current = amountGrams ?? 0
    const next = Math.min(MAX_AMOUNT_GRAMS, Math.max(0, current + delta))
    setAmount(next > 0 ? String(next) : '')
  }
  return <div className="sheet-backdrop" onMouseDown={onClose}><section className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><div><p className="eyebrow">Új bejegyzés · {selectedFood ? '2 / 2' : '1 / 2'}</p><h2 id="sheet-title">{selectedFood ? 'Mennyit ettél?' : 'Mit ettél?'}</h2></div><button className="close-button" onClick={onClose} aria-label="Bezárás"><X size={20} /></button></div>
    {!selectedFood ? <><label className="search-field"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keress egy ételt…" aria-label="Étel keresése" /></label><div className="food-list">{normalizedQuery.length < 2 && <p className="search-state">Írj be legalább 2 karaktert a kereséshez.</p>}{normalizedQuery.length >= 2 && (isDebouncing || searchQuery.isPending) && <p className="search-state">Keresés…</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isError && <p className="search-state error">Az ételkeresés most nem elérhető. Próbáld újra később.</p>}{normalizedQuery.length >= 2 && !isDebouncing && searchQuery.isSuccess && foods.length === 0 && <p className="search-state">Nincs találat erre a keresésre.</p>}{foods.map((food) => <button className="food-option" key={food.id} onClick={() => food.carbsAvailable && setSelectedFood(food)} disabled={!food.carbsAvailable} aria-disabled={!food.carbsAvailable}><FoodMedia food={food} /><span className="food-copy"><strong>{food.name}</strong>{food.originalName && food.originalName !== food.name && <small className="food-source-name">{food.originalName}</small>}<small className="food-kind">{food.categoryLabel}</small>{food.brand && <small>{food.brand}</small>}{food.carbsAvailable ? <small>{formatCarbohydrate(food.availableCarbs100g!)} g CH / 100 g</small> : <small className="unavailable">CH adat nem elérhető</small>}</span><ChevronRight size={18} /></button>)}</div></> : <div className="amount-step"><button className="selected-food-card" onClick={() => setSelectedFood(null)}><FoodMedia food={selectedFood} /><span><strong>{selectedFood.name}</strong>{selectedFood.originalName && selectedFood.originalName !== selectedFood.name && <small className="food-source-name">{selectedFood.originalName}</small>}<small className="food-kind">{selectedFood.categoryLabel}</small>{selectedFood.brand && <small>{selectedFood.brand}</small>}<small>{formatCarbohydrate(selectedFood.availableCarbs100g!)} g CH / 100 g</small></span><ArrowLeft size={18} /></button><div className="amount-label"><span>Mennyiség</span><small>grammban</small></div><div className="amount-control"><button onClick={() => adjustAmount(-5)} aria-label="5 grammal kevesebb"><Minus size={21} /></button><label><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Mennyiség grammban" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? 'amount-error' : undefined} /><span>g</span></label><button onClick={() => adjustAmount(5)} aria-label="5 grammal több"><Plus size={21} /></button></div>{amountError && <p id="amount-error" className="input-error" role="alert">{amountError}</p>}<div className="quick-amounts"><span>Gyors választás</span>{[50, 100, 150].map((value) => <button key={value} className={amountGrams === value ? 'active' : ''} onClick={() => setAmount(String(value))}>{value} g</button>)}</div>{carbs !== null ? <div className="calculation-result"><div><p className="eyebrow">Ezzel a mennyiséggel</p><strong>{formatCarbohydrate(carbs)} <small>g CH</small></strong></div><span className="result-check"><Check size={18} /></span></div> : <p className="calculation-error" role="status">A CH csak érvényes mennyiség és elérhető tápérték mellett számítható.</p>}<button className="confirm-button" onClick={onAdd} disabled={carbs === null}>Hozzáadás a mai naphoz <Plus size={19} /></button></div>}
  </section></div>
}

function FoodMedia({ food }: { food: Food }) { return food.imageUrl ? <span className="food-media"><img className="food-image" src={food.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span className="food-icon" aria-hidden="true"><Utensils size={20} /></span></span> : <span className="food-icon" aria-hidden="true"><Utensils size={20} /></span> }

function BottomNavigation() { const location = useLocation(); const navigate = useNavigate(); return <nav className="bottom-nav" aria-label="Fő navigáció">{navItems.map(({ label, icon: Icon, to }) => <button key={to} className={`nav-item ${location.pathname === to ? 'active' : ''} ${label === 'Kamera' ? 'camera-item' : ''}`} onClick={() => navigate(to)} aria-label={label}><span className="nav-icon"><Icon size={label === 'Kamera' ? 20 : 19} strokeWidth={location.pathname === to ? 2.4 : 1.8} /></span><span>{label}</span></button>)}</nav> }
function PlaceholderScreen() { const location = useLocation(); const page = navItems.find((item) => item.to === location.pathname); const Icon = page?.icon ?? Sparkles; return <main className="screen placeholder-screen"><div className="placeholder-icon"><Icon size={26} /></div><p className="eyebrow">Hamarosan</p><h1>{page?.label ?? 'Ez az oldal'}<br />készülőben van.</h1><p>Az M0 fókusza a gyors napi szénhidrátszámlálás. Ez a rész egy következő mérföldkőben érkezik.</p><Link className="back-home" to="/"><ArrowLeft size={17} /> Vissza a mához</Link></main> }
export default App
