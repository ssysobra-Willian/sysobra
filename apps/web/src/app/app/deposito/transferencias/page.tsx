'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeftRight, Clock, Send, Inbox, History, Loader2, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, X, AlertTriangle,
  Package, MapPin, User, Calendar, Hash, FileText, ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function tok() { return typeof window !== 'undefined' ? (localStorage.getItem('token') ?? '') : '' }
function cid() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

async function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${tok()}`,
      'x-company-id': cid(),
      ...(opts.headers ?? {}),
    },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferItem {
  id:           string
  itemId:       string
  requestedQty: number
  acceptedQty:  number | null
  unitCost:     number
  notes:        string | null
  item:         { id: string; name: string; unit: string; code?: string | null }
}

interface Transfer {
  id:              string
  docNumber:       string
  status:          string
  requestedAt:     string
  respondedAt:     string | null
  notes:           string | null
  rejectionReason: string | null
  fromLocation:    { id: string; name: string; type: string }
  toLocation:      { id: string; name: string; type: string }
  requester:       { id: string; name: string }
  responder:       { id: string; name: string } | null
  items:           TransferItem[]
  _count?:         { items: number }
}

type TabId = 'pending' | 'sent' | 'received' | 'history'

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; color: string; dot: string }> = {
  PENDING:   { label: 'Aguardando',  color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  ACCEPTED:  { label: 'Aceita',      color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'  },
  PARTIAL:   { label: 'Parcial',     color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'   },
  REJECTED:  { label: 'Rejeitada',   color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'    },
  CANCELLED: { label: 'Cancelada',   color: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400'   },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', s.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Accept Transfer Modal ────────────────────────────────────────────────────

function AcceptModal({
  transfer,
  onClose,
  onDone,
}: {
  transfer: Transfer
  onClose:  () => void
  onDone:   () => void
}) {
  const [accepted, setAccepted] = useState<Record<string, number>>(
    Object.fromEntries(transfer.items.map(it => [it.id, it.requestedQty])),
  )
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')

  const total = transfer.items.reduce((s, it) => s + (accepted[it.id] ?? 0), 0)

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      const body = {
        items: transfer.items.map(it => ({
          transferItemId: it.id,
          acceptedQty:    accepted[it.id] ?? 0,
        })),
      }
      const res = await apiFetch(`/api/v1/deposit/transfers/${transfer.id}/accept`, {
        method: 'PATCH',
        body:   JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }
      onDone()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao aceitar transferência')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96dvh]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 size={15} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">Aceitar Transferência</h2>
              <p className="text-xs text-gray-400">{transfer.docNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Rota */}
        <div className="mx-5 mt-4 bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-2 text-sm flex-shrink-0">
          <MapPin size={14} className="text-gray-400" />
          <span className="font-medium text-gray-700">{transfer.fromLocation.name}</span>
          <ArrowLeftRight size={14} className="text-gray-300 mx-1" />
          <span className="font-medium text-[#F5A623]">{transfer.toLocation.name}</span>
        </div>

        {/* Itens */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Confirme as quantidades recebidas:</p>
          {transfer.items.map(it => (
            <div key={it.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{it.item.name}</p>
                <p className="text-xs text-gray-400">
                  Solicitado: <strong className="text-gray-600">{it.requestedQty} {it.item.unit}</strong>
                  {it.item.code && <span className="ml-2">{it.item.code}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => setAccepted(p => ({ ...p, [it.id]: Math.max(0, (p[it.id] ?? 0) - 1) }))}
                  className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg font-light"
                >−</button>
                <input
                  type="number"
                  min="0"
                  max={it.requestedQty}
                  value={accepted[it.id] ?? 0}
                  onChange={e => setAccepted(p => ({ ...p, [it.id]: Math.min(it.requestedQty, Math.max(0, Number(e.target.value))) }))}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:border-[#F5A623]"
                />
                <button type="button"
                  onClick={() => setAccepted(p => ({ ...p, [it.id]: Math.min(it.requestedQty, (p[it.id] ?? 0) + 1) }))}
                  className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg font-light"
                >+</button>
                <span className="text-xs text-gray-400 w-6">{it.item.unit}</span>
              </div>
            </div>
          ))}

          {total === 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
              <AlertTriangle size={13} />
              <span>Para aceitar com quantidade zero em todos os itens, use "Rejeitar" em vez disso.</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 pb-[env(safe-area-inset-bottom,16px)]">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || total === 0}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={15} className="animate-spin" />Processando...</> : <><CheckCircle2 size={15} />Confirmar Recebimento</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({
  transfer,
  onClose,
  onDone,
}: {
  transfer: Transfer
  onClose:  () => void
  onDone:   () => void
}) {
  const [reason,  setReason]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Informe o motivo da rejeição'); return }
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/v1/deposit/transfers/${transfer.id}/reject`, {
        method: 'PATCH',
        body:   JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }
      onDone()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao rejeitar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle size={15} className="text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">Rejeitar Transferência</h2>
              <p className="text-xs text-gray-400">{transfer.docNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Informe o motivo para rejeitar a transferência de
            <strong className="text-gray-800"> {transfer.fromLocation.name}</strong> → <strong className="text-gray-800">{transfer.toLocation.name}</strong>.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Motivo da rejeição *
            </label>
            <textarea
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: Item não disponível, quantidade incorreta, erro de cadastro..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3 pb-[env(safe-area-inset-bottom,20px)]">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || !reason.trim()}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={15} className="animate-spin" />Rejeitando...</> : <><XCircle size={15} />Rejeitar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Transfer Card ────────────────────────────────────────────────────────────

function TransferCard({
  transfer,
  mode,
  onAccept,
  onReject,
  onCancel,
}: {
  transfer: Transfer
  mode:     'pending_receive' | 'sent' | 'received' | 'history'
  onAccept?: () => void
  onReject?: () => void
  onCancel?: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50/50 transition"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0 space-y-2">
          {/* Doc number + status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg font-medium">
              {transfer.docNumber}
            </span>
            <StatusBadge status={transfer.status} />
            <span className="text-xs text-gray-400 ml-auto">{formatDate(transfer.requestedAt)}</span>
          </div>

          {/* Route */}
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin size={13} className="text-gray-400 flex-shrink-0" />
            <span className="text-gray-600">{transfer.fromLocation.name}</span>
            <ArrowLeftRight size={13} className="text-gray-300 flex-shrink-0 mx-0.5" />
            <span className="font-medium text-gray-800">{transfer.toLocation.name}</span>
          </div>

          {/* Requester + items count */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <User size={11} />
              {transfer.requester.name}
            </span>
            <span className="flex items-center gap-1">
              <Package size={11} />
              {transfer.items.length} {transfer.items.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
        </div>

        {expanded
          ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0 mt-1" />
          : <ChevronDown size={16} className="text-gray-400 flex-shrink-0 mt-1" />
        }
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {/* Items list */}
          <div className="space-y-2">
            {transfer.items.map(it => (
              <div key={it.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                <Package size={13} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{it.item.name}</p>
                  {it.item.code && <p className="text-[10px] text-gray-400">{it.item.code}</p>}
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold text-gray-700">{it.requestedQty} {it.item.unit}</p>
                  {it.acceptedQty !== null && it.acceptedQty !== it.requestedQty && (
                    <p className="text-green-600">Aceito: {it.acceptedQty}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Rejection reason */}
          {transfer.rejectionReason && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-xs text-red-700">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Motivo da rejeição:</p>
                <p>{transfer.rejectionReason}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          {transfer.notes && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
              <span className="font-semibold text-gray-600">Observação:</span> {transfer.notes}
            </p>
          )}

          {/* Responder */}
          {transfer.responder && (
            <p className="text-xs text-gray-400">
              Respondido por <strong className="text-gray-600">{transfer.responder.name}</strong> em {formatDate(transfer.respondedAt)}
            </p>
          )}

          {/* Actions */}
          {mode === 'pending_receive' && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onReject?.() }}
                className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition flex items-center justify-center gap-1.5"
              >
                <XCircle size={14} /> Rejeitar
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onAccept?.() }}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={14} /> Aceitar
              </button>
            </div>
          )}

          {mode === 'sent' && transfer.status === 'PENDING' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onCancel?.() }}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition flex items-center gap-1.5"
              >
                <X size={13} /> Cancelar transferência
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransferenciasPage() {
  const router  = useRouter()
  const [tab,       setTab]       = useState<TabId>('pending')
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [accepting, setAccepting] = useState<Transfer | null>(null)
  const [rejecting, setRejecting] = useState<Transfer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (tab === 'pending')  { params.set('status', 'PENDING'); params.set('role', 'receiver') }
      if (tab === 'sent')     { params.set('role', 'sender') }
      if (tab === 'received') { params.set('status', 'ACCEPTED,PARTIAL'); params.set('role', 'receiver') }
      if (tab === 'history')  { params.set('status', 'REJECTED,CANCELLED,ACCEPTED,PARTIAL') }

      const res = await apiFetch(`/api/v1/deposit/transfers?${params}`)
      if (res.ok) {
        const d = await res.json()
        setTransfers(d.transfers ?? d.data ?? [])
      }
    } catch { /* silencioso */ }
    finally  { setLoading(false) }
  }, [tab])

  useEffect(() => { load() }, [load])

  const handleCancel = async (t: Transfer) => {
    if (!confirm(`Cancelar transferência ${t.docNumber}?`)) return
    try {
      await apiFetch(`/api/v1/deposit/transfers/${t.id}/cancel`, { method: 'PATCH' })
      load()
    } catch { /* silencioso */ }
  }

  const TABS: { id: TabId; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'pending',  label: 'Pendentes',  icon: Clock       },
    { id: 'sent',     label: 'Enviadas',   icon: Send        },
    { id: 'received', label: 'Recebidas',  icon: Inbox       },
    { id: 'history',  label: 'Histórico',  icon: History     },
  ]

  const pendingCount = tab === 'pending' ? transfers.filter(t => t.status === 'PENDING').length : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-screen-lg mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
              >
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <ArrowLeftRight size={18} className="text-[#F5A623]" />
                  Transferências
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">Controle de movimentação entre almoxarifados</p>
              </div>
            </div>
            <button
              onClick={load}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
              title="Recarregar"
            >
              <RefreshCw size={15} className={cn('text-gray-500', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-6">
        {/* Tab bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
          <div className="border-b border-gray-100 overflow-x-auto no-scrollbar">
            <div className="flex min-w-max">
              {TABS.map(t => (
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
                  <t.icon size={14} />
                  {t.label}
                  {t.id === 'pending' && pendingCount > 0 && (
                    <span className="ml-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="p-5">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={26} className="animate-spin text-[#F5A623]" />
              </div>
            ) : transfers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                <ArrowLeftRight size={32} />
                <p className="text-sm">
                  {tab === 'pending'  && 'Nenhuma transferência aguardando seu aceite'}
                  {tab === 'sent'     && 'Nenhuma transferência enviada'}
                  {tab === 'received' && 'Nenhuma transferência recebida'}
                  {tab === 'history'  && 'Nenhuma transferência no histórico'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {transfers.map(t => (
                  <TransferCard
                    key={t.id}
                    transfer={t}
                    mode={
                      tab === 'pending'  ? 'pending_receive' :
                      tab === 'sent'     ? 'sent'            :
                      tab === 'received' ? 'received'        : 'history'
                    }
                    onAccept={() => setAccepting(t)}
                    onReject={() => setRejecting(t)}
                    onCancel={() => handleCancel(t)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accept modal */}
      {accepting && (
        <AcceptModal
          transfer={accepting}
          onClose={() => setAccepting(null)}
          onDone={() => { setAccepting(null); load() }}
        />
      )}

      {/* Reject modal */}
      {rejecting && (
        <RejectModal
          transfer={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => { setRejecting(null); load() }}
        />
      )}
    </div>
  )
}
