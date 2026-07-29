import { cn } from '@/lib/utils'

export const STATUS_SELECT_BG: Record<string, string> = {
  todo:        'bg-white border-mushroom text-ink',
  in_progress: 'bg-blueberry-light border-blueberry/40 text-ink-dark',
  review:      'bg-butter-light border-butter/60 text-ink-dark',
  done:        'bg-thyme border-thyme text-white',
}

export const PRIORITY_SELECT_BG: Record<string, string> = {
  low:    'bg-white border-mushroom text-ink',
  medium: 'bg-citrus-light border-citrus/60 text-ink-dark',
  high:   'bg-terracotta-light border-terracotta/40 text-ink-dark',
  urgent: 'bg-tomato-light border-tomato/40 text-ink-dark',
}

type Variant = 'sage' | 'terracotta' | 'butter' | 'tomato' | 'blueberry' | 'thyme' | 'candy' | 'citrus' | 'mushroom'

const variantClasses: Record<Variant, string> = {
  sage:        'bg-sage-light text-ink-dark',
  terracotta:  'bg-terracotta-light text-ink-dark',
  butter:      'bg-butter-light text-ink-dark',
  tomato:      'bg-tomato-light text-ink-dark',
  blueberry:   'bg-blueberry-light text-ink-dark',
  thyme:       'bg-thyme-light text-ink-dark',
  candy:       'bg-candy-light text-ink-dark',
  citrus:      'bg-citrus-light text-ink-dark',
  mushroom:    'bg-mushroom text-ink-dark',
}

interface BadgeProps {
  label: string
  variant?: Variant
  className?: string
}

export function Badge({ label, variant = 'mushroom', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase',
        variantClasses[variant],
        className
      )}
      style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '10px', letterSpacing: '0.08em' }}
    >
      {label}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: Variant }> = {
    planning:    { label: 'Planning',    variant: 'citrus' },
    active:      { label: 'Active',      variant: 'sage' },
    on_hold:     { label: 'On Hold',     variant: 'mushroom' },
    complete:    { label: 'Complete',    variant: 'thyme' },
    todo:        { label: 'To Do',       variant: 'mushroom' },
    in_progress: { label: 'In Progress', variant: 'blueberry' },
    review:      { label: 'Review',      variant: 'butter' },
    done:        { label: 'Done',        variant: 'thyme' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'mushroom' as Variant }
  return <Badge label={label} variant={variant} />
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; variant: Variant }> = {
    low:    { label: 'Low',    variant: 'mushroom' },
    medium: { label: 'Medium', variant: 'butter' },
    high:   { label: 'High',   variant: 'terracotta' },
    urgent: { label: 'Urgent', variant: 'tomato' },
  }
  const { label, variant } = map[priority] ?? { label: priority, variant: 'mushroom' as Variant }
  return <Badge label={label} variant={variant} />
}
