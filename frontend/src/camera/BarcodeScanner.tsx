import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, X } from '../components/icons'
import type { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { isValidEan } from './barcode'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('A kép nem tölthető be'))
    image.src = url
  })
}

async function canvasBlob(image: HTMLImageElement, options: { scale: number; crop: boolean; contrast: boolean; rotation: 0 | 90 | 180 | 270 }): Promise<Blob | null> {
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  const cropWidth = options.crop ? Math.round(sourceWidth * 0.82) : sourceWidth
  const cropHeight = options.crop ? Math.round(sourceHeight * 0.82) : sourceHeight
  const maxDimension = Math.max(cropWidth, cropHeight)
  const scale = Math.min(options.scale, 2400 / maxDimension)
  const sourceCanvasWidth = Math.max(1, Math.round(cropWidth * scale))
  const sourceCanvasHeight = Math.max(1, Math.round(cropHeight * scale))
  const quarterTurn = options.rotation === 90 || options.rotation === 270
  const width = quarterTurn ? sourceCanvasHeight : sourceCanvasWidth
  const height = quarterTurn ? sourceCanvasWidth : sourceCanvasHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: options.contrast })
  if (!context) return null
  const sourceX = options.crop ? Math.round((sourceWidth - cropWidth) / 2) : 0
  const sourceY = options.crop ? Math.round((sourceHeight - cropHeight) / 2) : 0
  context.save()
  if (options.rotation === 90) {
    context.translate(width, 0)
    context.rotate(Math.PI / 2)
  } else if (options.rotation === 180) {
    context.translate(width, height)
    context.rotate(Math.PI)
  } else if (options.rotation === 270) {
    context.translate(0, height)
    context.rotate(-Math.PI / 2)
  }
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, sourceCanvasWidth, sourceCanvasHeight)
  context.restore()
  if (options.contrast) {
    const pixels = context.getImageData(0, 0, width, height)
    for (let index = 0; index < pixels.data.length; index += 4) {
      const luminance = 0.299 * pixels.data[index] + 0.587 * pixels.data[index + 1] + 0.114 * pixels.data[index + 2]
      const enhanced = Math.max(0, Math.min(255, (luminance - 128) * 1.7 + 128))
      pixels.data[index] = enhanced
      pixels.data[index + 1] = enhanced
      pixels.data[index + 2] = enhanced
    }
    context.putImageData(pixels, 0, 0)
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))
}

async function barcodeImageVariants(file: File): Promise<Blob[]> {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(sourceUrl)
    const variants: Blob[] = []
    for (const options of [
      { scale: 1, crop: false, contrast: false, rotation: 0 },
      { scale: 1.35, crop: false, contrast: false, rotation: 0 },
      { scale: 1.35, crop: true, contrast: false, rotation: 0 },
      { scale: 1.35, crop: false, contrast: true, rotation: 0 },
      { scale: 1.35, crop: true, contrast: true, rotation: 0 },
      { scale: 1.35, crop: false, contrast: false, rotation: 90 },
      { scale: 1.35, crop: false, contrast: false, rotation: 180 },
      { scale: 1.35, crop: false, contrast: false, rotation: 270 },
    ] as const) {
      const blob = await canvasBlob(image, options)
      if (blob) variants.push(blob)
    }
    return variants
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (barcode: string) => void | Promise<void>; onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const operationRef = useRef(0)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    operationRef.current += 1
    controlsRef.current?.stop()
    controlsRef.current = null
    readerRef.current = null
    const video = videoRef.current
    const stream = video?.srcObject
    if (stream && 'getTracks' in stream) stream.getTracks().forEach((track) => track.stop())
    if (video) {
      video.pause()
      video.srcObject = null
    }
    setActive(false)
  }, [])

  const deliver = useCallback(async (code: string) => {
    busyRef.current = true
    setBusy(true)
    stop()
    try {
      await onDetected(code)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [onDetected, stop])

  const detected = useCallback(async (value: string) => {
    const code = value.trim()
    if (busyRef.current) return
    if (!isValidEan(code)) {
      setError('Csak érvényes EAN-8 vagy EAN-13 vonalkód fogadható el.')
      return
    }
    await deliver(code)
  }, [deliver])

  const start = useCallback(async () => {
    setError(null)
    const video = videoRef.current
    if (!video) {
      setError('A kameraelőnézet nem érhető el. Próbáld a képfeltöltést vagy a kézi bevitelt.')
      return
    }
    stop()
    const operation = operationRef.current + 1
    operationRef.current = operation
    setActive(true)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (operation !== operationRef.current) return
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result) => {
        if (result) void detected(result.getText())
      })
      if (operation !== operationRef.current) {
        controls.stop()
        return
      }
      controlsRef.current = controls
    } catch (value) {
      if (operation !== operationRef.current) return
      stop()
      setError(value instanceof DOMException && value.name === 'NotAllowedError' ? 'A kameraengedélyt elutasítottad. Képfeltöltéssel vagy kézi bevitellel folytathatod.' : 'A vonalkódolvasó nem indítható. Használd a képfeltöltést vagy a kézi bevitelt.')
    }
  }, [detected, stop])

  const fileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      const variants = await barcodeImageVariants(file)
      for (const variant of variants) {
        const url = URL.createObjectURL(variant)
        try {
          const result = await reader.decodeFromImageUrl(url)
          if (result && isValidEan(result.getText())) {
            await deliver(result.getText())
            return
          }
        } catch {
          // Try the next locally processed image variant.
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      setError('Nem találtam érvényes EAN-8 vagy EAN-13 vonalkódot a képen. A képet nem töltöttük fel; add meg kézzel a kódot.')
    } catch {
      setError('A kép feldolgozása nem sikerült. A képet nem töltöttük fel; add meg kézzel a kódot.')
    } finally {
      readerRef.current = null
      busyRef.current = false
      setBusy(false)
    }
  }

  useEffect(() => () => stop(), [stop])

  return <section className="camera-capture barcode-scanner" aria-label="Vonalkódolvasó">
    <div className="camera-capture-header"><div><p className="eyebrow">Kamera · Vonalkód</p><h3>Termék azonosítása</h3><p className="goal-help">EAN-13 és EAN-8 kódot is beolvashatsz.</p></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Vonalkódolvasó bezárása"><X size={18} /></button>}</div>
    <div className={'camera-view ' + (active ? '' : 'camera-view-idle')}><video ref={videoRef} autoPlay playsInline muted aria-label="Vonalkód kamera előnézete" />{active && <div className="barcode-guide" aria-hidden="true" />}</div>
    {!active && <div className="camera-placeholder"><Camera size={28} /><span>A kódot tartsd a keretben.</span></div>}
    {error && <p className="input-error" role="alert">{error}</p>}
    <div className="camera-actions"><button className="confirm-button" onClick={() => void start()} disabled={active || busy}><Camera size={18} />Olvasás indítása</button><button className="secondary-action" onClick={() => fileRef.current?.click()} disabled={busy}>Képből olvasás</button>{active && <button className="secondary-action" onClick={stop} disabled={busy}>Leállítás</button>}</div>
    <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => void fileSelected(event)} />
    <form className="barcode-manual" onSubmit={(event) => { event.preventDefault(); void detected(manual) }}><label><span>Vonalkód kézzel</span><input value={manual} onChange={(event) => setManual(event.target.value)} inputMode="numeric" pattern="[0-9]+" placeholder="Pl. 5991234567890" /></label><button className="secondary-action" type="submit" disabled={busy || manual.trim().length < 8}>Keresés</button></form>
    {busy && <p className="search-state" role="status">Termék keresése…</p>}
  </section>
}
