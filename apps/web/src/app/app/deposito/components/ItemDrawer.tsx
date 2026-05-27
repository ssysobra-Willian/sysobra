'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X, Package, TrendingUp, TrendingDown, AlertTriangle, BarChart2,
  MapPin, Tag, Building2, Hash, Layers, Calendar, Loader2,
  ArrowDown, ArrowUp, FileText, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { MovementList } from './MovementList'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItemDetail {
  id:           string
  code?:        string | null
  name:         string
  description?: string | null
  category?:    string | null
  unit:         string
  quantity:     number
  minQuantity:  number
  maxQuantity?: number | null
  unitCost?:    number | null
  averageCost?: number | null
  location?:    string | null
  locationFull?: string | null
  imageUrl?:    string | null
  brand?:       string | null
  model?:       string | null
  serialNumber?: string | null
  isConsumable: boolean
  requiresCustody: boolean
  isEpi:        boolean
  isUniform:    boolean
  isUnderWarranty?: boolean
  nextMaintenance?: string | null
  lastMaintenance?: string | null
  currentProject?: { id: string; name: string } | null
  supplierLots?: SupplierLot[]
  _count?: { movements: number; custodies: number }
}

interface SupplierLot {
  id:            string
  lotNumber?:    string | null
  invoiceNumber?: string | null
  quantity:      number
  unitCost?:     number | null
  expiryDate?:   string | null
  supplier?:     { id: string; name: string } | null
}

interface Props {
  item:           ItemDetail
  onClose:        () => void
  onViewReceipt?: (basketId: string) => void
  onEdit?:        (item: ItemDetail) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateBR(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function StockBar({ qty, min, max }: { qty: number; min: number; max?: number | null }) {
  const cap = max || Math.max(min * 3, qty * 1.5, 10)
  const pct = Math.min(100, (qty / cap) * 100)
  const isLow  = qty <= min
  const isOver = max ? qty > max : false
  const color  = isLow ? 'bg-red-500' : isOver ? 'bg-blue-500' : 'bg-green-500'
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function MetricCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-start gap-2.5 shadow-sm">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-gray-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const DRAWER_TABS = [
  { id: 'info',     label: 'Cadastro'     },
  { id: 'entries',  label: 'Entradas'     },
  { id: 'exits',    label: 'Saídas'       },
  { id: 'all',      label: 'Histórico'    },
  { id: 'lots',     label: 'Lotes'        },
]

// ─── Main Component ───────────────────────────────────────────────────────────

export function ItemDrawer({ item, onClose, onViewReceipt, onEdit }: Props) {
  const [tab,     setTab]     = useState<'info' | 'entries' | 'exits' | 'all' | 'lots'>('info')
  const imgUrl = item.imageUrl
    ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${API}/${item.imageUrl}`)
    : null

  const totalValue = (item.averageCost || item.unitCost || 0) * item.quantity
  const isLow      = item.quantity <= item.minQuantity
  const flagTags   = [
    item.isEpi       && { label: 'EPI',      color: 'bg-teal-100 text-teal-700'   },
    item.isUniform   && { label: 'Uniforme', color: 'bg-indigo-100 text-indigo-700'},
    item.isConsumable&& { label: 'Consumível',color: 'bg-gray-100 text-gray-600'  },
    item.requiresCustody && { label: 'Cautela', color: 'bg-orange-100 text-orange-700'},
    item.isUnderWarranty && { label: 'Garantia', color: 'bg-green-100 text-green-700'},
  ].filter(Boolean) as { label: string; color: string }[]

  // Close on ESC
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl w-full sm:w-[480px] lg:w-[520px] overflow-hidden">

        {/* ── Photo Header ───────────────────────────────────────────────── */}
        <div className="relative flex-shrink-0">
          {imgUrl ? (
            <div className="h-48 overflow-hidden">
              <img src={imgUrl} alt={item.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            </div>
          ) : (
            <div className="h-36 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Package size={48} className="text-gray-300" />
            </div>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition"
          >
            <X size={16} className="text-gray-600" />
          </button>

          {/* Low stock badge */}
          {isLow && (
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <AlertTriangle size={11} />
              Estoque baixo
            </div>
          )}

          {/* Title overlay */}
          <div className={cn('px-5 py-4', imgUrl ? 'absolute bottom-0 inset-x-0' : 'bg-white border-b border-gray-100')}>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                {item.code && (
                  <p className={cn('text-xs font-mono mb-0.5', imgUrl ? 'text-white/70' : 'text-gray-400')}>
                    #{item.code}
                  </p>
                )}
                <h2 className={cn('font-bold text-lg leading-tight truncate', imgUrl ? 'text-white' : 'text-gray-800')}>
                  {item.name}
                </h2>
                {item.category && (
                  <p className={cn('text-xs mt-0.5', imgUrl ? 'text-white/70' : 'text-gray-400')}>
                    {item.category}
                  </p>
                )}
              </div>
              {onEdit && (
                <button
                  onClick={() => onEdit(item)}
                  className={cn(
                    'flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition',
                    imgUrl
                      ? 'bg-white/20 text-white hover:bg-white/30 border border-white/30'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  Editar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Metric cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2.5 px-5 py-4 bg-gray-50 flex-shrink-0">
          <MetricCard
            label="Estoque atual"
            value={`${item.quantity} ${item.unit}`}
            sub={`Mín: ${item.minQuantity}${item.maxQuantity ? ` · Máx: ${item.maxQuantity}` : ''}`}
            icon={<BarChart2 size={15} className={isLow ? 'text-red-500' : 'text-green-600'} />}
            color={isLow ? 'bg-red-50' : 'bg-green-50'}
          />
          <MetricCard
            label="Valor em estoque"
            value={formatCurrency(totalValue)}
            sub={`${formatCurrency(item.averageCost || item.unitCost || 0)}/un`}
            icon={<TrendingUp size={15} className="text-blue-600" />}
            color="bg-blue-50"
          />
          {item._count && (
            <>
              <MetricCard
                label="Movimentações"
                value={item._count.movements}
                icon={<Layers size={15} className="text-purple-600" />}
                color="bg-purple-50"
              />
              <MetricCard
                label="Custódias"
                value={item._count.custodies}
                icon={<FileText size={15} className="text-orange-600" />}
                color="bg-orange-50"
              />
            </>
          )}
        </div>

        {/* Stock bar */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Nível de estoque</span>
            <span className={isLow ? 'text-red-500 font-medium' : 'text-gray-400'}>
              {item.quantity} / {item.maxQuantity || `Mín ${item.minQuantity}`}
            </span>
          </div>
          <StockBar qty={item.quantity} min={item.minQuantity} max={item.maxQuantity} />
        </div>

        {/* Flag tags */}
        {flagTags.length > 0 && (
          <div className="px-5 pb-3 flex gap-1.5 flex-wrap flex-shrink-0">
            {flagTags.map(t => (
              <span key={t.label} className={cn('text-xs font-medium px-2 py-0.5 rounded-full', t.color)}>
                {t.label}
              </span>
            ))}
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="border-b border-gray-100 flex-shrink-0">
          <div className="flex overflow-x-auto no-scrollbar">
            {DRAWER_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={cn(
                  'flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  tab === t.id
                    ? 'border-[#F5A623] text-[#F5A623]'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── Tab content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Cadastro */}
          {tab === 'info' && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Código',      value: item.code,         icon: Hash    },
                  { label: 'Unidade',     value: item.unit,         icon: Layers  },
                  { label: 'Marca',       value: item.brand,        icon: Tag     },
                  { label: 'Modelo',      value: item.model,        icon: Package },
                  { label: 'Nº Série',    value: item.serialNumber, icon: Hash    },
                  { label: 'Localização', value: item.location,     icon: MapPin  },
                  { label: 'Vl. Médio',   value: item.averageCost ? formatCurrency(item.averageCost) : null, icon: TrendingUp },
                  { label: 'Vl. Unitário',value: item.unitCost ? formatCurrency(item.unitCost) : null, icon: TrendingUp },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <r.icon size={11} className="text-gray-400" />
                      <p className="text-xs text-gray-400">{r.label}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{String(r.value)}</p>
                  </div>
                ))}
              </div>

              {item.locationFull && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Localização completa</p>
                  <p className="text-sm text-gray-700">{item.locationFull}</p>
                </div>
              )}

              {item.description && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Descrição</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{item.description}</p>
                </div>
              )}

              {item.currentProject && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <Building2 size={14} className="text-orange-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-orange-600 font-medium">Alocado em obra</p>
                    <p className="text-sm text-orange-800">{item.currentProject.name}</p>
                  </div>
                </div>
              )}

              {item.nextMaintenance && (
                <div className={cn(
                  'flex items-center gap-2 border rounded-xl p-3',
                  new Date(item.nextMaintenance) < new Date()
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-100',
                )}>
                  <Calendar size={14} className={new Date(item.nextMaintenance) < new Date() ? 'text-red-500' : 'text-yellow-600'} />
                  <div>
                    <p className={cn('text-xs font-medium', new Date(item.nextMaintenance) < new Date() ? 'text-red-600' : 'text-yellow-700')}>
                      {new Date(item.nextMaintenance) < new Date() ? 'Manutenção em atraso' : 'Próxima manutenção'}
                    </p>
                    <p className="text-sm font-semibold text-gray-800">{formatDateBR(item.nextMaintenance)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Entradas */}
          {tab === 'entries' && (
            <div className="p-4">
              <MovementList
                itemId={item.id}
                unit={item.unit}
                filterType="ENTRY"
                onViewReceipt={onViewReceipt}
              />
            </div>
          )}

          {/* Saídas */}
          {tab === 'exits' && (
            <div className="p-4">
              <MovementList
                itemId={item.id}
                unit={item.unit}
                filterType="EXIT"
                onViewReceipt={onViewReceipt}
              />
            </div>
          )}

          {/* Histórico completo */}
          {tab === 'all' && (
            <div className="p-4">
              <MovementList
                itemId={item.id}
                unit={item.unit}
                filterType="ALL"
                onViewReceipt={onViewReceipt}
              />
            </div>
          )}

          {/* Lotes */}
          {tab === 'lots' && (
            <div className="p-4">
              {!item.supplierLots || item.supplierLots.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  Nenhum lote de fornecedor registrado
                </div>
              ) : (
                <div className="space-y-2">
                  {item.supplierLots.map((lot, i) => (
                    <div key={lot.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-500">#{i + 1}</span>
                          {lot.lotNumber && (
                            <span className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 font-mono">
                              Lote {lot.lotNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-gray-800">{lot.quantity} {item.unit}</span>
                      </div>
                      <div className="px-4 py-2.5 grid grid-cols-2 gap-2 text-xs text-gray-600">
                        {lot.supplier     && <span>📦 {lot.supplier.name}</span>}
                        {lot.invoiceNumber && <span>🧾 NF {lot.invoiceNumber}</span>}
                        {lot.unitCost      && <span>💰 {formatCurrency(lot.unitCost)}/un</span>}
                        {lot.expiryDate    && (
                          <span className={cn(
                            new Date(lot.expiryDate) < new Date() ? 'text-red-600 font-medium' : '',
                          )}>
                            ⏱️ Val.: {formatDateBR(lot.expiryDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
