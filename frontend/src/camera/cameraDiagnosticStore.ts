export const CAMERA_DIAGNOSTICS_ENABLED = import.meta.env.VITE_CAMERA_DIAGNOSTICS === '1'

type DiagnosticValue = string | number | boolean | null
type DiagnosticDetails = Record<string, DiagnosticValue | undefined>

export type CameraDiagnosticEntry = {
  sequence: number
  elapsedMs: number
  scope: string
  event: string
  details: Record<string, DiagnosticValue>
}

const startedAt = performance.now()
const entries: CameraDiagnosticEntry[] = []
const subscribers = new Set<(snapshot: CameraDiagnosticEntry[]) => void>()
let sequence = 0

function safeText(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 160)
}

function snapshot(): CameraDiagnosticEntry[] {
  return entries.map((entry) => ({ ...entry, details: { ...entry.details } }))
}

function publish() {
  const next = snapshot()
  subscribers.forEach((subscriber) => subscriber(next))
}

export function cameraDiagnostic(scope: string, event: string, details: DiagnosticDetails = {}) {
  if (!CAMERA_DIAGNOSTICS_ENABLED) return
  const safeDetails: Record<string, DiagnosticValue> = {}
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue
    safeDetails[safeText(key)] = typeof value === 'string' ? safeText(value) : value
  }
  entries.push({
    sequence: sequence += 1,
    elapsedMs: Math.round(performance.now() - startedAt),
    scope: safeText(scope),
    event: safeText(event),
    details: safeDetails,
  })
  if (entries.length > 250) entries.splice(0, entries.length - 250)
  publish()
}

export function diagnosticErrorCategory(value: unknown): string {
  const name = typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
    ? value.name
    : 'UnknownError'
  const categories: Record<string, string> = {
    AbortError: 'aborted',
    ChecksumException: 'zxing_checksum',
    EncodingError: 'image_encode',
    FormatException: 'zxing_format',
    IndexSizeError: 'canvas_geometry',
    NotAllowedError: 'permission_denied',
    NotFoundError: 'camera_not_found',
    NotFoundException: 'zxing_not_found',
    NotReadableError: 'camera_not_readable',
    OverconstrainedError: 'camera_constraints',
    SecurityError: 'camera_security',
  }
  return categories[name] ?? 'other_error'
}

export function describeCameraElement(value: Element | null): string {
  if (!(value instanceof HTMLElement)) return 'none'
  const parts = [value.tagName.toLowerCase()]
  if (value instanceof HTMLInputElement) parts.push(value.type || 'text')
  if (value.hasAttribute('autofocus')) parts.push('autofocus')
  if (value.closest('[aria-hidden="true"]')) parts.push('inside-aria-hidden')
  return parts.join(':')
}

function activeInputDescription(): string {
  const active = document.activeElement
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement
    ? describeCameraElement(active)
    : 'none'
}

function rounded(value: number | undefined): number {
  return value === undefined ? -1 : Math.round(value * 100) / 100
}

function rectDetails(prefix: string, element: Element | null): DiagnosticDetails {
  const rect = element?.getBoundingClientRect()
  return {
    [`${prefix}X`]: rounded(rect?.x),
    [`${prefix}Y`]: rounded(rect?.y),
    [`${prefix}Width`]: rounded(rect?.width),
    [`${prefix}Height`]: rounded(rect?.height),
    [`${prefix}Right`]: rounded(rect?.right),
    [`${prefix}Bottom`]: rounded(rect?.bottom),
  }
}

export function recordCameraLayout(reason: string) {
  if (!CAMERA_DIAGNOSTICS_ENABLED) return
  const viewport = window.visualViewport
  const flow = document.querySelector('#camera-root > .camera-flow')
  const body = flow?.querySelector('.camera-flow-body') ?? null
  const video = flow?.querySelector('video') ?? null
  const autofocusElements = document.querySelectorAll('[autofocus]')
  cameraDiagnostic('layout', 'snapshot', {
    reason,
    cameraMode: flow?.getAttribute('data-camera-mode') ?? 'closed',
    innerWidth: window.innerWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    scrollX: rounded(window.scrollX),
    visualWidth: rounded(viewport?.width),
    visualScale: rounded(viewport?.scale),
    visualOffsetLeft: rounded(viewport?.offsetLeft),
    visualOffsetTop: rounded(viewport?.offsetTop),
    activeElement: describeCameraElement(document.activeElement),
    activeInput: activeInputDescription(),
    autofocusCount: autofocusElements.length,
    autofocusFocused: [...autofocusElements].includes(document.activeElement as Element),
    flowScrollLeft: flow instanceof HTMLElement ? rounded(flow.scrollLeft) : -1,
    flowScrollTop: flow instanceof HTMLElement ? rounded(flow.scrollTop) : -1,
    ...rectDetails('camera', flow),
    ...rectDetails('cameraBody', body),
    ...rectDetails('video', video),
  })
}

export function subscribeCameraDiagnostics(subscriber: (snapshot: CameraDiagnosticEntry[]) => void): () => void {
  subscribers.add(subscriber)
  subscriber(snapshot())
  return () => subscribers.delete(subscriber)
}

export function clearCameraDiagnostics() {
  entries.length = 0
  publish()
}

export function formatCameraDiagnosticEntry(entry: CameraDiagnosticEntry): string {
  const details = Object.entries(entry.details).map(([key, value]) => `${key}=${String(value)}`).join(' ')
  return `+${entry.elapsedMs}ms #${entry.sequence} ${entry.scope}.${entry.event}${details ? ` ${details}` : ''}`
}

export function formatCameraDiagnosticReport(): string {
  return ['CHill iPhone kamera diagnosztika', 'A jelentés nem tartalmaz képet, teljes vonalkódot, fájlnevet vagy eszközazonosítót.', ...entries.map(formatCameraDiagnosticEntry)].join('\n')
}
