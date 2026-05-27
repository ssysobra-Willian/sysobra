'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Package, Hammer, ShieldCheck, Shirt,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
  MapPin, Clock, ChevronDown, ChevronUp,
  Loader2, X, RefreshCw, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function token() { return typeof window !== 'undefined' ? (localStorage.getItem('token') ?? '') : '' }
function companyIdHeader() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

async function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      'x-company-id': companyIdHeader(),
      ...(options.headers ?? {}),
    },
  })
}

// ─── types ───────────────────────────────────────────────────────────────────

interface StockItem {
  id: string
  name: string
  description?: string | null
  category?: string | null
  unit: string
  quantity: number
  minQuantity: number
  maxQuantity?: number | null
  unitCost?: number | null
  averageCost?: number | null
  location?: string | null
  code?: string | null
  imageUrl?: string | null
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
  isConsumable: boolean
  requiresCustody: boolean
  isEpi: boolean
  isUniform: boolean
  isActive: boolean
  currentProject?: { id: string; name: string; address?: string } | null
  movements: StockMovement[]
  custodies: ToolCustody[]
  epiDeliveries: StockEpiDelivery[]
  _count: { movements: number; custodies: number; epiDeliveries: number }
}

interface StockMovement {
  id: string
  type: string
  quantity: number
  unitCost?: number | null
  averageCostAfter?: number | null
  reason?: string | null
  notes?: string | null
  createdAt: string
  project?: { id: string; name: string } | null
  employee?: { id: string; name: string } | null
  responsible?: { id: string; name: string } | null
}

interface ToolCustody {
  id: string
  quantity: number
  checkedOutAt: string
  dueDate?: string | null
  returnedAt?: string | null
  condition?: string | null
  employee: { id: string; name: string; position?: string | null }
  project?: { id: string; name: string } | null
}

interface StockEpiDelivery {
  id: string
  quantity: number
  deliveredAt: string
  returnedAt?: string | null
  caNumber?: string | null
  employee: { id: string; name: string }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const MOVEMENT_LABELS: Record<string, { label: string; color: string; sign: '+' | '-' | '=' }> = {
  IN:           { label: 'Entrada',        color: 'text-green-600',  sign: '+' },
  OUT:          { label: 'Saída',          color: 'text-red-500',    sign: '-' },
  RETURN:       { label: 'Devolução',      color: 'text-blue-600',   sign: '+' },
  LOSS:         { label: 'Perda',          color: 'text-orange-500', sign: '-' },
  ADJUSTMENT:   { label: 'Ajuste',         color: 'text-purple-500', sign: '=' },
  TRANSFER:     { label: 'Transferência',  color: 'text-indigo-500', sign: '-' },
  EPI_DELIVERY: { label: 'Entrega EPI',    color: 'text-teal-500',   sign: '-' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function qtyColor(item: StockItem) {
  if (item.minQuantity > 0 && item.quantity <= 0) return 'text-red-600'
  if (item.minQuantity > 0 && item.quantity <= item.minQuantity) return 'text-orange-500'
  return 'text-green-600'
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function DepositoItemPage() {
  const router  = useRouter()
  const params  = useParams()
  const itemId  = params?.id as string

  const [item, setItem]       = useState<StockItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllMovs, setShowAllMovs] = useState(false)

  // Quick action sheet
  const [actionSheet, setActionSheet] = useState<null | 'movement' | 'custody'>(null)
  const [actionForm, setActionForm]   = useState({
    type: 'IN', quantity: '', unitCost: '', employeeId: '',
    projectId: '', reason: '', notes: '',
    dueDate: '', condition: '',
  })
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects]   = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await apiFetch(`/api/v1/deposit/items/${itemId}`)
      const data = await res.json()
      setItem(data)
    } finally {
      setLoading(false)
    }
  }, [itemId])

  const loadAux = useCallback(async () => {
    try {
      const [eRes, pRes] = await Promise.all([
        apiFetch('/api/v1/employees?limit=200&status=ACTIVE'),
        apiFetch('/api/v1/projects?limit=100'),
      ])
      const eData = await eRes.json()
      const pData = await pRes.json()
      setEmployees(eData.employees ?? eData ?? [])
      setProjects(pData.projects ?? pData ?? [])
    } catch {}
  }, [])

  useEffect(() => { load(); loadAux() }, [load, loadAux])

  async function handleAction(e: React.FormEvent) {
    e.preventDefault()
    if (!actionForm.quantity) { setError('Informe a quantidade'); return }
    setSaving(true)
    setError('')
    try {
      if (actionSheet === 'movement') {
        const res = await apiFetch('/api/v1/deposit/movements', {
          method: 'POST',
          body: JSON.stringify({
            stockItemId: itemId,
            type:        actionForm.type,
            quantity:    Number(actionForm.quantity),
            unitCost:    actionForm.unitCost ? Number(actionForm.unitCost) : undefined,
            projectId:   actionForm.projectId || undefined,
            employeeId:  actionForm.employeeId || undefined,
            reason:      actionForm.reason || undefined,
            notes:       actionForm.notes || undefined,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Erro')
      } else {
        // custody
        const res = await apiFetch('/api/v1/deposit/custodies', {
          method: 'POST',
          body: JSON.stringify({
            stockItemId: itemId,
            employeeId:  actionForm.employeeId,
            projectId:   actionForm.projectId || undefined,
            quantity:    Number(actionForm.quantity),
            dueDate:     actionForm.dueDate || undefined,
            condition:   actionForm.condition || undefined,
            notes:       actionForm.notes || undefined,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Erro')
      }
      setActionSheet(null)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <Package size={48} className="text-gray-300 mb-3" />
        <p className="text-gray-500">Item não encontrado</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 text-sm">
          ← Voltar
        </button>
      </div>
    )
  }

  const isLow  = item.minQuantity > 0 && item.quantity <= item.minQuantity
  const isZero = item.quantity <= 0
  const visibleMovs = showAllMovs ? item.movements : item.movements.slice(0, 5)

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold text-gray-900 flex-1 truncate">{item.name}</h1>
          <button onClick={load} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* ── Hero card ── */}
        <div className={cn(
          'bg-white rounded-2xl border p-5',
          isZero ? 'border-red-200' : isLow ? 'border-orange-200' : 'border-gray-100'
        )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              'w-16 h-16 rounded-2xl flex items-center justify-center shrink-0',
              item.isEpi ? 'bg-teal-100' :
              item.isUniform ? 'bg-blue-100' :
              item.requiresCustody ? 'bg-amber-100' :
              'bg-indigo-50'
            )}>
              {item.isEpi ? <ShieldCheck size={28} className="text-teal-600" /> :
               item.isUniform ? <Shirt size={28} className="text-blue-600" /> :
               item.requiresCustody ? <Hammer size={28} className="text-amber-600" /> :
               <Package size={28} className="text-indigo-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-gray-900">{item.name}</p>
              {item.code && <p className="text-sm text-gray-400">#{item.code}</p>}
              {item.description && (
                <p className="text-sm text-gray-500 mt-1">{item.description}</p>
              )}

              <div className="flex items-baseline gap-2 mt-3">
                <span className={cn('text-3xl font-extrabold', qtyColor(item))}>
                  {item.quantity}
                </span>
                <span className="text-gray-400 text-sm">{item.unit}</span>
                {item.minQuantity > 0 && (
                  <span className="text-xs text-gray-400">
                    / mín {item.minQuantity}
                  </span>
                )}
              </div>

              {isZero && (
                <div className="mt-2 flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">
                  <AlertTriangle size={12} /> Sem estoque
                </div>
              )}
              {isLow && !isZero && (
                <div className="mt-2 flex items-center gap-1 text-xs text-orange-600 bg-orange-50 rounded-lg px-2 py-1">
                  <AlertTriangle size={12} /> Estoque abaixo do mínimo
                </div>
              )}
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {item.category && (
              <div className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-xs text-gray-400">Categoria</p>
                <p className="text-sm font-medium text-gray-700">{item.category}</p>
              </div>
            )}
            {item.location && (
              <div className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-xs text-gray-400">Localização</p>
                <p className="text-sm font-medium text-gray-700">
                  <MapPin size={12} className="inline mr-1" />{item.location}
                </p>
              </div>
            )}
            {item.averageCost != null && (
              <div className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-xs text-gray-400">Custo médio</p>
                <p className="text-sm font-medium text-gray-700">{formatCurrency(item.averageCost)}</p>
              </div>
            )}
            {item.averageCost != null && (
              <div className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-xs text-gray-400">Valor em estoque</p>
                <p className="text-sm font-bold text-indigo-700">
                  {formatCurrency(item.quantity * item.averageCost)}
                </p>
              </div>
            )}
            {item.brand && (
              <div className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-xs text-gray-400">Marca / Modelo</p>
                <p className="text-sm font-medium text-gray-700">{item.brand}{item.model ? ` ${item.model}` : ''}</p>
              </div>
            )}
            {item.serialNumber && (
              <div className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-xs text-gray-400">N° Série</p>
                <p className="text-sm font-medium text-gray-700">{item.serialNumber}</p>
              </div>
            )}
          </div>

          {item.currentProject && (
            <div className="mt-3 flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2 text-sm text-indigo-700">
              <Layers size={14} /> Em uso: <strong>{item.currentProject.name}</strong>
            </div>
          )}
        </div>

        {/* ── Quick actions ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setActionSheet('movement'); setActionForm((f) => ({ ...f, type: 'IN' })); setError('') }}
            className="flex flex-col items-center gap-2 bg-green-50 hover:bg-green-100 rounded-2xl p-4 transition"
          >
            <ArrowDownToLine size={22} className="text-green-600" />
            <span className="text-sm font-medium text-green-700">Entrada</span>
          </button>
          <button
            onClick={() => { setActionSheet('movement'); setActionForm((f) => ({ ...f, type: 'OUT' })); setError('') }}
            className="flex flex-col items-center gap-2 bg-red-50 hover:bg-red-100 rounded-2xl p-4 transition"
          >
            <ArrowUpFromLine size={22} className="text-red-500" />
            <span className="text-sm font-medium text-red-600">Saída</span>
          </button>
          {item.requiresCustody && (
            <button
              onClick={() => { setActionSheet('custody'); setActionForm((f) => ({ ...f, type: 'OUT' })); setError('') }}
              className="flex flex-col items-center gap-2 bg-amber-50 hover:bg-amber-100 rounded-2xl p-4 transition"
            >
              <Hammer size={22} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-700">Emprestar</span>
            </button>
          )}
          <button
            onClick={() => { setActionSheet('movement'); setActionForm((f) => ({ ...f, type: 'ADJUSTMENT' })); setError('') }}
            className="flex flex-col items-center gap-2 bg-purple-50 hover:bg-purple-100 rounded-2xl p-4 transition"
          >
            <RefreshCw size={22} className="text-purple-500" />
            <span className="text-sm font-medium text-purple-700">Ajustar</span>
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <p className="text-xl font-bold text-indigo-700">{item._count.movements}</p>
            <p className="text-xs text-gray-400">Movimentos</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{item._count.custodies}</p>
            <p className="text-xs text-gray-400">Custódias</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <p className="text-xl font-bold text-teal-600">{item._count.epiDeliveries}</p>
            <p className="text-xs text-gray-400">EPIs entregues</p>
          </div>
        </div>

        {/* ── Active custodies ── */}
        {item.custodies.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-100 p-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
              <Hammer size={16} className="text-amber-600" /> Em custódia ({item.custodies.length})
            </h3>
            <div className="space-y-2">
              {item.custodies.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{c.employee.name}</p>
                    <p className="text-xs text-gray-400">
                      Saída {formatDate(c.checkedOutAt)}
                      {c.project ? ` · ${c.project.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-700">{c.quantity} {item.unit}</p>
                    {c.condition && <p className="text-xs text-gray-400">{c.condition}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Movement history ── */}
        {item.movements.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
              <Clock size={16} className="text-gray-500" /> Histórico de movimentos
            </h3>
            <div className="space-y-3">
              {visibleMovs.map((mov) => {
                const info = MOVEMENT_LABELS[mov.type] ?? MOVEMENT_LABELS.IN
                return (
                  <div key={mov.id} className="flex items-start gap-3 text-sm">
                    <div className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold',
                      info.sign === '+' ? 'bg-green-500' :
                      info.sign === '-' ? 'bg-red-400' :
                      'bg-purple-400'
                    )}>
                      {info.sign}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className={cn('font-medium text-xs', info.color)}>{info.label}</span>
                          {mov.employee && (
                            <span className="text-xs text-gray-400"> · {mov.employee.name}</span>
                          )}
                          {mov.project && (
                            <span className="text-xs text-gray-400"> · {mov.project.name}</span>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className={cn('font-bold text-sm', info.color)}>
                            {info.sign !== '=' ? info.sign : ''}{mov.quantity} {item.unit}
                          </p>
                          {mov.averageCostAfter != null && (
                            <p className="text-xs text-gray-400">
                              Cmédio: {formatCurrency(mov.averageCostAfter)}
                            </p>
                          )}
                        </div>
                      </div>
                      {mov.reason && <p className="text-xs text-gray-500 mt-0.5">{mov.reason}</p>}
                      <p className="text-xs text-gray-400">{formatDate(mov.createdAt)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            {item.movements.length > 5 && (
              <button
                onClick={() => setShowAllMovs(!showAllMovs)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition"
              >
                {showAllMovs
                  ? <><ChevronUp size={14} /> Mostrar menos</>
                  : <><ChevronDown size={14} /> Ver todos ({item.movements.length})</>}
              </button>
            )}
          </div>
        )}

        {/* ── EPI deliveries ── */}
        {item.epiDeliveries.length > 0 && (
          <div className="bg-white rounded-2xl border border-teal-100 p-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-teal-500" /> Entregas de EPI
            </h3>
            <div className="space-y-2">
              {item.epiDeliveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{d.employee.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(d.deliveredAt)}
                      {d.caNumber ? ` · CA: ${d.caNumber}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-teal-700">{d.quantity} {item.unit}</p>
                    {d.returnedAt && (
                      <p className="text-xs text-gray-400">Devolvido {formatDate(d.returnedAt)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Action Sheet ── */}
      {actionSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setActionSheet(null)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl"
            style={{ maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
              <h2 className="text-base font-semibold text-gray-900">
                {actionSheet === 'movement' ? 'Registrar Movimento' : 'Emprestar Ferramenta'}
              </h2>
              <button onClick={() => setActionSheet(null)} className="p-2 rounded-full hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAction} className="p-4 space-y-4">
              {actionSheet === 'movement' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setActionForm((f) => ({ ...f, type: k }))}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-xl border text-sm font-medium transition-all',
                          actionForm.type === k
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        )}
                      >
                        <span className={cn('text-base font-bold', v.color)}>{v.sign}</span>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {actionForm.type === 'ADJUSTMENT' ? 'Novo total' : 'Quantidade'} *
                  </label>
                  <input
                    type="number" step="0.001" min="0.001"
                    value={actionForm.quantity}
                    onChange={(e) => setActionForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                {['IN', 'RETURN'].includes(actionForm.type) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Custo (R$)</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={actionForm.unitCost}
                      onChange={(e) => setActionForm((f) => ({ ...f, unitCost: e.target.value }))}
                      placeholder="0,00"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                )}
              </div>

              {/* Employee */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Colaborador</label>
                <select
                  value={actionForm.employeeId}
                  onChange={(e) => setActionForm((f) => ({ ...f, employeeId: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">Selecione…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              {/* Project */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Obra / Projeto</label>
                <select
                  value={actionForm.projectId}
                  onChange={(e) => setActionForm((f) => ({ ...f, projectId: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">Sem obra</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Due date for custody */}
              {actionSheet === 'custody' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Data prevista de devolução</label>
                  <input
                    type="date"
                    value={actionForm.dueDate}
                    onChange={(e) => setActionForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Motivo</label>
                <input
                  type="text"
                  value={actionForm.reason}
                  onChange={(e) => setActionForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex: Compra NF-e 123, obra ABC..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
                  <AlertTriangle size={15} /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-sm font-semibold transition disabled:opacity-60"
              >
                {saving
                  ? <Loader2 size={18} className="animate-spin mx-auto" />
                  : actionSheet === 'custody' ? 'Registrar Empréstimo' : 'Registrar Movimento'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
