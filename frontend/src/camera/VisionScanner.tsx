import { useRef, useState } from 'react'
import { CameraCapture } from './CameraCapture'
import { FoodVisionError, identifyFoodImage, type FoodVisionResult, type FoodVisionSuggestion } from '../api/vision'
import { Check, X } from '../components/icons'

type VisionState = 'empty' | 'selected' | 'processing' | 'success' | 'error'

export function VisionScanner({ onSuggestion, onClose }: { onSuggestion: (name: string) => void; onClose?: () => void }) {
  const [result, setResult] = useState<FoodVisionResult | null>(null)
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
    setSourceImage(null)
    setError(null)
    setBusy(false)
  }

  if (result) return <section className="camera-capture vision-result" aria-label="Étel fotó eredménye" data-vision-state={state}>
    <div className="camera-capture-header"><div><p className="eyebrow">Étel fotó · Javaslatok</p><h3>Válassz kereshető élelmiszert</h3>{result.uncertain && <p className="goal-help">A javaslat vagy az összetevők bizonytalanok. Ellenőrizd a találatot.</p>}</div>{onClose && <button className="close-button" onClick={onClose} aria-label="Étel fotó bezárása"><X size={18} /></button>}</div>
    {result.suggestions.length === 0 ? <p className="search-state">Nem érkezett használható javaslat. Folytasd kézi kereséssel.</p> : <div className="vision-suggestions">{result.suggestions.map((item: FoodVisionSuggestion) => <button className="food-option" key={item.name} onClick={() => onSuggestion(item.name)}><span className="food-copy"><strong>{item.name}</strong>{item.confidence !== null && <small>{Math.round(item.confidence * 100)}% bizonyosság</small>}{item.possibleIngredients.length > 0 && <small>{item.possibleIngredients.join(', ')}</small>}</span><Check size={18} /></button>)}</div>}
    <div className="camera-actions"><button className="secondary-action" onClick={reset}>Új kép</button>{sourceImage && <button className="secondary-action" onClick={() => void process(sourceImage)}>Elemzés újra</button>}</div>
  </section>

  return <CameraCapture
    title="Étel fotó"
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
