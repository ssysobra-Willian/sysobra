'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, XCircle, CheckCircle,
  RefreshCw, Search, X, ChevronLeft, ChevronRight,
  AlertTriangle, Clock, Calendar, TrendingUp,
  Download, Eye,
} from 'lucide-react'
import { TransactionModal } from '@/components/financial/TransactionModal'
import { TransactionReceiptModal } from '@/components/financial/TransactionReceiptModal'
import { TableActionMenu } from '@/components/ui/TableActionMenu'
import { useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id:          string
  description: string
  type:        'INCOME' | 'EXPENSE'
  isPaid:      boolean
  grossAmount: number
  netAmount:   number
  dueDate:     string | null
  paidAt:      string | null
  referenceDate: string
  category:    { id: string; name: string; color: string; icon: string } | null
  bankAccount: { id: string; name: string; bank: string | null } | null
  supplier:    { id: string; name: string } | null
  client:      { id: string; name: string } | null
}

interface TxPage {
  transactions: Transaction[]
  total: number
  page: number
  pages: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = formatCurrency

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function daysDiff(iso: string | null) {
  if (!iso) return null
  const due = new Date(iso)
  due.setHours(0,0,0,0)
  const today = new Date()
  today.setHours(0,0,0,0)
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>{children}</div>
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  title, value, count, label, icon: Icon, iconCls, iconBgCls, loading,
}: {
  title: string; value: number; count?: number; label: string; loading: boolean
  icon: React.ElementType; iconCls: string; iconBgCls: string
}) {
  if (loading) return (
    <Panel className="p-5 xl:p-3">
      <Pulse className="w-10 h-10 xl:w-8 xl:h-8 rounded-xl mb-3 xl:mb-2" />
      <Pulse className="h-8 xl:h-6 w-28 xl:w-20 mb-2 xl:mb-1" />
      <Pulse className="h-3 w-20 xl:hidden" />
    </Panel>
  )
  return (
    <Panel className="p-5 xl:p-3">
      <div className={`w-10 h-10 xl:w-8 xl:h-8 rounded-xl flex items-center justify-center mb-3 xl:mb-2 ${iconBgCls}`}>
        <Icon size={20} className={`xl:hidden ${iconCls}`} />
        <Icon size={16} className={`hidden xl:block ${iconCls}`} />
      </div>
      <p className="text-2xl xl:text-xl font-bold text-gray-900 leading-none mb-1">{fmt(value)}</p>
      {count !== undefined && (
        <p className="text-xs text-gray-500 mb-0.5 xl:hidden">{count} lançamento{count !== 1 ? 's' : ''}</p>
      )}
      <p className="text-[11px] xl:text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      <p className="text-xs text-gray-500 mt-1 xl:hidden">{label}</p>
    </Panel>
  )
}

// ─── Status / Due date badge ──────────────────────────────────────────────────

function DueBadge({ tx }: { tx: Transaction }) {
  if (tx.isPaid) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Recebido</span>
  const diff = daysDiff(tx.dueDate)
  if (diff === null) return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sem vencimento</span>
  if (diff < 0) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Vencido há {Math.abs(diff)}d</span>
  if (diff === 0) return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Vence hoje</span>
  if (diff <= 7)  return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Vence em {diff}d</span>
  return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{fmtDate(tx.dueDate)}</span>
}


// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCsv(transactions: Transaction[]) {
  const header = '"Data Vencimento","Descrição","Cliente","Categoria","Conta","Valor","Status"'
  const rows = transactions.map((tx) => [
    tx.dueDate ? fmtDate(tx.dueDate) : '',
    tx.description,
    tx.client?.name ?? '',
    tx.category?.name ?? '',
    tx.bankAccount?.name ?? '',
    tx.netAmount.toFixed(2).replace('.', ','),
    tx.isPaid ? 'Recebido' : 'Pendente',
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv  = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = 'contas-a-receber.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TX_PER_PAGE = 20

export default function ContasReceberPage() {
  const [txPage,     setTxPage]     = useState<TxPage | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [filterPaid, setFilterPaid] = useState('false') // default: pendentes
  const [filterCat,  setFilterCat]  = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  const [categories,   setCategories]   = useState<{ id: string; name: string; color: string }[]>([])
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([])
  const [filterBank,   setFilterBank]   = useState('')

  const [showModal,  setShowModal]   = useState(false)
  const [editingTx,  setEditingTx]   = useState<Transaction | null>(null)
  const [viewingTxId,setViewingTxId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const queryClient = useQueryClient()
  const invalidateDashboard = () => queryClient.invalidateQueries({ queryKey: ['dashboard'] })

  // ── Summary accumulators ─────────────────────────────────────────────────

  const [summaryOverdue,   setSummaryOverdue]   = useState(0)
  const [summaryDueToday,  setSummaryDueToday]  = useState(0)
  const [summaryDue7,      setSummaryDue7]      = useState(0)
  const [summaryTotal,     setSummaryTotal]     = useState(0)
  const [summaryCountOv,   setSummaryCountOv]   = useState(0)
  const [summaryCountToday,setSummaryCountToday]= useState(0)
  const [summaryCountDue7, setSummaryCountDue7] = useState(0)
  const [summaryCountTotal,setSummaryCountTotal]= useState(0)

  // ── Helpers ─────────────────────────────────────────────────────────────

  function headers() {
    const token = localStorage.getItem('token') || ''
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  // ── Load data ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qp = new URLSearchParams({
        type:  'INCOME',
        page:  String(page),
        limit: String(TX_PER_PAGE),
      })
      if (search)     qp.set('search',    search)
      if (filterPaid) qp.set('isPaid',    filterPaid)
      if (filterCat)  qp.set('categoryId', filterCat)
      if (filterBank) qp.set('bankAccountId', filterBank)
      if (dateFrom)   qp.set('startDate', dateFrom)
      if (dateTo)     qp.set('endDate',   dateTo)

      const res = await fetch(`${API}/api/financial/transactions?${qp}`, { headers: headers() })
      if (res.ok) {
        const data: TxPage = await res.json()
        setTxPage(data)

        // Compute summary from current filtered set
        const today = new Date(); today.setHours(0,0,0,0)
        const in7   = new Date(today); in7.setDate(today.getDate() + 7)

        const pending = data.transactions.filter((t) => !t.isPaid)
        let ov = 0, ovCnt = 0, tod = 0, todCnt = 0, d7 = 0, d7Cnt = 0
        for (const t of pending) {
          if (!t.dueDate) continue
          const due = new Date(t.dueDate); due.setHours(0,0,0,0)
          if (due < today)                              { ov  += t.netAmount; ovCnt++ }
          else if (due.getTime() === today.getTime())   { tod += t.netAmount; todCnt++ }
          else if (due <= in7)                          { d7  += t.netAmount; d7Cnt++ }
        }
        setSummaryOverdue(ov);   setSummaryCountOv(ovCnt)
        setSummaryDueToday(tod); setSummaryCountToday(todCnt)
        setSummaryDue7(d7);      setSummaryCountDue7(d7Cnt)
        setSummaryTotal(pending.reduce((s, t) => s + t.netAmount, 0))
        setSummaryCountTotal(pending.length)
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [page, search, filterPaid, filterCat, filterBank, dateFrom, dateTo])

  useEffect(() => {
    async function loadMeta() {
      try {
        const [catRes, bankRes] = await Promise.all([
          fetch(`${API}/api/financial/categories?type=INCOME`, { headers: headers() }),
          fetch(`${API}/api/financial/bank-accounts`,          { headers: headers() }),
        ])
        if (catRes.ok)  setCategories((await catRes.json()).categories ?? [])
        if (bankRes.ok) setBankAccounts((await bankRes.json()).accounts ?? [])
      } catch { /* silent */ }
    }
    loadMeta()
  }, [])

  useEffect(() => { load() }, [load])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleReceive(tx: Transaction) {
    const today = new Date().toISOString().split('T')[0]
    setActionError('')
    try {
      const res = await fetch(`${API}/api/financial/transactions/${tx.id}/pay`, {
        method: 'PATCH',                              // era 'POST' — rota exige PATCH
        headers: headers(),
        body: JSON.stringify({ paidAt: today }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setActionError((err as any).error || `Erro ao registrar recebimento (HTTP ${res.status})`)
        return
      }
      load(); invalidateDashboard()
    } catch {
      setActionError('Falha na conexão. Verifique sua rede e tente novamente.')
    }
  }

  async function handleCancel(tx: Transaction) {
    if (!confirm(`Cancelar "${tx.description}"?`)) return
    setActionError('')
    try {
      const res = await fetch(`${API}/api/financial/transactions/${tx.id}/cancel`, {
        method: 'PATCH',                              // era 'DELETE' para URL errada
        headers: headers(),
        body: JSON.stringify({}),                     // obrigatório: body vazio + Content-Type: application/json → 400 no Fastify
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setActionError((err as any).error || `Erro ao cancelar (HTTP ${res.status})`)
        return
      }
      load(); invalidateDashboard()
    } catch {
      setActionError('Falha na conexão. Verifique sua rede e tente novamente.')
    }
  }

  function handleEdit(tx: Transaction) {
    setEditingTx(tx)
    setShowModal(true)
  }

  function handleView(tx: Transaction) {
    setViewingTxId(tx.id)
  }

  function handleClose() {
    setShowModal(false)
    setEditingTx(null)
  }

  const transactions = txPage?.transactions ?? []
  const totalPages   = txPage?.pages ?? 1

  const selectCls = (active: boolean) =>
    `text-sm border rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#F5A623] transition-colors ${
      active ? 'border-[#F5A623]' : 'border-gray-200'
    }`

  const activeFilterCount =
    (search ? 1 : 0) +
    (filterPaid !== 'false' ? 1 : 0) +
    (filterCat ? 1 : 0) +
    (filterBank ? 1 : 0) +
    ((dateFrom || dateTo) ? 1 : 0)

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas a Receber</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie todos os recebimentos e receitas da empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCsv(transactions)}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download size={13} /> Exportar CSV
          </button>
          <button
            onClick={() => { setEditingTx(null); setShowModal(true) }}
            className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={16} /> Nova Receita
          </button>
        </div>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard loading={loading} title="Vencidas" value={summaryOverdue} count={summaryCountOv}
          label="Recebimentos em atraso" icon={AlertTriangle} iconCls="text-red-500" iconBgCls="bg-red-100" />
        <SummaryCard loading={loading} title="Vencem hoje" value={summaryDueToday} count={summaryCountToday}
          label="Recebimento no dia" icon={Clock} iconCls="text-orange-500" iconBgCls="bg-orange-100" />
        <SummaryCard loading={loading} title="Próximos 7 dias" value={summaryDue7} count={summaryCountDue7}
          label="A receber em breve" icon={Calendar} iconCls="text-amber-600" iconBgCls="bg-amber-100" />
        <SummaryCard loading={loading} title="Total a receber" value={summaryTotal} count={summaryCountTotal}
          label="Total de receitas em aberto" icon={TrendingUp} iconCls="text-green-600" iconBgCls="bg-green-100" />
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {activeFilterCount > 0 && (
          <button onClick={() => { setSearch(''); setFilterPaid('false'); setFilterCat(''); setFilterBank(''); setDateFrom(''); setDateTo(''); setPage(1) }}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#F5A623] px-3 py-1.5 rounded-full hover:bg-[#d4891a] transition-colors">
            {activeFilterCount} {activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'} <X size={12} />
          </button>
        )}

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar receita..."
            className={`w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623] border ${search ? 'border-[#F5A623]' : 'border-gray-200'}`}
          />
        </div>

        <select value={filterPaid} onChange={(e) => { setFilterPaid(e.target.value); setPage(1) }} className={selectCls(filterPaid !== 'false')}>
          <option value="">Todos</option>
          <option value="false">Pendentes</option>
          <option value="true">Recebidos</option>
        </select>

        <select value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1) }} className={selectCls(!!filterCat)}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={filterBank} onChange={(e) => { setFilterBank(e.target.value); setPage(1) }} className={selectCls(!!filterBank)}>
          <option value="">Todas as contas</option>
          {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className={selectCls(!!(dateFrom || dateTo))} />
          <span className="text-gray-400 text-sm">–</span>
          <input type="date" value={dateTo}   onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className={selectCls(!!(dateFrom || dateTo))} />
        </div>

        <button onClick={load}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* ── Banner de erro de ação ──────────────────────────────────── */}
      {actionError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 flex-1">{actionError}</p>
          <button onClick={() => setActionError('')} className="p-1 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────── */}
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Vencimento</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Descrição</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Cliente</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Categoria</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden xl:table-cell">Conta</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Valor</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><Pulse className="h-3 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <TrendingUp size={28} className="text-green-400" />
                      <p className="text-sm font-medium text-gray-500">Nenhuma receita encontrada</p>
                      <p className="text-xs text-gray-400">Altere os filtros ou registre uma nova receita.</p>
                    </div>
                  </td>
                </tr>
              ) : transactions.map((tx) => {
                const diff = daysDiff(tx.dueDate)
                const rowCls = !tx.isPaid && diff !== null && diff < 0 ? 'bg-red-50/30' : ''
                return (
                  <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${rowCls}`}>
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {fmtDate(tx.dueDate)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-700 line-clamp-1 max-w-[200px]">{tx.description}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap hidden lg:table-cell">
                      {tx.client?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      {tx.category ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          <span className="w-2 h-2 rounded-full" style={{ background: tx.category.color }} />
                          {tx.category.name}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap hidden xl:table-cell">
                      {tx.bankAccount?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-sm font-bold tabular-nums text-green-600 whitespace-nowrap">
                      +{fmt(tx.netAmount)}
                    </td>
                    <td className="px-5 py-3"><DueBadge tx={tx} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {!tx.isPaid && (
                          <button onClick={() => handleReceive(tx)}
                            title="Marcar como recebido"
                            className="flex items-center gap-1.5 text-xs text-green-700 bg-green-100 hover:bg-green-200 px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
                            <CheckCircle size={11} /> Receber
                          </button>
                        )}
                        <TableActionMenu actions={[
                          { label: 'Ver lançamento', icon: <Eye size={13} className="text-[#F5A623]" />, onClick: () => handleView(tx) },
                          { label: 'Editar', icon: <Pencil size={13} />, onClick: () => handleEdit(tx) },
                          ...(!tx.isPaid ? [{ label: 'Marcar como recebido', icon: <CheckCircle size={13} className="text-green-500" />, onClick: () => handleReceive(tx) }] : []),
                          { label: 'Cancelar', icon: <XCircle size={13} />, onClick: () => handleCancel(tx), variant: 'danger' as const, separator: true },
                        ]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {((page - 1) * TX_PER_PAGE) + 1}–{Math.min(page * TX_PER_PAGE, txPage?.total ?? 0)} de {txPage?.total ?? 0}
            </p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setPage(n)}
                  className={`w-6 h-6 rounded-lg text-xs font-medium transition-colors ${n === page ? 'bg-[#F5A623] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {n}
                </button>
              ))}
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Modal de edição/criação ──────────────────────────────────── */}
      {showModal && (
        <TransactionModal
          open={showModal}
          onClose={handleClose}
          onSaved={() => { handleClose(); load(); invalidateDashboard() }}
          token={localStorage.getItem('token') ?? ''}
          defaultType="INCOME"
          editId={editingTx?.id ?? null}
        />
      )}

      {/* ── Modal de recibo ──────────────────────────────────────────── */}
      <TransactionReceiptModal
        open={!!viewingTxId}
        txId={viewingTxId}
        token={localStorage.getItem('token') ?? ''}
        onClose={() => setViewingTxId(null)}
      />
    </div>
  )
}
