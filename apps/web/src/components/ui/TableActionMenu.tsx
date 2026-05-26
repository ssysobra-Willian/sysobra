'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MoreVertical } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface TableAction {
  label:      string
  icon?:      React.ReactNode
  onClick:    () => void
  variant?:   'default' | 'danger' | 'warning' | 'success'
  disabled?:  boolean
  separator?: boolean   // mostra linha divisória ANTES deste item
}

interface Props {
  actions: TableAction[]
  /** Largura do menu em px. Default: 208 */
  menuWidth?: number
}

export function TableActionMenu({ actions, menuWidth = 208 }: Props) {
  const [open,     setOpen]     = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef   = useRef<HTMLDivElement>(null)

  // Calcula a posição ideal para o dropdown ao abrir
  const handleOpen = useCallback(() => {
    if (!buttonRef.current) return
    const rect       = buttonRef.current.getBoundingClientRect()
    const ITEM_H     = 36
    const PADDING    = 8
    const menuHeight = actions.length * ITEM_H + PADDING * 2

    // Posição horizontal: alinhar à direita do botão sem sair da janela
    let left = rect.right - menuWidth
    if (left < 4) left = rect.left

    // Posição vertical: abrir para baixo ou para cima
    const top = rect.bottom + menuHeight > window.innerHeight - 8
      ? rect.top - menuHeight - 4
      : rect.bottom + 4

    setPosition({ top, left })
    setOpen(true)
  }, [actions.length, menuWidth])

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Fecha ao pressionar Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const variantCls: Record<string, string> = {
    default: 'text-gray-700 hover:bg-gray-50',
    danger:  'text-red-600 hover:bg-red-50',
    warning: 'text-amber-600 hover:bg-amber-50',
    success: 'text-green-600 hover:bg-green-50',
  }

  const menu = open && (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: position.top, left: position.left, width: menuWidth, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 overflow-hidden"
    >
      {actions.map((action, i) => (
        <div key={i}>
          {action.separator && <div className="border-t border-gray-100 my-0.5" />}
          <button
            onClick={() => { if (!action.disabled) { action.onClick(); setOpen(false) } }}
            disabled={action.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors
              ${variantCls[action.variant ?? 'default']}
              ${action.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {action.icon && <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{action.icon}</span>}
            {action.label}
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Ações"
      >
        <MoreVertical size={14} />
      </button>

      {/* Renderiza o menu no body via portal para escapar de overflow:hidden */}
      {typeof document !== 'undefined' && menu
        ? createPortal(menu, document.body)
        : null}
    </>
  )
}
