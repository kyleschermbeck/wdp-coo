import { cn } from '@/lib/utils'

export type BadgeSeverity = 'critical' | 'warning' | 'good' | 'info' | 'neutral'

const STYLES: Record<BadgeSeverity, string> = {
  critical: 'bg-critical-light text-critical border-critical/25',
  warning:  'bg-warning-light  text-warning  border-warning/25',
  good:     'bg-success-light  text-success  border-success/25',
  info:     'bg-info-light     text-info     border-info/25',
  neutral:  'bg-mushroom/30   text-ink      border-mushroom',
}

const DOT_STYLES: Record<BadgeSeverity, string> = {
  critical: 'bg-critical', warning: 'bg-warning', good: 'bg-success',
  info: 'bg-info', neutral: 'bg-ink',
}

interface Props {
  severity: BadgeSeverity
  label: string
  dot?: boolean
  size?: 'sm' | 'md'
}

export function StatusBadge({ severity, label, dot = false, size = 'md' }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold rounded-full border',
        size === 'sm' ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-2.5 py-1',
        STYLES[severity],
      )}
      style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.06em' }}
    >
      {dot && (
        <span className={cn('rounded-full shrink-0', size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2', DOT_STYLES[severity])} />
      )}
      {label}
    </span>
  )
}
