import type { ReactNode } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field-stack"><span>{label}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>
}

export function ScreenHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="screen-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="goal-help">{description}</p>}</div>{action}</header>
}

export function StateMessage({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'error' | 'success' }) {
  return <p className={`state-message state-message-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
}
