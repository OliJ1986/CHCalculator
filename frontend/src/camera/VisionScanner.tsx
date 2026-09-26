import { useState } from 'react'
import { CameraCapture } from './CameraCapture'
import { identifyFoodImage, type FoodVisionSuggestion } from '../api/vision'
import { Check, X } from '../components/icons'

export function VisionScanner({ onSuggestion, onClose }: { onSuggestion: (name: string) => void; onClose?: () => void }) {
  const [suggestions, setSuggestions] = useState<FoodVisionSuggestion[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const process = async (image: Blob) => {
    setBusy(true); setError(null)
    try { setSuggestions((await identifyFoodImage(image)).suggestions) } catch (value) { setError(value instanceof Error ? value.message : 'Az ételfelismerés nem sikerült.') } finally { setBusy(false) }
  }
  if (suggestions) return <section className="camera-capture vision-result" aria-label="Étel fotó eredménye"><div className="camera-capture-header"><div><p className="eyebrow">Étel fotó · Javaslatok</p><h3>Válassz kereshető élelmiszert</h3></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Étel fotó bezárása"><X size={18} /></button>}</div>{suggestions.length === 0 ? <p className="search-state">Nem érkezett használható javaslat. Folytasd kézi kereséssel.</p> : <div className="vision-suggestions">{suggestions.map((item) => <button className="food-option" key={item.name} onClick={() => onSuggestion(item.name)}><span className="food-copy"><strong>{item.name}</strong>{item.confidence !== null && <small>{Math.round(item.confidence * 100)}% bizonyosság</small>}{item.possibleIngredients.length > 0 && <small>{item.possibleIngredients.join(', ')}</small>}</span><Check size={18} /></button>)}</div>}<div className="camera-actions"><button className="secondary-action" onClick={() => setSuggestions(null)}>Új kép</button></div></section>
  return <CameraCapture title="Étel felismerése" description={error ?? 'Az AI csak ételneveket és lehetséges hozzávalókat javasol. CH-értéket nem becsül és nem ment automatikusan.'} captureLabel="Étel felismerése" busy={busy} onCapture={process} onClose={onClose} />
}
