import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createCustomFood, createPlan, createRecipe, listCustomFoods, listRecipes, logRecipeMeal, type CustomFood, type Plan, type Recipe } from '../api/catalog'
import { searchFoods, type Food } from '../api/foods'
import type { MealCategory } from '../api/meals'
import { createGuestMealFromPlan, listGuestCustomFoods, listGuestRecipes, saveGuestCustomFood, saveGuestPlan, saveGuestRecipe } from '../storage/guestStore'
import type { FoodVisionIngredient } from '../api/vision'
import { calculateCarbohydrate, formatCarbohydrate, parseAmountInput } from '../lib/carbs'
import { calculateChefTotals, type ChefCalculationInput } from './calculation'

type ChefIngredientDraft = {
  id: string
  name: string
  uncertain: boolean
  confirmed: boolean
  food: Food | null
  quantity: string
}

export type ChefWorkflowProps = {
  guestMode: boolean
  selectedDate: string
  initialName: string
  initialIngredients: FoodVisionIngredient[]
  mealCategory: MealCategory
  onExit: () => void
  onCompleted: (message: string) => void
}

function foodFromCustom(item: CustomFood): Food {
  return { id: `custom-${item.id}`, name: item.name, originalName: null, brand: item.brand, barcode: null, source: 'custom', sourceId: item.id, availableCarbs100g: item.availableCarbs100g, servingSizeG: item.servingSizeG, imageUrl: null, language: 'hu', country: null, isGeneric: false, isVerified: true, category: 'custom', categoryLabel: 'Saját étel', carbsAvailable: true }
}

function sourceLabel(food: Food): string {
  if (food.source === 'custom') return 'Saját étel'
  if (food.source === 'off') return 'Open Food Facts'
  if (food.source === 'usda') return 'USDA'
  return food.source
}

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function IngredientMatchRow({ row, guestMode, onChange, onRemove, onConfirm }: { row: ChefIngredientDraft; guestMode: boolean; onChange: (patch: Partial<ChefIngredientDraft>) => void; onRemove: () => void; onConfirm: () => void }) {
  const [search, setSearch] = useState(row.name)
  const [manualCarbs, setManualCarbs] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const query = search.trim()
  const searchQuery = useQuery({ queryKey: ['chef-foods', query], queryFn: ({ signal }) => searchFoods(query, signal), enabled: query.length >= 2, staleTime: 60_000 })
  const customQuery = useQuery({ queryKey: ['chef-custom-foods', query, guestMode], queryFn: () => guestMode ? listGuestCustomFoods(query) : listCustomFoods(query), enabled: query.length >= 2, staleTime: 30_000 })
  const results = [...(customQuery.data ?? []).map(foodFromCustom), ...(searchQuery.data ?? [])]
  const choose = (food: Food) => { onChange({ food, name: row.name || food.name, confirmed: false }); setSearch(food.name) }
  const createManual = async () => {
    const carbs = Number(manualCarbs.replace(',', '.'))
    if (!row.name.trim() || !Number.isFinite(carbs) || carbs < 0 || carbs > 100) { setManualError('Adj meg nevet és 0–100 g közötti CH-t 100 g-ra.'); return }
    setManualError(null)
    try {
      const now = new Date().toISOString()
      const saved = guestMode ? { id: makeId(), name: row.name.trim(), brand: null, availableCarbs100g: carbs, dietaryFiber100g: null, servingSizeG: null, notes: 'CHill Chef saját étel', isFavorite: false, createdAt: now, updatedAt: now } satisfies CustomFood : await createCustomFood({ name: row.name.trim(), available_carbs_100g: carbs, notes: 'CHill Chef saját étel' })
      if (guestMode) await saveGuestCustomFood(saved)
      choose(foodFromCustom(saved))
      setManualCarbs('')
    } catch (value) { setManualError(value instanceof Error ? value.message : 'A saját étel mentése nem sikerült.') }
  }
  return <article className="chef-ingredient-row">
    <div className="chef-ingredient-heading"><label className="goal-input"><span>Összetevő</span><input value={row.name} onChange={(event) => { onChange({ name: event.target.value, confirmed: false }); setSearch(event.target.value) }} aria-label={`Összetevő neve ${row.id}`} /></label><button type="button" className="secondary-action compact-action" onClick={onRemove}>Eltávolítás</button></div>
    {row.uncertain && <p className="chef-warning" role="status">Lehetséges összetevő. Erősítsd meg, vagy javítsd a nevet.</p>}
    <label className="goal-input"><span>Kiválasztott adatforrás</span><input value={row.food?.name ?? ''} readOnly placeholder="Válassz találatot vagy adj meg saját ételt" /></label>
    <label className="goal-input"><span>Mennyiség (g)</span><input value={row.quantity} onChange={(event) => onChange({ quantity: event.target.value })} inputMode="decimal" aria-label={`Mennyiség ${row.name}`} /></label>
    {query.length >= 2 && <div className="chef-result-list" aria-label={`${row.name} találatai`}>
      {searchQuery.isPending || customQuery.isPending ? <p className="search-state">Találatok keresése…</p> : results.length === 0 ? <p className="search-state">Nincs ellenőrzött találat. Adj hozzá saját ételt.</p> : results.map((food) => <button type="button" className={'food-option ' + (row.food?.id === food.id ? 'active' : '')} key={`${food.source}:${food.id}`} onClick={() => choose(food)} disabled={food.availableCarbs100g === null}><span className="food-copy"><strong>{food.name}</strong>{food.originalName && food.originalName !== food.name && <small className="food-source-name">{food.originalName}</small>}<small>{sourceLabel(food)} · {food.availableCarbs100g === null ? 'CH adat nem elérhető' : `${formatCarbohydrate(food.availableCarbs100g)} g CH / 100 g`}</small></span></button>)}
    </div>}
    <label className="goal-input"><span>Saját étel CH-ja (g / 100 g)</span><input value={manualCarbs} onChange={(event) => setManualCarbs(event.target.value)} inputMode="decimal" placeholder="például 12,5" /></label>
    <div className="chef-ingredient-actions"><button type="button" className="secondary-action" onClick={onConfirm} disabled={!row.food || row.confirmed}>{row.confirmed ? 'Összetevő megerősítve' : 'Megerősítem ezt az összetevőt'}</button><button type="button" className="secondary-action" onClick={() => void createManual()}>Saját étel + CH megadása</button></div>
    {manualError && <p className="input-error" role="alert">{manualError}</p>}
    {manualCarbs === '' && !row.food && <p className="goal-help">Saját ételhez a gomb után add meg a CH-t 100 g-ra.</p>}
    {row.food && <p className="chef-source-note">Forrás: {sourceLabel(row.food)} · {row.food.availableCarbs100g === null ? 'CH ismeretlen' : `${formatCarbohydrate(row.food.availableCarbs100g)} g / 100 g`}{row.confirmed ? ' · megerősítve' : ' · megerősítés szükséges'}</p>}
  </article>
}

function emptyRow(item?: FoodVisionIngredient): ChefIngredientDraft {
  return { id: makeId(), name: item?.name ?? '', uncertain: item?.uncertain ?? false, confirmed: false, food: null, quantity: '' }
}

export function ChefWorkflow({ guestMode, selectedDate, initialName, initialIngredients, mealCategory, onExit, onCompleted }: ChefWorkflowProps) {
  const [name, setName] = useState(initialName)
  const [servings, setServings] = useState('1')
  const [rows, setRows] = useState<ChefIngredientDraft[]>(() => initialIngredients.length > 0 ? initialIngredients.map(emptyRow) : [emptyRow()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  useEffect(() => {
    let active = true
    void (guestMode ? listGuestRecipes() : listRecipes()).then((items) => { if (active) setRecipes(items) }).catch(() => { /* recipe suggestions are optional */ })
    return () => { active = false }
  }, [guestMode])
  const validRows = rows.map((row): ChefCalculationInput => ({ quantityG: parseAmountInput(row.quantity), availableCarbs100g: row.food?.availableCarbs100g ?? null }))
  const calculation = calculateChefTotals(validRows)
  const missingConfirmation = rows.some((row) => row.uncertain || !row.confirmed)
  const invalidQuantity = validRows.some((row) => row.quantityG === null)
  const canSave = name.trim().length > 0 && rows.length > 0 && !missingConfirmation && !invalidQuantity && rows.every((row) => row.food?.availableCarbs100g !== null && row.food !== null) && calculation.complete && calculation.totalCarbsG !== null
  const recipeSuggestions = recipes.filter((recipe) => rows.some((row) => row.name.trim() && recipe.ingredients.some((ingredient) => String(ingredient.snapshot.name ?? '').toLocaleLowerCase().includes(row.name.trim().toLocaleLowerCase())))).slice(0, 3)
  const updateRow = (id: string, patch: Partial<ChefIngredientDraft>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
  const removeRow = (id: string) => setRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : current)

  const save = async (mode: 'recipe' | 'log' | 'plan') => {
    if (!canSave || calculation.totalCarbsG === null) { setError('Minden összetevőt, forrást és grammot ellenőrizni kell mentés előtt.'); return }
    const servingNumber = Number(servings.replace(',', '.'))
    if (!Number.isFinite(servingNumber) || servingNumber <= 0) { setError('Az adagok száma 0-nál nagyobb legyen.'); return }
    setBusy(true); setError(null); setStatus(null)
    try {
      const totalWeight = validRows.reduce((sum, row) => sum + (row.quantityG ?? 0), 0)
      const ingredientPayload = rows.map((row) => ({ food_id: row.food?.source === 'custom' ? undefined : row.food?.id, custom_food_id: row.food?.source === 'custom' ? row.food.sourceId : undefined, quantity_g: parseAmountInput(row.quantity) as number }))
      let savedRecipe: Recipe
      if (guestMode) {
        const now = new Date().toISOString()
        const recipeId = makeId()
        savedRecipe = { id: recipeId, name: name.trim(), instructions: null, prepMinutes: null, notes: 'CHill Chef által ellenőrzött összetevőkből', servings: servingNumber, totalWeightG: totalWeight, totalCarbsG: calculation.totalCarbsG, carbsPerServingG: calculation.totalCarbsG / servingNumber, carbsPer100gCookedG: null, isFavorite: false, ingredients: rows.map((row, index) => ({ id: makeId(), foodId: row.food?.source === 'custom' ? null : row.food?.id ?? null, customFoodId: row.food?.source === 'custom' ? row.food.sourceId : null, quantityG: validRows[index].quantityG ?? 0, calculatedCarbsG: calculateCarbohydrate(validRows[index].quantityG ?? 0, row.food?.availableCarbs100g ?? null) ?? 0, snapshot: { name: row.food?.name, source: row.food?.source, source_id: row.food?.sourceId, available_carbs_100g: row.food?.availableCarbs100g }, position: index })), createdAt: now, updatedAt: now }
        await saveGuestRecipe(savedRecipe)
      } else {
        savedRecipe = await createRecipe({ name: name.trim(), servings: servingNumber, total_weight_g: totalWeight, instructions: '', notes: 'CHill Chef által ellenőrzött összetevőkből', ingredients: ingredientPayload })
      }
      if (mode === 'log') {
        if (guestMode) {
          await createGuestMealFromPlan({ id: makeId(), planDate: selectedDate, mealCategory, foodId: null, customFoodId: null, recipeId: savedRecipe.id, quantity: 1, quantityUnit: 'servings', plannedCarbsG: savedRecipe.carbsPerServingG, snapshot: { name: savedRecipe.name, source: 'recipe', source_id: savedRecipe.id }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, selectedDate)
        } else {
          await logRecipeMeal(savedRecipe.id, { quantity: 1, quantity_unit: 'servings', local_date: selectedDate, meal_category: mealCategory, idempotency_key: makeId() })
        }
      }
      if (mode === 'plan') {
        const plan: Plan = { id: makeId(), planDate: selectedDate, mealCategory, foodId: null, customFoodId: null, recipeId: savedRecipe.id, quantity: 1, quantityUnit: 'servings', plannedCarbsG: savedRecipe.carbsPerServingG, snapshot: { name: savedRecipe.name, source: 'recipe', source_id: savedRecipe.id }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        if (guestMode) await saveGuestPlan(plan)
        else await createPlan({ plan_date: selectedDate, meal_category: mealCategory, recipe_id: savedRecipe.id, quantity: 1, quantity_unit: 'servings' })
      }
      const message = mode === 'log' ? 'A Chef-étel receptként elmentve és a naplóba került.' : mode === 'plan' ? 'A Chef-étel receptként elmentve és a tervbe került.' : 'A Chef-étel receptként elmentve.'
      setStatus(message); onCompleted(message)
    } catch (value) { setError(value instanceof Error ? value.message : 'A Chef-étel mentése nem sikerült.') } finally { setBusy(false) }
  }

  return <section className="chef-workflow" aria-label="CHill Chef munkafolyamat">
    <div className="chef-header"><div><p className="eyebrow">CHill Chef · ellenőrzés</p><h3>Étel összeállítása</h3></div><button type="button" className="secondary-action compact-action" onClick={onExit} disabled={busy}>Vissza</button></div>
    <p className="goal-help">A Gemini csak javaslatot adott. A mentéshez minden összetevőhöz ellenőrzött adatforrás, gramm és egyedi megerősítés kell.</p>
    <label className="goal-input"><span>Recept neve</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="goal-input"><span>Adagok száma</span><input value={servings} onChange={(event) => setServings(event.target.value)} inputMode="decimal" /></label>
    <label className="category-field"><span>Étkezés</span><select value={mealCategory} disabled><option value={mealCategory}>{mealCategory === 'breakfast' ? 'Reggeli' : mealCategory === 'lunch' ? 'Ebéd' : mealCategory === 'dinner' ? 'Vacsora' : mealCategory === 'morning_snack' ? 'Tízórai' : mealCategory === 'afternoon_snack' ? 'Uzsonna' : 'Egyéb'}</option></select></label>
    <div className="chef-ingredients"><div className="section-heading"><h4>Összetevők</h4><button type="button" className="secondary-action compact-action" onClick={() => setRows((current) => [...current, emptyRow()])}>Összetevő hozzáadása</button></div>{rows.map((row) => <IngredientMatchRow key={row.id} row={row} guestMode={guestMode} onChange={(patch) => updateRow(row.id, patch)} onRemove={() => removeRow(row.id)} onConfirm={() => updateRow(row.id, { uncertain: false, confirmed: true })} />)}</div>
    {recipeSuggestions.length > 0 && <section className="chef-recipe-suggestions" aria-label="Meglévő receptjavaslatok"><p className="eyebrow">Meglévő receptjavaslatok</p>{recipeSuggestions.map((recipe) => <div className="chef-recipe-suggestion" key={recipe.id}><strong>{recipe.name}</strong><small>{formatCarbohydrate(recipe.carbsPerServingG)} g CH / adag · ellenőrzött katalógusadat</small></div>)}</section>}
    <div className="chef-summary"><p className="eyebrow">Determinisztikus CH-összesítés</p>{calculation.complete ? <strong>{formatCarbohydrate(calculation.totalCarbsG ?? 0)} g CH összesen · {formatCarbohydrate((calculation.totalCarbsG ?? 0) / Math.max(Number(servings.replace(',', '.')) || 1, 1))} g/adag</strong> : <><strong>Az ellenőrzött teljes CH még nem számítható.</strong><small>Ismert rész: {formatCarbohydrate(calculation.knownCarbsG)} g CH / {formatCarbohydrate(calculation.knownMassG)} g. Hiányzó adatok: {calculation.missingCount}.</small></>}</div>
    {error && <p className="input-error" role="alert">{error}</p>}{status && <p className="goal-help" role="status">{status}</p>}
    <div className="chef-actions"><button type="button" className="confirm-button" onClick={() => void save('recipe')} disabled={!canSave || busy}>Mentés receptként</button><button type="button" className="confirm-button" onClick={() => void save('log')} disabled={!canSave || busy}>Mentés és naplózás</button><button type="button" className="secondary-action" onClick={() => void save('plan')} disabled={!canSave || busy}>Mentés és tervezés</button></div>
  </section>
}
