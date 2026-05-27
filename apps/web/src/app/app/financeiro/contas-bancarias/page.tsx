'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Pencil, Trash2, RefreshCw,
  TrendingUp, TrendingDown, Wallet, CreditCard,
  Building2, Link, Link2Off, CheckCircle,
  PauseCircle, PlayCircle, AlertTriangle, Lock, ArrowLeftRight,
} from 'lucide-react'
import { BankAccountModal } from '@/components/financial/BankAccountModal'
import { TransferModal } from '@/components/financial/TransferModal'
import { TableActionMenu } from '@/components/ui/TableActionMenu'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

type BankAccountStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED'

interface BankAccount {
  id:                 string
  name:               string
  bank:               string | null
  bankId:             string | null
  agency:             string | null
  accountNumber:      string | null
  accountType:        string
  pixKey:             string | null
  holderName:         string | null
  balance:            number
  initialBalance:     number
  computedBalance:    number
  integrationActive:  boolean
  integrationStatus:  string | null
  lastSyncAt:         string | null
  isActive:           boolean
  status:             BankAccountStatus
  inactivatedAt:      string | null
  inactivationReason: string | null
}

type StatusFilter = 'ALL' | BankAccountStatus

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = formatCurrency
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  CHECKING: 'Conta Corrente',
  SAVINGS:  'Poupança',
  PAYMENT:  'Conta Pagamento',
  INVEST:   'Investimento',
  CASH:     'Caixa',
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BankAccountStatus }) {
  if (status === 'ACTIVE') return null
  if (status === 'INACTIVE') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
      <PauseCircle size={9} /> Inativa
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
      <Lock size={9} /> Encerrada
    </span>
  )
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>{children}</div>
}

// ─── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  title, value, label, icon: Icon, iconCls, iconBgCls, loading,
}: {
  title: string; value: string | number; label: string; loading: boolean
  icon: React.ElementType; iconCls: string; iconBgCls: string
}) {
  if (loading) return (
    <Panel className="p-5">
      <div className="flex items-start justify-between mb-3">
        <Pulse className="w-10 h-10 rounded-xl" />
      </div>
      <Pulse className="h-8 w-28 mb-2" />
      <Pulse className="h-3 w-20" />
    </Panel>
  )
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBgCls}`}>
          <Icon size={20} className={iconCls} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none mb-1">
        {typeof value === 'number' ? fmt(value) : value}
      </p>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </Panel>
  )
}

// ─── Confirmation Modal ────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open:             boolean
  title:            string
  description:      string
  confirmLabel:     string
  confirmCls:       string
  loading:          boolean
  requireTyping?:   string   // if set, user must type this word to confirm
  showReason?:      boolean
  onConfirm:        (reason: string) => void
  onClose:          () => void
}

function ConfirmModal({
  open, title, description, confirmLabel, confirmCls, loading,
  requireTyping, showReason, onConfirm, onClose,
}: ConfirmModalProps) {
  const [reason,  setReason]  = useState('')
  const [typed,   setTyped]   = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) { setReason(''); setTyped('') }
  }, [open])

  if (!open) return null

  const canConfirm = !requireTyping || typed.trim().toLowerCase() === requireTyping.toLowerCase()

  function handleOverlay(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlay}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
        </div>

        {showReason && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Motivo <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Descreva o motivo..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            />
          </div>
        )}

        {requireTyping && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Digite <strong className="text-red-600 font-mono">{requireTyping}</strong> para confirmar
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTyping}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 font-mono"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading || !canConfirm}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${confirmCls}`}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContasBancariasPage() {
  const [accounts,      setAccounts]      = useState<BankAccount[]>([])
  const [loading,       setLoading]       = useState(true)
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('ACTIVE')
  const [showModal,     setShowModal]     = useState(false)
  const [editing,       setEditing]       = useState<BankAccount | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showTransfer,  setShowTransfer]  = useState(false)

  // Summary counts (from API — includes all statuses)
  const [summary, setSummary] = useState({
    activeCount: 0, inactiveCount: 0, closedCount: 0,
    totalBalance: 0, connected: 0,
  })

  // Modal states
  const [inactivateTarget, setInactivateTarget] = useState<BankAccount | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<BankAccount | null>(null)
  const [closeTarget,      setCloseTarget]      = useState<BankAccount | null>(null)

  function headers() {
    const token = localStorage.getItem('token') || ''
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  // Load ALL accounts (for summary) then filter client-side
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/financial/bank-accounts?status=ALL`, { headers: headers() })
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts ?? [])
        setSummary({
          activeCount:   data.activeCount   ?? 0,
          inactiveCount: data.inactiveCount ?? 0,
          closedCount:   data.closedCount   ?? 0,
          totalBalance:  data.totalBalance  ?? 0,
          connected:     data.connected     ?? 0,
        })
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Filtered view
  const displayed = statusFilter === 'ALL'
    ? accounts
    : accounts.filter((a) => a.status === statusFilter)

  // ── Action handlers ────────────────────────────────────────────────────────

  async function handleDelete(account: BankAccount) {
    if (!confirm(`Excluir a conta "${account.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      const res = await fetch(`${API}/api/financial/bank-accounts/${account.id}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Não foi possível excluir a conta.')
        return
      }
      load()
    } catch { alert('Erro ao excluir a conta.') }
  }

  async function handleInactivate(reason: string) {
    if (!inactivateTarget) return
    setActionLoading(true)
    try {
      const res = await fetch(`${API}/api/financial/bank-accounts/${inactivateTarget.id}/inactivate`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ reason: reason || undefined }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Erro ao inativar conta.')
        return
      }
      setInactivateTarget(null)
      load()
    } catch { alert('Erro ao inativar conta.') } finally { setActionLoading(false) }
  }

  async function handleReactivate() {
    if (!reactivateTarget) return
    setActionLoading(true)
    try {
      const res = await fetch(`${API}/api/financial/bank-accounts/${reactivateTarget.id}/reactivate`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Erro ao reativar conta.')
        return
      }
      setReactivateTarget(null)
      load()
    } catch { alert('Erro ao reativar conta.') } finally { setActionLoading(false) }
  }

  async function handleClose(reason: string) {
    if (!closeTarget) return
    setActionLoading(true)
    try {
      const res = await fetch(`${API}/api/financial/bank-accounts/${closeTarget.id}/close`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ reason: reason || undefined }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Erro ao encerrar conta.')
        return
      }
      setCloseTarget(null)
      load()
    } catch { alert('Erro ao encerrar conta.') } finally { setActionLoading(false) }
  }

  function handleEdit(account: BankAccount) {
    setEditing(account)
    setShowModal(true)
  }

  function handleModalClose() {
    setShowModal(false)
    setEditing(null)
  }

  function handleSaved() {
    handleModalClose()
    load()
  }

  // ── Summary metrics ──────────────────────────────────────────────────────

  const positiveBalance = accounts
    .filter((a) => a.status === 'ACTIVE' && a.computedBalance > 0)
    .reduce((s, a) => s + a.computedBalance, 0)
  const negativeBalance = accounts
    .filter((a) => a.status === 'ACTIVE' && a.computedBalance < 0)
    .reduce((s, a) => s + a.computedBalance, 0)

  // ── Status filter tabs ────────────────────────────────────────────────────

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'ACTIVE',   label: 'Ativas',     count: summary.activeCount   },
    { key: 'INACTIVE', label: 'Inativas',   count: summary.inactiveCount },
    { key: 'CLOSED',   label: 'Encerradas', count: summary.closedCount   },
    { key: 'ALL',      label: 'Todas',      count: accounts.length       },
  ]

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Financeiro', href: '/app/financeiro' },
        { label: 'Contas Bancárias' },
      ]} />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas Bancárias</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie as contas bancárias da empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={13} /> Atualizar
          </button>
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-2 border border-[#F5A623] text-[#F5A623] hover:bg-orange-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeftRight size={16} /> Transferência
          </button>
          <button
            onClick={() => { setEditing(null); setShowModal(true) }}
            className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={16} /> Nova Conta
          </button>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          loading={loading}
          title="Contas ativas"
          value={`${summary.activeCount} conta${summary.activeCount !== 1 ? 's' : ''}`}
          label={`${summary.inactiveCount} inativa${summary.inactiveCount !== 1 ? 's' : ''} · ${summary.closedCount} encerrada${summary.closedCount !== 1 ? 's' : ''}`}
          icon={CreditCard} iconCls="text-blue-600" iconBgCls="bg-blue-100"
        />
        <SummaryCard
          loading={loading}
          title="Saldo total"
          value={summary.totalBalance}
          label="Saldo consolidado (contas ativas)"
          icon={Wallet} iconCls="text-violet-600" iconBgCls="bg-violet-100"
        />
        <SummaryCard
          loading={loading}
          title="Saldo positivo"
          value={positiveBalance}
          label="Contas ativas com saldo positivo"
          icon={TrendingUp} iconCls="text-green-600" iconBgCls="bg-green-100"
        />
        <SummaryCard
          loading={loading}
          title="Saldo negativo"
          value={negativeBalance}
          label="Contas ativas com saldo negativo"
          icon={TrendingDown} iconCls="text-red-500" iconBgCls="bg-red-100"
        />
      </div>

      {/* ── Accounts table ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">

        {/* Filter tabs */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === t.key
                    ? 'bg-[#F5A623] text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === t.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{displayed.length} conta{displayed.length !== 1 ? 's' : ''} exibida{displayed.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Conta</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden md:table-cell">Banco</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden md:table-cell">Tipo</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Agência / Conta</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Saldo</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Integração</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Última sinc</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><Pulse className="h-3 w-full" /></td>
                    <td className="px-5 py-4 hidden md:table-cell"><Pulse className="h-3 w-full" /></td>
                    <td className="px-5 py-4 hidden md:table-cell"><Pulse className="h-3 w-full" /></td>
                    <td className="px-5 py-4 hidden lg:table-cell"><Pulse className="h-3 w-full" /></td>
                    <td className="px-5 py-4"><Pulse className="h-3 w-full" /></td>
                    <td className="px-5 py-4 hidden lg:table-cell"><Pulse className="h-3 w-full" /></td>
                    <td className="px-5 py-4 hidden lg:table-cell"><Pulse className="h-3 w-full" /></td>
                    <td className="px-5 py-4"><Pulse className="h-3 w-8" /></td>
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <Building2 size={22} className="text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          {statusFilter === 'ALL' ? 'Nenhuma conta cadastrada' : `Nenhuma conta ${statusFilter === 'ACTIVE' ? 'ativa' : statusFilter === 'INACTIVE' ? 'inativa' : 'encerrada'}`}
                        </p>
                        {statusFilter === 'ACTIVE' && (
                          <p className="text-xs text-gray-400 mt-1">Clique em "Nova Conta" para adicionar uma conta bancária.</p>
                        )}
                      </div>
                      {statusFilter === 'ACTIVE' && (
                        <button
                          onClick={() => setShowModal(true)}
                          className="flex items-center gap-2 bg-[#F5A623] text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-[#d4891a] transition-colors"
                        >
                          <Plus size={14} /> Nova Conta
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : displayed.map((account) => (
                <tr
                  key={account.id}
                  className={`hover:bg-gray-50 transition-colors group ${
                    account.status === 'CLOSED'   ? 'opacity-60' :
                    account.status === 'INACTIVE' ? 'opacity-80' : ''
                  }`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        account.status === 'ACTIVE' ? 'bg-[#F5A623]/10' : 'bg-gray-100'
                      }`}>
                        <Wallet size={14} className={account.status === 'ACTIVE' ? 'text-[#F5A623]' : 'text-gray-400'} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800">{account.name}</p>
                          <StatusBadge status={account.status} />
                        </div>
                        {account.holderName && <p className="text-xs text-gray-400">{account.holderName}</p>}
                        {account.inactivationReason && (
                          <p className="text-[10px] text-gray-400 italic mt-0.5">"{account.inactivationReason}"</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-600 hidden md:table-cell">
                    {account.bank || account.bankId || '—'}
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {ACCOUNT_TYPE_LABEL[account.accountType] ?? account.accountType}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500 font-mono hidden lg:table-cell">
                    {account.agency ? `Ag: ${account.agency}` : ''}
                    {account.agency && account.accountNumber ? ' · ' : ''}
                    {account.accountNumber ? `CC: ${account.accountNumber}` : ''}
                    {!account.agency && !account.accountNumber ? '—' : ''}
                  </td>
                  <td className={`px-5 py-4 text-sm font-bold tabular-nums whitespace-nowrap ${
                    account.status !== 'ACTIVE' ? 'text-gray-400' :
                    account.computedBalance >= 0 ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {account.status === 'ACTIVE' ? fmt(account.computedBalance) : '—'}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    {account.integrationActive ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <Link size={10} /> Conectado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        <Link2Off size={10} /> Manual
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400 whitespace-nowrap hidden lg:table-cell">
                    {account.integrationActive ? fmtDate(account.lastSyncAt) : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <TableActionMenu actions={[
                      ...(account.status !== 'CLOSED' ? [{ label: 'Editar', icon: <Pencil size={13} />, onClick: () => handleEdit(account) }] : []),
                      ...(account.status === 'ACTIVE'   ? [{ label: 'Inativar conta', icon: <PauseCircle size={13} />, onClick: () => setInactivateTarget(account), variant: 'warning' as const }] : []),
                      ...(account.status === 'INACTIVE' ? [{ label: 'Reativar conta', icon: <PlayCircle size={13} />,  onClick: () => setReactivateTarget(account), variant: 'success' as const }] : []),
                      ...(account.status !== 'CLOSED'   ? [{ label: 'Encerrar conta', icon: <Lock size={13} />,       onClick: () => setCloseTarget(account),       variant: 'danger'  as const, separator: true }] : []),
                      ...(account.status === 'ACTIVE'   ? [{ label: 'Excluir conta',  icon: <Trash2 size={13} />,     onClick: () => handleDelete(account),         variant: 'danger'  as const, separator: true }] : []),
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PIX keys info strip */}
        {accounts.some((a) => a.pixKey && a.status === 'ACTIVE') && (
          <div className="px-5 py-3 border-t border-gray-100 bg-blue-50 rounded-b-2xl">
            <div className="flex items-start gap-2">
              <CheckCircle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-700">Chaves PIX cadastradas (contas ativas)</p>
                <div className="flex flex-wrap gap-3 mt-1">
                  {accounts.filter((a) => a.pixKey && a.status === 'ACTIVE').map((a) => (
                    <span key={a.id} className="text-xs text-blue-600">
                      <strong>{a.name}:</strong> {a.pixKey}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Info card: conectar banco ──────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#F5A623]/5 to-amber-50 rounded-2xl border border-amber-200 p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#F5A623]/20 flex items-center justify-center flex-shrink-0">
            <Link size={18} className="text-[#F5A623]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-800">Conectar conta via Open Finance</h4>
            <p className="text-xs text-gray-500 mt-1">
              Sincronize automaticamente os extratos das suas contas bancárias via Open Finance (disponível em breve).
              Por enquanto, os lançamentos são registrados manualmente.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal: Editar / Nova Conta ─────────────────────────────────── */}
      {showModal && (
        <BankAccountModal
          open={showModal}
          onClose={handleModalClose}
          onSaved={handleSaved}
          token={localStorage.getItem('token') ?? ''}
          editAccount={editing ?? null}
        />
      )}

      {/* ── Modal: Transferência entre contas ─────────────────────────── */}
      <TransferModal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        onSuccess={() => { setShowTransfer(false); load() }}
        accounts={accounts
          .filter((a) => a.status === 'ACTIVE')
          .map((a) => ({
            id:             a.id,
            name:           a.name,
            bank:           a.bank,
            balance:        a.balance,
            computedBalance:a.computedBalance,
            status:         a.status,
          }))}
      />

      {/* ── Modal: Inativar ───────────────────────────────────────────── */}
      <ConfirmModal
        open={!!inactivateTarget}
        title={`Inativar "${inactivateTarget?.name}"?`}
        description="A conta ficará inativa e não aparecerá nos seletores de novos lançamentos. Lançamentos existentes não serão afetados. Você pode reativar a qualquer momento."
        confirmLabel="Inativar conta"
        confirmCls="bg-amber-500 hover:bg-amber-600"
        loading={actionLoading}
        showReason
        onConfirm={handleInactivate}
        onClose={() => setInactivateTarget(null)}
      />

      {/* ── Modal: Reativar ───────────────────────────────────────────── */}
      <ConfirmModal
        open={!!reactivateTarget}
        title={`Reativar "${reactivateTarget?.name}"?`}
        description="A conta voltará ao status ativo e estará disponível para novos lançamentos."
        confirmLabel="Reativar conta"
        confirmCls="bg-green-600 hover:bg-green-700"
        loading={actionLoading}
        onConfirm={handleReactivate}
        onClose={() => setReactivateTarget(null)}
      />

      {/* ── Modal: Encerrar ───────────────────────────────────────────── */}
      <ConfirmModal
        open={!!closeTarget}
        title={`Encerrar "${closeTarget?.name}"?`}
        description="Esta operação é IRREVERSÍVEL. A conta será permanentemente encerrada e não poderá ser reativada. Lançamentos existentes serão mantidos."
        confirmLabel="Encerrar permanentemente"
        confirmCls="bg-red-600 hover:bg-red-700"
        loading={actionLoading}
        showReason
        requireTyping="ENCERRAR"
        onConfirm={handleClose}
        onClose={() => setCloseTarget(null)}
      />
    </div>
  )
}
