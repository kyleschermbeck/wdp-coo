'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(44, 44, 44, 0.4)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className={cn(
          'relative bg-cream rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]',
          {
            'max-w-sm': size === 'sm',
            'max-w-lg': size === 'md',
            'max-w-2xl': size === 'lg',
          }
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-mushroom shrink-0">
          <h2
            className="text-2xl text-ink-dark"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-ink hover:bg-mushroom/40 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}

interface ActionModalProps {
  open: boolean
  onClose: () => void
  onApprove: () => void
  title: string
  summary: string
  details: { label: string; value: string }[]
  preview?: React.ReactNode
  loading?: boolean
}

export function ActionModal({
  open, onClose, onApprove, title, summary, details, preview, loading
}: ActionModalProps) {
  const showPreviewRef = useRef(false)

  useEffect(() => { if (!open) showPreviewRef.current = false }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Proposed Action" size="md">
      <div className="space-y-4">
        <p className="text-sm text-ink font-medium">{title}</p>
        <p className="text-sm text-ink-dark">{summary}</p>

        <div className="bg-oatmilk rounded-xl p-4 space-y-2">
          {details.map((d) => (
            <div key={d.label} className="flex gap-2 text-sm">
              <span className="text-ink font-medium w-28 shrink-0">{d.label}</span>
              <span className="text-ink-dark">{d.value}</span>
            </div>
          ))}
        </div>

        {preview && (
          <details className="border border-mushroom rounded-xl overflow-hidden">
            <summary className="px-4 py-2.5 text-sm font-semibold text-ink cursor-pointer hover:bg-oatmilk select-none"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Preview Content
            </summary>
            <div className="px-4 pb-4 pt-2 text-sm text-ink-dark border-t border-mushroom">
              {preview}
            </div>
          </details>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-mushroom text-sm font-semibold text-ink hover:bg-oatmilk transition-all cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-ink-dark text-cream text-sm font-semibold hover:bg-ink transition-all disabled:opacity-50 cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            {loading ? 'Approving...' : 'Approve →'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
