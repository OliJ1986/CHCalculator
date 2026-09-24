import type { ReactNode } from 'react'

type IconProps = { size?: number | string; strokeWidth?: number; className?: string }
function IconBase({ size = 24, strokeWidth = 2, className, children }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
}
export function ArrowLeft(props: IconProps) { return <IconBase {...props}><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></IconBase> }
export function BookOpen(props: IconProps) { return <IconBase {...props}><path d="M2.8 5.5A2.5 2.5 0 0 1 5.3 3H11v17H5.3a2.5 2.5 0 0 0-2.5 2Z" /><path d="M21.2 5.5A2.5 2.5 0 0 0 18.7 3H13v17h5.7a2.5 2.5 0 0 1 2.5 2Z" /></IconBase> }
export function Camera(props: IconProps) { return <IconBase {...props}><path d="M4 7.5h3l1.4-2h3.2l1.4 2h3A2.5 2.5 0 0 1 18.5 10v7A2.5 2.5 0 0 1 16 19.5H8A2.5 2.5 0 0 1 5.5 17v-7A2.5 2.5 0 0 1 4 7.5Z" /><circle cx="12" cy="13.5" r="3" /></IconBase> }
export function Check(props: IconProps) { return <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase> }
export function ChevronRight(props: IconProps) { return <IconBase {...props}><path d="m9 18 6-6-6-6" /></IconBase> }
export function CircleUserRound(props: IconProps) { return <IconBase {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="2.5" /><path d="M7.5 18c.9-2.1 2.4-3.2 4.5-3.2s3.6 1.1 4.5 3.2" /></IconBase> }
export function Heart(props: IconProps) { return <IconBase {...props}><path d="M20.8 8.8c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z" /></IconBase> }
export function Minus(props: IconProps) { return <IconBase {...props}><path d="M5 12h14" /></IconBase> }
export function Moon(props: IconProps) { return <IconBase {...props}><path d="M20 15.7A8.2 8.2 0 0 1 8.3 4 8.2 8.2 0 1 0 20 15.7Z" /></IconBase> }
export function Plus(props: IconProps) { return <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase> }
export function Search(props: IconProps) { return <IconBase {...props}><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4 4" /></IconBase> }
export function Sparkles(props: IconProps) { return <IconBase {...props}><path d="m12 3-1.1 3.9L7 8l3.9 1.1L12 13l1.1-3.9L17 8l-3.9-1.1Z" /><path d="m19 14-.6 2.4L16 17l2.4.6L19 20l.6-2.4L22 17l-2.4-.6Z" /><path d="m5 14-.5 1.5L3 16l1.5.5L5 18l.5-1.5L7 16l-1.5-.5Z" /></IconBase> }
export function Sun(props: IconProps) { return <IconBase {...props}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></IconBase> }
export function Utensils(props: IconProps) { return <IconBase {...props}><path d="M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 10v11" /><path d="M16 3v18M16 3c2.5 1.1 3 3.8 3 6v2h-3" /></IconBase> }
export function X(props: IconProps) { return <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase> }
