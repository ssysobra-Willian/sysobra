import { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title:      string
  subtitle?:  string
  /** Slot para botões e ações no canto direito */
  actions?:   ReactNode
  /** Breadcrumb simples (array de labels) */
  breadcrumb?: string[]
  className?: string
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn('mb-6', className)}
      {...props}
    >
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-2">
          {breadcrumb.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-1.5">
              {idx > 0 && (
                <svg
                  className="w-3 h-3 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
              <span
                className={cn(
                  idx === breadcrumb.length - 1
                    ? 'text-gray-600 dark:text-gray-300 font-medium'
                    : 'hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer',
                )}
              >
                {crumb}
              </span>
            </span>
          ))}
        </nav>
      )}

      {/* Título + ações */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
