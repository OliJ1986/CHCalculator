import { useEffect, useRef, useState } from 'react'
import { Camera, X } from '../components/icons'
import type { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (barcode: string) => void | Promise<void>; onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stop = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    readerRef.current = null
    setActive(false)
  }

  const detected = async (value: string) => {
    const code = value.trim()
    if (!code || busy) return
    setBusy(true)
    stop()
    try { await onDetected(code) } finally { setBusy(false) }
  }

  const start = async () => {
    setError(null)
    if (!videoRef.current) return
    stop()
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      controlsRef.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, videoRef.current, (result) => {
        if (result) void detected(result.getText())
      })
      setActive(true)
    } catch (value) {
      setError(value instanceof DOMException && value.name === 'NotAllowedError' ? 'A kameraengedély nélkül is beírhatod a vonalkódot.' : 'A vonalkódolvasó nem indítható. Használd a képfeltöltést vagy a kézi bevitelt.')
    }
  }

  const fileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null); setBusy(true)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = readerRef.current ?? new BrowserMultiFormatReader()
      readerRef.current = reader
      const url = URL.createObjectURL(file)
      try { const result = await reader.decodeFromImageUrl(url); if (result) await detected(result.getText()); else setError('Nem találtam vonalkódot a képen.') } finally { URL.revokeObjectURL(url) }
    } catch { setError('Nem találtam olvasható vonalkódot a képen.') } finally { setBusy(false) }
  }

  useEffect(() => () => stop(), [])

  return <section className="camera-capture barcode-scanner" aria-label="Vonalkódolvasó">
    <div className="camera-capture-header"><div><p className="eyebrow">Kamera · Vonalkód</p><h3>Termék azonosítása</h3><p className="goal-help">EAN-13 és EAN-8 kódot is beolvashatsz.</p></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Vonalkódolvasó bezárása"><X size={18} /></button>}</div>
    {active ? <div className="camera-view"><video ref={videoRef} autoPlay playsInline muted aria-label="Vonalkód kamera előnézete" /><div className="barcode-guide" aria-hidden="true" /></div> : <div className="camera-placeholder"><Camera size={28} /><span>A kódot tartsd a keretben.</span></div>}
    {error && <p className="input-error" role="alert">{error}</p>}
    <div className="camera-actions"><button className="confirm-button" onClick={() => void start()} disabled={active || busy}><Camera size={18} />Olvasás indítása</button><button className="secondary-action" onClick={() => fileRef.current?.click()} disabled={busy}>Képből olvasás</button>{active && <button className="secondary-action" onClick={stop} disabled={busy}>Leállítás</button>}</div>
    <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => void fileSelected(event)} />
    <form className="barcode-manual" onSubmit={(event) => { event.preventDefault(); void detected(manual) }}><label><span>Vonalkód kézzel</span><input value={manual} onChange={(event) => setManual(event.target.value)} inputMode="numeric" pattern="[0-9]+" placeholder="Pl. 5991234567890" /></label><button className="secondary-action" type="submit" disabled={busy || manual.trim().length < 8}>Keresés</button></form>
    {busy && <p className="search-state" role="status">Termék keresése…</p>}
  </section>
}
