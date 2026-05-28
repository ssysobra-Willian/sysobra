'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Package, Wrench, ShieldCheck, Shirt, Layers, FileText, Search, Plus,
  AlertTriangle, TrendingUp, TrendingDown, BarChart2, Clock, RefreshCw,
  Filter, ChevronDown, ChevronUp, MoreHorizontal, Eye, Edit2, Trash2,
  ArrowDownToLine, ArrowUpFromLine, RotateCcw, XCircle, Loader2,
  CheckCircle2, Calendar, MapPin, Tag, Users, SlidersHorizontal, X,
  ArrowLeftRight, Zap, Warehouse,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

// ── Sub-components ─────────────────────────────────────────────────────────────
import { ItemDrawer,      type ItemDetail  } from './components/ItemDrawer'
import { ToolDrawer,      type ToolItem    } from './components/ToolDrawer'
import { CustodyModal    } from './components/CustodyModal'
import { MaintenanceModal} from './components/MaintenanceModal'
import { ReceiptViewer   } from './components/ReceiptViewer'
import { ItemFormModal   } from './components/ItemFormModal'
import { ToolFormModal   } from './components/ToolFormModal'
import { QuickEntryModal } from './components/QuickEntryModal'
import { EpiDeliveryModal} from './components/EpiDeliveryModal'
import { BasketModal, type BasketPayload } from '@/components/deposit/BasketModal'
import { CreateLocationModal } from './components/CreateLocationModal'
import DepositoOnboarding     from './components/DepositoOnboarding'

// ─── API ─────────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function token()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function companyH()  { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

async function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token()}`,
      'x-company-id': companyH(),
      ...(opts.headers ?? {}),
    },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryFull {
  totalItems:          number
  totalValue:          number
  lowStockCount:       number
  inMaintenanceCount:  number
  exitsThisMonth:      number
  entriesThisMonth:    number
  overdueReturns:      number
  overdueMaintenance:  number
}

interface StockItem {
  id:             string
  code?:          string | null
  name:           string
  description?:   string | null
  category?:      string | null
  unit:           string
  quantity:       number
  minQuantity:    number
  maxQuantity?:   number | null
  unitCost?:      number | null
  averageCost?:   number | null
  location?:      string | null
  locationFull?:  string | null
  imageUrl?:      string | null
  brand?:         string | null
  model?:         string | null
  serialNumber?:  string | null
  isConsumable:   boolean
  requiresCustody:boolean
  isEpi:          boolean
  isUniform:      boolean
  isActive:       boolean
  isUnderWarranty?:  boolean
  warrantyExpiry?:   string | null
  lastMaintenance?:  string | null
  nextMaintenance?:  string | null
  currentProject?:   { id: string; name: string } | null
  supplierLots?:     any[]
  _count?:           { movements: number; custodies: number; epiDeliveries: number }
}

interface StockMovement {
  id:        string
  type:      string
  quantity:  number
  unitCost?: number | null
  reason?:   string | null
  notes?:    string | null
  createdAt: string
  stockItem: { id: string; name: string; unit: string }
  project?:  { id: string; name: string } | null
  employee?: { id: string; name: string } | null
}

interface StockBasket {
  id:          string
  docNumber:   string
  type:        string
  status:      string
  destinatary?: string | null
  notes?:      string | null
  signedAt?:   string | null
  createdAt:   string
  project?:    { id: string; name: string } | null
  employee?:   { id: string; name: string } | null
  _count?:     { movements: number }
}

interface Employee { id: string; name: string; position?: string | null }
interface Project  { id: string; name: string; code?: string | null }

interface StockLocation {
  id:          string
  name:        string
  type:        string
  isActive:    boolean
  totalItems?: number
  totalValue?: number
  project?:    { id: string; name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateBR(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function daysFromNow(iso?: string | null) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function StockProgress({ qty, min, max }: { qty: number; min: number; max?: number | null }) {
  const cap = max || Math.max(min * 3, qty * 1.5, 10)
  const pct = Math.min(100, (qty / cap) * 100)
  const isLow  = qty <= min
  const isOver = max ? qty > max : false
  const color  = isLow ? 'bg-red-500' : isOver ? 'bg-blue-400' : 'bg-green-500'
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={cn('text-sm font-semibold tabular-nums flex-shrink-0', isLow ? 'text-red-600' : 'text-gray-800')}>
        {qty}
      </span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[40px]">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      {isLow && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
    </div>
  )
}

const MOV_TYPE: Record<string, { label: string; color: string }> = {
  IN:           { label: 'Entrada',    color: 'text-green-600 bg-green-50' },
  OUT:          { label: 'Saída',      color: 'text-red-600 bg-red-50'     },
  RETURN:       { label: 'Devolução',  color: 'text-blue-600 bg-blue-50'   },
  EPI_DELIVERY: { label: 'EPI',        color: 'text-orange-600 bg-orange-50'},
  LOSS:         { label: 'Perda',      color: 'text-red-800 bg-red-100'    },
  ADJUSTMENT:   { label: 'Ajuste',     color: 'text-gray-600 bg-gray-100'  },
  TRANSFER:     { label: 'Transfer.',  color: 'text-purple-600 bg-purple-50'},
}

const BASKET_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:   { label: 'Rascunho', color: 'bg-gray-100 text-gray-600'    },
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
  SIGNED:  { label: 'Assinado', color: 'bg-green-100 text-green-700'   },
  CLOSED:  { label: 'Fechado',  color: 'bg-blue-100 text-blue-700'     },
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon, color, alert }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color: string; alert?: boolean
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl border p-3 flex items-center gap-3 shadow-sm min-w-0',
      alert ? 'border-red-200' : 'border-gray-100',
    )}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400 leading-none truncate">{label}</p>
        <p className={cn('text-xl font-bold leading-tight mt-0.5', alert ? 'text-red-600' : 'text-gray-800')}>
          {value}
        </p>
        {sub && <p className="text-xs text-gray-400 leading-none mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Action Menu ─────────────────────────────────────────────────────────────

function ActionMenu({ onView, onEdit, onDelete, onCustody, onBasket }: {
  onView?:    () => void
  onEdit?:    () => void
  onDelete?:  () => void
  onCustody?: () => void
  onBasket?:  () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
      >
        <MoreHorizontal size={15} className="text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[140px] py-1 overflow-hidden">
          {onView    && <button onClick={() => { onView();    setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-gray-700"><Eye size={13}/>Detalhes</button>}
          {onEdit    && <button onClick={() => { onEdit();    setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-gray-700"><Edit2 size={13}/>Editar</button>}
          {onCustody && <button onClick={() => { onCustody();setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-orange-600"><Package size={13}/>Cautela</button>}
          {onBasket  && <button onClick={() => { onBasket(); setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-blue-600"><FileText size={13}/>Romaneio</button>}
          {onDelete  && <button onClick={() => { onDelete(); setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 text-red-600"><Trash2 size={13}/>Remover</button>}
        </div>
      )}
    </div>
  )
}

// ─── Materials Table ──────────────────────────────────────────────────────────

function MaterialsTable({ items, onView, onEdit, onCustody, onBasket }: {
  items:     StockItem[]
  onView:    (item: StockItem) => void
  onEdit?:   (item: StockItem) => void
  onCustody: (item: StockItem) => void
  onBasket:  (item: StockItem) => void
}) {
  const [sort,  setSort]  = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' })
  const [query, setQuery] = useState('')

  const toggleSort = (col: string) =>
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })

  const filtered = items
    .filter(i => !query || i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.code?.toLowerCase().includes(query.toLowerCase()) ||
      i.brand?.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      if (sort.col === 'name')     return a.name.localeCompare(b.name) * dir
      if (sort.col === 'quantity') return (a.quantity - b.quantity) * dir
      if (sort.col === 'value')    return (((a.averageCost || a.unitCost || 0) * a.quantity) - ((b.averageCost || b.unitCost || 0) * b.quantity)) * dir
      return 0
    })

  function SortIcon({ col }: { col: string }) {
    if (sort.col !== col) return <ChevronDown size={11} className="text-gray-300" />
    return sort.dir === 'asc'
      ? <ChevronUp size={11} className="text-[#F5A623]" />
      : <ChevronDown size={11} className="text-[#F5A623]" />
  }

  return (
    <div>
      {/* Search */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar material, cód., marca..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#F5A623]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} className="text-gray-400" />
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {[
                { col: null,       label: 'Cód.',       w: 'w-16'  },
                { col: 'name',     label: 'Descrição',  w: ''      },
                { col: null,       label: 'Un.',        w: 'w-14'  },
                { col: 'quantity', label: 'Estoque',    w: 'w-32'  },
                { col: null,       label: 'Localização',w: 'w-28'  },
                { col: null,       label: 'Vl.Unit',    w: 'w-20'  },
                { col: 'value',    label: 'Vl.Total',   w: 'w-24'  },
                { col: null,       label: '',           w: 'w-8'   },
              ].map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    'px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap',
                    h.w,
                    h.col && 'cursor-pointer select-none hover:text-gray-700',
                  )}
                  onClick={h.col ? () => toggleSort(h.col!) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {h.label}
                    {h.col && <SortIcon col={h.col} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nenhum item encontrado
                </td>
              </tr>
            ) : filtered.map(item => {
              const cost      = item.averageCost || item.unitCost || 0
              const totalVal  = cost * item.quantity
              const isLow     = item.quantity <= item.minQuantity
              const imgSrc    = item.imageUrl
                ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${API}/${item.imageUrl}`)
                : null
              return (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50/70 transition-colors cursor-pointer group"
                  onClick={() => onView(item)}
                >
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-gray-400">{item.code ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {imgSrc ? (
                        <img src={imgSrc} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Package size={13} className="text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{item.name}</p>
                        {(item.brand || item.model) && (
                          <p className="text-xs text-gray-400 truncate">
                            {[item.brand, item.model].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-500">{item.unit}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StockProgress qty={item.quantity} min={item.minQuantity} max={item.maxQuantity} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-500 truncate block max-w-[100px]">
                      {item.location ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-600">{cost > 0 ? formatCurrency(cost) : '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-sm font-semibold', totalVal > 0 ? 'text-gray-800' : 'text-gray-400')}>
                      {totalVal > 0 ? formatCurrency(totalVal) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <ActionMenu
                      onView={() => onView(item)}
                      onEdit={onEdit ? () => onEdit(item) : undefined}
                      onCustody={item.requiresCustody ? () => onCustody(item) : undefined}
                      onBasket={() => onBasket(item)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.map(item => {
          const cost     = item.averageCost || item.unitCost || 0
          const isLow    = item.quantity <= item.minQuantity
          const imgSrc   = item.imageUrl
            ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${API}/${item.imageUrl}`)
            : null
          return (
            <div
              key={item.id}
              className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 shadow-sm"
              onClick={() => onView(item)}
            >
              {imgSrc ? (
                <img src={imgSrc} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Package size={20} className="text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium text-gray-800 text-sm truncate">{item.name}</p>
                  {isLow && <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('text-sm font-bold', isLow ? 'text-red-600' : 'text-gray-700')}>
                    {item.quantity} {item.unit}
                  </span>
                  {cost > 0 && (
                    <span className="text-xs text-gray-400">· {formatCurrency(cost * item.quantity)}</span>
                  )}
                </div>
                {item.location && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {item.location}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tools Table ─────────────────────────────────────────────────────────────

function ToolsTable({ items, onView, onEdit, onCustody, onMaintenance }: {
  items:          StockItem[]
  onView:         (item: StockItem) => void
  onEdit?:        (item: StockItem) => void
  onCustody:      (item: StockItem) => void
  onMaintenance:  (item: StockItem) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = items.filter(i =>
    !query ||
    i.name.toLowerCase().includes(query.toLowerCase()) ||
    i.serialNumber?.toLowerCase().includes(query.toLowerCase()) ||
    i.brand?.toLowerCase().includes(query.toLowerCase()),
  )

  function warrantyBadge(item: StockItem) {
    if (!item.isUnderWarranty) return <span className="text-xs text-gray-400">—</span>
    const days = daysFromNow(item.warrantyExpiry)
    if (days === null) return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Ativa</span>
    )
    if (days < 0) return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Vencida</span>
    )
    if (days <= 30) return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
        {days}d
      </span>
    )
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Ativa</span>
  }

  function maintenanceBadge(item: StockItem) {
    if (!item.nextMaintenance) return <span className="text-xs text-gray-400">—</span>
    const days = daysFromNow(item.nextMaintenance)!
    if (days < 0) return (
      <div className="flex items-center gap-1">
        <AlertTriangle size={12} className="text-red-500" />
        <span className="text-xs font-medium text-red-600">{formatDateBR(item.nextMaintenance)}</span>
      </div>
    )
    if (days <= 7) return (
      <div className="flex items-center gap-1">
        <Clock size={12} className="text-yellow-500" />
        <span className="text-xs font-medium text-yellow-700">{formatDateBR(item.nextMaintenance)}</span>
      </div>
    )
    return <span className="text-xs text-gray-600">{formatDateBR(item.nextMaintenance)}</span>
  }

  function locationBadge(item: StockItem) {
    if (item.currentProject) return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 truncate max-w-[100px] block">
        🏗️ {item.currentProject.name}
      </span>
    )
    if (item.location) return (
      <span className="text-xs text-gray-600 truncate block max-w-[100px]">{item.location}</span>
    )
    return <span className="text-xs text-gray-400">Depósito</span>
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar ferramenta, nº série..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#F5A623]"
          />
          {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={13} className="text-gray-400" /></button>}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} ferramenta{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
              <th className="px-3 py-2.5 text-left w-16">Cód.</th>
              <th className="px-3 py-2.5 text-left">Ferramenta</th>
              <th className="px-3 py-2.5 text-left w-28">Nº Série</th>
              <th className="px-3 py-2.5 text-left w-28">Localização</th>
              <th className="px-3 py-2.5 text-left w-20">Garantia</th>
              <th className="px-3 py-2.5 text-left w-32">Próx. Manutenção</th>
              <th className="px-3 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma ferramenta encontrada</td></tr>
            ) : filtered.map(item => (
              <tr
                key={item.id}
                className="hover:bg-gray-50/70 transition-colors cursor-pointer"
                onClick={() => onView(item)}
              >
                <td className="px-3 py-2.5">
                  <span className="text-xs font-mono text-gray-400">{item.code ?? '—'}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div>
                    <p className="font-medium text-gray-800">{item.name}</p>
                    {(item.brand || item.model) && (
                      <p className="text-xs text-gray-400">{[item.brand, item.model].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs font-mono text-gray-500">{item.serialNumber ?? '—'}</span>
                </td>
                <td className="px-3 py-2.5">{locationBadge(item)}</td>
                <td className="px-3 py-2.5">{warrantyBadge(item)}</td>
                <td className="px-3 py-2.5">{maintenanceBadge(item)}</td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <ActionMenu
                    onView={() => onView(item)}
                    onEdit={onEdit ? () => onEdit(item) : undefined}
                    onCustody={() => onCustody(item)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map(item => {
          const overdueM = item.nextMaintenance && daysFromNow(item.nextMaintenance)! < 0
          return (
            <div
              key={item.id}
              className={cn('bg-white border rounded-xl p-3 shadow-sm cursor-pointer', overdueM ? 'border-red-200' : 'border-gray-100')}
              onClick={() => onView(item)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                  {item.serialNumber && <p className="text-xs text-gray-400 font-mono">Série: {item.serialNumber}</p>}
                </div>
                {warrantyBadge(item)}
              </div>
              <div className="flex items-center gap-3 text-xs">
                {locationBadge(item)}
                {item.nextMaintenance && maintenanceBadge(item)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Movements Tab ────────────────────────────────────────────────────────────

function MovementsTab({ onViewReceipt }: { onViewReceipt: (basketId: string) => void }) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(0)
  const [typeFilter,setTypeFilter]= useState('')
  const LIMIT = 20

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (typeFilter) qs.set('type', typeFilter)
    try {
      const res = await apiFetch(`/api/v1/deposit/movements?${qs}`)
      if (res.ok) {
        const d = await res.json()
        setMovements(d.movements ?? [])
        setTotal(d.total ?? 0)
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, typeFilter])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: '', label: 'Todos' }, ...Object.entries(MOV_TYPE).map(([k, v]) => ({ value: k, label: v.label }))].map(t => (
          <button
            key={t.value}
            onClick={() => { setTypeFilter(t.value); setPage(1) }}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition',
              typeFilter === t.value
                ? 'bg-[#F5A623] border-[#F5A623] text-white'
                : 'border-gray-200 text-gray-500 hover:border-gray-300',
            )}
          >{t.label}</button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">{total} registros</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[#F5A623]" />
        </div>
      ) : movements.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">Nenhuma movimentação encontrada</div>
      ) : (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                <th className="px-4 py-2.5 text-left">Data</th>
                <th className="px-4 py-2.5 text-left">Tipo</th>
                <th className="px-4 py-2.5 text-left">Item</th>
                <th className="px-4 py-2.5 text-left">Qtd.</th>
                <th className="px-4 py-2.5 text-left">Obra</th>
                <th className="px-4 py-2.5 text-left">Colaborador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.map(m => {
                const tc = MOV_TYPE[m.type] ?? MOV_TYPE.ADJUSTMENT
                return (
                  <tr key={m.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', tc.color)}>{tc.label}</span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 truncate max-w-[160px]">{m.stockItem.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {['IN','RETURN'].includes(m.type) ? '+' : '−'}{m.quantity} {m.stockItem.unit}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[100px]">{m.project?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[100px]">{m.employee?.name ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-gray-50">
            {movements.map(m => {
              const tc = MOV_TYPE[m.type] ?? MOV_TYPE.ADJUSTMENT
              return (
                <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0', tc.color)}>{tc.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.stockItem.name}</p>
                    <p className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleDateString('pt-BR')} · {m.project?.name}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 flex-shrink-0">{m.quantity}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40">← Anterior</button>
          <span className="text-xs text-gray-500">Pág. {page}/{totalPages}</span>
          <button disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40">Próxima →</button>
        </div>
      )}
    </div>
  )
}

// ─── Baskets Tab (Ordens/Romaneios) ─────────────────────────────────────────

function BasketsTab({ onViewReceipt }: { onViewReceipt: (basketId: string) => void }) {
  const [baskets,  setBaskets]  = useState<StockBasket[]>([])
  const [loading,  setLoading]  = useState(true)
  const [page,     setPage]     = useState(1)
  const [total,    setTotal]    = useState(0)
  const LIMIT = 15

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    try {
      const res = await apiFetch(`/api/v1/deposit/baskets?${qs}`)
      if (res.ok) {
        const d = await res.json()
        setBaskets(d.baskets ?? [])
        setTotal(d.total ?? 0)
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{total} romaneio{total !== 1 ? 's' : ''}</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[#F5A623]" /></div>
      ) : baskets.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">Nenhum romaneio encontrado</div>
      ) : (
        <div className="space-y-2">
          {baskets.map(b => {
            const st = BASKET_STATUS[b.status] ?? BASKET_STATUS.DRAFT
            const BTYPE: Record<string, string> = { OUT: 'Saída', IN: 'Entrada', TRANSFER: 'Transferência', EPI_DELIVERY: 'EPI', RETURN: 'Devolução' }
            return (
              <div key={b.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-gray-800">{b.docNumber}</span>
                    <span className="text-xs text-gray-500">{BTYPE[b.type] ?? b.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', st.color)}>{st.label}</span>
                    {b.status === 'SIGNED' && (
                      <button
                        onClick={() => onViewReceipt(b.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                      >
                        <Eye size={11} />Ver recibo
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  {b.employee && <span>👷 {b.employee.name}</span>}
                  {b.project  && <span>🏗️ {b.project.name}</span>}
                  {b._count   && <span>📦 {b._count.movements} iten{b._count.movements !== 1 ? 's' : ''}</span>}
                  <span>📅 {new Date(b.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40">← Anterior</button>
          <span className="text-xs text-gray-500">Pág. {page}/{totalPages}</span>
          <button disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40">Próxima →</button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = 'materials' | 'tools' | 'epis' | 'uniforms' | 'movements' | 'baskets'

const TABS: { id: TabId; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'materials', label: 'Materiais',    icon: Package    },
  { id: 'tools',     label: 'Ferramentário',icon: Wrench     },
  { id: 'epis',      label: 'EPIs',         icon: ShieldCheck},
  { id: 'uniforms',  label: 'Uniformes',    icon: Shirt      },
  { id: 'movements', label: 'Movimentações',icon: Layers     },
  { id: 'baskets',   label: 'Romaneios',    icon: FileText   },
]

export default function DepositoPage() {
  const router = useRouter()

  // ── State ─────────────────────────────────────────────────────────────────
  const [tab,            setTab]            = useState<TabId>('materials')
  const [items,          setItems]          = useState<StockItem[]>([])
  const [summary,        setSummary]        = useState<SummaryFull | null>(null)
  const [employees,      setEmployees]      = useState<Employee[]>([])
  const [projects,       setProjects]       = useState<Project[]>([])
  const [loading,        setLoading]        = useState(true)
  const [setupStatus,    setSetupStatus]    = useState<{ hasCentral: boolean } | null>(null)
  const [checkingSetup,  setCheckingSetup]  = useState(true)

  // Locations
  const [locations,        setLocations]        = useState<StockLocation[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [locationsLoading, setLocationsLoading] = useState(false)

  // Drawers & Modals
  const [selectedItem,      setSelectedItem]      = useState<StockItem | null>(null)
  const [selectedTool,      setSelectedTool]      = useState<StockItem | null>(null)
  const [custodyItem,       setCustodyItem]        = useState<StockItem | null>(null)
  const [maintenanceTool,   setMaintenanceTool]   = useState<StockItem | null>(null)
  const [maintenanceRecord, setMaintenanceRecord] = useState<any>(null)
  const [receiptBasketId,   setReceiptBasketId]   = useState<string | null>(null)
  const [basketOpen,        setBasketOpen]        = useState(false)

  // Form modals
  const [materialFormOpen,  setMaterialFormOpen]  = useState(false)
  const [toolFormOpen,      setToolFormOpen]      = useState(false)
  const [epiFormOpen,       setEpiFormOpen]       = useState(false)
  const [uniformFormOpen,   setUniformFormOpen]   = useState(false)
  const [editingMaterial,   setEditingMaterial]   = useState<StockItem | null>(null)
  const [editingTool,       setEditingTool]       = useState<StockItem | null>(null)

  // New multi-location modals
  const [quickEntryOpen,      setQuickEntryOpen]      = useState(false)
  const [epiDeliveryOpen,     setEpiDeliveryOpen]     = useState(false)
  const [epiDeliveryItemId,   setEpiDeliveryItemId]   = useState<string | undefined>(undefined)
  const [createLocationOpen,  setCreateLocationOpen]  = useState(false)

  // ── Verificar se Depósito Central existe ─────────────────────────────────
  const checkSetup = useCallback(async () => {
    setCheckingSetup(true)
    try {
      const res = await apiFetch('/api/v1/deposit/setup-status')
      const data = await res.json()
      setSetupStatus(data)
    } catch {
      setSetupStatus({ hasCentral: false })
    } finally {
      setCheckingSetup(false)
    }
  }, [])

  useEffect(() => { checkSetup() }, [checkSetup])

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, summaryRes, empRes, projRes, locRes] = await Promise.all([
        apiFetch('/api/v1/deposit/items?limit=500&active=true'),
        apiFetch('/api/v1/deposit/summary/full'),
        apiFetch('/api/v1/employees?limit=200'),
        apiFetch('/api/v1/projects?limit=200'),
        apiFetch('/api/v1/deposit/locations'),
      ])
      if (itemsRes.ok)    { const d = await itemsRes.json();    setItems(d.items ?? [])       }
      if (summaryRes.ok)  { const d = await summaryRes.json();  setSummary(d)                 }
      if (empRes.ok)      { const d = await empRes.json();      setEmployees(d.employees ?? d.data ?? []) }
      if (projRes.ok)     { const d = await projRes.json();     setProjects(d.projects ?? d.data ?? [])  }
      if (locRes.ok)      { const d = await locRes.json();      setLocations(d.locations ?? d.data ?? []) }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Derived item lists ────────────────────────────────────────────────────
  const materials = items.filter(i => !i.isEpi && !i.isUniform && !i.requiresCustody)
  const tools      = items.filter(i => i.requiresCustody)
  const epis       = items.filter(i => i.isEpi)
  const uniforms   = items.filter(i => i.isUniform)

  // ── Smart header button ───────────────────────────────────────────────────
  function getAddButton() {
    switch (tab) {
      case 'materials': return { label: 'Novo Material',   onClick: () => { setEditingMaterial(null); setMaterialFormOpen(true) } }
      case 'tools':     return { label: 'Nova Ferramenta', onClick: () => { setEditingTool(null);     setToolFormOpen(true)     } }
      case 'epis':      return { label: 'Novo EPI',        onClick: () => { setEditingMaterial(null); setEpiFormOpen(true)      } }
      case 'uniforms':  return { label: 'Novo Uniforme',   onClick: () => { setEditingMaterial(null); setUniformFormOpen(true)  } }
      case 'baskets':   return { label: 'Novo Romaneio',   onClick: () => setBasketOpen(true) }
      default:          return null
    }
  }
  const addBtn = getAddButton()

  // Active location label
  const activeLocation = locations.find(l => l.id === selectedLocation)

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleViewItem = (item: StockItem) => {
    if (item.requiresCustody) { setSelectedTool(item); setSelectedItem(null) }
    else                      { setSelectedItem(item); setSelectedTool(null) }
  }

  const handleViewReceipt = (basketId: string) => {
    setSelectedItem(null)
    setSelectedTool(null)
    setReceiptBasketId(basketId)
  }

  const handleBasketConfirm = async (payload: BasketPayload) => {
    const res = await apiFetch('/api/v1/deposit/baskets', {
      method: 'POST',
      body:   JSON.stringify(payload),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? `Erro ${res.status}`)
    }
    // Se há assinaturas, assinar o romaneio criado
    const basket = await res.json()
    if (payload.senderSignature || payload.receiverSignature) {
      await apiFetch(`/api/v1/deposit/baskets/${basket.id}/sign`, {
        method: 'PATCH',
        body:   JSON.stringify({
          senderSignature:   payload.senderSignature,
          receiverSignature: payload.receiverSignature,
        }),
      })
    }
    setBasketOpen(false)
    loadAll()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Verificando se há Depósito Central
  if (checkingSetup) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <Loader2 size={32} className="animate-spin mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Verificando configuração...</p>
        </div>
      </div>
    )
  }

  // Sem Depósito Central → onboarding obrigatório
  if (!setupStatus?.hasCentral) {
    return (
      <DepositoOnboarding
        onComplete={async () => {
          await checkSetup()
          loadAll()
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Depósito</h1>
              <p className="text-xs text-gray-400 mt-0.5">Controle de materiais, ferramentas e EPIs</p>
            </div>
            <div className="flex items-center gap-2">

              {/* Location selector */}
              {locations.length > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 bg-white">
                  <Warehouse size={13} className="text-gray-400" />
                  <select
                    value={selectedLocation}
                    onChange={e => setSelectedLocation(e.target.value)}
                    className="text-xs text-gray-700 bg-transparent focus:outline-none cursor-pointer font-medium max-w-[180px]"
                  >
                    <option value="all">📊 Estoque global — todos</option>
                    {locations.filter(l => l.isActive).map(l => (
                      <option key={l.id} value={l.id}>
                        {l.type === 'CENTRAL' ? '🏭 Depósito Central — ' : '🏗️ '}{l.name}
                        {l.project ? ` (${l.project.name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Botão + Novo almoxarifado */}
              <button
                onClick={() => setCreateLocationOpen(true)}
                className="hidden sm:flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-xl hover:bg-gray-50 transition"
                title="Criar novo almoxarifado"
              >
                <Warehouse size={14} className="text-[#F5A623]" />
                <span className="hidden md:inline text-xs font-medium">+ Almoxarifado</span>
              </button>

              {/* Transferências */}
              <button
                onClick={() => router.push('/app/deposito/transferencias')}
                className="hidden sm:flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-xl hover:bg-gray-50 transition"
                title="Transferências entre almoxarifados"
              >
                <ArrowLeftRight size={14} />
                <span className="hidden md:inline text-xs font-medium">Transferências</span>
              </button>

              {/* Entrada Rápida */}
              <button
                onClick={() => setQuickEntryOpen(true)}
                className="hidden sm:flex items-center gap-1.5 border border-[#F5A623] text-[#F5A623] text-sm px-3 py-2 rounded-xl hover:bg-orange-50 transition"
                title="Entrada rápida de estoque"
              >
                <Zap size={14} />
                <span className="hidden md:inline text-xs font-medium">Entrada Rápida</span>
              </button>

              <button
                onClick={loadAll}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
                title="Recarregar"
              >
                <RefreshCw size={15} className={cn('text-gray-500', loading && 'animate-spin')} />
              </button>
              {addBtn && (
                <button
                  onClick={addBtn.onClick}
                  className="flex items-center gap-1.5 bg-[#F5A623] text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-[#e09610] transition"
                >
                  <Plus size={15} />
                  <span className="hidden sm:inline">{addBtn.label}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Metric cards ───────────────────────────────────────────────── */}
        {loading && !summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Total de itens"
              value={summary.totalItems}
              icon={<Package size={18} className="text-blue-600" />}
              color="bg-blue-50"
            />
            <MetricCard
              label="Valor em estoque"
              value={formatCurrency(summary.totalValue)}
              icon={<TrendingUp size={18} className="text-green-600" />}
              color="bg-green-50"
            />
            <MetricCard
              label="Saídas este mês"
              value={summary.exitsThisMonth}
              icon={<ArrowUpFromLine size={18} className="text-red-500" />}
              color="bg-red-50"
            />
            <MetricCard
              label="Entradas este mês"
              value={summary.entriesThisMonth}
              icon={<ArrowDownToLine size={18} className="text-green-600" />}
              color="bg-green-50"
            />
            <MetricCard
              label="Estoque baixo"
              value={summary.lowStockCount}
              icon={<AlertTriangle size={18} className="text-red-500" />}
              color="bg-red-50"
              alert={summary.lowStockCount > 0}
            />
            <MetricCard
              label="Devoluções atrasadas"
              value={summary.overdueReturns}
              icon={<Clock size={18} className="text-orange-500" />}
              color="bg-orange-50"
              alert={summary.overdueReturns > 0}
            />
            <MetricCard
              label="Em manutenção"
              value={summary.inMaintenanceCount}
              icon={<Wrench size={18} className="text-purple-600" />}
              color="bg-purple-50"
            />
            <MetricCard
              label="Manutenções atrasadas"
              value={summary.overdueMaintenance}
              icon={<AlertTriangle size={18} className="text-red-600" />}
              color="bg-red-50"
              alert={summary.overdueMaintenance > 0}
            />
          </div>
        )}

        {/* ── Location context banner ───────────────────────────────────── */}
        {locations.length > 0 && selectedLocation !== 'all' && activeLocation && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border',
            'bg-amber-50 border-amber-200',
          )}>
            <Warehouse size={15} className="text-[#F5A623] flex-shrink-0" />
            <span>
              <strong className="text-gray-800">{activeLocation.name}</strong>
              {activeLocation.project && (
                <span className="text-gray-500 ml-2">— {activeLocation.project.name}</span>
              )}
              <span className={cn(
                'ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                activeLocation.type === 'CENTRAL'
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-amber-200 text-amber-900',
              )}>
                {activeLocation.type === 'CENTRAL' ? 'Depósito Central' : 'Almoxarifado de Obra'}
              </span>
            </span>
            <button
              onClick={() => setSelectedLocation('all')}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              title="Ver todos"
            >
              Ver todos
            </button>
          </div>
        )}

        {/* ── Location breakdown cards ───────────────────────────────────── */}
        {locations.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {locations.filter(l => l.isActive).map(l => (
              <button
                key={l.id}
                onClick={() => setSelectedLocation(prev => prev === l.id ? 'all' : l.id)}
                className={cn(
                  'bg-white rounded-xl border p-3 text-left flex items-start gap-2.5 shadow-sm hover:border-orange-200 transition',
                  selectedLocation === l.id ? 'border-[#F5A623] ring-1 ring-[#F5A623]/30' : 'border-gray-100',
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                  l.type === 'CENTRAL' ? 'bg-blue-50' : 'bg-purple-50',
                )}>
                  <Warehouse size={14} className={l.type === 'CENTRAL' ? 'text-blue-600' : 'text-purple-600'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{l.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{l.type === 'CENTRAL' ? 'Central' : 'Almox. Obra'}</p>
                  {l.totalItems !== undefined && (
                    <p className="text-[10px] text-gray-400">{l.totalItems} itens</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="border-b border-gray-100 overflow-x-auto no-scrollbar">
            <div className="flex min-w-max">
              {TABS.map(t => {
                const count =
                  t.id === 'materials' ? materials.length :
                  t.id === 'tools'     ? tools.length :
                  t.id === 'epis'      ? epis.length :
                  t.id === 'uniforms'  ? uniforms.length : null
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                      tab === t.id
                        ? 'border-[#F5A623] text-[#F5A623]'
                        : 'border-transparent text-gray-500 hover:text-gray-700',
                    )}
                  >
                    <t.icon size={15} />
                    {t.label}
                    {count !== null && (
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full font-medium',
                        tab === t.id ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500',
                      )}>{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="p-5">
            {loading && items.length === 0 ? (
              <div className="flex justify-center py-16">
                <Loader2 size={28} className="animate-spin text-[#F5A623]" />
              </div>
            ) : (
              <>
                {tab === 'materials' && (
                  <MaterialsTable
                    items={materials}
                    onView={handleViewItem}
                    onEdit={item => { setEditingMaterial(item); setMaterialFormOpen(true) }}
                    onCustody={item => setCustodyItem(item)}
                    onBasket={() => setBasketOpen(true)}
                  />
                )}
                {tab === 'tools' && (
                  <ToolsTable
                    items={tools}
                    onView={handleViewItem}
                    onEdit={item => { setEditingTool(item); setToolFormOpen(true) }}
                    onCustody={item => setCustodyItem(item)}
                    onMaintenance={item => { setMaintenanceTool(item); setMaintenanceRecord(null) }}
                  />
                )}
                {tab === 'epis' && (
                  <div>
                    <div className="flex justify-end mb-3">
                      <button
                        onClick={() => { setEpiDeliveryItemId(undefined); setEpiDeliveryOpen(true) }}
                        className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-green-700 transition"
                      >
                        <ShieldCheck size={14} />
                        Entregar EPI
                      </button>
                    </div>
                    <MaterialsTable
                      items={epis}
                      onView={handleViewItem}
                      onEdit={item => { setEditingMaterial(item); setEpiFormOpen(true) }}
                      onCustody={item => setCustodyItem(item)}
                      onBasket={() => setBasketOpen(true)}
                    />
                  </div>
                )}
                {tab === 'uniforms' && (
                  <MaterialsTable
                    items={uniforms}
                    onView={handleViewItem}
                    onEdit={item => { setEditingMaterial(item); setUniformFormOpen(true) }}
                    onCustody={item => setCustodyItem(item)}
                    onBasket={() => setBasketOpen(true)}
                  />
                )}
                {tab === 'movements' && (
                  <MovementsTab onViewReceipt={handleViewReceipt} />
                )}
                {tab === 'baskets' && (
                  <BasketsTab onViewReceipt={handleViewReceipt} />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Drawers & Modals ────────────────────────────────────────────── */}

      {selectedItem && (
        <ItemDrawer
          item={selectedItem as ItemDetail}
          onClose={() => setSelectedItem(null)}
          onViewReceipt={handleViewReceipt}
        />
      )}

      {selectedTool && (
        <ToolDrawer
          tool={selectedTool as ToolItem}
          onClose={() => setSelectedTool(null)}
          onNewMaintenance={() => { setMaintenanceTool(selectedTool); setMaintenanceRecord(null) }}
          onNewCustody={() => setCustodyItem(selectedTool)}
          onEditMaintenance={(_tool, record) => { setMaintenanceTool(selectedTool); setMaintenanceRecord(record) }}
        />
      )}

      {custodyItem && custodyItem.id && (
        <CustodyModal
          item={custodyItem as any}
          employees={employees}
          projects={projects}
          onClose={() => setCustodyItem(null)}
          onSaved={() => { setCustodyItem(null); loadAll() }}
        />
      )}

      {maintenanceTool && maintenanceTool.id && (
        <MaintenanceModal
          toolId={maintenanceTool.id}
          toolName={maintenanceTool.name}
          existing={maintenanceRecord ?? undefined}
          onClose={() => { setMaintenanceTool(null); setMaintenanceRecord(null) }}
          onSaved={() => { setMaintenanceTool(null); setMaintenanceRecord(null); loadAll() }}
        />
      )}

      {receiptBasketId && (
        <ReceiptViewer
          basketId={receiptBasketId}
          onClose={() => setReceiptBasketId(null)}
        />
      )}

      {basketOpen && (
        <BasketModal
          isOpen={basketOpen}
          stockItems={items.map(i => ({
            id:          i.id,
            name:        i.name,
            unit:        i.unit,
            quantity:    i.quantity,
            averageCost: i.averageCost,
            unitCost:    i.unitCost,
            brand:       i.brand,
            code:        i.code,
          }))}
          employees={employees}
          projects={projects}
          onClose={() => setBasketOpen(false)}
          onConfirm={handleBasketConfirm}
        />
      )}

      {/* ── Form Modals ──────────────────────────────────────────────── */}

      <ItemFormModal
        mode="material"
        isOpen={materialFormOpen}
        onClose={() => { setMaterialFormOpen(false); setEditingMaterial(null) }}
        onSuccess={() => { setMaterialFormOpen(false); setEditingMaterial(null); loadAll() }}
        item={editingMaterial as any}
      />

      <ItemFormModal
        mode="epi"
        isOpen={epiFormOpen}
        onClose={() => { setEpiFormOpen(false); setEditingMaterial(null) }}
        onSuccess={() => { setEpiFormOpen(false); setEditingMaterial(null); loadAll() }}
        item={editingMaterial as any}
      />

      <ItemFormModal
        mode="uniform"
        isOpen={uniformFormOpen}
        onClose={() => { setUniformFormOpen(false); setEditingMaterial(null) }}
        onSuccess={() => { setUniformFormOpen(false); setEditingMaterial(null); loadAll() }}
        item={editingMaterial as any}
      />

      <ToolFormModal
        isOpen={toolFormOpen}
        onClose={() => { setToolFormOpen(false); setEditingTool(null) }}
        onSuccess={() => { setToolFormOpen(false); setEditingTool(null); loadAll() }}
        tool={editingTool as any}
      />

      {/* ── Quick Entry ──────────────────────────────────────────────── */}
      <QuickEntryModal
        isOpen={quickEntryOpen}
        locations={locations}
        defaultLocationId={selectedLocation !== 'all' ? selectedLocation : undefined}
        onClose={() => setQuickEntryOpen(false)}
        onSuccess={() => { setQuickEntryOpen(false); loadAll() }}
      />

      {/* ── EPI Delivery ─────────────────────────────────────────────── */}
      <EpiDeliveryModal
        isOpen={epiDeliveryOpen}
        items={epis.map(i => ({
          id:       i.id,
          name:     i.name,
          code:     i.code,
          unit:     i.unit,
          quantity: i.quantity,
          brand:    i.brand,
        }))}
        employees={employees}
        preselectedItemId={epiDeliveryItemId}
        onClose={() => { setEpiDeliveryOpen(false); setEpiDeliveryItemId(undefined) }}
        onSaved={() => { setEpiDeliveryOpen(false); setEpiDeliveryItemId(undefined); loadAll() }}
      />

      {/* ── Criar almoxarifado ───────────────────────────────────────── */}
      <CreateLocationModal
        isOpen={createLocationOpen}
        onClose={() => setCreateLocationOpen(false)}
        onSuccess={() => { setCreateLocationOpen(false); loadAll() }}
        projects={projects}
        hasCentral={locations.some(l => l.type === 'CENTRAL')}
      />
    </div>
  )
}
