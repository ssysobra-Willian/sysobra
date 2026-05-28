'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationProps {
  currentPage:       number
  totalPages:        number
  totalItems:        number
  itemsPerPage:      number
  onPageChange:      (page: number) => void
  onPerPageChange?:  (perPage: number) => void
  perPageOptions?:   number[]
  showPerPage?:      boolean
  label?:            string   // ex: "movimentações", "registros", "dias"
  compact?:          boolean
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = [10, 25, 50],
  showPerPage    = true,
  label          = 'registros',
  compact        = false,
}: PaginationProps) {
  // Não renderiza nada se não houver mais de uma página
  if (totalPages <= 1 && totalItems <= itemsPerPage) return null

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem   = Math.min(currentPage * itemsPerPage, totalItems)

  // Gera os números de página a exibir (com "..." para elipses)
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | '...')[] = []
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i)
    }
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
    return pages
  }

  const iconSize = compact ? 12 : 14

  const btnBase = [
    'flex items-center justify-center rounded-md border transition-colors',
    compact ? 'min-w-[28px] h-7 px-1.5 text-[11px]' : 'min-w-[32px] h-8 px-2 text-xs',
  ].join(' ')

  const btnNormal   = `${btnBase} border-gray-200 text-gray-600 hover:bg-gray-50`
  const btnActive   = `${btnBase} border-[#F5A623] bg-[#F5A623] text-white font-bold`
  const btnDisabled = 'opacity-40 cursor-not-allowed pointer-events-none'

  return (
    <div className={`flex items-center justify-between flex-wrap gap-2 border-t border-gray-100 ${compact ? 'pt-2 mt-1' : 'pt-3 mt-2'}`}>
      {/* Informação de intervalo */}
      <span className={`text-gray-400 whitespace-nowrap ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {startItem}–{endItem} de {totalItems} {label}
      </span>

      {/* Botões de navegação */}
      <div className="flex items-center gap-1">
        {/* Primeira página */}
        {!compact && (
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className={`${btnNormal} ${currentPage === 1 ? btnDisabled : ''}`}
            title="Primeira página"
          >
            <ChevronsLeft size={iconSize} />
          </button>
        )}

        {/* Anterior */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`${btnNormal} ${currentPage === 1 ? btnDisabled : ''}`}
          title="Página anterior"
        >
          <ChevronLeft size={iconSize} />
        </button>

        {/* Números de página */}
        {getPageNumbers().map((page, i) =>
          page === '...' ? (
            <span key={`dots-${i}`} className="text-gray-400 text-xs px-1 select-none">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className={page === currentPage ? btnActive : btnNormal}
            >
              {page}
            </button>
          ),
        )}

        {/* Próxima */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`${btnNormal} ${currentPage === totalPages ? btnDisabled : ''}`}
          title="Próxima página"
        >
          <ChevronRight size={iconSize} />
        </button>

        {/* Última página */}
        {!compact && (
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className={`${btnNormal} ${currentPage === totalPages ? btnDisabled : ''}`}
            title="Última página"
          >
            <ChevronsRight size={iconSize} />
          </button>
        )}
      </div>

      {/* Seletor "por página" */}
      {showPerPage && onPerPageChange && (
        <div className={`flex items-center gap-1.5 text-gray-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          <span>Por página:</span>
          <select
            value={itemsPerPage}
            onChange={e => onPerPageChange(Number(e.target.value))}
            className={[
              'border border-gray-200 rounded-md bg-white text-gray-700',
              'focus:outline-none focus:ring-1 focus:ring-[#F5A623]',
              compact ? 'text-[11px] py-0.5 px-1.5' : 'text-xs py-1 px-2',
            ].join(' ')}
          >
            {perPageOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
