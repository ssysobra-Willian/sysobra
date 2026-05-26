'use client'

import { ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Button } from './Button'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

interface ModalAction {
  label:     string
  onClick:   () => void
  variant?:  'primary' | 'secondary' | 'danger' | 'ghost'
  loading?:  boolean
  disabled?: boolean
}

interface ModalProps {
  open:        boolean
  onClose:     () => void
  title?:      string
  subtitle?:   string
  size?:       ModalSize
  /** Oculta o botão X de fechar */
  hideClose?:  boolean
  /** Impede fechar ao clicar no backdrop */
  persistent?: boolean
  actions?:    ModalAction[]
  className?:  string
  children?:   ReactNode
}

// ─── Tamanhos ─────────────────────────────────────────────────────────────────

const sizeClasses: Record<ModalSize, string> = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-xl',
  full: 'max-w-[95vw] max-h-[95vh]',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size       = 'md',
  hideClose  = false,
  persistent = false,
  actions,
  className,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Fecha com Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !persistent) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, persistent])

  // Trava scroll do body enquanto aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => { if (!persistent) onClose() }}
      />

      {/* Painel */}
      <div
        ref={dialogRef}
        className={cn(
          'relative w-full bg-white dark:bg-neutral-900',
          'rounded-2xl shadow-xl',
          'border border-gray-100 dark:border-neutral-700',
          'flex flex-col max-h-[90vh]',
          sizeClasses[size],
          className,
        )}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-neutral-700 flex-shrink-0">
            <div className="min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="text-base font-semibold text-gray-900 dark:text-gray-100"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
              )}
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                className={cn(
                  'flex-shrink-0 p-1 rounded-lg',
                  'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
                  'dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-neutral-800',
                  'transition-colors',
                )}
                aria-label="Fechar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        {children && (
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
            {children}
          </div>
        )}

        {/* Footer com ações */}
        {actions && actions.length > 0 && (
          <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-neutral-700">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant ?? 'secondary'}
                size="md"
                onClick={action.onClick}
                loading={action.loading}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // Renderiza no body para evitar problemas de z-index/overflow
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}
