import { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | 'green'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'gray'
  | 'orange'
  | 'purple'
  | 'teal'

type BadgeSize = 'sm' | 'md'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?:    BadgeSize
  dot?:     boolean
  className?: string
  children: ReactNode
}

// ─── Estilos por variante ─────────────────────────────────────────────────────

const variantClasses: Record<BadgeVariant, string> = {
  green:  'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400',
  yellow: 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400',
  red:    'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400',
  blue:   'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400',
  gray:   'bg-gray-100   text-gray-600   dark:bg-neutral-800   dark:text-gray-400',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  teal:   'bg-teal-100   text-teal-700   dark:bg-teal-900/30   dark:text-teal-400',
}

const dotClasses: Record<BadgeVariant, string> = {
  green:  'bg-green-500',
  yellow: 'bg-amber-500',
  red:    'bg-red-500',
  blue:   'bg-blue-500',
  gray:   'bg-gray-400',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  teal:   'bg-teal-500',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs     px-2.5 py-1',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function Badge({
  variant   = 'gray',
  size      = 'sm',
  dot       = false,
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-bold rounded-full',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClasses[variant])}
        />
      )}
      {children}
    </span>
  )
}
