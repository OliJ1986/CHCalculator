import { useEffect, useState } from 'react'
import {
  CAMERA_DIAGNOSTICS_ENABLED,
  cameraDiagnostic,
  clearCameraDiagnostics,
  describeCameraElement,
  formatCameraDiagnosticEntry,
  formatCameraDiagnosticReport,
  recordCameraLayout,
  subscribeCameraDiagnostics,
  type CameraDiagnosticEntry,
} from './cameraDiagnosticStore'

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('copy_failed')
}

export function CameraDiagnosticsObserver() {
  useEffect(() => {
    if (!CAMERA_DIAGNOSTICS_ENABLED) return
    let frame = 0
    let pendingReason = 'mount'
    const schedule = (reason: string) => {
      pendingReason = reason
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        recordCameraLayout(pendingReason)
      })
    }
    const onFocus = (event: FocusEvent) => {
      cameraDiagnostic('layout', event.type === 'focusin' ? 'focus_in' : 'focus_out', {
        element: describeCameraElement(event.target instanceof Element ? event.target : null),
      })
      schedule(event.type)
    }
    const onResize = () => schedule('window_resize')
    const onScroll = () => schedule('scroll')
    const onOrientation = () => schedule('orientation_change')
    const viewport = window.visualViewport
    document.addEventListener('focusin', onFocus, true)
    document.addEventListener('focusout', onFocus, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('orientationchange', onOrientation)
    viewport?.addEventListener('resize', onResize)
    viewport?.addEventListener('scroll', onScroll)
    const timers = [0, 100, 500].map((delay) => window.setTimeout(() => schedule(`mount_${delay}ms`), delay))
    return () => {
      document.removeEventListener('focusin', onFocus, true)
      document.removeEventListener('focusout', onFocus, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('orientationchange', onOrientation)
      viewport?.removeEventListener('resize', onResize)
      viewport?.removeEventListener('scroll', onScroll)
      timers.forEach((timer) => window.clearTimeout(timer))
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
  return null
}

export function CameraDiagnosticsPanel() {
  const [currentEntries, setCurrentEntries] = useState<CameraDiagnosticEntry[]>([])
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  useEffect(() => {
    if (!CAMERA_DIAGNOSTICS_ENABLED) return
    recordCameraLayout('panel_mount')
    return subscribeCameraDiagnostics(setCurrentEntries)
  }, [])
  if (!CAMERA_DIAGNOSTICS_ENABLED) return null
  const visibleEntries = currentEntries.slice(-80)
  return <section className="camera-diagnostics" aria-label="iPhone kamera diagnosztika">
    <div className="camera-diagnostics-header"><div><strong>Staging diagnosztika</strong><small>{currentEntries.length} esemény · csak helyi memória</small></div><span>DIAG</span></div>
    <p>A panel nem tárol képet, teljes vonalkódot, fájlnevet vagy eszközazonosítót.</p>
    <div className="camera-diagnostics-actions">
      <button type="button" className="secondary-action compact-action" onClick={() => { recordCameraLayout('manual'); setCopyStatus(null) }}>Mérés frissítése</button>
      <button type="button" className="secondary-action compact-action" onClick={() => { cameraDiagnostic('panel', 'copy_requested'); void copyText(formatCameraDiagnosticReport()).then(() => setCopyStatus('A diagnosztika a vágólapra került.')).catch(() => setCopyStatus('A másolás nem sikerült; jelöld ki kézzel a naplót.')) }}>Másolás</button>
      <button type="button" className="secondary-action compact-action" onClick={() => { clearCameraDiagnostics(); setCopyStatus('A helyi diagnosztika törölve.') }}>Törlés</button>
    </div>
    {copyStatus && <p className="camera-diagnostics-status" role="status">{copyStatus}</p>}
    <ol className="camera-diagnostics-log" aria-label="Diagnosztikai események">
      {visibleEntries.map((entry) => <li key={entry.sequence}><code>{formatCameraDiagnosticEntry(entry)}</code></li>)}
    </ol>
  </section>
}
