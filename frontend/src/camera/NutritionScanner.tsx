import { useState } from 'react'
import { CameraCapture } from './CameraCapture'
import { parseNutritionLabel, type NutritionDraft } from './nutrition'
import { Check, X } from '../components/icons'

async function recognizeLabel(image: Blob, onProgress: (value: number) => void): Promise<NutritionDraft> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { logger: (message) => { if (message.status === 'recognizing text') onProgress(message.progress) } })
  try {
    const result = await worker.recognize(image)
    return parseNutritionLabel(result.data.text)
  } finally {
    await worker.terminate()
  }
}

export function NutritionScanner({ onConfirm, onClose }: { onConfirm: (draft: NutritionDraft) => void | Promise<void>; onClose?: () => void }) {
  const [draft, setDraft] = useState<NutritionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const process = async (image: Blob) => {
    setBusy(true); setError(null); setProgress(0)
    try { setDraft(await recognizeLabel(image, setProgress)) } catch { setError('A címke felismerése nem sikerült. Ellenőrizd és add meg kézzel az adatokat.') } finally { setBusy(false) }
  }
  if (draft) return <section className="camera-capture nutrition-result" aria-label="Tápérték ellenőrzése"><div className="camera-capture-header"><div><p className="eyebrow">Tápérték · Ellenőrzés</p><h3>Javítsd vagy hagyd jóvá az adatokat</h3></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Tápérték bezárása"><X size={18} /></button>}</div><label className="goal-input"><span>Élelmiszer neve</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="goal-input"><span>Elérhető CH / 100 g</span><input inputMode="decimal" value={draft.carbs100g ?? ''} onChange={(event) => setDraft({ ...draft, carbs100g: Number(event.target.value.replace(',', '.')) || null })} /></label><label className="goal-input"><span>Rost / 100 g (opcionális)</span><input inputMode="decimal" value={draft.fiber100g ?? ''} onChange={(event) => setDraft({ ...draft, fiber100g: Number(event.target.value.replace(',', '.')) || null })} /></label><p className={draft.confidence === 'high' ? 'camera-ready' : 'input-error'}>{draft.confidence === 'high' ? <><Check size={16} /> 100 g alapú, ellenőrizhető felismerés.</> : 'Bizonytalan vagy nem 100 g alapú felismerés. Mentés előtt javítsd az értékeket.'}</p><div className="camera-actions"><button className="confirm-button" onClick={() => void onConfirm(draft)} disabled={!draft.name.trim() || draft.carbs100g === null || draft.basis !== '100g'}><Check size={18} />Saját étel létrehozása</button><button className="secondary-action" onClick={() => setDraft(null)}>Új kép</button></div></section>
  return <CameraCapture title="Tápérték felismerése" description={error ?? `A címkét helyben, a böngészőben olvassuk. ${busy ? `Feldolgozás: ${Math.round(progress * 100)}%` : 'Az eredményt mentés előtt mindig ellenőrizd.'}`} captureLabel="Címke beolvasása" busy={busy} onCapture={process} onClose={onClose} />
}
