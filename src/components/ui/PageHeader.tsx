import { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow: string
  title: string
  subtitle?: string
  meta?: ReactNode          // small muted line below subtitle (e.g. "13 active · synced 2h ago")
  actions?: ReactNode       // button cluster top-right
  children?: ReactNode      // StatusRails or alerts rendered below the title block
}

const SERIF: React.CSSProperties = { fontFamily: "'Cormorant Garamond', Georgia, serif" }
const FONT: React.CSSProperties  = { fontFamily: "'Jost', system-ui, sans-serif" }

export function PageHeader({ eyebrow, title, subtitle, meta, actions, children }: PageHeaderProps) {
  return (
    <header style={{ marginBottom: children ? 20 : 32 }}>
      {/* Eyebrow + title row */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            ...FONT,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'rgba(116,116,116,0.6)', margin: '0 0 8px',
          }}>
            {eyebrow}
          </p>
          <h1 style={{
            ...SERIF,
            fontSize: 'clamp(36px,5vw,48px)', fontWeight: 700,
            color: '#2C2C2C', lineHeight: 1.04, margin: 0,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              ...FONT,
              fontSize: 14, color: 'rgba(44,44,44,0.55)', margin: '6px 0 0', maxWidth: 600, lineHeight: 1.5,
            }}>
              {subtitle}
            </p>
          )}
          {meta && (
            <p style={{
              ...FONT,
              fontSize: 12, color: 'rgba(116,116,116,0.6)', margin: '6px 0 0',
            }}>
              {meta}
            </p>
          )}
        </div>
        {actions && (
          <div className="page-header-actions" style={{ display: 'flex', gap: 10, flexShrink: 0, paddingTop: 8, alignItems: 'center' }}>
            {actions}
          </div>
        )}
      </div>

      {/* Rails / alerts slot */}
      {children && (
        <div style={{ marginTop: 20 }}>
          {children}
        </div>
      )}
    </header>
  )
}
