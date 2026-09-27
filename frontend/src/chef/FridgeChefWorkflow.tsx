import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraCapture } from '../camera/CameraCapture'
import { generateChefRecipes, identifyFoodImages, type ChefRecipeSuggestion, type FoodVisionIngredient } from '../api/vision'
import { createShopping, listShopping, type ShoppingItem } from '../api/catalog'
import { listGuestShopping, saveGuestShopping } from '../storage/guestStore'
import { ChefWorkflow } from './ChefWorkflow'
import { Check, Plus, Trash2, X } from '../components/icons'

type FridgeImage = { id: string; blob: Blob; url: string }
type InventoryItem = FoodVisionIngredient & { id: string; confirmed: boolean }
type FridgeStage = 'photos' | 'inventory' | 'preferences' | 'recipes' | 'review'

const MAX_IMAGES = 4

function comparisonKey(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

async function prepareImage(blob: Blob): Promise<Blob> {
  if (blob.size <= 2_500_000) return blob
  try {
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = url
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('image')) })
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
      return result ?? blob
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return blob
  }
}

function mergeSuggestions(suggestions: Array<{ name: string; possibleIngredients: FoodVisionIngredient[] }>): InventoryItem[] {
  const merged = new Map<string, InventoryItem>()
  suggestions.forEach((suggestion) => {
    const name = suggestion.name.trim()
    const key = comparisonKey(name)
    if (!key) return
    const existing = merged.get(key)
    if (existing) {
      existing.uncertain = existing.uncertain || suggestion.possibleIngredients.some((item) => item.uncertain)
      return
    }
    merged.set(key, { id: crypto.randomUUID(), name, uncertain: suggestion.possibleIngredients.some((item) => item.uncertain), confirmed: false })
  })
  return [...merged.values()]
}

export function FridgeChefWorkflow({ guestMode, selectedDate, mealCategory, onExit, onCompleted }: { guestMode: boolean; selectedDate: string; mealCategory: 'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner' | 'other'; onExit: () => void; onCompleted: (message: string) => void }) {
  const [stage, setStage] = useState<FridgeStage>('photos')
  const [images, setImages] = useState<FridgeImage[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({})
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraKey, setCameraKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mealType, setMealType] = useState('other')
  const [servings, setServings] = useState('2')
  const [requiredText, setRequiredText] = useState('')
  const [excludedText, setExcludedText] = useState('')
  const [limitText, setLimitText] = useState('')
  const [recipes, setRecipes] = useState<ChefRecipeSuggestion[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<ChefRecipeSuggestion | null>(null)
  const [shoppingNotice, setShoppingNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef<FridgeImage[]>([])
  const confirmedIngredients = useMemo(() => inventory.filter((item) => item.confirmed && item.name.trim()), [inventory])

  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => () => { imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)) }, [])

  const addBlobs = (blobs: Blob[]) => {
    const available = MAX_IMAGES - images.length
    if (available <= 0) { setError('Legfeljebb négy hűtőfotó adható meg.'); return }
    const next = blobs.slice(0, available).map((blob) => ({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) }))
    setImages((current) => [...current, ...next])
    setError(blobs.length > available ? 'Legfeljebb négy hűtőfotó adható meg.' : null)
  }

  const selectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    addBlobs(files)
  }

  const removeImage = (id: string) => {
    setImages((current) => { const item = current.find((image) => image.id === id); if (item) URL.revokeObjectURL(item.url); return current.filter((image) => image.id !== id) })
  }

  const recognize = async () => {
    if (images.length === 0 || busy) return
    setBusy(true); setError(null)
    try {
      const result = await identifyFoodImages(await Promise.all(images.map((image) => prepareImage(image.blob))))
      const merged = mergeSuggestions(result.suggestions)
      if (merged.length === 0) { setError('Nem sikerült látható élelmiszert azonosítani. A fotók megmaradtak, próbáld újra vagy add hozzá kézzel.'); return }
      setInventory(merged); setStage('inventory')
    } catch (value) {
      setError(value instanceof Error ? value.message : 'A hűtőfotók felismerése nem sikerült. A fotók megmaradtak.')
    } finally { setBusy(false) }
  }

  const addManual = () => setInventory((current) => [...current, { id: crypto.randomUUID(), name: '', uncertain: false, confirmed: false }])
  const updateItem = (id: string, name: string) => setInventory((current) => current.map((item) => item.id === id ? { ...item, name, confirmed: false } : item))
  const toggleItem = (id: string) => setInventory((current) => current.map((item) => item.id === id ? { ...item, confirmed: item.name.trim() ? !item.confirmed : false } : item))
  const removeItem = (id: string) => setInventory((current) => current.filter((item) => item.id !== id))
  const splitItem = (item: InventoryItem) => setInventory((current) => [...current, { ...item, id: crypto.randomUUID(), name: item.name, confirmed: false }])
  const mergeItem = (sourceId: string) => {
    const targetId = mergeTargets[sourceId]
    if (!targetId || targetId === sourceId) return
    setInventory((current) => {
      const source = current.find((item) => item.id === sourceId)
      const target = current.find((item) => item.id === targetId)
      if (!source || !target) return current
      return current.filter((item) => item.id !== sourceId).map((item) => item.id === targetId ? { ...item, uncertain: item.uncertain || source.uncertain, confirmed: false } : item)
    })
    setMergeTargets((current) => { const next = { ...current }; delete next[sourceId]; return next })
  }
  const confirmInventory = () => { if (confirmedIngredients.length !== inventory.length || inventory.length === 0) { setError('Erősítsd meg vagy töröld az összes felismert alapanyagot.'); return }; setError(null); setStage('preferences') }

  const generate = async () => {
    const servingValue = Number(servings.replace(',', '.'))
    if (!Number.isFinite(servingValue) || servingValue <= 0 || servingValue > 50) { setError('Az adagok száma 0-nál nagyobb és legfeljebb 50 lehet.'); return }
    const limit = limitText.trim() ? Number(limitText.replace(',', '.')) : null
    if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) { setError('A megadott CH-keret legyen érvényes szám.'); return }
    setBusy(true); setError(null)
    try {
      const result = await generateChefRecipes({ ingredients: confirmedIngredients.map((item) => item.name.trim()), meal_type: mealType, servings: servingValue, required_ingredients: requiredText.split(',').map((value) => value.trim()).filter(Boolean), excluded_ingredients: excludedText.split(',').map((value) => value.trim()).filter(Boolean), carbohydrate_limit_g: limit })
      setRecipes(result.recipes); setSelectedRecipe(null); setStage('recipes')
    } catch (value) { if (recipes.length > 0) setStage('recipes'); setError(value instanceof Error ? value.message : 'A receptgenerálás nem sikerült. A jóváhagyott leltár megmaradt.') } finally { setBusy(false) }
  }

  const addMissingToShopping = async (names: string[]) => {
    const clean = names.reduce<string[]>((result, name) => {
      const trimmed = name.trim()
      const key = comparisonKey(trimmed)
      if (key && !result.some((existing) => comparisonKey(existing) === key)) result.push(trimmed)
      return result
    }, [])
    if (clean.length === 0) return
    try {
      const existing = guestMode ? await listGuestShopping() : await listShopping()
      const known = new Set(existing.map((item) => comparisonKey(item.name)))
      const additions = clean.filter((name) => !known.has(comparisonKey(name)))
      const now = new Date().toISOString()
      if (guestMode) {
        await Promise.all(additions.map((name) => saveGuestShopping({ id: crypto.randomUUID(), name, quantity: null, unit: 'db', checked: false, source: 'recipe_missing', createdAt: now, updatedAt: now } satisfies ShoppingItem)))
      } else {
        await Promise.all(additions.map((name) => createShopping({ name, quantity: null, unit: 'db' })))
      }
      setShoppingNotice(additions.length > 0 ? `${additions.length} hiányzó hozzávaló a bevásárlólistára került.` : 'A hiányzó hozzávalók már a bevásárlólistán vannak.')
    } catch (value) {
      setShoppingNotice(value instanceof Error ? value.message : 'A bevásárlólista frissítése nem sikerült.')
    }
  }

  const instructionsText = selectedRecipe?.instructions.join('\n') ?? ''
  const reviewIngredients = selectedRecipe?.ingredients.map((name) => ({ name, uncertain: false } satisfies FoodVisionIngredient)) ?? []

  if (stage === 'review' && selectedRecipe) return <ChefWorkflow guestMode={guestMode} selectedDate={selectedDate} initialName={selectedRecipe.name} initialIngredients={reviewIngredients} initialInstructions={instructionsText} initialServings={selectedRecipe.servings ?? (Number(servings.replace(',', '.')) || 1)} mealCategory={mealCategory} onExit={() => setStage('recipes')} onCompleted={onCompleted} />

  return <section className="fridge-workflow" data-testid="fridge-workflow" aria-label="Hűtőfotó és receptkészítő">
    <div className="chef-header"><div><p className="eyebrow">CHill Chef · {stage === 'photos' ? '1 / 5 Fotók' : stage === 'inventory' ? '2 / 5 Leltár' : stage === 'preferences' ? '3 / 5 Beállítások' : '4 / 5 Receptötletek'}</p><h3>{stage === 'photos' ? 'Hűtőm lefényképezése' : stage === 'inventory' ? 'Ellenőrizd a hűtőleltárt' : stage === 'preferences' ? 'Mit főzzek ezekből?' : 'Válassz egy receptötletet'}</h3><p className="goal-help">A fotók helyben maradnak, a felismerés és a receptgenerálás csak külön gombnyomásra indul.</p></div><button className="close-button" onClick={onExit} aria-label="Hűtőfolyamat bezárása"><X size={18} /></button></div>
    {stage === 'photos' && <>
      <div className="fridge-photo-grid">{images.map((image, index) => <figure className="fridge-photo" key={image.id}><img src={image.url} alt={`Hűtőfotó ${index + 1}`} /><button className="fridge-photo-remove" onClick={() => removeImage(image.id)} aria-label={`Hűtőfotó ${index + 1} törlése`}><Trash2 size={16} /></button></figure>)}{images.length === 0 && <p className="search-state">Adj hozzá egy vagy több fotót a nyitott hűtőről.</p>}</div>
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={selectFiles} />
      <div className="chef-actions"><button className="secondary-action" onClick={() => fileRef.current?.click()} disabled={images.length >= MAX_IMAGES}>Képek feltöltése</button><button className="secondary-action" onClick={() => { setCameraOpen(true); setCameraKey((value) => value + 1) }} disabled={images.length >= MAX_IMAGES}>Kamera megnyitása</button><button className="confirm-button" onClick={() => void recognize()} disabled={images.length === 0 || busy}>{busy ? 'Felismerés…' : 'Élelmiszerek felismerése'} <Check size={18} /></button></div>
      {cameraOpen && <CameraCapture key={cameraKey} title="Hűtőfotó készítése" description="Készíts egy képet, majd a fotó hozzáadódik a gyűjteményhez. A kamera nem indul el feltöltéskor." busy={busy} onCapture={async (blob) => { addBlobs([blob]); setCameraOpen(false) }} onClose={() => setCameraOpen(false)} />}
    </>}
    {stage === 'inventory' && <>
      <div className="fridge-inventory">{inventory.map((item) => <div className={'fridge-inventory-row ' + (item.uncertain ? 'uncertain' : '')} key={item.id}><label className="goal-input"><span>{item.uncertain ? 'Lehetséges élelmiszer' : 'Élelmiszer'}</span><input value={item.name} onChange={(event) => updateItem(item.id, event.target.value)} aria-label="Felismert élelmiszer" /></label><div className="fridge-row-actions"><button className={item.confirmed ? 'confirm-button compact-action' : 'secondary-action compact-action'} onClick={() => toggleItem(item.id)} disabled={!item.name.trim()}>{item.confirmed ? 'Megerősítve' : 'Megerősítem'}</button>{inventory.length > 1 && <><select className="compact-select" aria-label={`${item.name || 'Élelmiszer'} összevonása`} value={mergeTargets[item.id] ?? ''} onChange={(event) => setMergeTargets((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Összevonás…</option>{inventory.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name || 'Névtelen élelmiszer'}</option>)}</select><button className="secondary-action compact-action" onClick={() => mergeItem(item.id)} disabled={!mergeTargets[item.id]}>Egyesítés</button></>}<button className="secondary-action compact-action" onClick={() => splitItem(item)}>Szétválasztás</button><button className="secondary-action compact-action" onClick={() => removeItem(item.id)} aria-label="Élelmiszer törlése"><Trash2 size={16} /></button></div></div>)}</div>
      <div className="chef-actions"><button className="secondary-action" onClick={addManual}><Plus size={17} /> Alapanyag hozzáadása</button><button className="secondary-action" onClick={() => setStage('photos')}>Vissza a fotókhoz</button><button className="confirm-button" onClick={confirmInventory} disabled={inventory.length === 0 || confirmedIngredients.length !== inventory.length}>Leltár jóváhagyása <Check size={18} /></button></div>
    </>}
    {stage === 'preferences' && <>
      <div className="chef-preferences"><label className="goal-input"><span>Étkezés</span><select value={mealType} onChange={(event) => setMealType(event.target.value)}><option value="breakfast">Reggeli</option><option value="lunch">Ebéd</option><option value="dinner">Vacsora</option><option value="other">Egyéb</option></select></label><label className="goal-input"><span>Adagok</span><input inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} /></label><label className="goal-input"><span>Mindenképpen használandó, vesszővel</span><input value={requiredText} onChange={(event) => setRequiredText(event.target.value)} placeholder="például paradicsom" /></label><label className="goal-input"><span>Kizárandó, vesszővel</span><input value={excludedText} onChange={(event) => setExcludedText(event.target.value)} placeholder="például tej" /></label><label className="goal-input"><span>Étkezési CH-keret, opcionális</span><input inputMode="decimal" value={limitText} onChange={(event) => setLimitText(event.target.value)} placeholder="A CH-t később számítjuk" /></label></div>
      <div className="chef-actions"><button className="secondary-action" onClick={() => setStage('inventory')}>Vissza a leltárhoz</button><button className="confirm-button" onClick={() => void generate()} disabled={busy}>{busy ? 'Receptgenerálás…' : 'Mit főzzek ezekből?'} <Check size={18} /></button></div>
    </>}
    {stage === 'recipes' && <>
      <div className="fridge-recipe-list">{recipes.map((recipe) => <article className="fridge-recipe-card" key={recipe.name}><h4>{recipe.name}</h4><p>{recipe.description}</p><p><strong>Hozzávalók:</strong> {recipe.ingredients.join(', ')}</p>{recipe.missingIngredients.length > 0 && <p className="chef-warning"><strong>Hiányzó:</strong> {recipe.missingIngredients.join(', ')}</p>}<ol>{recipe.instructions.map((step) => <li key={step}>{step}</li>)}</ol><div className="chef-actions"><button className="confirm-button" onClick={() => setSelectedRecipe({ ...recipe, ingredients: [...recipe.ingredients], instructions: [...recipe.instructions] })}>Recept ellenőrzése</button>{recipe.missingIngredients.length > 0 && <button className="secondary-action" onClick={() => void addMissingToShopping(recipe.missingIngredients)}>Hiányzók a bevásárlólistára</button>}</div></article>)}</div>
      {selectedRecipe && <div className="fridge-recipe-editor"><label className="goal-input"><span>Recept neve</span><input value={selectedRecipe.name} onChange={(event) => setSelectedRecipe({ ...selectedRecipe, name: event.target.value })} /></label><label className="goal-input"><span>Leírás</span><textarea value={selectedRecipe.description} onChange={(event) => setSelectedRecipe({ ...selectedRecipe, description: event.target.value })} rows={3} /></label><label className="goal-input"><span>Hozzávalók, vesszővel</span><textarea value={selectedRecipe.ingredients.join(', ')} onChange={(event) => setSelectedRecipe({ ...selectedRecipe, ingredients: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} rows={3} /></label><label className="goal-input"><span>Elkészítés, lépésenként</span><textarea value={selectedRecipe.instructions.join('\n')} onChange={(event) => setSelectedRecipe({ ...selectedRecipe, instructions: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} rows={5} /></label><label className="goal-input"><span>Adagok</span><input inputMode="decimal" value={selectedRecipe.servings ?? ''} onChange={(event) => setSelectedRecipe({ ...selectedRecipe, servings: Number(event.target.value.replace(',', '.')) || null })} /></label>{selectedRecipe.missingIngredients.length > 0 && <button className="secondary-action" onClick={() => void addMissingToShopping(selectedRecipe.missingIngredients)}>Hiányzók a bevásárlólistára</button>}{shoppingNotice && <p className="goal-help" role="status">{shoppingNotice}</p>}<div className="chef-actions"><button className="secondary-action" onClick={() => setSelectedRecipe(null)}>Vissza a receptekhez</button><button className="confirm-button" onClick={() => { if (!selectedRecipe.name.trim() || selectedRecipe.ingredients.length === 0 || selectedRecipe.instructions.length === 0) { setError('A recept neve, hozzávalói és elkészítése szükséges.'); return }; setError(null); setStage('review') }}>Hozzávalók ellenőrzése <Check size={18} /></button></div></div>}
      {!selectedRecipe && <button className="secondary-action" onClick={() => setStage('preferences')}>Újrakérés más beállításokkal</button>}
    </>}
    {error && <p className="input-error" role="alert">{error}</p>}
  </section>
}
