import { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TableColumn<T> {
  key:        keyof T | string
  header:     ReactNode
  /** Renderização customizada da célula */
  cell?:      (row: T, index: number) => ReactNode
  /** Alinhamento horizontal */
  align?:     'left' | 'center' | 'right'
  /** Largura fixa (ex: "w-16", "w-32") */
  width?:     string
  /** Oculta em mobile */
  hideOnMobile?: boolean
}

interface TableProps<T> {
  /** Colunas da tabela */
  columns:       TableColumn<T>[]
  /** Dados das linhas */
  data:          T[]
  /** Chave única de cada linha */
  rowKey?:       (row: T, index: number) => string | number
  /** Estado vazio */
  emptyMessage?: string
  emptyIcon?:    ReactNode
  /** Loading skeleton */
  loading?:      boolean
  /** Ao clicar em uma linha */
  onRowClick?:   (row: T) => void
  className?:    string
  /** Remove o padding dos containers para full-bleed em Card */
  noPadding?:    boolean
}

// ─── Th ───────────────────────────────────────────────────────────────────────

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right'
  className?: string
}

export function Th({ align = 'left', className, children, ...props }: ThProps) {
  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }[align]
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide',
        'bg-gray-50 dark:bg-neutral-800',
        alignClass,
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

// ─── Td ───────────────────────────────────────────────────────────────────────

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right'
  className?: string
}

export function Td({ align = 'left', className, children, ...props }: TdProps) {
  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }[align]
  return (
    <td
      className={cn(
        'px-4 py-3 text-sm text-gray-700 dark:text-gray-300',
        'border-b border-gray-100 dark:border-neutral-700',
        alignClass,
        className,
      )}
      {...props}
    >
      {children}
    </td>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3 border-b border-gray-100 dark:border-neutral-700">
          <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Table<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  emptyMessage = 'Nenhum registro encontrado.',
  emptyIcon,
  loading      = false,
  onRowClick,
  className,
  noPadding    = false,
}: TableProps<T>) {
  return (
    <div className={cn('w-full overflow-x-auto', !noPadding && 'rounded-xl', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <Th
                key={String(col.key)}
                align={col.align}
                className={cn(col.width, col.hideOnMobile && 'hidden sm:table-cell')}
              >
                {col.header}
              </Th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <>
              <SkeletonRow cols={columns.length} />
              <SkeletonRow cols={columns.length} />
              <SkeletonRow cols={columns.length} />
              <SkeletonRow cols={columns.length} />
            </>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center"
              >
                <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
                  {emptyIcon ?? (
                    <svg
                      className="w-10 h-10 opacity-40"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  )}
                  <p className="text-sm">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, idx) => {
              const key = rowKey ? rowKey(row, idx) : idx
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'bg-white dark:bg-neutral-900',
                    'hover:bg-gray-50 dark:hover:bg-neutral-800',
                    'transition-colors',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {columns.map((col) => {
                    const cellValue = col.cell
                      ? col.cell(row, idx)
                      : (row[col.key as keyof T] as ReactNode)

                    return (
                      <Td
                        key={String(col.key)}
                        align={col.align}
                        className={cn(col.hideOnMobile && 'hidden sm:table-cell')}
                      >
                        {cellValue}
                      </Td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
