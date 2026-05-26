import { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?:    string
  subtitle?: string
  /** Slot para ações no canto superior direito */
  actions?:  ReactNode
  /** Remove o padding interno (útil para tabelas full-bleed) */
  noPadding?: boolean
  className?: string
  children?:  ReactNode
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

interface CardHeaderProps {
  title:     string
  subtitle?: string
  actions?:  ReactNode
}

export function CardHeader({ title, subtitle, actions }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-neutral-700">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function Card({
  title,
  subtitle,
  actions,
  noPadding = false,
  children,
  className,
  ...props
}: CardProps) {
  const hasHeader = !!title

  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900',
        'border border-gray-200 dark:border-neutral-700',
        'rounded-2xl shadow-sm',
        'flex flex-col',
        className,
      )}
      {...props}
    >
      {hasHeader && (
        <CardHeader title={title!} subtitle={subtitle} actions={actions} />
      )}
      {children && (
        <div className={cn('flex-1', !noPadding && 'p-5')}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Card.Root / Card.Content para uso composicional ─────────────────────────

interface CardRootProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
  children:   ReactNode
}

Card.Root = function CardRoot({ children, className, ...props }: CardRootProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900',
        'border border-gray-200 dark:border-neutral-700',
        'rounded-2xl shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

Card.Header = CardHeader

interface CardBodyProps {
  className?: string
  children:   ReactNode
}

Card.Body = function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={cn('p-5', className)}>
      {children}
    </div>
  )
}

interface CardFooterProps {
  className?: string
  children:   ReactNode
}

Card.Footer = function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        'px-5 py-3 border-t border-gray-100 dark:border-neutral-700',
        'flex items-center justify-end gap-2',
        className,
      )}
    >
      {children}
    </div>
  )
}
