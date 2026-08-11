'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  badge?: React.ReactNode
  footer?: React.ReactNode
  width?: number
  children: React.ReactNode
}

export function DetailDrawer({
  open, onClose, title, subtitle, badge, footer, width = 440, children,
}: DrawerProps) {
  // Lock scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-ink-dark/20 backdrop-blur-[1px] transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full z-50 bg-cream flex flex-col',
          'shadow-[−4px_0_32px_rgba(44,44,44,0.12)]',
          'transition-transform duration-300 ease-in-out border-l border-mushroom',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ width, fontFamily: "'Jost', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-mushroom shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2
              className="text-xl font-semibold text-ink-dark leading-tight"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              {title}
            </h2>
            {subtitle && <p className="text-xs text-ink mt-0.5">{subtitle}</p>}
            {badge && <div className="mt-2">{badge}</div>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-ink hover:bg-mushroom/50 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div className="shrink-0 px-6 py-4 border-t border-mushroom bg-oatmilk">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

export function DrawerSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink mb-2">
        {label}
      </p>
      {children}
    </div>
  )
}

export function DrawerField({
  label, value, flagged = false,
}: { label: string; value: React.ReactNode; flagged?: boolean }) {
  return (
    <div className="mb-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink mb-0.5">
        {label}
      </p>
      <p className={cn('text-sm', flagged ? 'text-critical font-semibold' : 'text-ink-dark')}>
        {value ?? '—'}
      </p>
    </div>
  )
}

export function DrawerDivider() {
  return <hr className="border-mushroom my-4" />
}

export function DrawerAction({
  label, onClick, variant = 'primary',
}: { label: string; onClick: () => void; variant?: 'primary' | 'ghost' }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors',
        variant === 'primary'
          ? 'bg-ink-dark text-cream hover:bg-ink'
          : 'bg-mushroom/30 text-ink-dark hover:bg-mushroom/50',
      )}
    >
      {label}
    </button>
  )
}
