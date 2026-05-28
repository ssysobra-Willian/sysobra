'use client'

import React, { useState, useEffect } from 'react'
import {
  X, Wrench, AlertTriangle, Calendar, Clock, CheckCircle2, XCircle,
  User, MapPin, Package, Tag, Hash, ShieldCheck, Loader2, Plus, Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// FIX 1: helper to build absolute URL — avoids double-slash when url starts with /
function toAbsUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolItem {
  id:            string
  code?:         string | null
  name:          string
  description?:  string | null
  category?:     string | null
  unit:          string
  quantity:      number
  serialNumber?: string | null
  brand?:        string | null
  model?:        string | null
  location?:     string | null
  currentLocation?: string | null
  toolStatus?:   string | null
  toolType?:     string | null
  imageUrl?:     string | null
  requiresCustody: boolean
  isUnderWarranty?: boolean
  warrantyExpiry?: string | null
  lastMaintenance?: string | null
  nextMaintenance?: string | null
  currentProject?: { id: string; name: string } | null
  unitCost?: number | null
}

interface Custody {
  id:                 string
  quantity:           number
  checkedOutAt:       string
  dueDate?:           string | null
  returnedAt?:        string | null
  condition?:         string | null
  conditionOnReturn?: string | null
  notes?:             string | null
  photoUrl?:          string | null
  photoOnReturnUrl?:  string | null
  returnSignatureUrl?:string | null
  returnedBy?:        string | null
  returnNotes?:       string | null
  employee:     { id: string; name: string; position?: string | null }
  project?:     { id: string; name: string } | null
}

interface WaybillExit {
  id:              string
  waybillId:       string
  waybillDoc:      string
  requestedQty:    number
  serialNumber?:   string | null
  toolCondition?:  string | null
  destinationName?:string | null
  receiverName?:   string | null
  createdAt:       string
}

interface MaintenanceRecord {
  id:          string
  type:        string
  date:        string
  performedBy?: string | null
  description: string
  cost?:       number | null
  nextDate?:   string | null
  result?:     string | null
  notes?:      string | null
  fileUrl?:    string | null
}

interface Props {
  tool:            ToolItem
  onClose:         () => void
  onNewMaintenance?: (tool: ToolItem) => void
  onNewCustody?:   (tool: ToolItem) => void
  onEditMaintenance?: (tool: ToolItem, record: MaintenanceRecord) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateBR(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function daysFromNow(iso?: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

const MAINTENANCE_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PREVENTIVE: { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Preventiva' },
  CORRECTIVE: { bg: 'bg-red-100',   text: 'text-red-700',   label: 'Corretiva'  },
  INSPECTION: { bg: 'bg-green-100', text: 'text-green-700', label: 'Inspeção'   },
}

const RESULT_ICONS: Record<string, React.ReactNode> = {
  OK:            <CheckCircle2 size={13} className="text-green-600" />,
  NEEDS_PARTS:   <AlertTriangle size={13} className="text-yellow-500" />,
  WAITING_QUOTE: <Clock size={13} className="text-blue-500" />,
}

const CONDITION_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  BOM:       { label: '✅ Bom estado', bg: 'bg-green-100', text: 'text-green-700' },
  DANIFICADO:{ label: '⚠️ Danificada', bg: 'bg-amber-100', text: 'text-amber-700' },
  PERDIDO:   { label: '🚨 Perdida',    bg: 'bg-red-100',   text: 'text-red-700'   },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WarrantyCard({ tool }: { tool: ToolItem }) {
  const days = daysFromNow(tool.warrantyExpiry)
  const expired = days !== null && days < 0
  const soonExpiring = days !== null && days >= 0 && days <= 30

  return (
    <div className={cn(
      'rounded-xl border p-4',
      expired      ? 'bg-red-50 border-red-200'    :
      soonExpiring ? 'bg-yellow-50 border-yellow-200' :
                     'bg-green-50 border-green-200',
    )}>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={15} className={
          expired      ? 'text-red-600'    :
          soonExpiring ? 'text-yellow-600' : 'text-green-600'
        } />
        <h4 className={cn('text-sm font-semibold',
          expired      ? 'text-red-700'    :
          soonExpiring ? 'text-yellow-700' : 'text-green-700',
        )}>
          {expired ? 'Garantia Vencida' : soonExpiring ? 'Garantia a Vencer' : 'Em Garantia'}
        </h4>
      </div>
      {tool.warrantyExpiry && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Vencimento</span>
          <span className={cn('font-semibold',
            expired      ? 'text-red-700'    :
            soonExpiring ? 'text-yellow-700' : 'text-green-700',
          )}>{formatDateBR(tool.warrantyExpiry)}</span>
        </div>
      )}
      {days !== null && !expired && (
        <p className="text-xs text-gray-500 mt-1">{days} dias restantes</p>
      )}
      {expired && days !== null && (
        <p className="text-xs text-red-600 mt-1">Vencida há {Math.abs(days)} dias</p>
      )}
    </div>
  )
}

function MaintenanceTimeline({ records, onAdd, onEdit }: {
  records:   MaintenanceRecord[]
  onAdd?:    () => void
  onEdit?:   (r: MaintenanceRecord) => void
}) {
  if (records.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
          <Wrench size={20} className="text-gray-300" />
        </div>
        <p className="text-sm text-gray-400">Nenhuma manutenção registrada</p>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 text-xs text-[#F5A623] font-medium hover:underline"
          >
            <Plus size={13} />Registrar primeira manutenção
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute left-4 top-0 bottom-4 w-0.5 bg-gray-100" />
      {records.map((r, i) => {
        const tc = MAINTENANCE_TYPE_COLORS[r.type] ?? MAINTENANCE_TYPE_COLORS.PREVENTIVE
        return (
          <div key={r.id} className="relative pl-10 pb-4">
            <div className={cn('absolute left-2 top-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center', tc.bg)}>
              <div className={cn('w-1.5 h-1.5 rounded-full', tc.text.replace('text', 'bg'))} />
            </div>
            <div
              className="bg-white border border-gray-100 rounded-xl p-3 hover:border-gray-200 transition cursor-pointer"
              onClick={() => onEdit?.(r)}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', tc.bg, tc.text)}>
                    {tc.label}
                  </span>
                  {r.result && RESULT_ICONS[r.result]}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatDateBR(r.date)}</span>
              </div>
              <p className="text-sm text-gray-700 leading-snug">{r.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-gray-400">
                {r.performedBy && <span>👤 {r.performedBy}</span>}
                {r.cost && <span>💰 {formatCurrency(r.cost)}</span>}
                {r.nextDate && <span>📅 Próxima: {formatDateBR(r.nextDate)}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// FIX 3: Rewritten CustodyTimeline with photos, return info, condition badges
function CustodyTimeline({ custodies }: { custodies: Custody[] }) {

  if (custodies.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        Nenhum registro de custódia
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {custodies.map(c => {
        const isOpen   = !c.returnedAt
        const overdue  = !c.returnedAt && c.dueDate && new Date(c.dueDate) < new Date()
        const condReturn = c.conditionOnReturn ? (CONDITION_CONFIG[c.conditionOnReturn] ?? null) : null

        return (
          <div key={c.id} className={cn(
            'border-l-4 rounded-r-xl bg-white shadow-sm overflow-hidden',
            isOpen
              ? overdue ? 'border-l-red-400' : 'border-l-orange-400'
              : 'border-l-green-400',
          )}>
            {/* Header */}
            <div className={cn(
              'px-4 py-2.5 flex items-center justify-between',
              isOpen ? overdue ? 'bg-red-50' : 'bg-orange-50' : 'bg-gray-50',
            )}>
              <div className="flex items-center gap-2">
                <User size={13} className={
                  isOpen ? overdue ? 'text-red-500' : 'text-orange-500' : 'text-gray-400'
                } />
                <span className="text-sm font-medium text-gray-800">{c.employee.name}</span>
                {c.employee.position && (
                  <span className="text-xs text-gray-400">· {c.employee.position}</span>
                )}
              </div>
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                isOpen
                  ? overdue ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                  : 'bg-green-100 text-green-700',
              )}>
                {isOpen ? overdue ? '🔴 Atrasado' : '🟡 Ativo' : '✅ Devolvido'}
              </span>
            </div>

            {/* Body */}
            <div className="px-4 py-2.5 space-y-2">
              {/* Dates + meta grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-gray-500">
                <span>Saída: <strong className="text-gray-700">{formatDateBR(c.checkedOutAt)}</strong></span>
                {c.dueDate && (
                  <span>Prazo: <strong className={cn(overdue ? 'text-red-600' : 'text-gray-700')}>
                    {formatDateBR(c.dueDate)}
                  </strong></span>
                )}
                {c.returnedAt && (
                  <span>Retorno: <strong className="text-gray-700">{formatDateBR(c.returnedAt)}</strong></span>
                )}
                {c.project && <span>🏗️ {c.project.name}</span>}
                <span>Qtd: <strong>{c.quantity}</strong></span>
                {c.condition && <span>Estado saída: {c.condition}</span>}
              </div>

              {/* Return details (when returned) */}
              {c.returnedAt && (c.returnedBy || condReturn || c.returnNotes) && (
                <div className="border-t border-gray-100 pt-2 space-y-1.5">
                  {c.returnedBy && (
                    <p className="text-xs text-gray-500">
                      Devolvido por: <strong className="text-gray-700">{c.returnedBy}</strong>
                    </p>
                  )}
                  {condReturn && (
                    <span className={cn(
                      'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
                      condReturn.bg, condReturn.text,
                    )}>
                      {condReturn.label}
                    </span>
                  )}
                  {c.returnNotes && (
                    <p className="text-xs text-gray-500 italic">{c.returnNotes}</p>
                  )}
                </div>
              )}

              {/* Photos row */}
              {(c.photoUrl || c.photoOnReturnUrl) && (
                <div className="flex gap-3 pt-1">
                  {c.photoUrl && (
                    <div className="text-center">
                      <img
                        src={toAbsUrl(c.photoUrl)}
                        alt="Foto saída"
                        className="w-16 h-12 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition"
                        onClick={() => window.open(toAbsUrl(c.photoUrl), '_blank')}
                      />
                      <p className="text-xs text-gray-400 mt-0.5">📷 Saída</p>
                    </div>
                  )}
                  {c.photoOnReturnUrl && (
                    <div className="text-center">
                      <img
                        src={toAbsUrl(c.photoOnReturnUrl)}
                        alt="Foto retorno"
                        className="w-16 h-12 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition"
                        onClick={() => window.open(toAbsUrl(c.photoOnReturnUrl), '_blank')}
                      />
                      <p className="text-xs text-gray-400 mt-0.5">📷 Retorno</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── WaybillExits section ─────────────────────────────────────────────────────

function WaybillExitsSection({ exits }: { exits: WaybillExit[] }) {
  if (exits.length === 0) return null
  return (
    <div className="mt-5">
      <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
        Romaneios / Saídas ({exits.length})
      </h5>
      <div className="space-y-2">
        {exits.map(w => (
          <div key={w.id} className="border-l-4 border-l-blue-300 rounded-r-xl bg-blue-50 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-semibold text-blue-700">{w.waybillDoc}</span>
              <span className="text-xs text-gray-400">{formatDateBR(w.createdAt)}</span>
            </div>
            <div className="text-xs text-gray-600 space-y-0.5">
              {w.destinationName && <p>📍 {w.destinationName}</p>}
              {w.receiverName    && <p>👤 {w.receiverName}</p>}
              <p>Qtd solicitada: <strong>{w.requestedQty}</strong></p>
              {w.serialNumber    && <p>S/N: {w.serialNumber}</p>}
              {w.toolCondition   && <p>Estado: {w.toolCondition}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'info',         label: 'Ficha'        },
  { id: 'maintenances', label: 'Manutenções'  },
  { id: 'custodies',    label: 'Custódias'    },
]

export function ToolDrawer({ tool, onClose, onNewMaintenance, onNewCustody, onEditMaintenance }: Props) {
  const [tab,          setTab]          = useState<'info' | 'maintenances' | 'custodies'>('info')
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([])
  const [custodies,    setCustodies]    = useState<Custody[]>([])
  const [waybillExits, setWaybillExits] = useState<WaybillExit[]>([])
  const [loadingM,     setLoadingM]     = useState(false)
  const [loadingC,     setLoadingC]     = useState(false)

  // FIX 1: use toAbsUrl to avoid double-slash
  const imgUrl = toAbsUrl(tool.imageUrl) || null

  const maintenanceDays = daysFromNow(tool.nextMaintenance)
  const maintenanceOverdue = maintenanceDays !== null && maintenanceDays < 0

  // FIX 4: Display currentLocation if available
  const locationLabel = tool.currentLocation || tool.currentProject?.name || tool.location || 'Depósito'

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // FIX 1: Fixed d.records → d.maintenances ?? d.records
  useEffect(() => {
    if (tab === 'maintenances' && maintenances.length === 0) {
      setLoadingM(true)
      fetch(`${API}/api/v1/deposit/tools/${tool.id}/maintenances`, {
        headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
      })
        .then(r => r.ok ? r.json() : { maintenances: [] })
        .then(d => setMaintenances(d.maintenances ?? d.records ?? []))
        .catch(() => {})
        .finally(() => setLoadingM(false))
    }
  }, [tab, tool.id])

  // FIX 7: fetch custodies + waybillExits together
  useEffect(() => {
    if (tab === 'custodies' && custodies.length === 0) {
      setLoadingC(true)
      fetch(`${API}/api/v1/deposit/tools/${tool.id}/custodies`, {
        headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
      })
        .then(r => r.ok ? r.json() : { custodies: [], waybillExits: [] })
        .then(d => {
          setCustodies(d.custodies ?? [])
          setWaybillExits(d.waybillExits ?? [])
        })
        .catch(() => {})
        .finally(() => setLoadingC(false))
    }
  }, [tab, tool.id])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl w-full sm:w-[480px] lg:w-[520px] overflow-hidden">

        {/* Photo Header */}
        <div className="relative flex-shrink-0">
          {imgUrl ? (
            <div className="h-48 overflow-hidden">
              <img src={imgUrl} alt={tool.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            </div>
          ) : (
            <div className="h-36 bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
              <Wrench size={48} className="text-slate-500" />
            </div>
          )}

          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition"
          >
            <X size={16} className="text-gray-600" />
          </button>

          {maintenanceOverdue && (
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <AlertTriangle size={11} />Manutenção atrasada
            </div>
          )}

          <div className={cn('px-5 py-4', imgUrl ? 'absolute bottom-0 inset-x-0' : 'bg-white border-b border-gray-100')}>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {tool.code && (
                  <p className={cn('text-xs font-mono mb-0.5', imgUrl ? 'text-white/70' : 'text-gray-400')}>
                    #{tool.code}
                  </p>
                )}
                <h2 className={cn('font-bold text-lg leading-tight', imgUrl ? 'text-white' : 'text-gray-800')}>
                  {tool.name}
                </h2>
                {tool.category && (
                  <p className={cn('text-xs', imgUrl ? 'text-white/70' : 'text-gray-400')}>{tool.category}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* FIX 4: Status cards row — use currentLocation */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 flex-shrink-0">
          {/* Localização atual */}
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Localização</p>
            <p className="text-xs font-semibold text-gray-700 truncate">
              {locationLabel}
            </p>
          </div>
          {/* Garantia */}
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Garantia</p>
            {tool.isUnderWarranty ? (
              <p className="text-xs font-semibold text-green-600">✅ Ativa</p>
            ) : (
              <p className="text-xs font-semibold text-gray-400">Não</p>
            )}
          </div>
          {/* Próx. Manutenção */}
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Próx. Manutenção</p>
            {tool.nextMaintenance ? (
              <p className={cn('text-xs font-semibold', maintenanceOverdue ? 'text-red-600' : 'text-gray-700')}>
                {formatDateBR(tool.nextMaintenance)}
              </p>
            ) : (
              <p className="text-xs text-gray-400">—</p>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 px-5 py-3 flex-shrink-0 border-b border-gray-100">
          {/* FIX 4: cautela manual removida — saída apenas via romaneio */}
          <a
            href="/app/deposito/romaneios"
            className="flex-1 py-2 rounded-xl bg-[#F5A623] text-white text-xs font-semibold hover:bg-[#e09610] transition flex items-center justify-center gap-1.5"
          >
            <Package size={13} />Saída via romaneio
          </a>
          {onNewMaintenance && (
            <button
              onClick={() => onNewMaintenance(tool)}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
            >
              <Wrench size={13} />Nova Manutenção
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-100 flex-shrink-0">
          <div className="flex">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={cn(
                  'flex-1 py-3 text-sm font-medium border-b-2 transition-colors',
                  tab === t.id
                    ? 'border-[#F5A623] text-[#F5A623]'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* Ficha técnica */}
          {tab === 'info' && (
            <div className="p-5 space-y-4">
              {/* Dados técnicos */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Marca',      value: tool.brand,        icon: Tag     },
                  { label: 'Modelo',     value: tool.model,        icon: Package },
                  { label: 'Nº Série',   value: tool.serialNumber, icon: Hash    },
                  { label: 'Localização',value: tool.currentLocation ?? tool.location, icon: MapPin },
                  { label: 'Vl. Unitário', value: tool.unitCost ? formatCurrency(tool.unitCost) : null, icon: Package },
                  { label: 'Qtd.',       value: `${tool.quantity} ${tool.unit}`, icon: Package },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-0.5">
                      <r.icon size={11} className="text-gray-400" />
                      <p className="text-xs text-gray-400">{r.label}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{String(r.value)}</p>
                  </div>
                ))}
              </div>

              {tool.description && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Descrição</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{tool.description}</p>
                </div>
              )}

              {/* Garantia */}
              {tool.isUnderWarranty && (
                <WarrantyCard tool={tool} />
              )}

              {/* Manutenção */}
              <div className={cn(
                'rounded-xl border p-4 space-y-2',
                maintenanceOverdue ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100',
              )}>
                <div className="flex items-center gap-2">
                  <Wrench size={14} className={maintenanceOverdue ? 'text-red-500' : 'text-gray-400'} />
                  <h4 className={cn('text-sm font-semibold', maintenanceOverdue ? 'text-red-700' : 'text-gray-700')}>
                    Manutenção
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {tool.lastMaintenance && (
                    <div>
                      <p className="text-gray-400">Última</p>
                      <p className="font-medium text-gray-700">{formatDateBR(tool.lastMaintenance)}</p>
                    </div>
                  )}
                  {tool.nextMaintenance && (
                    <div>
                      <p className="text-gray-400">Próxima</p>
                      <p className={cn('font-medium', maintenanceOverdue ? 'text-red-600' : 'text-gray-700')}>
                        {formatDateBR(tool.nextMaintenance)}
                        {maintenanceDays !== null && maintenanceOverdue && (
                          <span className="ml-1 text-red-500">({Math.abs(maintenanceDays)}d atraso)</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Manutenções */}
          {tab === 'maintenances' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-700">Histórico de Manutenções</h4>
                {onNewMaintenance && (
                  <button
                    onClick={() => onNewMaintenance(tool)}
                    className="flex items-center gap-1 text-xs text-[#F5A623] font-medium hover:underline"
                  >
                    <Plus size={12} />Nova
                  </button>
                )}
              </div>
              {loadingM ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-[#F5A623]" />
                </div>
              ) : (
                <MaintenanceTimeline
                  records={maintenances}
                  onAdd={onNewMaintenance ? () => onNewMaintenance(tool) : undefined}
                  onEdit={onEditMaintenance ? (r) => onEditMaintenance(tool, r) : undefined}
                />
              )}
            </div>
          )}

          {/* Custódias — FIX 3 (rich timeline) + FIX 7 (waybill exits) */}
          {tab === 'custodies' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-700">Histórico de Custódia</h4>
                {/* FIX 4: link to romaneios instead of CustodyModal */}
                <a
                  href="/app/deposito/romaneios"
                  className="flex items-center gap-1 text-xs text-[#F5A623] font-medium hover:underline"
                >
                  <Plus size={12} />Nova saída
                </a>
              </div>
              {loadingC ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-[#F5A623]" />
                </div>
              ) : (
                <>
                  <CustodyTimeline custodies={custodies} />
                  <WaybillExitsSection exits={waybillExits} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
