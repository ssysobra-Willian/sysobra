'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowDown, ArrowUp, RotateCcw, AlertTriangle, Settings, Loader2, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Movement {
  id:          string
  type:        string
  quantity:    number
  unitCost:    number
  totalCost:   number
  reason:      string | null
  notes:       string | null
  docNumber:   string | null
  createdAt:   string
  project?:    { id: string; name: string } | null
  employee?:   { id: string; name: string } | null
  responsible?:{ id: string; name: string } | null
  basket?:     { id: string; docNumber: string; status: string; senderSignatureUrl: string | null; receiverSignatureUrl: string | null } | null
}

// ─── Movement type config ─────────────────────────────────────────────────────

const MOV_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  IN:           { label: 'Entrada',    icon: <ArrowDown  size={14} />, color: 'text-green-600',   bg: 'bg-green-50 border-green-200'  },
  OUT:          { label: 'Saída',      icon: <ArrowUp    size={14} />, color: 'text-red-600',     bg: 'bg-red-50 border-red-200'      },
  RETURN:       { label: 'Devolução',  icon: <RotateCcw  size={14} />, color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200'    },
  EPI_DELIVERY: { label: 'EPI/Unif.', icon: <ArrowUp    size={14} />, color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200'},
  LOSS:         { label: 'Perda',      icon: <AlertTriangle size={14} />, color: 'text-red-800', bg: 'bg-red-100 border-red-300'    },
  ADJUSTMENT:   { label: 'Ajuste',     icon: <Settings   size={14} />, color: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200'    },
  TRANSFER:     { label: 'Transfer.',  icon: <ArrowUp    size={14} />, color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200'},
}

function formatDateBR(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Linha de movimentação ────────────────────────────────────────────────────

function MovRow({ m, unit, onViewReceipt }: { m: Movement; unit: string; onViewReceipt?: (basketId: string) => void }) {
  const cfg = MOV_CONFIG[m.type] ?? MOV_CONFIG.ADJUSTMENT

  return (
    <div className={cn('rounded-xl border p-4 space-y-2', cfg.bg)}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('flex-shrink-0', cfg.color)}>{cfg.icon}</span>
          <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</span>
          {m.basket?.docNumber && (
            <span className="text-xs bg-white/70 border border-current/20 rounded px-1.5 py-0.5 font-mono">
              {m.basket.docNumber}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">{formatDateBR(m.createdAt)}</span>
      </div>

      {/* Valores */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <span className={cn('font-bold text-base', cfg.color)}>
          {['IN', 'RETURN'].includes(m.type) ? '+' : '−'}{m.quantity} {unit}
        </span>
        {m.unitCost > 0 && (
          <span className="text-gray-500">
            {formatCurrency(m.unitCost)}/un
            {m.totalCost > 0 && ` · Total: ${formatCurrency(m.totalCost)}`}
          </span>
        )}
      </div>

      {/* Metadados */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
        {m.project   && <span>🏗️ {m.project.name}</span>}
        {m.employee  && <span>👷 {m.employee.name}</span>}
        {m.responsible && <span>✅ Resp.: {m.responsible.name}</span>}
        {m.reason    && <span>📋 {m.reason}</span>}
        {m.notes     && <span className="italic">{m.notes}</span>}
      </div>

      {/* Link para recibo */}
      {m.basket && onViewReceipt && (
        <button
          onClick={() => onViewReceipt(m.basket!.id)}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"
        >
          <FileText size={12} />
          Ver recibo assinado →
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  itemId:       string
  unit:         string
  filterType?:  'ALL' | 'ENTRY' | 'EXIT'
  onViewReceipt?: (basketId: string) => void
}

export function MovementList({ itemId, unit, filterType = 'ALL', onViewReceipt }: Props) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [period,    setPeriod]    = useState<'month' | 'quarter' | 'half' | 'all'>('all')
  const LIMIT = 10

  const load = useCallback(async () => {
    setLoading(true)
    const now   = new Date()
    let startDate = ''
    if (period === 'month')   { const s = new Date(now.getFullYear(), now.getMonth(), 1);         startDate = s.toISOString().slice(0, 10) }
    if (period === 'quarter') { const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);     startDate = s.toISOString().slice(0, 10) }
    if (period === 'half')    { const s = new Date(now.getFullYear(), now.getMonth() - 5, 1);     startDate = s.toISOString().slice(0, 10) }

    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (filterType !== 'ALL') qs.set('type', filterType)
    if (startDate) qs.set('startDate', startDate)

    try {
      const res = await fetch(`${API}/api/v1/deposit/items/${itemId}/movements?${qs}`, {
        headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
      })
      if (!res.ok) return
      const d = await res.json()
      setMovements(d.movements ?? [])
      setTotal(d.total ?? 0)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [itemId, page, filterType, period])

  useEffect(() => { load() }, [load])

  const periods = [
    { key: 'month',   label: 'Este mês'  },
    { key: 'quarter', label: '3 meses'   },
    { key: 'half',    label: '6 meses'   },
    { key: 'all',     label: 'Tudo'      },
  ] as const

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-3">
      {/* Filtro de período */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {periods.map(p => (
          <button
            key={p.key}
            onClick={() => { setPeriod(p.key); setPage(1) }}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              period === p.key
                ? 'bg-[#F5A623] border-[#F5A623] text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >{p.label}</button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{total} registro{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={22} className="animate-spin text-[#F5A623]" />
        </div>
      ) : movements.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">Nenhuma movimentação encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {movements.map(m => (
            <MovRow key={m.id} m={m} unit={unit} onViewReceipt={onViewReceipt} />
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >← Anterior</button>
          <span className="text-xs text-gray-500">Pág. {page} / {totalPages}</span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >Próxima →</button>
        </div>
      )}
    </div>
  )
}
