'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ArrowLeft } from 'lucide-react'

export interface BreadcrumbItem {
  label:  string
  href?:  string          // se undefined = item atual (não clicável)
  icon?:  React.ReactNode
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  const router = useRouter()
  const prev   = items.length > 1 ? items[items.length - 2] : null
  const last   = items[items.length - 1]

  return (
    <div className={className}>
      {/* ── Botão voltar (mobile only) ─────────────────────────────────── */}
      {prev && (
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-1.5 md:hidden transition-colors"
        >
          <ArrowLeft size={15} />
          <span className="font-medium">{prev.label}</span>
        </button>
      )}

      {/* ── Trilha completa (desktop) ───────────────────────────────────── */}
      <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Navegação">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
              )}
              {!isLast && item.href ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-1 text-gray-500 hover:text-[#F5A623] font-medium transition-colors"
                >
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span className={`flex items-center gap-1 ${isLast ? 'text-gray-800 font-semibold' : 'text-gray-500 font-medium'}`}>
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span>{item.label}</span>
                </span>
              )}
            </span>
          )
        })}
      </nav>

      {/* ── Apenas anterior + atual (mobile) ───────────────────────────── */}
      <nav className="flex md:hidden items-center gap-1 text-sm" aria-label="Navegação">
        {prev && (
          <>
            <span className="text-gray-400 font-medium truncate max-w-[120px]">{prev.label}</span>
            <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
          </>
        )}
        <span className="text-gray-800 font-semibold truncate max-w-[180px]">{last?.label}</span>
      </nav>
    </div>
  )
}
