'use client'

import { useState } from 'react'
import { AlertTriangle, Info, XCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RailSeverity = 'critical' | 'warning' | 'info'

export interface RailItem {
  label: string
  onClick?: () => void
}

interface Props {
  severity: RailSeverity
  message: string
  items?: RailItem[]
  onViewAll?: () => void
  dismissible?: boolean
}

const STYLE: Record<RailSeverity, { wrap: string; link: string }> = {
  critical: { wrap: 'bg-critical-light border-critical/25 text-critical', link: 'border-critical/40' },
  warning:  { wrap: 'bg-warning-light  border-warning/25  text-warning',  link: 'border-warning/40'  },
  info:     { wrap: 'bg-info-light     border-info/25     text-info',     link: 'border-info/40'     },
}

const ICON = { critical: XCircle, warning: AlertTriangle, info: Info }

export function StatusRail({ severity, message, items, onViewAll, dismissible = true }: Props) {
  const [gone, setGone] = useState(false)
  if (gone) return null

  const s = STYLE[severity]
  const Icon = ICON[severity]

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm mb-6',
        s.wrap,
      )}
      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
    >
      <Icon size={14} className="shrink-0" />

      <div className="flex-1 min-w-0 text-sm">
        <span className="font-semibold">{message}</span>
        {items && items.length > 0 && (
          <span className="font-normal">
            {' — '}
            {items.map((item, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {item.onClick ? (
                  <button
                    onClick={item.onClick}
                    className={cn('border-b hover:opacity-70 transition-opacity', s.link)}
                  >
                    {item.label}
                  </button>
                ) : item.label}
              </span>
            ))}
          </span>
        )}
      </div>

      {onViewAll && (
        <button
          onClick={onViewAll}
          className="shrink-0 text-xs font-semibold hover:opacity-70 transition-opacity whitespace-nowrap"
        >
          View all →
        </button>
      )}

      {dismissible && (
        <button onClick={() => setGone(true)} className="shrink-0 hover:opacity-70 transition-opacity ml-1">
          <X size={13} />
        </button>
      )}
    </div>
  )
}
