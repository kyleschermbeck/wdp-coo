import { cn } from '@/lib/utils'
import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-ink-dark uppercase tracking-wide"
          style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '11px', letterSpacing: '0.08em' }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full px-3 py-2 bg-cream border border-mushroom rounded-lg text-sm text-ink-dark placeholder:text-ink/60',
          'focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink transition-all',
          error && 'border-tomato focus:ring-tomato/20',
          className
        )}
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        {...props}
      />
      {error && <p className="text-xs text-tomato">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-ink-dark uppercase tracking-wide"
          style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '11px', letterSpacing: '0.08em' }}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        className={cn(
          'w-full px-3 py-2 bg-cream border border-mushroom rounded-lg text-sm text-ink-dark placeholder:text-ink/60',
          'focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink transition-all resize-none',
          error && 'border-tomato focus:ring-tomato/20',
          className
        )}
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        {...props}
      />
      {error && <p className="text-xs text-tomato">{error}</p>}
    </div>
  )
)
Textarea.displayName = 'Textarea'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-ink-dark uppercase tracking-wide"
          style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '11px', letterSpacing: '0.08em' }}>
          {label}
        </label>
      )}
      <select
        className={cn(
          'w-full px-3 py-2 bg-cream border border-mushroom rounded-lg text-sm text-ink-dark',
          'focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink transition-all',
          className
        )}
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
