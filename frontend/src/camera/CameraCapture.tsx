import { useEffect, useRef, useState } from 'react'
import { Camera, Check, X } from '../components/icons'

export type CameraCaptureProps = {
  title: string
  description?: string
  captureLabel?: string
  busy?: boolean
  onCapture: (image: Blob) => void | Promise<void>
  onClose?: () => void
}

function cameraError(value: unknown): string {
  if (value instanceof DOMException && value.name === 'NotAllowedError') return 'A kameraengedély nélkül is folytathatod feltöltéssel.'
  if (value instanceof DOMException && value.name === 'NotFoundError') return 'Nem található használható kamera ezen az eszközön.'
  return 'A kamera most nem indítható. Próbáld a képfeltöltést.'
}

export function CameraCapture({ title, description, captureLabel = 'Fénykép készítése', busy = false, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
  }

  const start = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('A böngésző nem támogatja a kamerát. Használd a képfeltöltést.')
      return
    }
    stop()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setActive(true)
    } catch (value) {
      setError(cameraError(value))
    }
  }

  const submit = async (blob: Blob) => {
    setError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(blob))
    await onCapture(blob)
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError('A kamera képe még nem áll készen.')
      return
    }
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1600 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => { if (blob) void submit(blob); else setError('A kép rögzítése nem sikerült.') }, 'image/jpeg', 0.88)
  }

  const fileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void submit(file)
  }

  useEffect(() => () => {
    stop()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  return <section className="camera-capture" aria-label={title}>
    <div className="camera-capture-header"><div><p className="eyebrow">Kamera</p><h3>{title}</h3>{description && <p className="goal-help">{description}</p>}</div>{onClose && <button className="close-button" onClick={onClose} aria-label="Kamera bezárása"><X size={18} /></button>}</div>
    {active ? <div className="camera-view"><video ref={videoRef} autoPlay playsInline muted aria-label="Kamera előnézete" /><div className="camera-guide" aria-hidden="true" /></div> : previewUrl ? <img className="camera-preview" src={previewUrl} alt="Kiválasztott kép előnézete" /> : <div className="camera-placeholder"><Camera size={28} /><span>A kamera csak a gomb megnyomása után indul.</span></div>}
    {error && <p className="input-error" role="alert">{error}</p>}
    <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={fileSelected} />
    <div className="camera-actions">
      {active ? <><button className="confirm-button" onClick={capture} disabled={busy}><Camera size={18} />{captureLabel}</button><button className="secondary-action" onClick={() => { setFacingMode((value) => value === 'environment' ? 'user' : 'environment'); void start() }} disabled={busy}>Kamera váltása</button><button className="secondary-action" onClick={stop} disabled={busy}>Leállítás</button></> : <button className="confirm-button" onClick={() => void start()} disabled={busy}><Camera size={18} />Kamera engedélyezése</button>}
      <button className="secondary-action" onClick={() => fileRef.current?.click()} disabled={busy}>Kép feltöltése</button>
    </div>
    {busy && <p className="search-state" role="status">Feldolgozás…</p>}
    {!busy && previewUrl && <p className="camera-ready"><Check size={16} /> A kép elkészült, ellenőrizd az eredményt.</p>}
  </section>
}
