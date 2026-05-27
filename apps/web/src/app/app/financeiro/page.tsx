'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart, AreaChart, Bar, Line, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Scale, AlertTriangle,
  Plus, CheckCircle, XCircle, Pencil,
  RefreshCw, ChevronLeft, ChevronRight, Search, X,
  Wallet, Clock, CalendarDays, Eye,
  ArrowDownCircle, ArrowUpCircle, Landmark, LayoutGrid, Users, Truck,
  SlidersHorizontal, HardHat, ArrowLeftRight,
} from 'lucide-react'
import { TransactionModal } from '@/components/financial/TransactionModal'
import { TransactionReceiptModal } from '@/components/financial/TransactionReceiptModal'
import { TransferModal } from '@/components/financial/TransferModal'
import { TableActionMenu } from '@/components/ui/TableActionMenu'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatCurrency, formatCurrencyCompact } from '@/lib/format'

// ─── Tipo projeto para dropdown ───────────────────────────────────────────────

interface ProjectOption {
  id:     string
  name:   string
  code:   string | null
  stages: { id: string; name: string; order: number }[]
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Alias local para não quebrar referências internas
const fmt  = formatCurrency
const fmtK = formatCurrencyCompact
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  currentBalance:    number
  periodIncome:      number
  periodExpense:     number
  periodResult:      number
  payableToday:      { count: number; amount: number }
  receivableMonth:   { count: number; amount: number }
  overduePayable:    { count: number; amount: number }
  overdueReceivable: { count: number; amount: number }
  cashflowByMonth:   { month: string; income: number; expense: number; balance: number }[]
  expensesByCategory:{ id: string; name: string; color: string; total: number }[]
  topProjectsByExpense: { id: string; name: string; total: number }[]
  recentTransactions: Transaction[]
}

interface Transaction {
  id:             string
  description:    string
  type:           'INCOME' | 'EXPENSE'
  isPaid:         boolean
  grossAmount:    number
  netAmount:      number
  dueDate:        string | null
  paidAt:         string | null
  referenceDate:  string
  isTransfer:     boolean
  transferPairId: string | null
  category:       { id: string; name: string; color: string; icon: string } | null
  bankAccount:    { id: string; name: string; bank: string | null } | null
  client:         { id: string; name: string } | null
  supplier:       { id: string; name: string } | null
  createdBy:      { id: string; name: string; avatarUrl: string | null } | null
}

interface TxPage {
  transactions: Transaction[]
  total: number
  page: number
  pages: number
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}
function SkeletonMetric() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 xl:p-3">
      <div className="flex items-start justify-between mb-3 xl:mb-2">
        <Pulse className="w-10 h-10 xl:w-8 xl:h-8 rounded-xl" />
        <Pulse className="w-14 h-5 rounded-full xl:hidden" />
      </div>
      <Pulse className="h-8 xl:h-6 w-36 xl:w-24 mb-2 xl:mb-1" />
      <Pulse className="h-3 w-20 mb-1.5" />
      <Pulse className="h-3 w-28 xl:hidden" />
    </div>
  )
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>{children}</div>
}
function PanelHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-3">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  )
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({
  title, value, label, sub, loading, icon: Icon, iconCls, iconBgCls, badge, badgeCls,
}: {
  title: string; value: number; label: string; sub?: string; loading: boolean
  icon: React.ElementType; iconCls: string; iconBgCls: string
  badge?: string; badgeCls?: string
}) {
  if (loading) return <SkeletonMetric />
  return (
    <Panel className="p-5 xl:p-3">
      <div className="flex items-start justify-between mb-3 xl:mb-2">
        <div className={`w-10 h-10 xl:w-8 xl:h-8 rounded-xl flex items-center justify-center ${iconBgCls}`}>
          <Icon size={20} className={`xl:hidden ${iconCls}`} />
          <Icon size={16} className={`hidden xl:block ${iconCls}`} />
        </div>
        {badge && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full xl:hidden ${badgeCls}`}>{badge}</span>
        )}
      </div>
      <p className="text-2xl xl:text-xl font-bold text-gray-900 leading-none mb-1">{fmt(value)}</p>
      <p className="text-[11px] xl:text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 xl:hidden">{sub}</p>}
    </Panel>
  )
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutCard({ categories, loading }: { categories: DashboardData['expensesByCategory']; loading: boolean }) {
  const total = categories.reduce((s, c) => s + c.total, 0)
  const data  = categories.map((c) => ({ ...c, value: total > 0 ? Math.round((c.total / total) * 100) : 0 }))
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Despesas por categoria" />
      {loading ? (
        <div className="px-4 pb-4 animate-pulse">
          <div className="h-[150px] bg-gray-100 rounded-xl mb-3" />
          <div className="space-y-2">
            {[1,2,3].map((i) => <div key={i} className="flex justify-between"><Pulse className="h-3 w-2/3" /><Pulse className="h-3 w-1/5" /></div>)}
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4">
          {categories.length === 0 ? (
            <div className="flex items-center justify-center h-[180px] text-xs text-gray-400">Sem despesas no período.</div>
          ) : (
            <>
              <div className="relative">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={data} innerRadius={46} outerRadius={66} paddingAngle={3}
                      dataKey="value" startAngle={90} endAngle={-270}>
                      {data.map((c, i) => <Cell key={i} fill={c.color || '#6B7280'} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v}%`, '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] text-gray-400 font-medium">Total</span>
                  <span className="text-sm font-bold text-gray-800">{fmtK(total)}</span>
                </div>
              </div>
              <div className="space-y-2 mt-1">
                {data.slice(0, 6).map((c) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color || '#6B7280' }} />
                      <span className="text-xs text-gray-600 truncate max-w-[120px]">{c.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-800">{c.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

// ─── Alertas ─────────────────────────────────────────────────────────────────

function AlertsCard({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const alerts = []
  if (data) {
    if (data.overduePayable.count > 0)
      alerts.push({ color: 'red',  icon: AlertTriangle, title: `${data.overduePayable.count} conta(s) a pagar vencida(s)`, desc: `Total: ${fmt(data.overduePayable.amount)}` })
    if (data.overdueReceivable.count > 0)
      alerts.push({ color: 'amber', icon: AlertTriangle, title: `${data.overdueReceivable.count} recebimento(s) vencido(s)`, desc: `Total: ${fmt(data.overdueReceivable.amount)}` })
    if (data.payableToday.count > 0)
      alerts.push({ color: 'blue',  icon: Clock, title: `${data.payableToday.count} vencimento(s) hoje`, desc: `Total: ${fmt(data.payableToday.amount)}` })
  }
  const scheme = {
    red:   { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-500',    text: 'text-red-700'    },
    amber: { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'text-amber-500',  text: 'text-amber-700'  },
    blue:  { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-500',   text: 'text-blue-700'   },
  }
  return (
    <Panel className="flex flex-col h-full">
      <PanelHeader title="Alertas financeiros" />
      <div className="px-5 pb-5 flex-1 flex flex-col gap-2.5">
        {loading ? (
          <div className="space-y-2 animate-pulse">{[1,2].map((i) => <Pulse key={i} className="h-16 rounded-xl" />)}</div>
        ) : alerts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
            <div className="text-center">
              <CheckCircle size={28} className="mx-auto text-green-400 mb-2" />
              <p>Tudo em dia! Sem alertas no momento.</p>
            </div>
          </div>
        ) : alerts.map((a, i) => {
          const s = scheme[a.color as keyof typeof scheme]
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${s.bg} ${s.border}`}>
              <a.icon size={15} className={`flex-shrink-0 mt-0.5 ${s.icon}`} />
              <div>
                <p className={`text-xs font-semibold ${s.text}`}>{a.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{a.desc}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}


// ─── Main Page ────────────────────────────────────────────────────────────────

const TX_PER_PAGE = 15

export default function FinanceiroPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [dash,       setDash]       = useState<DashboardData | null>(null)
  const [loadingDash,setLoadingDash]= useState(true)

  const [txPage,     setTxPage]     = useState<TxPage | null>(null)
  const [loadingTx,  setLoadingTx]  = useState(true)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPaid, setFilterPaid] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  const [bankAccounts,  setBankAccounts]  = useState<{ id: string; name: string }[]>([])
  const [filterBank,    setFilterBank]    = useState('')

  // ── Filtros CC / Etapa ────────────────────────────────────────────────────
  const [projects,      setProjects]      = useState<ProjectOption[]>([])
  const [filterProject, setFilterProject] = useState(() => searchParams?.get('projectId') ?? '')
  const [filterStage,   setFilterStage]   = useState(() => searchParams?.get('stageId')   ?? '')
  const [filtersOpen,   setFiltersOpen]   = useState(false)

  const [showModal,       setShowModal]       = useState(false)
  const [editingTx,       setEditingTx]       = useState<Transaction | null>(null)
  const [viewingTxId,     setViewingTxId]     = useState<string | null>(null)
  const [actionError,     setActionError]     = useState('')
  const [showTransfer,    setShowTransfer]    = useState(false)

  const queryClient = useQueryClient()

  /** Invalida o cache do dashboard para que ele atualize automaticamente */
  function invalidateDashboard() {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  // ── API helpers ──────────────────────────────────────────────────────────

  function headers() {
    const token = localStorage.getItem('token') || ''
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  // ── Load dashboard ───────────────────────────────────────────────────────

  const loadDash = useCallback(async () => {
    setLoadingDash(true)
    try {
      const qp = new URLSearchParams()
      if (dateFrom)       qp.set('startDate',    dateFrom)
      if (dateTo)         qp.set('endDate',       dateTo)
      if (filterBank)     qp.set('bankAccountId', filterBank)
      if (filterStage)    qp.set('stageId',       filterStage)
      else if (filterProject) qp.set('projectId', filterProject)
      const res = await fetch(`${API}/api/financial/dashboard?${qp}`, { headers: headers() })
      if (res.ok) setDash(await res.json())
    } catch { /* silent */ } finally { setLoadingDash(false) }
  }, [dateFrom, dateTo, filterBank, filterProject, filterStage])

  // ── Load transactions ────────────────────────────────────────────────────

  const loadTx = useCallback(async () => {
    setLoadingTx(true)
    try {
      const qp = new URLSearchParams({ page: String(page), limit: String(TX_PER_PAGE) })
      if (search)         qp.set('search',       search)
      if (filterType)     qp.set('type',         filterType)
      if (filterPaid)     qp.set('isPaid',        filterPaid)
      if (dateFrom)       qp.set('startDate',     dateFrom)
      if (dateTo)         qp.set('endDate',        dateTo)
      if (filterBank)     qp.set('bankAccountId', filterBank)
      if (filterStage)    qp.set('stageId',       filterStage)
      else if (filterProject) qp.set('projectId', filterProject)
      const res = await fetch(`${API}/api/financial/transactions?${qp}`, { headers: headers() })
      if (res.ok) setTxPage(await res.json())
    } catch { /* silent */ } finally { setLoadingTx(false) }
  }, [page, search, filterType, filterPaid, dateFrom, dateTo, filterBank, filterProject, filterStage])

  // ── Load bank accounts + projects for filters ────────────────────────────

  useEffect(() => {
    async function loadBanks() {
      try {
        const res = await fetch(`${API}/api/financial/bank-accounts`, { headers: headers() })
        if (res.ok) {
          const data = await res.json()
          setBankAccounts(data.accounts ?? [])
        }
      } catch { /* silent */ }
    }
    async function loadProjects() {
      try {
        const res = await fetch(`${API}/api/financial/projects`, { headers: headers() })
        if (res.ok) {
          const data = await res.json()
          setProjects(data.projects ?? [])
        }
      } catch { /* silent */ }
    }
    loadBanks()
    loadProjects()
  }, [])

  useEffect(() => { loadDash() }, [loadDash])
  useEffect(() => { loadTx()   }, [loadTx])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handlePay(tx: Transaction) {
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
        setActionError((err as any).error || `Erro ao registrar pagamento (HTTP ${res.status})`)
        return
      }
      loadDash(); loadTx(); invalidateDashboard()
    } catch {
      setActionError('Falha na conexão. Verifique sua rede e tente novamente.')
    }
  }

  async function handleCancel(tx: Transaction) {
    if (!confirm(`Cancelar o lançamento "${tx.description}"?`)) return
    setActionError('')
    try {
      const res = await fetch(`${API}/api/financial/transactions/${tx.id}/cancel`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({}),  // obrigatório: sem body + Content-Type: application/json → 400 no Fastify
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setActionError((err as any).error || `Erro ao cancelar (HTTP ${res.status})`)
        return
      }
      loadDash(); loadTx(); invalidateDashboard()
    } catch {
      setActionError('Falha na conexão. Verifique sua rede e tente novamente.')
    }
  }

  async function handleRevertTransfer(tx: Transaction) {
    if (!tx.transferPairId) return
    if (!confirm(`Estornar a transferência "${tx.description}"?\n\nOs saldos serão revertidos e ambos os lançamentos serão cancelados.`)) return
    setActionError('')
    try {
      const res = await fetch(`${API}/api/v1/financial/transfers/${tx.transferPairId}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setActionError((err as any).error || `Erro ao estornar (HTTP ${res.status})`)
        return
      }
      loadDash(); loadTx(); invalidateDashboard()
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

  function handleModalClose() {
    setShowModal(false)
    setEditingTx(null)
  }

  function handleModalSaved() {
    handleModalClose()
    loadDash()
    loadTx()
    invalidateDashboard()   // dashboard refaz fetch automaticamente
  }

  // ── Cashflow chart data ──────────────────────────────────────────────────

  const cashflow = dash?.cashflowByMonth ?? []

  // ── Status badges ────────────────────────────────────────────────────────

  function StatusBadge({ tx }: { tx: Transaction }) {
    const today = new Date()
    today.setHours(0,0,0,0)
    if (tx.isPaid) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Pago</span>
    if (tx.dueDate) {
      const due = new Date(tx.dueDate)
      if (due < today) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Vencido</span>
    }
    return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pendente</span>
  }

  const transactions = txPage?.transactions ?? []
  const totalPages   = txPage?.pages ?? 1

  const selectCls = (active: boolean) =>
    `text-sm border rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#F5A623] transition-colors ${
      active ? 'border-[#F5A623]' : 'border-gray-200'
    }`

  const activeFilterCount =
    (filterBank    ? 1 : 0) +
    (filterType    ? 1 : 0) +
    (filterPaid    ? 1 : 0) +
    ((dateFrom || dateTo) ? 1 : 0) +
    (filterProject ? 1 : 0) +
    (filterStage   ? 1 : 0)

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-0.5">Painel financeiro geral da empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-2 border border-[#F5A623] text-[#F5A623] hover:bg-orange-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeftRight size={16} /> Transferência
          </button>
          <button
            onClick={() => { setEditingTx(null); setShowModal(true) }}
            className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={16} /> Lançamento
          </button>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────── */}
      <div className="space-y-2">

        {/* Accordion toggle — mobile only */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <SlidersHorizontal size={14} />
            Filtros
            {activeFilterCount > 0 && (
              <span className="bg-[#F5A623] text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button onClick={() => { loadDash(); loadTx() }}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors ml-auto">
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>

        {/* Filter panel */}
        <div className={`flex-wrap items-center gap-2 ${filtersOpen ? 'flex' : 'hidden sm:flex'}`}>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterBank(''); setFilterType(''); setFilterPaid(''); setDateFrom(''); setDateTo(''); setFilterProject(''); setFilterStage(''); setPage(1) }}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#F5A623] px-3 py-1.5 rounded-full hover:bg-[#d4891a] transition-colors"
            >
              {activeFilterCount} {activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'} <X size={12} />
            </button>
          )}

          <select value={filterBank} onChange={(e) => { setFilterBank(e.target.value); setPage(1) }} className={selectCls(!!filterBank)}>
            <option value="">Todas as contas</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1) }} className={selectCls(!!filterType)}>
            <option value="">Entradas e saídas</option>
            <option value="INCOME">Entradas</option>
            <option value="EXPENSE">Saídas</option>
          </select>

          <select value={filterPaid} onChange={(e) => { setFilterPaid(e.target.value); setPage(1) }} className={selectCls(!!filterPaid)}>
            <option value="">Todos os status</option>
            <option value="true">Pagos</option>
            <option value="false">Pendentes</option>
          </select>

          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className={selectCls(!!(dateFrom || dateTo))} />
            <span className="text-gray-400 text-sm">–</span>
            <input type="date" value={dateTo}   onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className={selectCls(!!(dateFrom || dateTo))} />
          </div>

          {/* Centro de custo */}
          <select
            value={filterProject}
            onChange={(e) => { setFilterProject(e.target.value); setFilterStage(''); setPage(1) }}
            className={selectCls(!!filterProject)}
          >
            <option value="">Todas as obras</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} — ${p.name}` : p.name}
              </option>
            ))}
          </select>

          {/* Etapa — dependente do CC */}
          <select
            value={filterStage}
            onChange={(e) => { setFilterStage(e.target.value); setPage(1) }}
            disabled={!filterProject}
            className={`${selectCls(!!filterStage)} disabled:opacity-50 disabled:cursor-not-allowed`}
            title={!filterProject ? 'Selecione uma obra primeiro' : undefined}
          >
            <option value="">{filterProject ? 'Todas as etapas' : 'Selecione uma obra primeiro'}</option>
            {(projects.find((p) => p.id === filterProject)?.stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <button onClick={() => { loadDash(); loadTx() }}
            className="hidden sm:flex ml-auto items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {/* ── Banner de contexto (obra/etapa selecionada) ───────────────── */}
      {filterProject && (() => {
        const proj = projects.find((p) => p.id === filterProject)
        if (!proj) return null
        const stageLabel = proj.stages.find((s) => s.id === filterStage)?.name
        return (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
            <HardHat size={15} className="text-blue-500 flex-shrink-0" />
            <p className="text-sm text-blue-700 flex-1 font-medium">
              Visualizando:{' '}
              <span className="font-semibold">{proj.name}</span>
              {proj.code && (
                <span className="ml-1 text-blue-500 font-normal text-xs">({proj.code})</span>
              )}
              {stageLabel && (
                <> — <span className="font-semibold">{stageLabel}</span></>
              )}
            </p>
            <button
              onClick={() => { setFilterProject(''); setFilterStage(''); setPage(1) }}
              className="p-1 text-blue-400 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        )
      })()}

      {/* ── Métricas ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard loading={loadingDash} title="Saldo atual" value={dash?.currentBalance ?? 0}
          label="Saldo consolidado das contas" icon={Wallet} iconCls="text-blue-600" iconBgCls="bg-blue-100" />
        <MetricCard loading={loadingDash} title="Entradas no período" value={dash?.periodIncome ?? 0}
          label="Receitas recebidas" icon={TrendingUp} iconCls="text-green-600" iconBgCls="bg-green-100" />
        <MetricCard loading={loadingDash} title="Saídas no período" value={dash?.periodExpense ?? 0}
          label="Despesas pagas" icon={TrendingDown} iconCls="text-orange-500" iconBgCls="bg-orange-100" />
        <MetricCard loading={loadingDash} title="Resultado do período" value={dash?.periodResult ?? 0}
          label="Entradas − Saídas"
          badge={dash ? (dash.periodResult >= 0 ? '▲ Positivo' : '▼ Negativo') : undefined}
          badgeCls={dash ? (dash.periodResult >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') : ''}
          icon={Scale} iconCls="text-violet-600" iconBgCls="bg-violet-100" />
        <MetricCard loading={loadingDash} title="A pagar hoje" value={dash?.payableToday.amount ?? 0}
          label={`${dash?.payableToday.count ?? 0} lançamento(s) com vencimento hoje`}
          icon={AlertTriangle} iconCls="text-red-500" iconBgCls="bg-red-100" />
        <MetricCard loading={loadingDash} title="A receber no mês" value={dash?.receivableMonth.amount ?? 0}
          label={`${dash?.receivableMonth.count ?? 0} lançamento(s) a vencer`}
          icon={CalendarDays} iconCls="text-amber-600" iconBgCls="bg-amber-100" />
      </div>

      {/* ── Gráficos ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Fluxo de caixa */}
        <Panel className="xl:col-span-2 flex flex-col">
          <PanelHeader title="Fluxo de caixa (últimos 12 meses)" />
          <div className="flex items-center gap-4 px-5 pb-1">
            {[['#22C55E','Entradas'],['#F97316','Saídas'],['#3B82F6','Saldo']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                <span className="text-xs text-gray-500">{l}</span>
              </div>
            ))}
          </div>
          {loadingDash ? (
            <div className="px-4 pb-4 animate-pulse"><div className="bg-gray-100 rounded-xl h-[230px]" /></div>
          ) : (
            <div className="px-4 pb-4">
              {cashflow.length === 0 ? (
                <div className="flex items-center justify-center h-[230px] text-xs text-gray-400">Sem dados de fluxo.</div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <ComposedChart data={cashflow} barSize={10} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={52} />
                    <Tooltip
                      formatter={(v, n) => [fmt(Number(v)), n as string]}
                      contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,.07)' }}
                    />
                    <Bar dataKey="income"  name="Entradas" fill="#22C55E" radius={[4,4,0,0]} />
                    <Bar dataKey="expense" name="Saídas"   fill="#F97316" radius={[4,4,0,0]} />
                    <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3B82F6" strokeWidth={2.5}
                      dot={{ r:3, fill:'#3B82F6', strokeWidth:0 }} activeDot={{ r:5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </Panel>

        <DonutCard categories={dash?.expensesByCategory ?? []} loading={loadingDash} />
      </div>

      {/* ── Alertas ──────────────────────────────────────────────────── */}
      <AlertsCard data={dash} loading={loadingDash} />

      {/* ── Acesso rápido ────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acesso rápido</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {[
            {
              label: 'Contas a Pagar',
              icon:  ArrowDownCircle,
              cls:   'text-red-500 bg-red-50',
              href:  '/app/financeiro/contas-pagar',
            },
            {
              label: 'Contas a Receber',
              icon:  ArrowUpCircle,
              cls:   'text-green-500 bg-green-50',
              href:  '/app/financeiro/contas-receber',
            },
            {
              label: 'Contas Bancárias',
              icon:  Landmark,
              cls:   'text-blue-500 bg-blue-50',
              href:  '/app/financeiro/contas-bancarias',
            },
            {
              label: 'Clientes',
              icon:  Users,
              cls:   'text-indigo-500 bg-indigo-50',
              href:  '/app/financeiro/clientes',
            },
            {
              label: 'Fornecedores',
              icon:  Truck,
              cls:   'text-orange-500 bg-orange-50',
              href:  '/app/financeiro/fornecedores',
            },
            {
              label: 'Novo Lançamento',
              icon:  Plus,
              cls:   'text-[#F5A623] bg-[#F5A623]/10',
              action: () => { setEditingTx(null); setShowModal(true) },
            },
            {
              label: 'Visão Geral',
              icon:  LayoutGrid,
              cls:   'text-violet-500 bg-violet-50',
              href:  '/app/dashboard',
            },
          ].map((item) => {
            const Icon = item.icon
            const handler = item.action
              ? { onClick: item.action, role: 'button' as const }
              : { onClick: () => router.push(item.href!), role: 'button' as const }
            return (
              <button
                key={item.label}
                {...handler}
                className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-300 hover:shadow-sm transition-all text-center cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.cls}`}>
                  <Icon size={20} />
                </div>
                <p className="text-xs font-medium text-gray-700 leading-tight">{item.label}</p>
              </button>
            )
          })}
        </div>
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

      {/* ── Tabela de lançamentos ────────────────────────────────────── */}
      <Panel>
        <div className="px-5 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800 flex-1">Lançamentos financeiros</h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar lançamento..."
              className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623] w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-y border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Data</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Descrição</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">Categoria</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden xl:table-cell">Conta</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap hidden xl:table-cell">Criado por</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Valor</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loadingTx ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><Pulse className="h-3 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : transactions.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">Nenhum lançamento encontrado.</td></tr>
              ) : transactions.map((tx) => (
                <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${tx.isTransfer ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-5 py-3 text-xs text-gray-500 font-mono whitespace-nowrap hidden lg:table-cell">{fmtDate(tx.referenceDate)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-6 rounded-full flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-green-400' : 'bg-red-400'}`} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          {tx.isTransfer && <ArrowLeftRight size={11} className="text-blue-400 flex-shrink-0" />}
                          <span className="text-xs text-gray-700 line-clamp-1 max-w-[200px]">{tx.description}</span>
                        </div>
                        {/* Data visível só no mobile */}
                        <p className="lg:hidden text-[10px] text-gray-400 font-mono">{fmtDate(tx.referenceDate)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    {tx.isTransfer ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                        <ArrowLeftRight size={9} />
                        Transferência
                      </span>
                    ) : tx.category ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        <span className="w-2 h-2 rounded-full" style={{ background: tx.category.color }} />
                        {tx.category.name}
                      </span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap hidden xl:table-cell">
                    {tx.bankAccount?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3 hidden xl:table-cell">
                    {tx.createdBy ? (
                      <div className="flex items-center gap-1.5" title={tx.createdBy.name}>
                        <UserAvatar name={tx.createdBy.name} avatarUrl={tx.createdBy.avatarUrl} size="sm" />
                        <span className="text-[11px] text-gray-500 truncate max-w-[80px]">{tx.createdBy.name.split(' ')[0]}</span>
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className={`px-5 py-3 text-xs font-semibold tabular-nums whitespace-nowrap ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'INCOME' ? '+' : '−'}{fmt(tx.netAmount)}
                  </td>
                  <td className="px-5 py-3"><StatusBadge tx={tx} /></td>
                  <td className="px-5 py-3">
                    {tx.isTransfer ? (
                      <TableActionMenu actions={[
                        { label: 'Ver lançamento', icon: <Eye size={13} className="text-[#F5A623]" />, onClick: () => handleView(tx) },
                        { label: 'Estornar transferência', icon: <XCircle size={13} />, onClick: () => handleRevertTransfer(tx), variant: 'danger' as const },
                      ]} />
                    ) : (
                      <TableActionMenu actions={[
                        { label: 'Ver lançamento', icon: <Eye size={13} className="text-[#F5A623]" />, onClick: () => handleView(tx) },
                        { label: 'Editar', icon: <Pencil size={13} />, onClick: () => handleEdit(tx) },
                        ...(!tx.isPaid ? [{ label: 'Marcar como pago', icon: <CheckCircle size={13} className="text-green-500" />, onClick: () => handlePay(tx) }] : []),
                        { label: 'Cancelar lançamento', icon: <XCircle size={13} />, onClick: () => handleCancel(tx), variant: 'danger' as const, separator: true },
                      ]} />
                    )}
                  </td>
                </tr>
              ))}
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
          onClose={handleModalClose}
          onSaved={handleModalSaved}
          token={localStorage.getItem('token') ?? ''}
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

      {/* ── Modal de transferência ───────────────────────────────────── */}
      <TransferModal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        onSuccess={() => {
          setShowTransfer(false)
          loadTx()
          loadDash()
          invalidateDashboard()
        }}
      />
    </div>
  )
}
