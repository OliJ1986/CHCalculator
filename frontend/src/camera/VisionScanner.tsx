import { useRef, useState } from 'react'
import { CameraCapture } from './CameraCapture'
import { FoodVisionError, identifyFoodImage, type FoodVisionIngredient, type FoodVisionResult, type FoodVisionSuggestion } from '../api/vision'
import { Check, X } from '../components/icons'

type VisionState = 'empty' | 'selected' | 'processing' | 'success' | 'error'

export type ConfirmedVisionSuggestion = {
  name: string
  ingredients: FoodVisionIngredient[]
}

function normalizeIngredient(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function VisionScanner({ onSuggestion, onClose, mode = 'food' }: { onSuggestion: (suggestion: ConfirmedVisionSuggestion) => void; onClose?: () => void; mode?: 'food' | 'ingredients' }) {
  const ingredientMode = mode === 'ingredients'
  const [result, setResult] = useState<FoodVisionResult | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<FoodVisionSuggestion | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftIngredients, setDraftIngredients] = useState('')
  const [sourceImage, setSourceImage] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FoodVisionError | Error | null>(null)
  const requestRef = useRef(0)
  const state: VisionState = busy ? 'processing' : result ? 'success' : error ? 'error' : sourceImage ? 'selected' : 'empty'

  const process = async (image: Blob) => {
    if (busy) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setSourceImage(image)
    setResult(null)
    setSelectedSuggestion(null)
    setBusy(true)
    setError(null)
    try {
      const next = await identifyFoodImage(image)
      if (requestId !== requestRef.current) return
      setResult(next)
    } catch (value) {
      if (requestId !== requestRef.current) return
      setError(value instanceof FoodVisionError || value instanceof Error ? value : new Error('Az ételfelismerés nem sikerült.'))
    } finally {
      if (requestId === requestRef.current) setBusy(false)
    }
  }

  const reset = () => {
    requestRef.current += 1
    setResult(null)
    setSelectedSuggestion(null)
    setSourceImage(null)
    setError(null)
    setBusy(false)
  }

  const chooseSuggestion = (item: FoodVisionSuggestion) => {
    setSelectedSuggestion(item)
    setDraftName(item.name)
    setDraftIngredients(item.possibleIngredients.map((ingredient) => ingredient.name).join(', '))
  }

  const confirmSuggestion = () => {
    const name = draftName.trim()
    if (!name) return
    const originalUncertainty = new Map((selectedSuggestion?.possibleIngredients ?? []).map((ingredient) => [normalizeIngredient(ingredient.name), ingredient.uncertain]))
    const ingredients = draftIngredients.split(',').map((value) => value.trim()).filter(Boolean).map((value) => ({
      name: value,
      uncertain: originalUncertainty.get(normalizeIngredient(value)) ?? false,
    }))
    onSuggestion({ name, ingredients })
  }

  const confidenceLabel = (item: FoodVisionSuggestion) => {
    const uncertain = result?.uncertain || item.possibleIngredients.some((ingredient) => ingredient.uncertain)
    if (uncertain || item.confidence === null || item.confidence < 0.65) return 'Bizonytalan egyezés'
    if (item.confidence < 0.85) return 'Valószínű egyezés'
    return 'Erős egyezés'
  }

  const ingredientLabel = (item: FoodVisionSuggestion) => item.possibleIngredients.map((ingredient) => ingredient.uncertain ? `Lehetséges összetevő: ${ingredient.name}` : ingredient.name).join(', ')

  if (result) return <section className="camera-capture vision-result" aria-label={ingredientMode ? 'Alapanyag fotó eredménye' : 'Étel fotó eredménye'} data-vision-state={state}>
    <div className="camera-capture-header"><div><p className="eyebrow">{ingredientMode ? 'Alapanyag fotó · Javaslatok' : 'Étel fotó · Javaslatok'}</p><h3>{selectedSuggestion ? 'Ellenőrizd a javaslatot' : ingredientMode ? 'Ellenőrizd az alapanyagokat' : 'Válassz kereshető élelmiszert'}</h3>{result.uncertain && <p className="goal-help">A javaslat vagy egy összetevő bizonytalan. Ellenőrizd és szükség esetén javítsd.</p>}</div>{onClose && <button className="close-button" onClick={onClose} aria-label="Étel fotó bezárása"><X size={18} /></button>}</div>
    {result.suggestions.length === 0 ? <p className="search-state">Nem érkezett használható javaslat. Folytasd kézi kereséssel.</p> : selectedSuggestion ? <div className="vision-confirmation">
      <label className="goal-input"><span>Étel neve</span><input aria-label="Étel neve" value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label>
      <label className="goal-input vision-ingredients"><span>Összetevők ellenőrzése</span><textarea aria-label="Összetevők ellenőrzése" value={draftIngredients} onChange={(event) => setDraftIngredients(event.target.value)} rows={3} /></label>
      <p className="goal-help">Az összetevők csak ellenőrzési információk. A CH-értéket kizárólag a kiválasztott adatforrás adataiból számítjuk.</p>
      {selectedSuggestion.possibleIngredients.some((ingredient) => ingredient.uncertain) && <p className="goal-help">Lehetséges összetevő: {selectedSuggestion.possibleIngredients.filter((ingredient) => ingredient.uncertain).map((ingredient) => ingredient.name).join(', ')}</p>}
      {(selectedSuggestion.possibleIngredients.some((ingredient) => ingredient.uncertain) || result.uncertain) && <p className="goal-help" role="status">Egy vagy több összetevő csak lehetséges. Erősítsd meg vagy javítsd a nevet a keresés előtt.</p>}
      <div className="camera-actions"><button className="confirm-button" onClick={confirmSuggestion} disabled={!draftName.trim()}><Check size={18} />{ingredientMode ? 'Alapanyagok megerősítése' : 'Étel megerősítése és keresése'}</button><button className="secondary-action" onClick={() => setSelectedSuggestion(null)}>Vissza a javaslatokhoz</button></div>
    </div> : <div className="vision-suggestions">{result.suggestions.map((item: FoodVisionSuggestion) => <button className="food-option" key={item.name} onClick={() => chooseSuggestion(item)}><span className="food-copy"><strong>{item.name}</strong><small>{confidenceLabel(item)}</small>{item.possibleIngredients.length > 0 && <small>{ingredientLabel(item)}</small>}</span><Check size={18} /></button>)}</div>}
    <div className="camera-actions"><button className="secondary-action" onClick={reset}>Új kép</button>{sourceImage && <button className="secondary-action" onClick={() => void process(sourceImage)}>Elemzés újra</button>}</div>
  </section>

  return <CameraCapture
    title={ingredientMode ? 'Alapanyag fotó' : 'Étel fotó'}
    description={error?.message ?? 'Válassz egy képet vagy készíts újat. A felismeréshez nem kell kameraengedély, ha már kiválasztottál egy képfájlt.'}
    captureLabel="Elemzés indítása"
    busy={busy}
    onCapture={process}
    onRetry={sourceImage ? () => process(sourceImage) : undefined}
    showCameraButton={!sourceImage}
    initialImage={sourceImage}
    descriptionRole={error ? 'alert' : 'status'}
    visionState={state === 'success' ? 'selected' : state}
    onClose={onClose}
  />
}
