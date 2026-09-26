import { useEffect, useState } from 'react'
import { CameraCapture } from './CameraCapture'
import { parseNutritionLabel, type NutritionDraft, type NutritionValues, type NutritionBasis } from './nutrition'
import { Check, X } from '../components/icons'

type Crop = { left: number; top: number; width: number; height: number }
type OcrWindow = Window & { __CHILL_NUTRITION_OCR_TEXT?: string }

function emptyDraft(): NutritionDraft {
  return {
    name: '',
    carbs100g: null,
    sugars100g: null,
    fiber100g: null,
    protein100g: null,
    fat100g: null,
    values: { carbohydrates: null, sugars: null, fiber: null, protein: null, fat: null },
    basis: '100g',
    servingSizeG: null,
    tableDetected: false,
    confidence: 'low',
    rawText: '',
  }
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null
  const number = Number(value.replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? number : null
}

function cropAndEnhance(source: Blob, crop: Crop, contrast: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const sx = Math.round(image.naturalWidth * crop.left)
      const sy = Math.round(image.naturalHeight * crop.top)
      const sw = Math.max(1, Math.round(image.naturalWidth * crop.width))
      const sh = Math.max(1, Math.round(image.naturalHeight * crop.height))
      const scale = Math.min(1.5, 2400 / Math.max(sw, sh))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw * scale))
      canvas.height = Math.max(1, Math.round(sh * scale))
      const context = canvas.getContext('2d', { willReadFrequently: contrast })
      if (!context) return reject(new Error('A kép feldolgozása nem sikerült.'))
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      if (contrast) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        for (let index = 0; index < pixels.data.length; index += 4) {
          pixels.data[index] = Math.max(0, Math.min(255, (pixels.data[index] - 128) * 1.35 + 128))
          pixels.data[index + 1] = Math.max(0, Math.min(255, (pixels.data[index + 1] - 128) * 1.35 + 128))
          pixels.data[index + 2] = Math.max(0, Math.min(255, (pixels.data[index + 2] - 128) * 1.35 + 128))
        }
        context.putImageData(pixels, 0, 0)
      }
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('A kép feldolgozása nem sikerült.')), 'image/jpeg', 0.92)
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('A kép nem olvasható.')) }
    image.src = url
  })
}

async function recognizeLabel(image: Blob, onProgress: (value: number) => void): Promise<NutritionDraft> {
  // The development-only hook makes the browser regression test deterministic
  // without sending a fixture to an OCR service.
  const mockText = import.meta.env.DEV ? (window as OcrWindow).__CHILL_NUTRITION_OCR_TEXT : undefined
  if (mockText) return parseNutritionLabel(mockText)
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('hun+eng', 1, { logger: (message) => { if (message.status === 'recognizing text') onProgress(message.progress) } })
  try {
    const result = await worker.recognize(image)
    return parseNutritionLabel(result.data.text)
  } finally {
    await worker.terminate()
  }
}

const basisLabel: Record<Exclude<NutritionBasis, null>, string> = {
  '100g': '100 g',
  '100ml': '100 ml',
  serving: 'Adag',
}

export function NutritionScanner({ onConfirm, onClose }: { onConfirm: (draft: NutritionDraft) => void | Promise<void>; onClose?: () => void }) {
  const [source, setSource] = useState<{ blob: Blob; url: string } | null>(null)
  const [crop, setCrop] = useState<Crop>({ left: 0, top: 0, width: 1, height: 1 })
  const [contrast, setContrast] = useState(true)
  const [draft, setDraft] = useState<NutritionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url) }, [source])

  const reset = () => {
    setDraft(null)
    setError(null)
    setCrop({ left: 0, top: 0, width: 1, height: 1 })
    setSource((current) => { if (current) URL.revokeObjectURL(current.url); return null })
  }

  const process = async () => {
    if (!source) return
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      const cropped = await cropAndEnhance(source.blob, crop, contrast)
      setDraft(await recognizeLabel(cropped, setProgress))
    } catch {
      setDraft(emptyDraft())
      setError('A címke felismerése nem sikerült. Az adatokat kézzel megadhatod és ellenőrzés után mentheted.')
    } finally {
      setBusy(false)
    }
  }

  const updateValue = (field: keyof NutritionValues, value: number | null) => {
    setDraft((current) => {
      if (!current) return current
      const values = { ...current.values, [field]: value }
      const next: NutritionDraft = { ...current, values }
      if (current.basis === '100g') {
        if (field === 'carbohydrates') next.carbs100g = value
        if (field === 'sugars') next.sugars100g = value
        if (field === 'fiber') next.fiber100g = value
        if (field === 'protein') next.protein100g = value
        if (field === 'fat') next.fat100g = value
      }
      return next
    })
  }

  const updateBasis = (basis: NutritionBasis) => setDraft((current) => {
    if (!current) return current
    const is100g = basis === '100g'
    return {
      ...current,
      basis,
      carbs100g: is100g ? current.values.carbohydrates : null,
      sugars100g: is100g ? current.values.sugars : null,
      fiber100g: is100g ? current.values.fiber : null,
      protein100g: is100g ? current.values.protein : null,
      fat100g: is100g ? current.values.fat : null,
    }
  })

  if (draft) {
    const canSave = draft.name.trim() && draft.basis === '100g' && draft.values.carbohydrates !== null
    return <section className="camera-capture nutrition-result" aria-label="Tápérték ellenőrzése">
      <div className="camera-capture-header"><div><p className="eyebrow">Tápérték · Ellenőrzés</p><h3>Javítsd vagy hagyd jóvá az adatokat</h3></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Tápérték bezárása"><X size={18} /></button>}</div>
      <label className="goal-input"><span>Élelmiszer neve</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="goal-input"><span>Tápértékalap</span><select value={draft.basis ?? ''} onChange={(event) => updateBasis((event.target.value || null) as NutritionBasis)}><option value="">Ismeretlen</option>{Object.entries(basisLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {([['carbohydrates', 'Szénhidrát'], ['sugars', 'Ebből cukrok'], ['fiber', 'Rost'], ['protein', 'Fehérje'], ['fat', 'Zsír']] as const).map(([field, label]) => <label className="goal-input" key={field}><span>{label} / {draft.basis ? basisLabel[draft.basis] : 'alap'}</span><input inputMode="decimal" value={draft.values[field] ?? ''} onChange={(event) => updateValue(field, numberOrNull(event.target.value))} /></label>)}
      {error && <p className="input-error" role="alert">{error}</p>}
      <p className={draft.confidence === 'high' ? 'camera-ready' : 'input-error'}>{draft.confidence === 'high' ? <><Check size={16} /> Ellenőrizhető, 100 g alapú felismerés.</> : 'Ellenőrizd a mezőket. A hiányzó érték ismeretlen marad; a 0 érvényes érték.'}</p>
      <div className="camera-actions"><button className="confirm-button" onClick={() => void onConfirm(draft)} disabled={!canSave}><Check size={18} />Saját étel létrehozása</button><button className="secondary-action" onClick={reset}>Új kép</button></div>
      {draft.rawText && <details><summary>Nyers OCR-szöveg</summary><pre className="ocr-raw-text">{draft.rawText}</pre></details>}
    </section>
  }

  if (source) return <section className="camera-capture nutrition-crop" aria-label="Címke kivágása">
    <div className="camera-capture-header"><div><p className="eyebrow">Helyi képfeldolgozás</p><h3>Jelöld ki a tápértéktáblázatot</h3><p className="goal-help">A kép nem kerül feltöltésre. A kivágás és a kontrasztjavítás a telefonon fut.</p></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Tápérték bezárása"><X size={18} /></button>}</div>
    <img className="nutrition-crop-image" src={source.url} alt="Feldolgozandó címke" />
    <div className="nutrition-crop-controls">
      {([['left', 'Bal szél'], ['top', 'Felső szél'], ['width', 'Szélesség'], ['height', 'Magasság']] as const).map(([field, label]) => <label key={field}><span>{label}</span><input type="range" min="0" max="1" step="0.01" value={crop[field]} onChange={(event) => setCrop({ ...crop, [field]: Number(event.target.value) })} /></label>)}
    </div>
    <label className="checkbox-line"><input type="checkbox" checked={contrast} onChange={(event) => setContrast(event.target.checked)} /> Erősebb kontraszt és nagyítás</label>
    {error && <p className="input-error" role="alert">{error}</p>}
    <div className="camera-actions"><button className="confirm-button" onClick={() => void process()} disabled={busy}><Check size={18} />{busy ? `Feldolgozás: ${Math.round(progress * 100)}%` : 'Kivágás és felismerés'}</button><button className="secondary-action" onClick={reset} disabled={busy}>Új kép</button></div>
  </section>

  return <CameraCapture title="Tápérték felismerése" description="A címkét helyben, a böngészőben olvassuk. Az eredményt mentés előtt mindig ellenőrizd." captureLabel="Címke beolvasása" busy={busy} onCapture={(blob) => { const url = URL.createObjectURL(blob); setSource({ blob, url }); setError(null) }} onClose={onClose} />
}
