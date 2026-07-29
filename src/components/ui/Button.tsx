import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
          {
            'bg-ink-dark text-cream hover:bg-ink': variant === 'primary',
            'bg-oatmilk text-ink-dark border border-mushroom hover:bg-mushroom/40': variant === 'secondary',
            'text-ink hover:bg-oatmilk hover:text-ink-dark': variant === 'ghost',
            'bg-tomato text-cream hover:bg-tomato/80': variant === 'danger',
          },
          {
            'px-3 py-1.5 text-xs': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },
          className
        )}
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
