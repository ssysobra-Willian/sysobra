import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant
  size?:     ButtonSize
  loading?:  boolean
  icon?:     ReactNode
  iconRight?: ReactNode
  fullWidth?: boolean
}

// ─── Estilos por variante ─────────────────────────────────────────────────────

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-orange text-white hover:bg-brand-orange-dark active:bg-primary-700 ' +
    'dark:bg-primary-500 dark:hover:bg-primary-600',
  secondary:
    'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 ' +
    'dark:bg-neutral-800 dark:text-gray-200 dark:border-neutral-700 dark:hover:bg-neutral-700',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 ' +
    'dark:bg-red-700 dark:hover:bg-red-800',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 ' +
    'dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm:  'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md:  'px-4 py-2.5 text-sm gap-2   rounded-xl',
  lg:  'px-6 py-3   text-base gap-2 rounded-xl',
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ variant }: { variant: ButtonVariant }) {
  const spinnerColor: Record<ButtonVariant, string> = {
    primary:   'border-white/70   border-t-white',
    secondary: 'border-gray-300   border-t-gray-600',
    danger:    'border-white/70   border-t-white',
    ghost:     'border-gray-300   border-t-gray-600',
  }
  return (
    <span
      className={cn(
        'inline-block w-3.5 h-3.5 border-2 rounded-full animate-spin',
        spinnerColor[variant],
      )}
    />
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant   = 'primary',
      size      = 'md',
      loading   = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      children,
      className,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          // base
          'inline-flex items-center justify-center font-semibold',
          'transition-colors duration-150 focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          // disabled
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // variant + size
          variantClasses[variant],
          sizeClasses[size],
          // full width
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {loading ? (
          <Spinner variant={variant} />
        ) : (
          icon && <span className="flex-shrink-0">{icon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && iconRight && (
          <span className="flex-shrink-0">{iconRight}</span>
        )}
      </button>
    )
  },
)

Button.displayName = 'Button'
