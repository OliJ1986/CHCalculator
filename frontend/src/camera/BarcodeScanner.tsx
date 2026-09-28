import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, X } from '../components/icons'
import type { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { isValidEan } from './barcode'
import { cameraDiagnostic, diagnosticErrorCategory } from './cameraDiagnosticStore'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      cameraDiagnostic('barcode-photo', 'image_loaded', { width: image.naturalWidth, height: image.naturalHeight })
      resolve(image)
    }
    image.onerror = () => {
      cameraDiagnostic('barcode-photo', 'image_load_failed', { category: 'browser_image_decode' })
      reject(new Error('A kép nem tölthető be'))
    }
    image.src = url
  })
}

async function canvasBlob(image: HTMLImageElement, options: { scale: number; crop: boolean; contrast: boolean; rotation: 0 | 90 | 180 | 270 }, variantIndex: number): Promise<Blob | null> {
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
  if (!context) {
    cameraDiagnostic('barcode-photo', 'canvas_failed', { variant: variantIndex, category: 'context_unavailable' })
    return null
  }
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
  return new Promise((resolve) => canvas.toBlob((blob) => {
    cameraDiagnostic('barcode-photo', blob ? 'variant_created' : 'canvas_failed', {
      variant: variantIndex,
      category: blob ? 'ok' : 'blob_unavailable',
      width,
      height,
      crop: options.crop,
      contrast: options.contrast,
      rotation: options.rotation,
      outputType: blob?.type ?? 'none',
      outputBytes: blob?.size ?? 0,
    })
    resolve(blob)
  }, 'image/jpeg', 0.94))
}

async function barcodeImageVariants(file: File): Promise<Blob[]> {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(sourceUrl)
    const variants: Blob[] = []
    const optionsList = [
      { scale: 1, crop: false, contrast: false, rotation: 0 },
      { scale: 1.35, crop: false, contrast: false, rotation: 0 },
      { scale: 1.35, crop: true, contrast: false, rotation: 0 },
      { scale: 1.35, crop: false, contrast: true, rotation: 0 },
      { scale: 1.35, crop: true, contrast: true, rotation: 0 },
      { scale: 1.35, crop: false, contrast: false, rotation: 90 },
      { scale: 1.35, crop: false, contrast: false, rotation: 180 },
      { scale: 1.35, crop: false, contrast: false, rotation: 270 },
    ] as const
    for (const [index, options] of optionsList.entries()) {
      const blob = await canvasBlob(image, options, index + 1)
      if (blob) variants.push(blob)
    }
    cameraDiagnostic('barcode-photo', 'variants_complete', { requested: optionsList.length, created: variants.length })
    return variants
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

type BarcodeStopReason = 'restart' | 'accepted' | 'user' | 'close' | 'unmount' | 'startup_error'

function barcodeDiagnostic(event: string, details: Record<string, string | number | boolean | undefined> = {}) {
  console.debug('[CHill camera]', { component: 'barcode', event, ...details })
  cameraDiagnostic('barcode-live', event, details)
}

function safeDeviceLabel(value: string): string {
  const label = value.toLowerCase()
  if (!label) return 'unavailable'
  if (/back|rear|environment/.test(label)) {
    if (/ultra/.test(label)) return 'back_ultrawide_camera'
    if (/tele/.test(label)) return 'back_telephoto_camera'
    return 'back_camera'
  }
  if (/front|user|facetime/.test(label)) return 'front_camera'
  return /camera|webcam/.test(label) ? 'camera_label_available' : 'device_label_available'
}

function streamDetails(video: HTMLVideoElement | null): Record<string, string | number | boolean | undefined> {
  const stream = video?.srcObject
  const tracks = stream && 'getVideoTracks' in stream ? stream.getVideoTracks() : []
  const track = tracks[0]
  let settings: MediaTrackSettings = {}
  try { settings = track?.getSettings?.() ?? {} } catch { settings = {} }
  return {
    streamPresent: Boolean(stream),
    videoTrackCount: tracks.length,
    trackLabel: track ? safeDeviceLabel(track.label ?? '') : 'none',
    trackReadyState: track?.readyState ?? 'none',
    trackEnabled: track?.enabled,
    trackMuted: track?.muted,
    facingMode: settings.facingMode ?? 'unavailable',
    settingsWidth: settings.width ?? -1,
    settingsHeight: settings.height ?? -1,
    settingsFrameRate: settings.frameRate ?? -1,
    deviceIdPresent: Boolean(settings.deviceId),
    videoWidth: video?.videoWidth ?? -1,
    videoHeight: video?.videoHeight ?? -1,
    videoReadyState: video?.readyState ?? -1,
    videoPaused: video?.paused ?? true,
  }
}

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (barcode: string) => boolean | Promise<boolean>; onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const operationRef = useRef(0)
  const decodeErrorCountsRef = useRef<Record<string, number>>({})
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback((reason: BarcodeStopReason = 'user') => {
    const hadStream = Boolean(videoRef.current?.srcObject)
    const wasActive = Boolean(controlsRef.current) || hadStream
    barcodeDiagnostic('stop', { reason, wasActive, ...streamDetails(videoRef.current) })
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
    try {
      const accepted = await onDetected(code)
      if (accepted) stop('accepted')
      return accepted
    } catch {
      setError('A termékkeresés nem sikerült. A kamera aktív maradt; próbáld újra.')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [onDetected, stop])

  const detected = useCallback(async (value: string) => {
    const code = value.trim()
    if (busyRef.current) return
    if (!isValidEan(code)) {
      barcodeDiagnostic('decoded_value_rejected', { valueLength: code.length, category: 'invalid_ean_checksum_or_length' })
      setError('Csak érvényes EAN-8 vagy EAN-13 vonalkód fogadható el.')
      return
    }
    barcodeDiagnostic('decoded_value_accepted', { valueLength: code.length, category: code.length === 8 ? 'ean8' : 'ean13' })
    await deliver(code)
  }, [deliver])

  const start = useCallback(async () => {
    setError(null)
    const video = videoRef.current
    barcodeDiagnostic('start_requested', { mediaDevicesAvailable: Boolean(navigator.mediaDevices?.getUserMedia) })
    if (!video) {
      setError('A kameraelőnézet nem érhető el. Próbáld a képfeltöltést vagy a kézi bevitelt.')
      return
    }
    stop('restart')
    const operation = operationRef.current + 1
    operationRef.current = operation
    decodeErrorCountsRef.current = {}
    setActive(true)
    try {
      barcodeDiagnostic('zxing_import_started')
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      barcodeDiagnostic('zxing_import_succeeded')
      if (operation !== operationRef.current) return
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      barcodeDiagnostic('zxing_reader_created')
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result, error) => {
        if (result) {
          const value = result.getText()
          barcodeDiagnostic('decode_result', { valueLength: value.length, format: String(result.getBarcodeFormat()), validEan: isValidEan(value) })
          void detected(value)
        } else if (error) {
          const category = diagnosticErrorCategory(error)
          const count = (decodeErrorCountsRef.current[category] ?? 0) + 1
          decodeErrorCountsRef.current[category] = count
          if (count === 1 || count === 10 || count % 50 === 0) barcodeDiagnostic('decode_error', { category, count })
        }
      })
      if (operation !== operationRef.current) {
        controls.stop()
        return
      }
      controlsRef.current = controls
      barcodeDiagnostic('get_user_media_succeeded', streamDetails(video))
      barcodeDiagnostic('zxing_scanning_started', streamDetails(video))
      for (const [delay, label] of [[0, 'immediate'], [250, '250ms'], [1000, '1000ms']] as const) {
        window.setTimeout(() => {
          if (operation === operationRef.current) barcodeDiagnostic('stream_snapshot', { after: label, ...streamDetails(videoRef.current) })
        }, delay)
      }
    } catch (value) {
      if (operation !== operationRef.current) return
      barcodeDiagnostic('start_failed', { category: diagnosticErrorCategory(value) })
      stop('startup_error')
      setError(value instanceof DOMException && value.name === 'NotAllowedError' ? 'A kameraengedélyt elutasítottad. Képfeltöltéssel vagy kézi bevitellel folytathatod.' : 'A vonalkódolvasó nem indítható. Használd a képfeltöltést vagy a kézi bevitelt.')
    }
  }, [detected, stop])

  const fileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    cameraDiagnostic('barcode-photo', 'file_selected', { mimeType: file.type || 'unavailable', sizeBytes: file.size })
    setError(null)
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      const variants = await barcodeImageVariants(file)
      for (const [index, variant] of variants.entries()) {
        const url = URL.createObjectURL(variant)
        try {
          const result = await reader.decodeFromImageUrl(url)
          const value = result?.getText() ?? ''
          const validEan = isValidEan(value)
          cameraDiagnostic('barcode-photo', 'decode_result', { variant: index + 1, valueLength: value.length, format: result ? String(result.getBarcodeFormat()) : 'none', validEan })
          if (result && validEan) {
            await deliver(value)
            return
          }
        } catch (value) {
          cameraDiagnostic('barcode-photo', 'decode_error', { variant: index + 1, category: diagnosticErrorCategory(value) })
          // Try the next locally processed image variant.
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      setError('Nem találtam érvényes EAN-8 vagy EAN-13 vonalkódot a képen. A képet nem töltöttük fel; add meg kézzel a kódot.')
    } catch (value) {
      cameraDiagnostic('barcode-photo', 'processing_failed', { category: diagnosticErrorCategory(value) })
      setError('A kép feldolgozása nem sikerült. A képet nem töltöttük fel; add meg kézzel a kódot.')
    } finally {
      readerRef.current = null
      busyRef.current = false
      setBusy(false)
    }
  }

  useEffect(() => () => stop('unmount'), [stop])

  return <section className="camera-capture barcode-scanner" aria-label="Vonalkódolvasó">
    <div className="camera-capture-header"><div><p className="eyebrow">Kamera · Vonalkód</p><h3>Termék azonosítása</h3><p className="goal-help">EAN-13 és EAN-8 kódot is beolvashatsz.</p></div>{onClose && <button className="close-button" onClick={() => { stop('close'); onClose() }} aria-label="Vonalkódolvasó bezárása"><X size={18} /></button>}</div>
    <div className={'camera-view ' + (active ? '' : 'camera-view-idle')}><video ref={videoRef} autoPlay playsInline muted aria-label="Vonalkód kamera előnézete" onLoadedMetadata={() => barcodeDiagnostic('video_loaded_metadata', streamDetails(videoRef.current))} onPlaying={() => barcodeDiagnostic('video_playing', streamDetails(videoRef.current))} onResize={() => barcodeDiagnostic('video_resized', streamDetails(videoRef.current))} />{active && <div className="barcode-guide" aria-hidden="true" />}</div>
    {!active && <div className="camera-placeholder"><Camera size={28} /><span>A kódot tartsd a keretben.</span></div>}
    {error && <p className="input-error" role="alert">{error}</p>}
    <div className="camera-actions"><button className="confirm-button" onClick={() => void start()} disabled={active || busy}><Camera size={18} />Olvasás indítása</button><button className="secondary-action" onClick={() => fileRef.current?.click()} disabled={busy}>Képből olvasás</button>{active && <button className="secondary-action" onClick={() => stop('user')} disabled={busy}>Leállítás</button>}</div>
    <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => void fileSelected(event)} />
    <form className="barcode-manual" onSubmit={(event) => { event.preventDefault(); void detected(manual) }}><label><span>Vonalkód kézzel</span><input value={manual} onChange={(event) => setManual(event.target.value)} inputMode="numeric" pattern="[0-9]+" placeholder="Pl. 5991234567890" /></label><button className="secondary-action" type="submit" disabled={busy || manual.trim().length < 8}>Keresés</button></form>
    {busy && <p className="search-state" role="status">Termék keresése…</p>}
  </section>
}
